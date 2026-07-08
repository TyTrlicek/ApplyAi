"""Fetch orchestrator: run all source adapters for a query, then deduplicate
across sources into one canonical job list.

This is the MVP 1 backbone. It is deliberately source-agnostic -- it only knows
about the SourceAdapter interface, so adapters can be swapped, added, or fail
without changing this code.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from app.sources.base import (
    NormalizedJob,
    SearchQuery,
    SourceAdapter,
    SourceResult,
    is_blocked_company,
    is_excluded_title,
    is_noise_title,
    is_tech_title,
)
from app.sources.jobspy_adapter import default_adapters


@dataclass(slots=True)
class FetchReport:
    """Combined result of a fetch run, including per-source health so a degraded
    source is visible rather than silently empty."""

    jobs: list[NormalizedJob] = field(default_factory=list)
    results: list[SourceResult] = field(default_factory=list)
    duplicates_removed: int = 0
    seniority_filtered: int = 0
    domain_filtered: int = 0
    noise_filtered: int = 0

    @property
    def degraded_sources(self) -> list[str]:
        return [r.source for r in self.results if not r.ok]

    def summary(self) -> str:
        lines = [
            f"Fetched {len(self.jobs)} unique jobs "
            f"({self.duplicates_removed} dupes removed, "
            f"{self.seniority_filtered} senior excluded, "
            f"{self.domain_filtered} off-domain excluded, "
            f"{self.noise_filtered} noise excluded)"
        ]
        for r in self.results:
            status = f"{len(r.jobs)} jobs" if r.ok else f"FAILED ({r.error})"
            lines.append(f"  - {r.source}: {status}")
        return "\n".join(lines)


def filter_seniority(
    jobs: list[NormalizedJob],
    exclude_terms: tuple[str, ...] | list[str] | None = None,
) -> tuple[list[NormalizedJob], int]:
    """Drop jobs whose title carries a senior signal (exclusion-based). Applies
    to every source, so it catches senior roles that leak past LinkedIn's f_E
    filter on Indeed/Google. Returns (kept, removed_count)."""
    kept = [j for j in jobs if not is_excluded_title(j.title, exclude_terms)]
    return kept, len(jobs) - len(kept)


def filter_noise(
    jobs: list[NormalizedJob],
    noise_terms: tuple[str, ...] | list[str] | None = None,
) -> tuple[list[NormalizedJob], int]:
    """Drop jobs from blocked companies or with noise-pattern titles (gig work,
    clearance-required, etc.). Returns (kept, removed_count)."""
    kept = [
        j for j in jobs
        if not is_blocked_company(j.company) and not is_noise_title(j.title, noise_terms)
    ]
    return kept, len(jobs) - len(kept)


def filter_domain(
    jobs: list[NormalizedJob],
    include_terms: tuple[str, ...] | list[str] | None = None,
) -> tuple[list[NormalizedJob], int]:
    """Keep only jobs whose title contains a tech-domain signal word (inclusion-based).
    Catches off-domain results (finance, ops, admin) that slip through keyword-match
    noise on Indeed/Google despite a quoted search term. Returns (kept, removed_count)."""
    kept = [j for j in jobs if is_tech_title(j.title, include_terms)]
    return kept, len(jobs) - len(kept)


def deduplicate(jobs: list[NormalizedJob]) -> tuple[list[NormalizedJob], int]:
    """Collapse cross-source duplicates by canonical key, keeping first seen
    (sources are processed in priority order). Returns (unique, removed_count)."""
    seen: set[str] = set()
    unique: list[NormalizedJob] = []
    for job in jobs:
        key = job.dedup_key
        if key in seen:
            continue
        seen.add(key)
        unique.append(job)
    return unique, len(jobs) - len(unique)


def fetch_all(
    query: SearchQuery,
    adapters: list[SourceAdapter] | None = None,
    max_workers: int = 4,
    exclude_seniority: bool = True,
    exclude_terms: tuple[str, ...] | list[str] | None = None,
    include_domain: bool = True,
    include_terms: tuple[str, ...] | list[str] | None = None,
    exclude_noise: bool = True,
    noise_terms: tuple[str, ...] | list[str] | None = None,
) -> FetchReport:
    """Run every adapter concurrently, merge, filter, dedupe, report.

    Filter order:
      1. Seniority exclusion  — drop senior/lead/staff/etc titles
      2. Domain inclusion     — keep only titles with a tech-signal word
      3. Noise exclusion      — drop blocked companies + gig/clearance title patterns
      4. Dedup                — collapse cross-source duplicates
    """
    adapters = adapters if adapters is not None else default_adapters()

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        results = list(pool.map(lambda a: a.fetch(query), adapters))

    merged: list[NormalizedJob] = []
    for result in results:  # priority order preserved
        merged.extend(result.jobs)

    seniority_filtered = 0
    if exclude_seniority:
        merged, seniority_filtered = filter_seniority(merged, exclude_terms)

    domain_filtered = 0
    if include_domain:
        merged, domain_filtered = filter_domain(merged, include_terms)

    noise_filtered = 0
    if exclude_noise:
        merged, noise_filtered = filter_noise(merged, noise_terms)

    unique, removed = deduplicate(merged)
    return FetchReport(
        jobs=unique,
        results=results,
        duplicates_removed=removed,
        seniority_filtered=seniority_filtered,
        domain_filtered=domain_filtered,
        noise_filtered=noise_filtered,
    )
