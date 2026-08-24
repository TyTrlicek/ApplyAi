"""Scheduler status endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app import scheduler

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.get("/status")
def scheduler_status():
    return scheduler.get_status()
