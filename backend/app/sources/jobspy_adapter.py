"""Adapter wrapping the vendored JobSpy scrapers (backend/vendor/jobspy).

One JobSpyAdapter instance = one underlying source (indeed, linkedin, google, ...).
The vendored scraper code lives in our repo, so when a source's HTML/endpoints
change we patch backend/vendor/jobspy/<source>/ directly instead of waiting on
an upstream release.
"""

from __future__ import annotations

import math
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

from app.sources.base import NormalizedJob, SearchQuery, SourceAdapter, SourceResult

# Put the vendored package on the path so its internal absolute imports
# (`from jobspy.indeed import ...`) resolve against our copied-in snapshot.
_VENDOR_DIR = Path(__file__).resolve().parents[2] / "vendor"
if str(_VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(_VENDOR_DIR))


# Sources we actually use, in priority order. Indeed is the workhorse (broadest
# coverage, scrapes cleanest); google adds aggregator breadth; linkedin is most
# rate-limited and added last. Others stay available but off by default.
DEFAULT_SITES = ("indeed", "google", "linkedin")


class JobSpyAdapter(SourceAdapter):
    def __init__(self, site: str, proxies: list[str] | None = None):
        self.name = site
        self.site = site
        self.proxies = proxies

    def fetch(self, query: SearchQuery) -> SourceResult:
        try:
            from jobspy import scrape_jobs  # vendored

            df = scrape_jobs(
                site_name=[self.site],
                search_term=query.search_term,
                google_search_term=query.search_term if self.site == "google" else None,
                location=query.location,
                is_remote=query.is_remote,
                results_wanted=query.results_wanted,
                hours_old=query.hours_old,
                country_indeed=query.country,
                job_type=query.job_type,
                # Server-side level filter only applies to LinkedIn (f_E).
                linkedin_experience_level=(
                    query.linkedin_experience_level if self.site == "linkedin" else None
                ),
                proxies=self.proxies,
                verbose=0,
            )
            jobs = [self._to_normalized(row) for row in df.to_dict("records")]
            return SourceResult(source=self.name, ok=True, jobs=jobs)
        except Exception as exc:  # graceful degradation -- never raise
            return SourceResult(source=self.name, ok=False, error=f"{type(exc).__name__}: {exc}")

    def _to_normalized(self, row: dict[str, Any]) -> NormalizedJob:
        return NormalizedJob(
            source=_clean(row.get("site")) or self.name,
            source_id=_clean(row.get("id")),
            title=_clean(row.get("title")) or "(untitled)",
            company=_clean(row.get("company")),
            location=_clean(row.get("location")),
            is_remote=bool(row.get("is_remote")),
            url=_clean(row.get("job_url")),
            apply_url=_clean(row.get("job_url_direct")),
            date_posted=_to_date(row.get("date_posted")),
            salary_min=_to_float(row.get("min_amount")),
            salary_max=_to_float(row.get("max_amount")),
            salary_currency=_clean(row.get("currency")),
            salary_interval=_clean(row.get("interval")),
            description=_clean(row.get("description")),
            raw=row,
        )


def default_adapters(proxies: list[str] | None = None) -> list[JobSpyAdapter]:
    """The MVP 1 source set, in priority order."""
    return [JobSpyAdapter(site, proxies=proxies) for site in DEFAULT_SITES]


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    return text or None


def _to_float(value: Any) -> float | None:
    try:
        f = float(value)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def _to_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError):
        return None
