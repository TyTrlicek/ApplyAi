"""Persistence layer (SQLAlchemy). DB-agnostic: SQLite for dev/tests, Postgres
(Supabase) in deployment via DATABASE_URL."""

from app.db.models import Base, Company, Job, JobStatus, SearchProfile
from app.db.session import get_session, init_db
from app.db.repository import persist_report, upsert_job

__all__ = [
    "Base",
    "Company",
    "Job",
    "JobStatus",
    "SearchProfile",
    "get_session",
    "init_db",
    "persist_report",
    "upsert_job",
]
