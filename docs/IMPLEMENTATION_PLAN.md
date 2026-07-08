# ApplyAi — Implementation Plan
_Last updated: 2026-07-07. Personal tool, local deployment, full form-fill automation._

---

## Current State

All MVP 1 and MVP 2 core features are complete. The app is a working local tool.

**Done:**
- Job fetch pipeline (LinkedIn + Indeed, 6 search profiles, seniority/domain/noise/company filters)
- Dashboard, Discover, Pipeline (9 statuses), Analytics, Profile, Settings, Companies pages
- 9-stage pipeline: need_to_apply → applied → interviewing → rejected_pre/post → stale_pre/post → ghosted → chose_not_to_apply
- Company targeting system (Big Tech / Top Tech / S&P 500 lists + custom, filter on Discover + Pipeline)
- Resume generation: fixed structure (Tyler Tech + SportsFrames, 2 projects), LibreOffice page-count validation, DOCX output
- Cover letter generation
- Prepare page: resume + cover letter preview, print, DOCX download
- Profile persistence (MAP in Supabase)
- Monorepo at ~/projects/ApplyAi, committed to git

**Not done:** see phases below.

---

## Phase 1 — MVP 2 Completion
_Small gaps. Do these before automation._

### 1.1 Form Answer Drafts
When a job application has short-answer questions ("Why do you want to work here?", "Describe a time you..."), generate AI-drafted answers from MAP + job description.

- **UI:** Add a "Form Answers" tab on the Prepare page (alongside Resume and Cover Letter tabs)
- **UX:** Text area where user pastes the application questions, one per line or block. Claude returns a draft answer for each, pulled from MAP context + JD.
- **Backend:** New endpoint `POST /jobs/{id}/form-answers` — takes `{"questions": [...]}`, returns `{"answers": [...]}`
- **Prompt:** Same pattern as resume/cover letter — MAP + JD context, answer in first person, factual only, no invented details

### 1.2 Auto-Daily Scheduler (APScheduler)
Replace the manual "Fetch Jobs" button with an automatic daily fetch.

- **Backend:** Add APScheduler to the FastAPI app. On startup, schedule a daily job at a configurable time (default 7am local).
- **Config:** `FETCH_SCHEDULE_HOUR` env var. Runs `fetch_all()` across all active search profiles.
- **Settings page:** Show next scheduled run time, last run time, allow manual trigger (already exists).
- **Note:** Runs only while the backend process is alive (local tool — acceptable).

---

## Phase 2 — Playwright Automation
_The highest-leverage feature. Turns this into a real volume machine._

### 2.1 Architecture
Playwright runs as a separate Python process/service, controlled by the FastAPI backend via a job queue or direct subprocess call. Not threaded into the main FastAPI process (Playwright is blocking + browser-heavy).

**Stack:** Python + `playwright` library. Spawn as a subprocess per application run.

### 2.2 Application Flow (per job)
1. User clicks "Apply" on a job from the Prepare page (after reviewing resume + cover letter)
2. Backend kicks off a Playwright session with the job URL
3. Playwright navigates to the application page and detects form fields
4. **Known fields** (auto-filled): name, email, phone, location, LinkedIn URL, GitHub URL, resume upload (DOCX/PDF), cover letter upload, years of experience, work authorization (US citizen = yes), sponsorship required (no)
5. **Unknown fields** (text questions): Claude generates a best-guess answer from MAP + JD context
6. All AI-generated answers are stored and flagged `ai_generated: true`
7. Playwright fills everything, then **stops before the Submit button**
8. Frontend shows a "Review & Submit" screen: all filled fields listed, AI answers highlighted for review, edit-in-place
9. User clicks "Submit" in the UI → Playwright clicks the actual submit button
10. Job status auto-updates to `applied`

