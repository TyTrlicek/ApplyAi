"""Engine + session management."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import DATABASE_URL
from app.db.models import Base

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
# pool_pre_ping: Neon (and serverless Postgres generally) closes idle connections
# server-side: without this, the pool hands back a dead connection and every
# query after an idle period fails with "SSL connection has been closed
# unexpectedly". pool_recycle forces a refresh before Neon's own idle timeout
# can hit. Both are no-ops for local SQLite.
engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    future=True,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


def init_db() -> None:
    """Create tables if they don't exist. Fine for MVP; swap to Alembic migrations
    once the schema starts evolving in production."""
    Base.metadata.create_all(engine)

    # create_all() only creates missing tables, not missing columns on tables that
    # already existed before a model change. Backfill new columns here until this
    # project has real migrations.
    with engine.begin() as conn:
        if DATABASE_URL.startswith("sqlite"):
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(jobs)"))}
            if "resume_source" not in cols:
                conn.execute(text(
                    "ALTER TABLE jobs ADD COLUMN resume_source VARCHAR(16) DEFAULT 'uploaded'"
                ))
        else:
            conn.execute(text(
                "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resume_source VARCHAR(16) DEFAULT 'uploaded'"
            ))


@contextmanager
def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
