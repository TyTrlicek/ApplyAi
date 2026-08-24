"""Add application_started_at, application_submitted_at, form_answers to jobs table.

Run once:
    cd backend && source .venv/bin/activate && python scripts/migrate_add_application_columns.py
"""

from __future__ import annotations

from sqlalchemy import text
from app.db.session import engine


def main() -> None:
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_started_at TIMESTAMPTZ"
        ))
        conn.execute(text(
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_submitted_at TIMESTAMPTZ"
        ))
        conn.execute(text(
            "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS form_answers JSONB"
        ))
        conn.commit()
    print("Migration complete: application_started_at + application_submitted_at + form_answers added to jobs.")


if __name__ == "__main__":
    main()
