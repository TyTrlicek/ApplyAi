"""Job CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import JobCapture, JobOut, JobStatusUpdate
from app.db.models import Job, JobStatus
from app.db.repository import upsert_job
from app.db.session import get_session
from app.sources.base import NormalizedJob

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _db():
    with get_session() as session:
        yield session


@router.get("/", response_model=list[JobOut])
def list_jobs(
    status: JobStatus | None = Query(None),
    is_remote: bool | None = Query(None),
    source: str | None = Query(None),
    search: str | None = Query(None, description="Filter by title or company name"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    session: Session = Depends(_db),
):
    q = select(Job).options(selectinload(Job.company)).order_by(Job.date_posted.desc().nulls_last(), Job.first_seen.desc())

    if status:
        q = q.where(Job.status == status)
    if is_remote is not None:
        q = q.where(Job.is_remote == is_remote)
    if source:
        q = q.where(Job.source == source)
    if search:
        pattern = f"%{search}%"
        q = q.where(Job.title.ilike(pattern))

    q = q.offset(offset).limit(limit)
    return session.scalars(q).all()


@router.post("/capture", response_model=JobOut)
def capture_job(body: JobCapture, session: Session = Depends(_db)):
    """Capture a single job ad hoc (e.g. from the LinkedIn extension). Upserts
    on the same dedup_key the scheduled fetch pipeline uses, so a job already
    found by the daily scraper is updated in place rather than duplicated."""
    normalized = NormalizedJob(
        source="linkedin_extension",
        source_id=None,
        title=body.title,
        company=body.company,
        location=body.location,
        url=body.url,
        apply_url=body.url,
        description=body.description,
    )
    upsert_job(session, normalized)
    session.flush()
    job = session.scalar(
        select(Job)
        .options(selectinload(Job.company))
        .where(Job.dedup_key == normalized.dedup_key)
    )
    return job


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, session: Session = Depends(_db)):
    job = session.scalar(
        select(Job).options(selectinload(Job.company)).where(Job.id == job_id)
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}/status", response_model=JobOut)
def update_status(job_id: int, body: JobStatusUpdate, session: Session = Depends(_db)):
    job = session.scalar(
        select(Job).options(selectinload(Job.company)).where(Job.id == job_id)
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = body.status
    session.flush()
    return job