### 2.3 Field Detection Strategy
- Match labels by keyword: "resume" → upload resume, "cover letter" → upload cover letter, name/email/phone → MAP personal fields
- Detect `<input type="file">` → offer resume or cover letter upload
- Detect `<textarea>` or long text input with a question label → send to Claude for answer drafting
- Detect `<select>` for known option sets: work authorization, sponsorship, years of experience
- Unknown field types → flag for manual review, don't block the rest of the form

### 2.4 Portal Coverage (priority order)
1. **LinkedIn Easy Apply** — highest volume, most standardized
2. **Greenhouse** (boards.greenhouse.io) — most common ATS for tech companies
3. **Lever** (jobs.lever.co) — second most common
4. **Workday** (wd*.myworkdayjobs.com) — enterprise companies
5. **Indeed Apply** — fallback for Indeed-sourced jobs
6. **Generic** — best-effort on any other portal

### 2.5 DB Changes Needed
- Add `application_started_at`, `application_submitted_at` timestamps to `jobs` table
- Add `form_answers` JSON column (stores question → answer pairs with `ai_generated` flag)
- Migration script required

### 2.6 UI Changes Needed
- Prepare page: "Apply" button that kicks off Playwright session
- New "Review & Submit" modal/page: all filled fields visible, AI answers highlighted, edit-in-place, final Submit button
- Application status indicator while Playwright is running (polling or websocket)

### 2.7 Auth / Login Handling
- Playwright uses a persistent browser profile stored locally — login session persists between runs
- First run on a new portal prompts user to log in manually, then saves the session
- No credentials stored by the app — browser handles its own session storage

---

## Phase 3 — Gmail Integration
_Auto-move pipeline status based on incoming emails._

### 3.1 Scope
- Detect incoming emails related to job applications
- Match sender/content to jobs in DB by company domain + job title keywords
- Auto-move job status:
  - Interview invite → `interviewing`
  - Rejection → `rejected_pre` or `rejected_post` (Claude determines from context)
  - No response after N days → `ghosted` (time-based staleness, not email-based)
- Show email snippet inline on Pipeline card (Mail icon is already stubbed)

### 3.2 Architecture
- Gmail API via OAuth2
- APScheduler background job polls every 30 min for new emails
- Claude classifies each email: "interview invite", "rejection", "offer", "other"
- Low-confidence matches → flag for manual review instead of auto-moving

### 3.3 DB Changes Needed
- Add `email_snippet` (text), `email_received_at` (datetime) to `jobs` table
- Migration script required

### 3.4 UI Changes Needed
- Pipeline card: Mail icon lights up when an email is matched (already stubbed)
- Click Mail icon → show email snippet
- Settings: Gmail connect/disconnect, toggle auto-status-update on/off

---

## Phase 4 — Polish & Staleness
_Quality-of-life, run after Phases 2 and 3._

### 4.1 Staleness Detection
- Daily APScheduler job: mark `applied` jobs with no email response after 21 days → `stale_pre`
- Mark `interviewing` jobs with no activity after 14 days → `stale_post`
- Both overridable — user can manually move status

### 4.2 Dashboard Improvements
- "X jobs match your targeted companies" stat card
- Application velocity chart (applications/day over last 30 days)

### 4.3 Export
- CSV export of pipeline for personal tracking

---

## Build Order

```
Phase 1.1  Form answer drafts      ~1 session    Completes MVP 2
Phase 1.2  Scheduler               ~1 session    Unblocks daily automation
Phase 2    Playwright              ~3-4 sessions  Start with LinkedIn + Greenhouse
Phase 3    Gmail                   ~2 sessions
Phase 4    Polish                  Ongoing
```

---

## Key Constraints
- **Local only** — no cloud deployment, no auth, single user
- **Playwright stops before Submit** — human always clicks the final button
- **No invented facts** — Claude only uses MAP data, never fabricates metrics
- **1-page resume guaranteed** — LibreOffice validates every generated resume
- **Secrets in .env only** — Supabase password rotated 2026-07-06
- **shadcn uses @base-ui/react** — no `asChild`, no Radix primitives
- **Session pooler connection string** — Supabase requires pooler URL (not direct), IPv6 issue
