"""Job source adapters.

Every job source (vendored JobSpy scrapers, future paid APIs, etc.) is exposed
through the SourceAdapter interface so the rest of the system never depends on a
single fragile source. A broken adapter degrades gracefully instead of taking
down the fetch pipeline.
"""

from app.sources.base import NormalizedJob, SearchQuery, SourceAdapter, SourceResult

__all__ = ["NormalizedJob", "SearchQuery", "SourceAdapter", "SourceResult"]
