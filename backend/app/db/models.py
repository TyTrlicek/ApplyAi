"""ORM models for MVP 1 job tracking.

Tables:
  * companies     -- deduped employers
  * jobs          -- canonical jobs (one row per dedup_key), with lifecycle status
                     and first_seen/last_seen for incremental fetch + staleness.

The raw source payload is kept on the job row (JSON) so we never lose source data
even though `jobs` stores our normalized view as the source of truth.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class JobStatus(str, enum.Enum):
    NEED_TO_APPLY = "need_to_apply"
    APPLIED = "applied"
    CHOSE_NOT_TO_APPLY = "chose_not_to_apply"
    INTERVIEWING = "interviewing"
    REJECTED_PRE = "rejected_pre"
    REJECTED_POST = "rejected_post"
    STALE_PRE = "stale_pre"
    STALE_POST = "stale_post"
    GHOSTED = "ghosted"


class SearchProfile(Base):
    """Stored search configuration. One row per role/query the scheduler runs.
    The scheduler loops over all active profiles daily."""

    __tablename__ = "search_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(256), unique=True)  # e.g. "software engineer"
    search_term: Mapped[str] = mapped_column(String(256))
    location: Mapped[str] = mapped_column(String(256), default="United States")
    country: Mapped[str] = mapped_column(String(16), default="usa")
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False)
    job_type: Mapped[str | None] = mapped_column(String(32), default="fulltime", nullable=True)
    results_wanted: Mapped[int] = mapped_column(default=50)
    hours_old: Mapped[int] = mapped_column(default=24)
    sources: Mapped[str] = mapped_column(String(256), default="indeed,google,linkedin")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(512), unique=True, index=True)

    jobs: Mapped[list["Job"]] = relationship(back_populates="company")


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint("dedup_key", name="uq_jobs_dedup_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    dedup_key: Mapped[str] = mapped_column(String(1024), index=True)

    source: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str | None] = mapped_column(String(256), nullable=True)

    title: Mapped[str] = mapped_column(String(512))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    company: Mapped[Company | None] = relationship(back_populates="jobs")

    location: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    apply_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_posted: Mapped[date | None] = mapped_column(Date, nullable=True)

    salary_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    salary_interval: Mapped[str | None] = mapped_column(String(16), nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    cached_resume: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    cached_cover_letter: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    form_answers: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)

    # "uploaded" (default) -> apply step uses the profile's uploaded resume file directly.
    # "ai_generated" -> set the moment /jobs/{id}/resume is called for this job; apply step
    # renders cached_resume to DOCX as before. See playwright_worker/runner.py.
    resume_source: Mapped[str] = mapped_column(String(16), default="uploaded")

    application_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    application_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, native_enum=False, length=32),
        default=JobStatus.NEED_TO_APPLY,
        index=True,
    )

    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
