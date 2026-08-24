"""APScheduler-based background scheduler for daily job fetches."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.config import FETCH_SCHEDULE_HOUR
from app.db.models import SearchProfile
from app.db.repository import persist_report
from app.db.session import get_session
from app.fetch import fetch_all
from app.sources.base import ENTRY_LEVEL_LINKEDIN, SearchQuery
from app.sources.jobspy_adapter import JobSpyAdapter

logger = logging.getLogger("applyai.scheduler")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     [scheduler] %(message)s"))
    logger.addHandler(_handler)
    logger.propagate = False

_scheduler: BackgroundScheduler | None = None

_state: dict[str, Any] = {
    "last_run_at": None,
    "last_run_status": None,
    "last_run_summary": None,
}


def _run_fetch() -> None:
    logger.info("Daily fetch starting")
    _state["last_run_at"] = datetime.now().isoformat()

    try:
        with get_session() as session:
            profiles = session.scalars(
                select(SearchProfile).where(SearchProfile.active == True)
            ).all()

        total_inserted = 0
        total_updated = 0

        for profile in profiles:
            sources = [s.strip() for s in profile.sources.split(",")]
            adapters = [JobSpyAdapter(site=s, proxies=None) for s in sources]
            for adapter in adapters:
                if adapter.site == "linkedin":
                    adapter._linkedin_experience_level = ENTRY_LEVEL_LINKEDIN

            query = SearchQuery(
                search_term=f'"{profile.search_term}"',
                location=profile.location,
                country=profile.country,
                is_remote=profile.is_remote,
                job_type=profile.job_type,
                results_wanted=profile.results_wanted,
                hours_old=profile.hours_old,
                linkedin_experience_level=ENTRY_LEVEL_LINKEDIN,
            )

            report = fetch_all(query, adapters=adapters)

            with get_session() as persist_session:
                result = persist_report(persist_session, report)

            total_inserted += result.inserted
            total_updated += result.updated
            logger.info("profile=%s inserted=%d updated=%d", profile.name, result.inserted, result.updated)

        _state["last_run_status"] = "success"
        _state["last_run_summary"] = {"total_inserted": total_inserted, "total_updated": total_updated}
        logger.info("Daily fetch complete: inserted=%d updated=%d", total_inserted, total_updated)

    except Exception as e:
        _state["last_run_status"] = "error"
        _state["last_run_summary"] = {"error": str(e)}
        logger.exception("Daily fetch failed: %s", e)


def start() -> None:
    global _scheduler
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _run_fetch,
        CronTrigger(hour=FETCH_SCHEDULE_HOUR, minute=0),
        id="daily_fetch",
        replace_existing=True,
    )
    _scheduler.start()
    job = _scheduler.get_job("daily_fetch")
    logger.info(
        "Scheduler started — daily fetch at %02d:00, next run: %s",
        FETCH_SCHEDULE_HOUR,
        job.next_run_time,
    )


def stop() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def get_status() -> dict[str, Any]:
    next_run_at = None
    if _scheduler and _scheduler.running:
        job = _scheduler.get_job("daily_fetch")
        if job and job.next_run_time:
            next_run_at = job.next_run_time.isoformat()

    return {
        "active": bool(_scheduler and _scheduler.running),
        "hour": FETCH_SCHEDULE_HOUR,
        "next_run_at": next_run_at,
        **_state,
    }
