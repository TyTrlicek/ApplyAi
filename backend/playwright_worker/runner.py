"""Playwright subprocess entry point.

Spawned by FastAPI for each apply attempt. Runs independently — communicates
with FastAPI via state/signal files in ~/.applyai/apply_state/.

Run as:
    cd backend
    PYTHONPATH=. python -m playwright_worker.runner <job_id>
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure the backend root is importable
_BACKEND_DIR = Path(__file__).parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from playwright.sync_api import sync_playwright
from sqlalchemy import select

from app.db.models import Job, JobStatus
from app.db.repository import get_profile
from app.db.session import get_session
from app.docx_render import build_cover_letter_docx, build_resume_docx
from playwright_worker.ashby import AshbyApply
from playwright_worker.greenhouse import GreenhouseApply
from playwright_worker.linkedin import LinkedInEasyApply
from playwright_worker.portals import detect_portal as _detect_portal
from playwright_worker.workday import WorkdayApply
from playwright_worker.state import (
    BROWSER_PROFILE_DIR,
    clear_signal,
    cover_letter_path,
    read_signal,
    resume_path,
    write_state,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [playwright] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("applyai.runner")

API_BASE = os.environ.get("API_BASE_URL", "http://localhost:8000")



def _ai_answer_fn(job_id: int):
    """Return a callable that hits our own form-answers endpoint for one question."""
    import requests

    def answer(question: str) -> str:
        try:
            r = requests.post(
                f"{API_BASE}/jobs/{job_id}/form-answers",
                json={"questions": [question]},
                timeout=45,
            )
            r.raise_for_status()
            answers = r.json().get("answers", [])
            return answers[0] if answers else ""
        except Exception as exc:
            log.warning("AI answer failed for '%s': %s", question[:60], exc)
            return ""

    return answer


def main(job_id: int) -> None:
    log.info("Runner started for job_id=%d  pid=%d", job_id, os.getpid())
    write_state(job_id, "starting", pid=os.getpid())

    # ── Load job + profile from DB ─────────────────────────────────────────────
    with get_session() as session:
        job = session.scalar(select(Job).where(Job.id == job_id))
        if not job:
            write_state(job_id, "error", error=f"Job {job_id} not found in database")
            return

        resume_source = job.resume_source or "uploaded"
        job_url = job.url
        cached_resume = job.cached_resume
        cached_cover_letter = job.cached_cover_letter

        profile = get_profile(session)
        if not profile:
            write_state(job_id, "error", error="Profile is empty — fill in your profile first")
            return

        uploaded_resume = profile.get("resumeFile")
        if resume_source == "ai_generated" and not cached_resume:
            write_state(job_id, "error", error="Resume not generated — generate it on the Prepare page first")
            return
        if resume_source == "uploaded" and not (uploaded_resume and Path(uploaded_resume.get("path", "")).exists()):
            write_state(job_id, "error", error="No default resume uploaded — upload one on the Profile page")
            return

    if not job_url:
        write_state(job_id, "error", error="Job has no URL")
        return

    # Prefer apply_url for portal detection; fall back to job URL
    apply_url_for_detect = None
    with get_session() as session:
        job_row = session.scalar(select(Job).where(Job.id == job_id))
        if job_row:
            apply_url_for_detect = job_row.apply_url

    portal = _detect_portal(apply_url_for_detect or job_url)
    # apply_url is the actual application page (captured by the extension via
    # LinkedIn's off-platform redirect); job_url is only a fallback for jobs
    # captured before that existed, or where no apply_url was found.
    portal_url = apply_url_for_detect or job_url

    # ── Resolve the resume file to upload ──────────────────────────────────────
    if resume_source == "ai_generated":
        r_path = resume_path(job_id)
        try:
            r_path.write_bytes(
                build_resume_docx(cached_resume.get("resume", {}), cached_resume.get("job", {}))
            )
            log.info("AI-tailored resume rendered → %s", r_path)
        except Exception as exc:
            write_state(job_id, "error", error=f"Failed to render resume DOCX: {exc}")
            return
    else:
        # Uploaded default resume — use the profile's file directly, no rendering.
        r_path = Path(uploaded_resume["path"])
        log.info("Using uploaded resume → %s", r_path)

    cl_path = None
    if cached_cover_letter:
        cl_path = cover_letter_path(job_id)
        try:
            cl_path.write_bytes(build_cover_letter_docx(cached_cover_letter))
            log.info("Cover letter written → %s", cl_path)
        except Exception as exc:
            log.warning("Could not render cover letter DOCX (will skip upload): %s", exc)
            cl_path = None

    # ── Clear any stale signals from prior runs ────────────────────────────────
    clear_signal(job_id)

    # ── Launch Playwright ──────────────────────────────────────────────────────
    BROWSER_PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    try:
        with sync_playwright() as pw:
            context = pw.chromium.launch_persistent_context(
                str(BROWSER_PROFILE_DIR),
                headless=False,
                args=["--start-maximized"],
                no_viewport=True,
            )
            try:
                page = context.new_page()

                def _write(status, **kwargs):
                    write_state(job_id, status, pid=os.getpid(), **kwargs)

                handler_kwargs = dict(
                    page=page,
                    job_id=job_id,
                    profile=profile,
                    resume_path=r_path,
                    cover_letter_path=cl_path,
                    ai_answer_fn=_ai_answer_fn(job_id),
                    write_state_fn=_write,
                    read_signal_fn=lambda: read_signal(job_id),
                )

                if portal == "linkedin":
                    applier = LinkedInEasyApply(job_url=portal_url, **handler_kwargs)
                elif portal == "workday":
                    applier = WorkdayApply(job_url=portal_url, **handler_kwargs)
                elif portal == "ashby":
                    applier = AshbyApply(job_url=portal_url, **handler_kwargs)
                elif portal == "greenhouse":
                    applier = GreenhouseApply(job_url=portal_url, **handler_kwargs)
                else:
                    write_state(job_id, "error", error=f"Portal not yet supported: {portal}. Apply manually.")
                    return

                applier.run()

                # If successfully submitted, mark job as applied in DB
                final = applier.filled_fields
                state_data = None
                try:
                    from playwright_worker.state import read_state
                    state_data = read_state(job_id)
                except Exception:
                    pass

                if state_data and state_data.get("status") == "submitted":
                    try:
                        with get_session() as session:
                            job_row = session.scalar(select(Job).where(Job.id == job_id))
                            if job_row:
                                job_row.application_submitted_at = datetime.now(timezone.utc)
                                job_row.status = JobStatus.APPLIED
                                job_row.form_answers = [
                                    f for f in final if f.get("ai_generated")
                                ] or None
                        log.info("Job %d marked as applied", job_id)
                    except Exception as exc:
                        log.warning("Could not update job status in DB: %s", exc)
            finally:
                # Guarantee the persistent profile (and whatever session/login
                # state accumulated this run) gets flushed to disk even if
                # applier.run() raised — otherwise a crashed run can silently
                # lose a login that just succeeded.
                context.close()

    except Exception as exc:
        log.exception("Runner failed: %s", exc)
        write_state(job_id, "error", error=str(exc))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m playwright_worker.runner <job_id>", file=sys.stderr)
        sys.exit(1)
    main(int(sys.argv[1]))
