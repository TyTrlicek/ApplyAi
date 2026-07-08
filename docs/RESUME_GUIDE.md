# Resume Guide — ApplyAi Reference Doc
_For Tyler Trlicek, CS new grad (Winter 2026, UT Dallas). Used to train the Claude resume generator._

---

## 1. Template & Formatting Standards

### Layout
- **Single column only.** Two-column PDFs extract only ~71% of content in ATS parsers vs ~97% for single-column .docx. Never use tables, text boxes, or multi-column layouts — ATS scrambles them.
- **Reference template:** Jake's Resume (single column, clean, FAANG-proven). Harvard template is the conservative fallback.
- **File format:** `.docx` for applications that accept it. PDF only when explicitly required.

### Font
- **Body:** Times New Roman 11pt — matches the Jake's Resume template Tyler uses and is fully ATS-safe. (Calibri/Arial 11pt are equally ATS-safe sans-serif fallbacks.) Minimum 10pt anywhere on the page.
- **Section headers:** 12–14pt, bold, uppercase, with a thin horizontal rule beneath.
- **Name:** 20–22pt, bold, centered.
- Never use decorative fonts (Helvetica Neue, custom fonts, etc.).

### Margins & Spacing
- **Margins:** 0.75 inch all sides. Drop to 0.5 inch only if content won't fit at 0.75.
- **Line spacing:** 1.0–1.15 within sections. Add 6–8pt spacing between sections for visual separation.
- No horizontal rules, no icons, no color (except optionally the name in dark navy/black).

### Section Headings
Use standard labels — ATS relies on exact matches:
- `Contact` / header (no heading needed, just the block)
- `Skills` or `Technical Skills`
- `Experience` or `Work Experience`
- `Education`
- `Projects`
- `Certifications` (if applicable)

---

## 2. Section Order (New Grad — Jake's Resume template)

Follows Tyler's preferred layout (Jake's Resume): lead with Education, then skills.

```
1. Header (name + contact)
2. Education
3. Technical Skills
4. Work Experience
5. Projects
6. Certifications (if any)
7. Extracurriculars (only if space and substantive)
```

> The renderer controls section order; keep this list in sync with `docx_render.py`.

> **No objective statement.** No summary paragraph unless the role explicitly needs one (rare for SWE). No references section. No "References available upon request."

---

## 3. Header / Contact Block

Include:
- Full name (large, prominent)
- City, State (Dallas, TX — no street address)
- Phone
- Email
- LinkedIn URL (shorten to linkedin.com/in/username)
- GitHub URL

Do NOT include:
- Full mailing address
- Photo
- Date of birth
- Pronouns (unless applicant chooses to)
- Links to irrelevant social media

---

## 4. Bullet Point Formula

### The Formula: XYZ (Google's standard)
> **Accomplished [X] as measured by [Y] by doing [Z].**

Reordered for readability (most natural):
> **[Strong verb] + [what you did/built] + [how/tools] + [impact/metric]**

### Length Rules
- **15–25 words per bullet.** 1–2 lines maximum.
- Bullets over 2 lines get skipped by recruiters in a 6-second scan.
- Never start two consecutive bullets with the same verb.
- Past tense for past roles. Present tense for current role.
- No pronouns. No "I", "my", "we".

### Examples of Good vs Bad

| Bad | Good |
|-----|------|
| "Responsible for building AIOps agent" | "Engineered AIOps triage agent (Anthropic + Temporal) automating Datadog/PagerDuty incident investigation, cutting MTTR by 65%" |
| "Worked on inventory system" | "Built full-stack inventory management system deployed to production across 4 user roles and 3 marketplaces" |
| "Used Redis for caching" | "Implemented multi-layer Redis caching strategy achieving 95% cache hit rate and <100ms average response time" |

### Bullets per Role
- Most recent role: 4–6 bullets
- Second role: 3–4 bullets
- Older roles: 2–3 bullets

---

## 5. Strong Action Verbs by Category

### Building / Engineering
Engineered, Built, Developed, Implemented, Architected, Constructed, Created, Designed, Shipped, Launched

### AI / ML Specific
Trained, Fine-tuned, Deployed, Evaluated, Orchestrated, Integrated, Automated, Distilled, Benchmarked, Optimized

