"""Read/write helpers. The core is upsert-on-dedup_key so re-fetching (daily
incremental runs) never creates duplicate rows -- it just bumps last_seen."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Company, Job, Profile
from app.sources.base import NormalizedJob


def _json_safe(obj):
    """Recursively convert a raw JobSpy dict to JSON-serializable types."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


@dataclass(slots=True)
class PersistResult:
    inserted: int = 0
    updated: int = 0

    @property
    def total(self) -> int:
        return self.inserted + self.updated


def _get_or_create_company(session: Session, name: str | None) -> Company | None:
    if not name:
        return None
    company = session.scalar(select(Company).where(Company.name == name))
    if company is None:
        company = Company(name=name)
        session.add(company)
        session.flush()  # assign id without committing
    return company


def upsert_job(session: Session, job: NormalizedJob) -> bool:
    """Insert a new job or refresh an existing one (matched on dedup_key).

    Returns True if a new row was inserted, False if an existing row was updated.
    Existing rows keep their lifecycle `status` and `first_seen`; only freshness
    fields are refreshed (last_seen is bumped via the model's onupdate)."""
    existing = session.scalar(select(Job).where(Job.dedup_key == job.dedup_key))
    company = _get_or_create_company(session, job.company)

    if existing is not None:
        # Refresh volatile fields; preserve status + first_seen.
        existing.url = job.url or existing.url
        existing.apply_url = job.apply_url or existing.apply_url
        existing.description = job.description or existing.description
        existing.salary_min = job.salary_min if job.salary_min is not None else existing.salary_min
        existing.salary_max = job.salary_max if job.salary_max is not None else existing.salary_max
        existing.raw = _json_safe(job.raw) if job.raw else existing.raw
        # touch -> triggers last_seen onupdate
        existing.title = job.title
        return False

    session.add(
        Job(
            dedup_key=job.dedup_key,
            source=job.source,
            source_id=job.source_id,
            title=job.title,
            company=company,
            location=job.location,
            is_remote=job.is_remote,
            url=job.url,
            apply_url=job.apply_url,
            date_posted=job.date_posted,
            salary_min=job.salary_min,
            salary_max=job.salary_max,
            salary_currency=job.salary_currency,
            salary_interval=job.salary_interval,
            description=job.description,
            raw=_json_safe(job.raw) if job.raw else None,
        )
    )
    return True


def persist_jobs(session: Session, jobs: list[NormalizedJob]) -> PersistResult:
    result = PersistResult()
    for job in jobs:
        if upsert_job(session, job):
            result.inserted += 1
        else:
            result.updated += 1
        session.flush()
    return result


_PROFILE_ID = 1


def get_profile(session: Session) -> dict:
    profile = session.get(Profile, _PROFILE_ID)
    return profile.data if profile else {}


def upsert_profile(session: Session, data: dict) -> dict:
    profile = session.get(Profile, _PROFILE_ID)
    if profile is None:
        session.add(Profile(id=_PROFILE_ID, data=data))
    else:
        profile.data = data
    return data


def persist_report(session: Session, report) -> PersistResult:
    """Persist a FetchReport's jobs. Kept loosely typed to avoid importing the
    fetch module here (it only needs `.jobs`)."""
    return persist_jobs(session, report.jobs)
