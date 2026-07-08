# MVP Specification — Job Application OS

## Goal

Build a system that allows a user to:

1. Discover relevant jobs daily
2. Track and organize them
3. Generate AI-personalized resumes per job
4. Review applications before submission
5. Submit applications via browser automation

---

# MVP 1 — Job Discovery & Tracking

## Features

### Job Fetching

* Scheduled daily job fetch
* Sources:

  * LinkedIn
  * Handshake
  * Indeed (optional)
  * Greenhouse / Lever feeds

### Job Processing

* Normalize job data
* Deduplicate listings
* Basic ranking (non-AI or light AI optional)

### Dashboard

* Show jobs in UI
* Statuses:

  * Need to Apply
  * Decided Not to Apply
  * Applied

### Job Storage

* PostgreSQL schema:

  * Job
  * Company
  * Source
  * Raw posting

---

## MVP 1 Output

A fully functional job tracking dashboard with daily updated job feed.

---

## MVP 1 — Source Strategy & Research Decisions

> Conclusions from pre-development research. Decisions are locked unless noted **OPEN**.
> Goal context: maximize total job coverage ("apply to all companies"), avoid niche
> single-purpose boards, minimize duplication, and scrape safely where possible.

### Decided

* **Aggregator-primary, NOT ATS-backbone.** ATS feeds (Greenhouse/Lever/Ashby) are clean
  but are inherently a per-company list and cap out at a subset of mostly tech/large
  employers — they can never reach "every employer." Rejected as the backbone.
* **Source set (priority order): Indeed → Google Jobs → LinkedIn.**

  * Indeed = primary workhorse: employers post directly AND it aggregates the long tail;
    scrapes cleanest (no rate limit).
  * Google for Jobs = breadth: itself an aggregator (LinkedIn/Indeed/Glassdoor/ZipRecruiter/Monster).
  * LinkedIn = added last: most rate-limited (~page 10 per IP), needs proxies.
* **No usable job-seeker APIs exist** — Indeed Publisher API deprecated, Google Jobs API
  shut down 2021, LinkedIn closed to new partners. Scraping is the only path.
* **Handshake deferred.** Its only API is institution/university-scoped (EDU API), not for
  individual students. No clean programmatic access without auth (crosses the CFAA line).
* **Fetch code is vendored, not a dependency.** [JobSpy](https://github.com/speedyapply/JobSpy)
  (MIT) is copied into `backend/vendor/jobspy/` so we own and can patch the scrapers when a
  source changes. License notice retained; provenance in `backend/vendor/jobspy/VENDORED.md`.
* **Fragility quarantine.** Every source is a swappable `SourceAdapter` (`backend/app/sources/`);
  adapters never raise — a broken source returns `SourceResult(ok=False)` and degrades
  gracefully instead of killing the pipeline. The canonical store is OUR normalized DB,
  never any source's raw output.
* **Canonical schema + dedup decided** (research R5/R6): `NormalizedJob` with cross-source
  dedup by normalized (company + title + location) exact key. Fuzzy/embedding dedup is a
  documented future upgrade.

### Legal & anti-bot guardrails (research R2/R3)

* **hiQ v. LinkedIn:** scraping public, logged-out data is not a CFAA violation; bypassing a
  login wall or technical barrier is. **Rule: public pages only, no auth bypass, respect robots.txt.**
* Indeed ToS prohibits scraping and actively monitors — highest-friction source.
* LinkedIn/Indeed use TLS + session fingerprinting; Playwright-stealth alone is insufficient
  at scale → **residential rotating proxies required for LinkedIn/Indeed at volume.**

### Built so far

* `backend/vendor/jobspy/` — vendored MIT scrapers (Indeed/Google/LinkedIn/+more)
* `backend/app/sources/base.py` — `SearchQuery`, `NormalizedJob`, `SourceAdapter`, `SourceResult`
* `backend/app/sources/jobspy_adapter.py` — adapter over vendored scrapers
* `backend/app/fetch.py` — orchestrator: concurrent fetch → dedup → per-source health report
* `backend/tests/test_dedup.py` — offline dedup tests (passing)
* `backend/scripts/smoke_fetch.py` — live Indeed fetch (verified working)

### Still OPEN

* **R3/R8 — Proxy provider & budget** for LinkedIn/Indeed at daily volume (self-host vs
  managed scraping API; paid-API fallback e.g. Bright Data/Coresignal for sources that break).
* **R7 — Fetch scheduling & incremental fetch:** per-source cadence, fetch-only-new keying.
* **R9 — Location & remote normalization** ruleset.
* **R11 — Staleness/expiry detection** (mark postings missing-after-N-days as stale).
* **Persistence:** Postgres schema (Job/Company/Source/Raw) + storing the `NormalizedJob` rows.
* **Dashboard:** Next.js UI with Need-to-Apply / Decided-Not / Applied states.

---

# MVP 2 — AI Application Preparation

## Features

### Master Applicant Profile (MAP)

* Structured user profile editor
* Source of truth for all applications

### Resume Generation

* Input:

  * MAP
  * Job description
* Output:

  * tailored resume (PDF/DOCX)

### Cover Letter Generation

* Optional per job
* AI-generated based on MAP + job

### Application Package

Each job generates:

* resume
* cover letter
* form answers (drafts)

### Review Screen

User can:

* preview resume
* preview cover letter
* edit before submission

---

## MVP 2 Output

User can generate complete job applications in the browser without automation.

---

# MVP 3 — Application Automation

## Features

### Playwright Integration

* Login handling
* Form filling
* File uploads
* Navigation

### Application Workflow

* Load prepared application package
* Auto-fill job portal
* Stop at final review page

### User Confirmation

* User manually clicks "Submit"

---

## MVP 3 Output

One-click semi-automated job application system.

---

# Success Criteria

MVP is successful if user can:

* Apply to 20–50 jobs/day
* Spend <1 minute per application review
* Maintain full visibility of all applications

---