### DevOps / Infrastructure
Provisioned, Automated, Containerized, Migrated, Configured, Deployed, Monitored, Scaled, Hardened, Terraformed, Orchestrated

### Performance / Optimization
Reduced, Optimized, Accelerated, Improved, Cut, Decreased, Boosted, Streamlined, Eliminated, Minimized

### Systems / Architecture
Designed, Architected, Refactored, Modularized, Abstracted, Decoupled, Standardized, Structured

### Analysis / Investigation
Diagnosed, Investigated, Analyzed, Identified, Correlated, Audited, Profiled, Debugged, Traced

### Leadership / Collaboration
Led, Coordinated, Mentored, Collaborated, Partnered, Drove, Facilitated, Aligned

> **Never use:** Assisted, Helped, Participated, Was responsible for, Worked on, Contributed to — these bury your actual impact.

---

## 6. How to Quantify Without Hard Metrics

When exact numbers aren't available, use these proxy strategies (in priority order):

1. **Scope numbers you already know:** "4 data sources", "3 marketplaces", "4 permission tiers" — real numbers you know exactly.
2. **Time saved estimate:** "reducing manual triage time by ~60%" — use "~" to signal an estimate, not a lie.
3. **Before/after state:** "...eliminating manual on-call handoff" or "...replacing a manual spreadsheet workflow"
4. **Volume/frequency:** "handling X alerts per day", "used by N engineers daily"
5. **Performance metrics:** response times, cache hit rates, test coverage — these are measurable and you built them.
6. **Team/org context:** "deployed across a 10-person engineering team", "used by the entire operations team daily"

> **Rule:** Never invent a number you cannot defend in an interview. Use "~" or "up to" when estimating. Concrete scope beats a made-up percentage.

---

## 7. Technical Skills Section

### Format
Categorized, comma-separated, single line per category. No proficiency ratings (beginner/advanced), no progress bars.

```
Languages:    Python, TypeScript, JavaScript, SQL, C#, Bash
Frameworks:   FastAPI, Next.js, React, Node.js, Express, SQLAlchemy, Tailwind CSS
Tools:        Docker, Git, PostgreSQL, Redis, Supabase, Prisma, Terraform, AWS CLI
Cloud:        AWS (EC2, CloudWatch, Lambda), Datadog, PagerDuty
AI / Agents:  Anthropic Claude API, Temporal Workflows, LLM orchestration
```

### ATS Keyword Strategy
- Copy the job description into a doc and highlight repeated terms (usually 8–20 keywords).
- Confirm those keywords appear verbatim in your Skills section AND in at least one experience bullet.
- Include both full names and abbreviations: "Kubernetes (K8s)", "CI/CD", "Infrastructure as Code (IaC)".
- Do NOT list outdated or irrelevant tech just to pad the section.
- Do NOT list things you cannot discuss competently in an interview.

### What to Omit from Skills
- Microsoft Office, Google Docs, Slack — assumed
- "Communication", "Teamwork", "Problem-solving" — soft skills don't belong in tech stack
- Specific version numbers (Python 3.11) — unnecessary and will age poorly
- Technologies from a 1-day tutorial you never used in a real project

---

## 8. Resume Length

**Verdict: 1 page for Tyler's current profile.**

Reasoning:
- 2 internships + 3 projects is appropriate for 1 tight page.
- Two-page resumes from new grads with padding (extra coursework, high school activities, generic bullets) read as someone who doesn't know what matters.
- If the content genuinely fills 2 pages with substance, go to 2. Don't pad.
- All Tyler's applications are digital — no print constraint. But 1 page signals judgment and editing ability, which matters for early-career candidates.

---

## 9. ATS Optimization Checklist

- [ ] Single column layout
- [ ] Standard section headings (no creative names like "Where I've Worked")
- [ ] .docx format (or PDF only when required)
- [ ] No tables, text boxes, or multi-column layouts
- [ ] No images, icons, or graphics
- [ ] Keywords from job description appear verbatim in Skills + Experience
- [ ] All dates formatted consistently (e.g., "May 2025 – Aug 2025")
- [ ] No headers/footers (ATS often skips them)
- [ ] No special characters in place of bullets (use standard • or –)
- [ ] File named: `FirstLast_Resume.pdf` or `FirstLast_Resume_CompanyName.pdf`

