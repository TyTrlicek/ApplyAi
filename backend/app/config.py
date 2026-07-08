"""Runtime configuration, read from environment / backend/.env.

DATABASE_URL examples:
  * local dev (default):  sqlite:///./applyai.db
  * Supabase / Postgres:  postgresql://USER:PASSWORD@HOST:5432/postgres

A plain `postgresql://` (or `postgres://`) URL is normalized to the
`postgresql+psycopg://` driver used by SQLAlchemy here, so you can paste the
Supabase connection string as-is.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:  # dotenv optional; env vars still work without it
    pass


def _normalize(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalize(os.environ.get("DATABASE_URL", "sqlite:///./applyai.db"))
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
