# Vendored: JobSpy

Source: https://github.com/speedyapply/JobSpy
License: MIT (see LICENSE in this directory — © Cullen Watson 2023)
Vendored commit: fda080a373e8226f3fd60635323f5da9af9892b1
Vendored on: 2026-06-27

This is a copied-in (vendored) snapshot, not a pip dependency, so we own and can
patch the scraper code directly when a source's HTML/endpoints change.

## Runtime dependencies (add to backend requirements)
requests, beautifulsoup4, pandas, numpy, pydantic, tls-client, markdownify, regex

## Local modifications (search the code for the tag `ApplyAi`)
* Added LinkedIn experience-level filter (`f_E`), exposed end-to-end:
  - `__init__.py`  : `scrape_jobs(..., linkedin_experience_level=...)` param + passthrough
  - `model.py`     : `ScraperInput.linkedin_experience_level`
  - `linkedin/__init__.py` : adds `f_E` to the search params dict
  f_E codes: 1=Internship, 2=Entry level, 3=Associate, 4=Mid-Senior, 5=Director, 6=Executive

## To pull upstream fixes later
Diff this directory against upstream main and cherry-pick (watch for the `ApplyAi` tags):
  git clone --depth 1 https://github.com/speedyapply/JobSpy /tmp/jobspy_upstream
  diff -ru backend/vendor/jobspy /tmp/jobspy_upstream/jobspy
