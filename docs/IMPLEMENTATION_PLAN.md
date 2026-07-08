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
