"""Offline tests for the canonical schema + cross-source dedup (no network)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.fetch import deduplicate  # noqa: E402
from app.sources.base import NormalizedJob, SourceResult  # noqa: E402


def _job(source, title, company, location="New York, NY"):
    return NormalizedJob(source=source, source_id=None, title=title, company=company, location=location)


def test_dedup_collapses_same_job_across_sources():
    jobs = [
        _job("indeed", "Software Engineer", "Acme Corp"),
        _job("linkedin", "software engineer", "acme corp"),   # case/space variant
        _job("google", "Software  Engineer", "Acme  Corp."),  # punctuation/space variant
    ]
    unique, removed = deduplicate(jobs)
    assert len(unique) == 1
    assert removed == 2
    # first-seen (priority order) wins
    assert unique[0].source == "indeed"


def test_dedup_keeps_genuinely_different_jobs():
    jobs = [
        _job("indeed", "Software Engineer", "Acme Corp"),
        _job("indeed", "Data Scientist", "Acme Corp"),
        _job("indeed", "Software Engineer", "Globex"),
    ]
    unique, removed = deduplicate(jobs)
    assert len(unique) == 3
    assert removed == 0


def test_dedup_key_is_stable_and_normalized():
    a = _job("indeed", "Sr. Engineer, Backend", "Foo, Inc.")
    b = _job("linkedin", "sr engineer backend", "foo inc")
    assert a.dedup_key == b.dedup_key


def test_source_result_degraded_is_visible():
    r = SourceResult(source="linkedin", ok=False, error="RateLimited: 429")
    assert not r.ok
    assert "429" in r.error
