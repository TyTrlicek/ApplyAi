"""State file and signal file helpers for the Playwright subprocess.

State file:  ~/.applyai/apply_state/<job_id>.json  — subprocess writes, FastAPI reads
Signal file: ~/.applyai/apply_state/<job_id>.signal — FastAPI writes, subprocess reads
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

STATE_DIR = Path.home() / ".applyai" / "apply_state"
TMP_DIR = Path.home() / ".applyai" / "tmp"
BROWSER_PROFILE_DIR = Path.home() / ".applyai" / "browser_profile"

ApplyStatus = Literal["starting", "running", "waiting_for_login", "waiting_for_review", "submitted", "error", "cancelled"]


def _ensure_dirs() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)


def state_path(job_id: int) -> Path:
    return STATE_DIR / f"{job_id}.json"


def signal_path(job_id: int) -> Path:
    return STATE_DIR / f"{job_id}.signal"


def write_state(
    job_id: int,
    status: ApplyStatus,
    *,
    step: str | None = None,
    filled_fields: list[dict] | None = None,
    error: str | None = None,
    pid: int | None = None,
) -> None:
    _ensure_dirs()
    existing = read_state(job_id) or {}
    state = {
        "status": status,
        "pid": pid if pid is not None else existing.get("pid"),
        "step": step if step is not None else existing.get("step"),
        "filled_fields": filled_fields if filled_fields is not None else existing.get("filled_fields", []),
        "error": error,
        "started_at": existing.get("started_at") or datetime.now(timezone.utc).isoformat(),
    }
    state_path(job_id).write_text(json.dumps(state))


def read_state(job_id: int) -> dict | None:
    p = state_path(job_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def clear_state(job_id: int) -> None:
    for p in [state_path(job_id), signal_path(job_id)]:
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass


def write_signal(job_id: int, signal: Literal["submit", "cancel"]) -> None:
    _ensure_dirs()
    signal_path(job_id).write_text(signal)


def read_signal(job_id: int) -> str | None:
    p = signal_path(job_id)
    if not p.exists():
        return None
    try:
        return p.read_text().strip()
    except Exception:
        return None


def clear_signal(job_id: int) -> None:
    try:
        signal_path(job_id).unlink(missing_ok=True)
    except Exception:
        pass


def resume_path(job_id: int) -> Path:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    return TMP_DIR / f"{job_id}_resume.docx"


def cover_letter_path(job_id: int) -> Path:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    return TMP_DIR / f"{job_id}_cover_letter.docx"
