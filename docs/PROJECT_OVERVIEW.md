# Job Application OS — Project Overview

## Summary

Job Application OS is an AI-assisted job application system that helps users discover, evaluate, prepare, and submit job applications at scale while maintaining full user control.

The system automates repetitive parts of the job search process (job discovery, ranking, resume generation, form filling) while keeping the user as the final decision-maker for all submissions.

The core goal is:

> Reduce job application time from ~15–30 minutes to ~30–60 seconds per job while improving application quality through AI personalization.

---

## Core Principles

1. **Human-in-the-loop always**

   * AI prepares applications
   * User approves submission

2. **Truthful AI only**

   * No fabrication of experience or skills
   * Only reformatting, emphasizing, or restructuring existing data

3. **Master Applicant Profile (MAP) is source of truth**

   * All applications derive from structured user data
   * No reliance on existing resume PDFs

4. **State-based job tracking**

   * Every job is tracked through a lifecycle

---

## System Modules

### 1. Job Discovery Service

* Pulls job postings from multiple sources:

  * LinkedIn
  * Handshake
  * Indeed (optional)
  * Company ATS systems (Greenhouse, Lever, Workday, Ashby)
* Runs on a scheduled job (daily)
* Produces normalized job objects

---

### 2. Job Processing Pipeline

* Deduplicates jobs across sources
* Filters obvious mismatches
* Scores jobs based on:

  * skill match
  * location
  * salary
  * seniority
* Stores results in database

---

### 3. Master Applicant Profile (MAP)

Structured representation of user:

* Experience
* Projects
* Skills
* Education
* Preferences
* Eligibility constraints
* Salary expectations

Used as the single source of truth for all AI generation.

---

### 4. AI Generation Service

Responsible for:

* Resume generation (per job)
* Cover letter generation
* Form answer generation
* Job analysis (scoring explanation)

Uses LLM provider abstraction (Claude/OpenAI/etc.)

---

### 5. Application Service (Orchestrator)

Coordinates full application lifecycle:

* triggers AI generation
* prepares application package
* coordinates browser automation
* manages application state transitions

---

### 6. Browser Automation Service

* Uses Playwright
* Logs into job portals
* Fills forms
* Uploads documents
* Stops at final review page for user approval

---

### 7. Email Listener Service

* Monitors application email inbox
* Classifies responses:

  * interview
  * rejection
  * offer
  * pending
* Updates application state automatically

---

### 8. Analytics Engine

Tracks:

* application success rate
* keyword performance
* resume version effectiveness
* company response times
* job market trends

---

## Application State Machine

Each job moves through:

* Fetched
* Need to Apply
* Preparing
* Ready for Review
* Browser Filling
* Ready to Submit
* Applied
* Waiting
* Interview / Rejected / Offer / Stale

---

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript

### Backend

* FastAPI (Python)

### Database

* PostgreSQL (Supabase recommended)

### Storage

* Supabase Storage (or S3-compatible)

### Automation

* Playwright

### AI

* Claude (primary)
* provider abstraction layer required

### Scheduling

* APScheduler (MVP)

---

## Key Design Decision

The system is a **modular monolith**, not microservices.

Services are logical modules within one backend codebase.

This allows:

* faster iteration
* simpler deployment
* easier debugging
* future extraction if needed

---
