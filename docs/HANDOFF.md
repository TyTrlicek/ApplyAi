# ApplyAi — Session Handoff
_Last updated: 2026-06-28_

## What this project is

Job Application OS — an AI-assisted job application system. Discovers, ranks, prepares, and auto-submits job applications. Human approves every submission. The user is Ty, a new grad (winter 2026, US citizen, Dallas TX, willing to relocate anywhere in US, wants in-office/hybrid, no visa issues).

---

## What exists now (end of session 2)

### Backend — fully working, 16 tests passing

**Fetch pipeline**

SearchQuery → fetch_all() [concurrent] → seniority exclusion → domain inclusion → noise exclusion → cross-source dedup → FetchReport → persist_report() → Supabase

Filter stack in order:
1. **Seniority exclusion** — drops senior/sr/staff/principal/lead/director/manager/architect/vp/head/ii/iii/iv/distinguished/fellow
2. **Domain inclusion** — keeps only titles with a tech-signal word (engineer, developer, devops, sre, cloud, data, ml, ai, software, etc.)
3. **Noise exclusion** — drops blocked companies + noise title patterns:
   - Company blocklist: DataAnnotation, BeaconFire Inc., JBS International
   - Title noise terms: "trainer", "cleared", "secret"
4. **Cross-source dedup** — by normalized(company|title|location)

**Search terms are quoted** (`"Software Engineer"` not `Software Engineer`) for exact phrase match on Indeed/Google.

**Sources: Indeed + LinkedIn only** — Google removed from all 6 search profiles (confirmed expendable: aggregates from other boards, no unique listings, adds scraping overhead).

**Key files**
- `backend/vendor/jobspy/` — vendored MIT-licensed JobSpy scrapers. Local patch adds LinkedIn f_E experience-level filter. Tagged `# ApplyAi`.
- `backend/app/sources/base.py` — NormalizedJob schema, SourceAdapter interface, all filter lists (COMPANY_BLOCKLIST, DEFAULT_SENIORITY_EXCLUDE, DEFAULT_NOISE_EXCLUDE, DEFAULT_TECH_INCLUDE), filter functions
- `backend/app/sources/jobspy_adapter.py` — JobSpy wrapper
- `backend/app/fetch.py` — orchestrator (fetch_all, filter_seniority, filter_domain, filter_noise, deduplicate)
- `backend/app/db/` — SQLAlchemy ORM: Company, Job (status: need_to_apply/decided_not/applied), SearchProfile. Upsert on dedup_key.
- `backend/app/main.py` — FastAPI. CORS open to localhost:3000/3001/3002. Endpoints: GET/PATCH /jobs/, GET /searches/, POST /fetch/, GET /health

**Supabase DB**
- Tables: companies, jobs, search_profiles
- 6 active search profiles: Software Engineer, DevOps Engineer, Cloud Engineer, AI Engineer, Data Engineer, AIOps Engineer — all fulltime, US, hours_old=24, sources: indeed,linkedin
- DB currently has ~157 jobs from last fetch — needs to be cleared and refetched with the new noise filters applied
- ⚠️ DB password was exposed in a previous chat session. Ty is aware and chose to defer rotation until after stable data is flowing.

