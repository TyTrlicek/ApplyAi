"""Offline tests for exclusion-based seniority filtering (no network)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.fetch import filter_seniority  # noqa: E402
from app.sources.base import NormalizedJob, is_excluded_title  # noqa: E402


def _job(title):
    return NormalizedJob(source="indeed", source_id=None, title=title, company="Acme")


def test_excludes_obvious_senior_titles():
    for title in [
        "Senior Software Engineer",
        "Sr. Data Engineer",
        "Staff AI Engineer",
        "Principal DevOps Engineer",
        "Engineering Manager",
        "Software Engineer III",
        "Lead Backend Engineer",
        "Director of Engineering",
        "Software Architect",
    ]:
        assert is_excluded_title(title), f"should exclude: {title}"


def test_keeps_entry_level_titles():
    for title in [
        "Software Engineer",
        "Junior Software Engineer",
        "Entry Level Data Engineer",
        "Software Engineer I",
        "New Grad AI Engineer",
        "Associate DevOps Engineer",
        "AIOps Engineer",
    ]:
        assert not is_excluded_title(title), f"should keep: {title}"


def test_whole_word_matching_avoids_false_positives():
    # "sr" must not match inside other words; "ii" must not match "Hawaii"
    assert not is_excluded_title("MSR Research Engineer")
    assert not is_excluded_title("Engineer, Hawaii Office")


def test_filter_seniority_counts():
    jobs = [_job("Software Engineer"), _job("Senior Software Engineer"), _job("Data Engineer I")]
    kept, removed = filter_seniority(jobs)
    assert removed == 1
    assert {j.title for j in kept} == {"Software Engineer", "Data Engineer I"}


def test_custom_exclude_terms_override():
    jobs = [_job("Software Engineer"), _job("Backend Engineer")]
    kept, removed = filter_seniority(jobs, exclude_terms=["backend"])
    assert removed == 1
    assert kept[0].title == "Software Engineer"
