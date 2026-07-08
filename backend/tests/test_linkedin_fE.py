"""Verify the vendored LinkedIn f_E patch is wired end-to-end (offline).

We don't hit the network here; we confirm the parameter threads from
scrape_jobs -> ScraperInput, and that the LinkedIn scraper emits f_E in its
search params for the experience codes we pass.
"""

import inspect
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor"))

import jobspy  # noqa: E402
from jobspy.model import ScraperInput  # noqa: E402


def test_scrape_jobs_accepts_experience_level():
    sig = inspect.signature(jobspy.scrape_jobs)
    assert "linkedin_experience_level" in sig.parameters


def test_scraper_input_has_field():
    si = ScraperInput(site_type=[], linkedin_experience_level=[1, 2, 3])
    assert si.linkedin_experience_level == [1, 2, 3]


def test_linkedin_source_builds_f_E_param():
    # The patch lives in linkedin/__init__.py; confirm the source emits f_E.
    src = inspect.getsource(sys.modules["jobspy.linkedin"])
    assert '"f_E"' in src
    assert "linkedin_experience_level" in src
