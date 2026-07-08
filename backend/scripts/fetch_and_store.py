"""End-to-end: fetch jobs -> persist to the database (upsert on dedup_key).

    cd backend && python scripts/fetch_and_store.py

Uses DATABASE_URL (default local sqlite:///./applyai.db). Run it twice to see
incremental behaviour: the second run reports updates, not new inserts.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select  # noqa: E402

from app.db import get_session, init_db  # noqa: E402
from app.db.models import Job, JobStatus  # noqa: E402
from app.db.repository import persist_report  # noqa: E402
from app.fetch import fetch_all  # noqa: E402
from app.sources.base import SearchQuery  # noqa: E402
from app.sources.jobspy_adapter import JobSpyAdapter  # noqa: E402


def main() -> int:
    init_db()

    query = SearchQuery(
        search_term="entry level software engineer",
        location="United States",
        results_wanted=15,
        hours_old=168,
    )
    report = fetch_all(query, adapters=[JobSpyAdapter("indeed")])
    print(report.summary())

    with get_session() as session:
        result = persist_report(session, report)

    with get_session() as session:
        total = session.scalar(select(func.count()).select_from(Job))
        need = session.scalar(
            select(func.count()).select_from(Job).where(Job.status == JobStatus.NEED_TO_APPLY)
        )

    print(f"\nPersisted: {result.inserted} new, {result.updated} updated")
    print(f"DB now holds: {total} jobs ({need} need-to-apply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
