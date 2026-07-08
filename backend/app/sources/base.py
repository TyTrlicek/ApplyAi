"""Core source-adapter contracts: the canonical job schema, the search query,
and the SourceAdapter interface every source must implement.

Design notes
------------
* NormalizedJob is OUR schema and OUR source of truth -- never a raw source row.
* SourceAdapter.fetch() must NEVER raise. Failures are caught and reported via
  SourceResult.ok=False so one broken source can't kill the pipeline ("fragility
  quarantine"). The orchestrator decides what to do with a degraded source.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any


# LinkedIn f_E experience-level codes (used server-side via the vendored patch).
LINKEDIN_EXPERIENCE = {
    "internship": 1,
    "entry": 2,
    "associate": 3,
    "mid_senior": 4,
    "director": 5,
    "executive": 6,
}

# Default entry-level target for LinkedIn: internship + entry + associate.
ENTRY_LEVEL_LINKEDIN = [1, 2, 3]


@dataclass(slots=True)
class SearchQuery:
    """What to fetch. Drives every source query (research item R10)."""

    search_term: str
    location: str | None = None
    is_remote: bool = False
    results_wanted: int = 50
    hours_old: int | None = None  # only postings newer than N hours, if supported
    country: str = "usa"
    job_type: str | None = None  # fulltime|parttime|contract|temporary|internship
    # LinkedIn-only server-side level filter (f_E codes). None = no filter.
    linkedin_experience_level: list[int] | None = None


@dataclass(slots=True)
class NormalizedJob:
    """Canonical job object (research item R5). All sources map into this."""

    source: str
    source_id: str | None
    title: str
    company: str | None
    location: str | None = None
    is_remote: bool = False
    url: str | None = None
    apply_url: str | None = None
    date_posted: date | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_currency: str | None = None
    salary_interval: str | None = None
    description: str | None = None
    raw: dict[str, Any] = field(default_factory=dict, repr=False)

    @property
    def dedup_key(self) -> str:
        """Canonical key for cross-source dedup (research item R6).

        Normalized company + title + location. Same job posted to LinkedIn,
        Indeed and Google collapses to one key. This is an exact-key strategy;
        fuzzy/embedding matching is a documented future upgrade.
        """
        return "|".join(_norm(p) for p in (self.company, self.title, self.location))


# Companies whose listings are systematically low-quality: gig-work platforms
# disguised as engineering roles, staffing farms with mass multi-location spam, etc.
# Normalized (lowercase, alphanumeric + spaces only) for robust matching.
COMPANY_BLOCKLIST: frozenset[str] = frozenset({
    # Gig / annotation farms
    "dataannotation",
    "beaconfire inc",
    "beaconfire",
    "jbs international inc",
    "jbs international",
    # Indian IT staffing / body shops
    "tata consultancy services",
    "tcs",
    "emonics llc",
    "emonics",
    "inherent technologies",
    "intone networks",
    "capgemini",
    "osi engineering",
    "atc",
    "entarian",
    "wipro",
    # Job board aggregators posting as companies
    "jack jill",
    "sundayy",
    "fetchjobs co",
    "fetchjobs",
    "jobright ai",
    "jobright",
    "smart apply test company",
    "hibu",
})

# Title noise terms excluded regardless of seniority. Whole-word matched.
# "trainer"  → DataAnnotation "AI Trainer" gig posts
# "cleared"  → "Cleared Data Engineer" etc. (require active security clearance)
# "secret"   → "Top Secret", "Secret Clearance" (same problem)
DEFAULT_NOISE_EXCLUDE = (
    "trainer",
    "cleared",
    "clearance",
    "secret",
    "embedded",
    "mobile",
    "high side",
    "seta",
    "space systems",
)

# Senior-signal terms excluded from results on ALL sources (exclusion-based, not
# inclusion). Whole-word matched, case-insensitive. Catches what LinkedIn's f_E
# filter can't reach on Indeed/Google. Roman numerals II+ denote senior IC levels.
DEFAULT_SENIORITY_EXCLUDE = (
    "senior", "sr", "staff", "principal", "lead", "director", "manager", "mgr",
    "architect", "vp", "head", "ii", "iii", "iv", "distinguished", "fellow",
)

# Tech-domain inclusion terms. A job title must contain at least one of these
# (whole-word, case-insensitive) to pass the domain filter. Prevents off-domain
# results (finance, operations, admin) from slipping through keyword-match noise.
DEFAULT_TECH_INCLUDE = (
    "engineer", "developer", "programmer", "devops", "sre", "platform",
    "cloud", "data", "ml", "ai", "ops", "backend", "frontend", "fullstack",
    "full-stack", "software", "systems", "infrastructure", "security",
    "analyst", "scientist", "dba", "database", "automation", "qa",
    "reliability", "kubernetes", "python", "java", "golang",
)


def _build_regex(terms: tuple[str, ...] | list[str]) -> re.Pattern[str]:
    pattern = r"\b(" + "|".join(re.escape(t) for t in terms) + r")\b"
    return re.compile(pattern, re.IGNORECASE)


_DEFAULT_EXCLUDE_RE = _build_regex(DEFAULT_SENIORITY_EXCLUDE)
_DEFAULT_INCLUDE_RE = _build_regex(DEFAULT_TECH_INCLUDE)
_DEFAULT_NOISE_RE = _build_regex(DEFAULT_NOISE_EXCLUDE)


def is_excluded_title(title: str | None, terms: tuple[str, ...] | list[str] | None = None) -> bool:
    """True if the title contains a senior-signal term and should be dropped."""
    if not title:
        return False
    regex = _DEFAULT_EXCLUDE_RE if terms is None else _build_regex(terms)
    return regex.search(title) is not None


def is_tech_title(title: str | None, terms: tuple[str, ...] | list[str] | None = None) -> bool:
    """True if the title contains at least one tech-domain signal word."""
    if not title:
        return False
    regex = _DEFAULT_INCLUDE_RE if terms is None else _build_regex(terms)
    return regex.search(title) is not None


def is_noise_title(title: str | None, terms: tuple[str, ...] | list[str] | None = None) -> bool:
    """True if the title matches a noise-exclusion pattern (gig work, clearance, etc.)."""
    if not title:
        return False
    regex = _DEFAULT_NOISE_RE if terms is None else _build_regex(terms)
    return regex.search(title) is not None


def is_blocked_company(company: str | None) -> bool:
    """True if the company is on the blocklist (normalized, case-insensitive).

    Uses substring matching so that e.g. "Tata Consultancy Services (TCS)"
    matches the blocklist entry "tata consultancy services"."""
    if not company:
        return False
    normed = _norm(company)
    return any(entry in normed for entry in COMPANY_BLOCKLIST)


def _norm(value: str | None) -> str:
    if not value:
        return ""
    # lowercase, strip everything but alphanumerics + spaces, collapse whitespace
    cleaned = re.sub(r"[^a-z0-9 ]+", " ", value.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


@dataclass(slots=True)
class SourceResult:
    """Outcome of a single adapter run -- success or graceful failure."""

    source: str
    ok: bool
    jobs: list[NormalizedJob] = field(default_factory=list)
    error: str | None = None


class SourceAdapter(ABC):
    """Interface every job source implements."""

    #: Stable identifier, e.g. "indeed", "linkedin".
    name: str

    @abstractmethod
    def fetch(self, query: SearchQuery) -> SourceResult:
        """Fetch jobs for the query. MUST NOT raise -- wrap failures in
        SourceResult(ok=False, error=...)."""
        raise NotImplementedError
