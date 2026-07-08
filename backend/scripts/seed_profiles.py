"""Seed the default search profiles into the database.

Run once after init_db(). Safe to re-run — skips profiles that already exist.

    cd backend && python scripts/seed_profiles.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.db import get_session, init_db
from app.db.models import SearchProfile

DEFAULT_PROFILES = [
    {"name": "Software Engineer",  "search_term": "software engineer"},
    {"name": "DevOps Engineer",    "search_term": "devops engineer"},
    {"name": "Cloud Engineer",     "search_term": "cloud engineer"},
    {"name": "AI Engineer",        "search_term": "AI engineer"},
    {"name": "Data Engineer",      "search_term": "data engineer"},
    {"name": "AIOps Engineer",     "search_term": "AIOps engineer"},
]

DEFAULTS = {
    "location":       "United States",
    "country":        "usa",
    "is_remote":      False,
    "job_type":       "fulltime",
    "results_wanted": 50,
    "hours_old":      24,
    "sources":        "indeed,google,linkedin",
    "active":         True,
}


def main() -> int:
    init_db()
    created = 0
    skipped = 0

    with get_session() as session:
        for p in DEFAULT_PROFILES:
            exists = session.scalar(
                select(SearchProfile).where(SearchProfile.name == p["name"])
            )
            if exists:
                skipped += 1
                continue
            session.add(SearchProfile(**p, **DEFAULTS))
            created += 1

    print(f"Search profiles: {created} created, {skipped} already existed")
    with get_session() as session:
        profiles = session.scalars(select(SearchProfile)).all()
        for p in profiles:
            status = "active" if p.active else "inactive"
            print(f"  [{status}] {p.name} — '{p.search_term}' ({p.sources})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
