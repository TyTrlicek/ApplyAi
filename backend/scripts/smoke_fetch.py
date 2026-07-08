"""Smoke test: run a small real fetch through the adapter layer and print a
per-source health report. This hits the network.

    cd backend && python scripts/smoke_fetch.py

Use a tiny results_wanted so it stays fast and low-volume (polite scraping).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running as a plain script: put backend/ on the path so `app` imports work.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.fetch import fetch_all  # noqa: E402
from app.sources.base import SearchQuery  # noqa: E402
from app.sources.jobspy_adapter import JobSpyAdapter  # noqa: E402


def main() -> int:
    query = SearchQuery(
        search_term="software engineer intern",
        location="United States",
        results_wanted=5,
        hours_old=168,
    )

    # Indeed only for the smoke test: cleanest scraper, no proxy/rate-limit needed.
    report = fetch_all(query, adapters=[JobSpyAdapter("indeed")])

    print(report.summary())
    print()
    for job in report.jobs[:5]:
        loc = job.location or "?"
        print(f"  [{job.source}] {job.title} @ {job.company or '?'} ({loc})")
        print(f"        {job.url}")

    if report.degraded_sources:
        print(f"\nWARNING: degraded sources: {report.degraded_sources}")
        return 1
    if not report.jobs:
        print("\nWARNING: no jobs returned (source may be blocking; try again / add proxy)")
        return 1
    print("\nOK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
