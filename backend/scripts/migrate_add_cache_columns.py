"""Add cached_resume and cached_cover_letter columns to the jobs table.

Run once:
    cd backend && source .venv/bin/activate && python scripts/migrate_add_cache_columns.py
"""

from __future__ import annotations

from sqlalchemy import text
from app.db.session import engine


def main() -> None:
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cached_resume JSONB"
        ))
        conn.execute(text(
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cached_cover_letter JSONB"
        ))
        conn.commit()
    print("Migration complete: cached_resume + cached_cover_letter added to jobs.")


if __name__ == "__main__":
    main()
