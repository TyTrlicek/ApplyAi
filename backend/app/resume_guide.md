# Software Engineering Resume Guide
# New Grad / Early Career CS — AI Generation Instructions

---

## AUTHORITY

This guide takes precedence over all other instructions. Follow every rule below exactly.
The gold standard this targets is **Jake's Resume** — the #1 recommended template in
CS hiring communities (r/cscareerquestions, Blind, Levels.fyi). Clean, single-column,
ATS-safe, information-dense.

---

## ABSOLUTE RULES

1. **ONE PAGE. No exceptions.** Cut content before adding a second page.
2. **No personal pronouns.** Never write "I", "my", "we", or "our".
3. **Past tense throughout** — including current roles.
4. **No objective or summary section** — wastes space for early-career candidates.
5. **No soft skills** — never write "hardworking", "team player", "detail-oriented".
6. **No references section.**
7. **No tables, text boxes, or graphics** — they break ATS parsers.
8. **GPA only if ≥ 3.5.**
9. **Every bullet starts with a strong action verb** — never "Responsible for" or "Worked on".
10. **Quantify everything possible** — users, latency, %, hours saved, scale, team size.

---

## SECTION ORDER

Render sections in exactly this order:

1. **Header** — Name (large), then one line: email · phone · city, ST · linkedin · github
2. **Education** — School, degree, graduation, GPA, relevant coursework (new grads lead with this)
3. **Experience** — Reverse chronological. Most recent first.
4. **Projects** — 2–3 projects max. Include only strong, live, or clearly scoped work.
5. **Technical Skills** — Categorized, comma-separated. No badges.

Do NOT add extra sections unless the profile contains certifications or publications.

---

## BULLET FORMULA

Use Google's **XYZ formula** for every bullet:

> **Accomplished [X] as measured by [Y], by doing [Z]**

Translate this into natural language — don't be robotic, but every bullet must contain:
- A strong **action verb** (see list below)
- **What** was built or done
- **How** (brief — one or two technologies max inline)
- **Impact** with a number or metric where the profile provides one

**Strong action verbs:** Built, Engineered, Designed, Developed, Architected, Implemented,
Led, Reduced, Improved, Automated, Deployed, Integrated, Optimized, Migrated, Launched,
Created, Scaled, Delivered, Refactored, Streamlined

**Good bullet:**
> Engineered multi-layer Redis caching with intelligent invalidation, achieving 95% cache hit rate and sub-100ms response times across 100,000+ book records

**Bad bullet:**
> Worked on caching to make the site faster

Rules per bullet:
- 1–2 lines max (~100–130 characters)
- One idea per bullet
- 3–5 bullets per experience entry
- 2–4 bullets per project entry
- Never start two consecutive bullets with the same verb

---

## EXPERIENCE SECTION

Format each entry as:
```
Job Title                                    Company Name   |   Month YYYY – Month YYYY
• Bullet
• Bullet
```

- Include tech stack inline in bullets when it adds context, not as a separate "Tech:" line
- Omit team size unless notable (e.g., "Led a 4-engineer team")
- If officially titled differently from actual work (e.g., "DevOps Intern" doing AIOps/software work),
  keep the official title but let bullets accurately describe the real scope

---

## PROJECTS SECTION

Format each entry as:
```
Project Name — one-line description or live URL
• Bullet
• Bullet
Tech stack: Next.js, PostgreSQL, Redis, Docker, AWS EC2
```

- Include a "Tech stack:" line as the final item for each project
- Only include projects with meaningful scope: shipped products, real users, or clear technical depth
- Prioritize projects with live URLs and user metrics

---

## TECHNICAL SKILLS SECTION

Format exactly as:
```
Languages:   JavaScript, TypeScript, Python, C#, Java, SQL
Frameworks:  React, Next.js, Node.js, Express, Temporal
Tools:       Git, Docker, Redis, PostgreSQL, DataDog, Jira, CloudWatch, Supabase
Cloud:       AWS (EC2, IAM, CloudWatch), GitHub Actions
Other:       REST APIs, OAuth/JWT, AI/LLM Integration, Anthropic SDK, MCP
```

Rules:
- Comma-separated within each category
- Only include things you can speak to in an interview
- Order each category by relevance/proficiency (strongest first)
- "AI/LLM Integration" and "Anthropic SDK" belong here for AI-targeted roles
- Omit any tool you only used once or superficially

---

## ROLE-SPECIFIC TAILORING

Analyze the job description and apply the appropriate emphasis:

### Full-Stack / Product Engineering Roles
- Lead experience with **Bookmarkd** (2,000+ users, Redis caching, production scale) and **SportsFrames** work
- Tech stack: emphasize React, Next.js, Node.js, PostgreSQL, Redis, Docker
- De-emphasize AI/agent work unless the job mentions it
- Projects: Bookmarkd first, then one AI project if relevant

### AI / Agents / LLM Roles
- Lead experience with **Tyler Technologies**: Project Beacon (C#, Anthropic, Temporal) and cost optimization bot (Python, Claude, DataDog MCP, AWS)
- Include **ApplyAi** as a project — it directly demonstrates AI agent engineering, full-stack, and product thinking
- Tech stack: lead with Python, Anthropic SDK, Temporal, MCP, C#
- Bookmarkd becomes a supporting project showing production scale

### Systems / Infrastructure / DevOps Roles
- Emphasize Docker, AWS, CI/CD, PostgreSQL architecture, DataDog, CloudWatch
- Lead with SportsFrames database schema work and Tyler Tech operational tooling
- Highlight any reliability/performance metrics

### General / Unknown
- Default ordering: Tyler Tech → SportsFrames → Bookmarkd → ApplyAi
- Balanced skills section

---

## ATS OPTIMIZATION

- Mirror language from the job description exactly — if they say "large language models", use that phrase, not "LLMs"
- Include the tech stack keywords mentioned in the JD in bullets or skills
- Use standard section headers: "Experience", "Education", "Projects", "Technical Skills"
- Spell out acronyms at least once: "Application Programming Interface (API)"
- Never abbreviate company names or school names

---

## CONTENT QUALITY CHECKS

Before finalizing, verify:
- [ ] Every bullet has a metric or concrete outcome (or explicitly notes one isn't available)
- [ ] No two bullets start with the same verb
- [ ] No bullet says "helped", "assisted", "worked on", or "was responsible for"
- [ ] Skills section reflects tech mentioned in bullets
- [ ] Education GPA is included (3.55 ≥ 3.5 threshold)
- [ ] Total content fits one page at standard margins
- [ ] No personal pronouns anywhere

---

## WHAT TO OMIT

- High school anything
- "References available upon request"
- Hobbies / interests (unless directly relevant — rare)
- A headshot or photo
- Full mailing address (city, ST only)
- Any job held < 1 month unless substantial project work resulted
- Obvious tools: Microsoft Word, Google Docs, Slack, Zoom