**To start the API**
```
cd /Users/tytrlicek/projects/ApplyAi/backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

**To run tests**
```
cd /Users/tytrlicek/projects/ApplyAi/backend
source .venv/bin/activate
python -m pytest tests/ -q  # 16 passed
```

---

### Frontend — fully built, wired to FastAPI

Next.js 15 + shadcn/ui (base-ui, NOT Radix) + Tailwind v4. Dark mode. Linear/Raycast/Vercel Dashboard aesthetic.

**⚠️ shadcn uses `@base-ui/react` not Radix UI** — `asChild` prop does not exist. Use className directly on Trigger components, or `render` prop. Do NOT use `asChild` in any new components.

**Frontend location:** `/Users/tytrlicek/projects/ApplyAi/frontend/`

**To start frontend**
```
cd /Users/tytrlicek/projects/ApplyAi/frontend
npm run dev
# Runs on localhost:3000 (or 3002 if 3000 is taken)
```

**Pages built:**
- `/dashboard` — stat cards (total, need to apply, applied, fetched today), activity feed with per-profile fetch detail (senior/off-domain/noise filtered, deduped), recent jobs table, Fetch Jobs button
- `/discover` — dense jobs table, inline status dropdown, bulk select + bulk status update, right-side detail drawer on row click, filter by status/source/search
- `/pipeline` — kanban + table toggle. Kanban columns: Need to Apply, Applied, + future stubs (Phone Screen, Technical, Onsite, Offer, Ghosted/Rejected). Drag not wired yet — status change via dropdown on card.
- `/analytics` — 6 recharts cards: funnel, weekly bar, source breakdown, status donut, salary histogram, response rate placeholder
- `/profile` — MAP editor (personal info, work experience, education, skills, projects, preferences) + live AI preview panel. State is local only — not persisted to backend yet.
- `/settings` — API health check, search profiles list, Gmail coming-soon card, scheduler coming-soon card

**Key source files:**
- `frontend/src/lib/types.ts` — all TypeScript types matching backend schemas
- `frontend/src/lib/api.ts` — API client (jobs.list, jobs.get, jobs.updateStatus, searches.list, fetch.trigger, health)
- `frontend/src/lib/format.ts` — formatSalary, formatDate, formatDateTime
- `frontend/src/components/sidebar.tsx` — nav
- `frontend/src/components/job-detail-sheet.tsx` — right-side job detail drawer
- `frontend/src/components/status-badge.tsx` — colored status pill
- `frontend/src/components/source-badge.tsx` — source pill (Indeed/LinkedIn/Google)
- `frontend/src/app/(app)/layout.tsx` — shell with sidebar

---

## What needs to happen next

### Immediate (before anything else)
1. **Clear DB and do a clean fetch** — current 157 jobs include pre-filter-fix noise. Clear companies + jobs tables, hit Fetch Jobs on dashboard.

### Near-term quality improvements
2. **Proxy infrastructure for LinkedIn** — LinkedIn rate limits at ~page 10/IP. `JobSpyAdapter` already accepts a `proxies: list[str]` param, just needs config. **Deferred to MVP 2** — required before resume/cover letter generation at scale so LinkedIn descriptions are fully populated.
3. **Per-company-title cap** — if same company+title appears in N+ cities, keep max 2-3. Not urgent since blocklist handles current offenders.

### MVP 1 remaining
4. **Scheduler (APScheduler)** — Ty deferred, don't bring up. UI slot exists in Settings.
5. **Staleness detection** — mark postings gone missing after N days as stale.
6. **Profile persistence** — ✅ Done. `GET /profile/` + `PUT /profile/` endpoints, singleton JSON row in `profiles` table, frontend loads on mount + saves on button.

### MVP 2 — AI Application Preparation
7. **MAP backend** — store Master Applicant Profile in DB, expose GET/PUT /profile/ endpoints
8. **Resume generation** — MAP + job description → tailored PDF/DOCX via Claude API
9. **Cover letter generation** — same pattern
10. **Form answer drafts**
11. **Review screen** — preview resume + cover letter before applying

### MVP 3 — Automation
12. **Email integration (Gmail)** — read incoming emails, detect status changes (interview invite, rejection, offer). Auto-update Pipeline status. Show email snippet + confirm/override UI (all UI stubs already exist in Pipeline page).
13. **Playwright** — form filling, file uploads, stop at final review page. Human clicks Submit.

---

## Key architectural decisions (locked)

- **Aggregator-primary, no ATS company-list** — Indeed + LinkedIn only
- **No "entry level" in search terms** — rely on LinkedIn f_E filter + post-fetch seniority/domain filters
- **Quoted search terms** — `"Software Engineer"` not `Software Engineer` for exact phrase match
- **JobSpy vendored** — not pip dependency. We own and patch the scraper code.
- **Filter order matters** — seniority → domain → noise → dedup (each pass reduces the set for the next)
- **Supabase SESSION POOLER** connection string (not direct — IPv6 issue): `postgresql://postgres.<ref>:<pw>@aws-X-us-east-X.pooler.supabase.com:5432/postgres`
- **Modular monolith** — not microservices
- **shadcn uses @base-ui/react** — no `asChild`, no Radix primitives

---

## Working with Ty

- Explain reasoning before building — don't just produce code
- He pushes back well — engage with his instincts, don't steamroll
- Ask extensively before preference-heavy work (UI especially). Design brief: Linear/Raycast/Vercel Dashboard. Dark mode. Minimal, information-dense, no glassmorphism, no gradients, no marketing-style design. Tool, not landing page.
- Keep scope tight — don't add features beyond what's asked
- Secrets in .env only — never in chat
- Check context usage periodically
