"""Manual fetch trigger endpoint.

POST /fetch runs all active search profiles (or a subset) immediately,
persists results, and returns a per-profile summary. This is how you kick off
a fetch from the dashboard until the scheduler is wired up.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import FetchRequest, FetchResponse, FetchResult
from app.db.models import SearchProfile
from app.db.repository import persist_report
from app.db.session import get_session
from app.fetch import fetch_all
from app.sources.base import SearchQuery, ENTRY_LEVEL_LINKEDIN
from app.sources.jobspy_adapter import JobSpyAdapter

router = APIRouter(prefix="/fetch", tags=["fetch"])


def _db():
    with get_session() as session:
        yield session


@router.post("/", response_model=FetchResponse)
def trigger_fetch(body: FetchRequest = FetchRequest(), session: Session = Depends(_db)):
    # Load active profiles (or specified subset)
    q = select(SearchProfile).where(SearchProfile.active == True)
    if body.profile_ids:
        q = q.where(SearchProfile.id.in_(body.profile_ids))
    profiles = session.scalars(q).all()

    results = []
    for profile in profiles:
        sources = [s.strip() for s in profile.sources.split(",")]
        adapters = [
            JobSpyAdapter(
                site=s,
                proxies=None,
            )
            for s in sources
        ]
        # Wire LinkedIn f_E for entry+associate level on LinkedIn adapters
        for adapter in adapters:
            if adapter.site == "linkedin":
                adapter._linkedin_experience_level = ENTRY_LEVEL_LINKEDIN

        query = SearchQuery(
            search_term=f'"{profile.search_term}"',
            location=profile.location,
            country=profile.country,
            is_remote=profile.is_remote,
            job_type=profile.job_type,
            results_wanted=profile.results_wanted,
            hours_old=body.hours_old if body.hours_old is not None else profile.hours_old,
            linkedin_experience_level=ENTRY_LEVEL_LINKEDIN,
        )

        report = fetch_all(query, adapters=adapters)

        with get_session() as persist_session:
            persist_result = persist_report(persist_session, report)

        results.append(FetchResult(
            profile=profile.name,
            inserted=persist_result.inserted,
            updated=persist_result.updated,
            seniority_filtered=report.seniority_filtered,
            domain_filtered=report.domain_filtered,
            noise_filtered=report.noise_filtered,
            duplicates_removed=report.duplicates_removed,
            degraded_sources=report.degraded_sources,
        ))

    return FetchResponse(
        results=results,
        total_inserted=sum(r.inserted for r in results),
        total_updated=sum(r.updated for r in results),
    )
