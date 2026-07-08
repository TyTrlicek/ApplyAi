"""Migrate job statuses: rename decided_not -> chose_not_to_apply.

Safe to re-run — only updates rows that still have the old value.

    cd backend && python scripts/migrate_status_expansion.py
"""
import sys
sys.path.insert(0, "/Users/tytrlicek/projects/ApplyAi/backend")

from sqlalchemy import text
from app.db.session import engine

with engine.begin() as conn:
    result = conn.execute(
        text("UPDATE jobs SET status = 'chose_not_to_apply' WHERE status = 'decided_not'")
    )
    print(f"Migrated {result.rowcount} rows: decided_not -> chose_not_to_apply")
    total = conn.execute(text("SELECT COUNT(*) FROM jobs")).scalar()
    print(f"Total jobs in DB: {total}")
