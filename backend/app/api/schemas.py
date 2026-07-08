"""Pydantic request/response schemas for the API layer."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from app.db.models import JobStatus


class CompanyOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class JobOut(BaseModel):
    id: int
    title: str
    company: CompanyOut | None
    location: str | None
    is_remote: bool
    url: str | None
    apply_url: str | None
    date_posted: date | None
    salary_min: float | None
    salary_max: float | None
    salary_currency: str | None
    salary_interval: str | None
    source: str
    status: JobStatus
    first_seen: datetime
    last_seen: datetime
    description: str | None
    cached_resume: dict | None = None
    cached_cover_letter: dict | None = None

    model_config = {"from_attributes": True}


class JobStatusUpdate(BaseModel):
    status: JobStatus


class SearchProfileOut(BaseModel):
    id: int
    name: str
    search_term: str
    location: str
    is_remote: bool
    job_type: str | None
    results_wanted: int
    hours_old: int
    sources: str
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SearchProfileCreate(BaseModel):
    name: str
    search_term: str
    location: str = "United States"
    country: str = "usa"
    is_remote: bool = False
    job_type: str | None = "fulltime"
    results_wanted: int = 50
    hours_old: int = 24
    sources: str = "indeed,google,linkedin"
    active: bool = True


class FetchRequest(BaseModel):
    profile_ids: list[int] | None = None  # None = run all active profiles
    hours_old: int | None = None           # override profile's hours_old


class FetchResult(BaseModel):
    profile: str
    inserted: int
    updated: int
    seniority_filtered: int
    domain_filtered: int
    noise_filtered: int
    duplicates_removed: int
    degraded_sources: list[str]


class FetchResponse(BaseModel):
    results: list[FetchResult]
    total_inserted: int
    total_updated: int
