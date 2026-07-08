"""Offline persistence tests against in-memory SQLite (no Supabase needed)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, Company, Job, JobStatus
from app.db.repository import persist_jobs, upsert_job
from app.sources.base import NormalizedJob


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", future=True)  # in-memory
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    with Session() as s:
        yield s


def _job(title="Software Engineer", company="Acme Corp", source="indeed", url="u1"):
    return NormalizedJob(source=source, source_id="1", title=title, company=company,
                         location="New York, NY", url=url)


def test_insert_then_dedup_does_not_duplicate(session):
    assert upsert_job(session, _job()) is True       # inserted
    session.flush()
    # same job from another source -> same dedup_key -> update, not insert
    assert upsert_job(session, _job(source="linkedin", url="u2")) is False
    session.flush()
    assert len(session.scalars(select(Job)).all()) == 1


def test_company_is_deduped(session):
    persist_jobs(session, [_job(title="Software Engineer"), _job(title="Data Engineer")])
    companies = session.scalars(select(Company)).all()
    assert len(companies) == 1
    assert companies[0].name == "Acme Corp"


def test_status_defaults_and_is_preserved_on_update(session):
    upsert_job(session, _job())
    session.flush()
    job = session.scalar(select(Job))
    assert job.status == JobStatus.NEED_TO_APPLY

    # user marks it applied
    job.status = JobStatus.APPLIED
    session.flush()

    # a later fetch re-sees the job -> status must NOT reset
    upsert_job(session, _job(url="u-new"))
    session.flush()
    job = session.scalar(select(Job))
    assert job.status == JobStatus.APPLIED
    assert job.url == "u-new"  # volatile field refreshed


def test_persist_jobs_counts(session):
    r1 = persist_jobs(session, [_job(title="A"), _job(title="B")])
    assert (r1.inserted, r1.updated) == (2, 0)
    r2 = persist_jobs(session, [_job(title="A"), _job(title="C")])  # A repeats
    assert (r2.inserted, r2.updated) == (1, 1)