---

## 10. What NOT to Include

| Don't Include | Why |
|---------------|-----|
| Objective statement | Outdated; wastes prime real estate |
| "References available upon request" | Assumed; wastes space |
| Full street address | Privacy risk; only City, State needed |
| Photo | Illegal basis for discrimination; ATS may reject it |
| GPA below 3.5 | Omit — it only hurts you |
| High school anything | Irrelevant post-college |
| Buzzwords: "rockstar", "ninja", "synergy", "passionate" | LinkedIn data: >5 buzzwords = 12% lower interview rate |
| Duties-only bullets ("Responsible for...") | Shows activity, not impact |
| Proficiency bars / star ratings for skills | ATS ignores them; recruiters distrust them |
| Irrelevant jobs (food service, etc.) | Only include if it shows transferable leadership/scale |
| Every technology ever touched | Curate ruthlessly to what's relevant per role |
| AI-generated filler text | 80% of hiring managers in 2026 say they can detect it; 49% auto-reject |

---

## 11. Tailoring Per Role (for the AI Generator)

The resume generator should swap out or emphasize content based on role type. Bullets are not pre-written variants — the generator reads rich `context` fields and writes bullets weighted toward the role.

### Role-level emphasis

| Role Type | Lead With | Emphasize in Bullets | Skills to Surface |
|-----------|-----------|----------------------|-------------------|
| **AIOps / AI Engineer** | Beacon internship | Temporal, Anthropic, multi-source investigation, automation | AI/Agents section, Temporal, Claude API |
| **DevOps / Cloud** | Beacon + Bookmarkd infra | AWS, Datadog, Terraform, Docker, Redis, fault-tolerance | Cloud section, AWS CLI, Terraform |
| **SWE (Backend)** | SportsFrames or Bookmarkd | FastAPI, Node.js, PostgreSQL, Redis, API design | Languages, Frameworks |
| **SWE (Full Stack)** | SportsFrames or ApplyAi | Next.js, React, FastAPI, TypeScript end-to-end | Languages, Frameworks, Tools |
| **Data / ML** | Beacon investigation modules | Data pipelines, analysis, Python, AI | AI section, Python |

### Bullet-level emphasis per role

**Tyler Technologies (Beacon) — always 4 bullets, reorder by role:**
- AIOps/AI: lead with agent architecture (A), then investigation modules (B), then Temporal fault-tolerance (C), then Jira output (D)
- DevOps/Cloud: lead with Temporal workflows (C), then AWS/Datadog modules (B), then agent (A), then Jira output (D)
- SWE: lead with agent build (A), then multi-source investigation (B), skip or compress C+D into one bullet

**SportsFrames — 3 bullets max, always secondary to Tyler:**
- SWE (full-stack): emphasize Next.js/React frontend, DB schema design, full-stack architecture
- DevOps/Cloud: emphasize PostgreSQL schema design, Docker/hosting, deployment infrastructure
- AIOps/AI: emphasize Python scraping pipeline, data processing, automation (listing tools)
- All roles: keep the 40% processing time and 10+ staff hours/week metrics — they're strong regardless

**Bookmarkd — project section, 2-3 bullets:**
- SWE: lead with hybrid search engine and achievement engine, mention 2,000+ users
- DevOps/Cloud: lead with Docker/AWS EC2 infrastructure, Redis caching architecture (95% hit rate), scalability
- AIOps/AI: lead with Redis caching intelligence, hybrid search relevance scoring

**Last sentence of positioningNotes swaps per role** — this is the single most impactful tailoring lever.

---

## 12. The Summary / Bio (Optional)

Use a 2–3 line summary only when:
- The role is senior enough to require positioning context
- The job description explicitly calls for a summary
- You're pivoting and need to explain the transition

For Tyler's standard applications: **omit the summary** and let the skills + experience lead. The profile page's `positioningNotes` field feeds the AI generator context without consuming resume real estate.

If used, format: `[Identity] with [X years / internship] experience in [domain]. [Strongest differentiator in one clause]. Seeking [role type].`

---

_Last updated: 2026-07-01_
