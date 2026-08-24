"""Apply endpoints — spawn + control the Playwright subprocess per job."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.db.models import Job
from app.db.repository import get_profile
from app.db.session import get_session
from playwright_worker.state import (
    clear_state,
    read_state,
    write_signal,
)

router = APIRouter(prefix="/jobs", tags=["apply"])

_BACKEND_DIR = Path(__file__).parents[3]  # backend/app/api/routes/ → backend/


def _proc_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


@router.post("/{job_id}/apply")
def start_apply(job_id: int):
    """Spawn a Playwright subprocess to auto-fill the LinkedIn Easy Apply form."""
    with get_session() as session:
        job = session.scalar(select(Job).where(Job.id == job_id))
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        has_ai_resume = bool(job.cached_resume)
        resume_file = (get_profile(session) or {}).get("resumeFile")
        has_uploaded_resume = bool(resume_file and Path(resume_file.get("path", "")).exists())
        if not has_ai_resume and not has_uploaded_resume:
            raise HTTPException(
                status_code=400,
                detail="Upload a default resume on the Profile page, or generate a tailored one for this job first",
            )
        if not job.url:
            raise HTTPException(status_code=400, detail="Job has no URL")

        # Prevent double-spawn
        existing = read_state(job_id)
        if existing:
            status = existing.get("status")
            pid = existing.get("pid")
            if status in ("starting", "running", "waiting_for_review") and _proc_alive(pid):
                raise HTTPException(status_code=409, detail="An apply session is already running for this job")

        job.application_started_at = datetime.now(timezone.utc)

    # Spawn detached subprocess
    proc = subprocess.Popen(
        [sys.executable, "-m", "playwright_worker.runner", str(job_id)],
        cwd=str(_BACKEND_DIR),
        env={**os.environ, "PYTHONPATH": str(_BACKEND_DIR)},
        stdout=open(Path.home() / ".applyai" / "apply_state" / f"{job_id}.log", "w"),
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

    return {"status": "starting", "pid": proc.pid}


@router.get("/{job_id}/apply-status")
def get_apply_status(job_id: int):
    """Poll this to track the Playwright session state."""
    state = read_state(job_id)
    if not state:
        return {"status": "idle", "filled_fields": [], "step": None, "error": None}

    # Mark as error if process died unexpectedly
    pid = state.get("pid")
    status = state.get("status")
    if status in ("starting", "running") and not _proc_alive(pid):
        state["status"] = "error"
        state["error"] = state.get("error") or "Process exited unexpectedly"

    return state


@router.post("/{job_id}/apply-continue")
def continue_apply(job_id: int):
    """Signal the Playwright process to continue after manual login."""
    state = read_state(job_id)
    if not state or state.get("status") != "waiting_for_login":
        raise HTTPException(status_code=400, detail="No session waiting for login")
    write_signal(job_id, "continue")
    return {"ok": True}


@router.post("/{job_id}/apply-submit")
def submit_apply(job_id: int):
    """Tell the waiting Playwright process to click Submit."""
    state = read_state(job_id)
    if not state or state.get("status") != "waiting_for_review":
        raise HTTPException(status_code=400, detail="No session waiting for review")
    write_signal(job_id, "submit")
    return {"ok": True}


@router.delete("/{job_id}/apply")
def cancel_apply(job_id: int):
    """Cancel a running or waiting Playwright session."""
    state = read_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="No active session for this job")

    pid = state.get("pid")
    write_signal(job_id, "cancel")

    # Give the process a moment to clean up, then force-kill if needed
    if _proc_alive(pid):
        import time
        time.sleep(1.5)
        if _proc_alive(pid):
            try:
                os.kill(pid, 15)  # SIGTERM
            except Exception:
                pass

    clear_state(job_id)
    return {"ok": True}
