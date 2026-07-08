"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, downloadDocx } from "@/lib/api";
import type { GenerateCoverLetterResponse, GenerateResumeResponse, Job } from "@/lib/types";
import { formatSalary } from "@/lib/format";

// ─── Resume HTML renderer ────────────────────────────────────────────────────

function buildResumeHtml(resume: GenerateResumeResponse["resume"], jobTitle: string, company: string | null): string {
  const skillsHtml = (resume.skills ?? [])
    .map((s) =>
      typeof s === "string"
        ? `<div class="skill-row">${s}</div>`
        : `<div class="skill-row"><span class="skill-cat">${s.category}:</span> ${s.items}</div>`
    )
    .join("");

  const experienceHtml = (resume.experience ?? [])
    .map(
      (e) => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${e.title} — ${e.company}</span>
        <span class="entry-dates">${e.start} – ${e.end || "Present"}</span>
      </div>
      <ul>${(e.bullets ?? []).map((b) => `<li>${b}</li>`).join("")}</ul>
    </div>`
    )
    .join("");

  const educationHtml = (resume.education ?? [])
    .map(
      (ed) => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${ed.school}</span>
        ${ed.location ? `<span class="entry-dates">${ed.location}</span>` : ""}
      </div>
      <div class="entry-header">
        <span class="entry-sub">${ed.degree}${ed.field ? ` in ${ed.field}` : ""}</span>
        <span class="entry-dates">${ed.graduation}</span>
      </div>
      ${ed.gpa ? `<p class="edu-detail">GPA: ${ed.gpa.includes("/") ? ed.gpa : `${ed.gpa} / 4.0`}</p>` : ""}
      ${ed.coursework ? `<p class="edu-detail">Relevant Coursework: ${ed.coursework}</p>` : ""}
    </div>`
    )
    .join("");

  const projectsHtml =
    (resume.projects ?? []).length > 0
      ? `<section>
    <h2>Projects</h2>
    ${(resume.projects ?? [])
      .map(
        (p) => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${p.name}${p.url ? ` <span class="url">— ${p.url}</span>` : ""}</span>
      </div>
      ${
        p.bullets && p.bullets.length > 0
          ? `<ul>${p.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
          : p.description
          ? `<p class="project-desc">${p.description}</p>`
          : ""
      }
    </div>`
      )
      .join("")}
  </section>`
      : "";

  const contactParts = [
    resume.contact?.email,
    resume.contact?.phone,
    resume.contact?.location?.split(/—| - | – |\(/)[0]?.trim(),
    resume.contact?.linkedin,
    resume.contact?.github,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${resume.name} — Resume</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.15;
    color: #111;
    background: #fff;
    padding: 0.75in 0.75in 0.75in 0.75in;
    max-width: 8.5in;
    margin: 0 auto;
  }
  header { text-align: center; margin-bottom: 10px; }
  header h1 { font-size: 22pt; font-weight: bold; letter-spacing: 0.02em; }
  header .contact { font-size: 9pt; color: #222; margin-top: 3px; }
  header .contact span + span::before { content: " | "; }
  .entry-sub { font-style: italic; font-size: 10pt; }
  h2 {
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #999;
    padding-bottom: 1px;
    margin-bottom: 4px;
    margin-top: 12px;
  }
  section { margin-bottom: 2px; }
  .summary { font-size: 11pt; color: #222; margin-bottom: 4px; }
  .entry { margin-bottom: 5px; }
  .entry-header { display: flex; justify-content: space-between; align-items: baseline; }
  .entry-title { font-weight: bold; font-size: 11pt; }
  .entry-dates { font-size: 10pt; color: #555; white-space: nowrap; margin-left: 8px; }
  ul { margin-left: 14px; margin-top: 1px; }
  li { margin-bottom: 0; font-size: 11pt; }
  .skill-row { font-size: 11pt; margin-bottom: 0; }
  .skill-cat { font-weight: bold; }
  .url { font-weight: normal; font-size: 9pt; color: #555; }
  .project-desc { font-size: 11pt; color: #333; margin-top: 1px; }
  .edu-detail { font-size: 10pt; color: #333; margin-top: 0; }
  .tailored-for { text-align: center; font-size: 8pt; color: #999; margin-top: 12px; }

  @media print {
    body { padding: 0.5in 0.6in; }
    .no-print { display: none !important; }
  }
  @media screen {
    body { background: #f5f5f5; }
    .page { background: #fff; padding: 0.75in; max-width: 8.5in; margin: 24px auto; box-shadow: 0 2px 12px rgba(0,0,0,0.12); }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${resume.name}</h1>
    <div class="contact">
      ${contactParts.map((c) => `<span>${c}</span>`).join("")}
    </div>
  </header>

  ${resume.summary ? `<section><h2>Summary</h2><p class="summary">${resume.summary}</p></section>` : ""}

  ${educationHtml ? `<section><h2>Education</h2>${educationHtml}</section>` : ""}

  ${skillsHtml ? `<section><h2>Technical Skills</h2>${skillsHtml}</section>` : ""}

  ${experienceHtml ? `<section><h2>Experience</h2>${experienceHtml}</section>` : ""}

  ${projectsHtml}

  <p class="tailored-for no-print">Tailored for: ${jobTitle}${company ? ` at ${company}` : ""}</p>
</div>
</body>
</html>`;
}

// ─── Cover letter HTML renderer ──────────────────────────────────────────────

function buildCoverLetterHtml(data: GenerateCoverLetterResponse): string {
  const paragraphs = data.cover_letter
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${p.trim()}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${data.applicant_name} — Cover Letter</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Georgia", serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #111;
    background: #fff;
    padding: 0.75in;
    max-width: 8.5in;
    margin: 0 auto;
  }
  header { margin-bottom: 32px; }
  header h1 { font-size: 16pt; font-weight: bold; }
  header .meta { font-size: 10pt; color: #555; margin-top: 4px; }
  p { margin-bottom: 16px; }
  @media print { body { padding: 0.6in; } }
  @media screen {
    body { background: #f5f5f5; }
    .page { background: #fff; padding: 0.75in; max-width: 8.5in; margin: 24px auto; box-shadow: 0 2px 12px rgba(0,0,0,0.12); }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${data.applicant_name}</h1>
    <div class="meta">${data.job.title}${data.job.company ? ` · ${data.job.company}` : ""}</div>
  </header>
  ${paragraphs}
</div>
</body>
</html>`;
}

// ─── Print helper ────────────────────────────────────────────────────────────

function printHtml(html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

// ─── Page ────────────────────────────────────────────────────────────────────

type GenState = "idle" | "loading" | "done" | "error";

export default function PreparePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const id = Number(jobId);

  const [job, setJob] = useState<Job | null>(null);
  const [jobLoading, setJobLoading] = useState(true);

  const [resumeState, setResumeState] = useState<GenState>("idle");
  const [resumeData, setResumeData] = useState<GenerateResumeResponse | null>(null);

  const [clState, setClState] = useState<GenState>("idle");
  const [clData, setClData] = useState<GenerateCoverLetterResponse | null>(null);

  useEffect(() => {
    api.jobs.get(id).then((j) => {
      setJob(j);
      if (j.cached_resume) {
        setResumeData(j.cached_resume);
        setResumeState("done");
      }
      if (j.cached_cover_letter) {
        setClData(j.cached_cover_letter);
        setClState("done");
      }
    }).finally(() => setJobLoading(false));
  }, [id]);

  async function generateResume(refresh = false) {
    setResumeState("loading");
    try {
      const data = await api.generate.resume(id, refresh);
      setResumeData(data);
      setResumeState("done");
    } catch {
      setResumeState("error");
    }
  }

  async function generateCoverLetter(refresh = false) {
    setClState("loading");
    try {
      const data = await api.generate.coverLetter(id, refresh);
      setClData(data);
      setClState("done");
    } catch {
      setClState("error");
    }
  }

  function printResume() {
    if (!resumeData) return;
    printHtml(buildResumeHtml(resumeData.resume, resumeData.job.title, resumeData.job.company));
  }

  function printCoverLetter() {
    if (!clData) return;
    printHtml(buildCoverLetterHtml(clData));
  }

  function slug(value: string | null | undefined): string {
    if (!value) return "Company";
    return value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Company";
  }

  function downloadResumeDocx() {
    if (!resumeData) return;
    downloadDocx(
      api.generate.resumeDocxUrl(id),
      `TylerTrlicek_Resume_${slug(resumeData.job.company)}.docx`,
    ).catch(() => setResumeState("error"));
  }

  function downloadCoverLetterDocx() {
    if (!clData) return;
    downloadDocx(
      api.generate.coverLetterDocxUrl(id),
      `TylerTrlicek_CoverLetter_${slug(clData.job.company)}.docx`,
    ).catch(() => setClState("error"));
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className="h-4 w-px bg-border" />
        {jobLoading ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <span className="text-sm font-medium text-foreground">
            {job?.title ?? "Job"}{job?.company ? ` — ${job.company.name}` : ""}
          </span>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex-row md:overflow-hidden md:p-6">
        {/* Left: job details */}
        <div className="w-full shrink-0 space-y-3 md:w-72 md:overflow-y-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Job Details
          </h2>
          {jobLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : job ? (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{job.title}</p>
                <p className="text-xs text-muted-foreground">
                  {job.company?.name ?? "—"} · {job.location ?? "—"}
                </p>
                {formatSalary(job) && (
                  <p className="text-xs text-muted-foreground">{formatSalary(job)}</p>
                )}
              </div>
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  View posting →
                </a>
              )}
              {job.description ? (
                <div className="max-h-64 overflow-y-auto md:max-h-none">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {job.description}
                  </p>
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground/60">
                  No description — generation will be less tailored.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Job not found.</p>
          )}
        </div>

        {/* Right: generate tabs */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Tabs defaultValue="resume" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-3">
              <TabsList className="h-8">
                <TabsTrigger value="resume" className="h-7 text-xs">Resume</TabsTrigger>
                <TabsTrigger value="cover-letter" className="h-7 text-xs">Cover Letter</TabsTrigger>
              </TabsList>
            </div>

            {/* Resume tab */}
            <TabsContent value="resume" className="flex flex-1 flex-col overflow-hidden data-hidden:hidden">
              <div className="flex items-center gap-2 pb-3">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => generateResume(resumeState === "done")}
                  disabled={resumeState === "loading"}
                >
                  {resumeState === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {resumeState === "idle" ? "Generate" : resumeState === "loading" ? "Generating…" : "Regenerate"}
                </Button>
                {resumeState === "done" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={printResume}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print / Save PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={downloadResumeDocx}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download .docx
                    </Button>
                  </>
                )}
                {resumeState === "error" && (
                  <span className="text-xs text-destructive">Generation failed — try again</span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto rounded-md border border-border bg-muted/20">
                {resumeState === "idle" && (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">Click Generate to create a tailored resume.</p>
                  </div>
                )}
                {resumeState === "loading" && (
                  <div className="flex h-full items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Claude is writing your resume…</p>
                  </div>
                )}
                {resumeState === "done" && resumeData && (
                  <ResumePreview data={resumeData.resume} />
                )}
              </div>
            </TabsContent>

            {/* Cover letter tab */}
            <TabsContent value="cover-letter" className="flex flex-1 flex-col overflow-hidden data-hidden:hidden">
              <div className="flex items-center gap-2 pb-3">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => generateCoverLetter(clState === "done")}
                  disabled={clState === "loading"}
                >
                  {clState === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {clState === "idle" ? "Generate" : clState === "loading" ? "Generating…" : "Regenerate"}
                </Button>
                {clState === "done" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={printCoverLetter}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print / Save PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={downloadCoverLetterDocx}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download .docx
                    </Button>
                  </>
                )}
                {clState === "error" && (
                  <span className="text-xs text-destructive">Generation failed — try again</span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-6">
                {clState === "idle" && (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">Click Generate to write a tailored cover letter.</p>
                  </div>
                )}
                {clState === "loading" && (
                  <div className="flex h-full items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Claude is writing your cover letter…</p>
                  </div>
                )}
                {clState === "done" && clData && (
                  <div className="prose prose-sm max-w-none text-foreground">
                    {clData.cover_letter.split(/\n\n+/).filter(Boolean).map((para, i) => (
                      <p key={i} className="mb-4 text-sm leading-relaxed text-foreground">
                        {para}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// ─── Resume preview component ─────────────────────────────────────────────────

function ResumePreview({ data }: { data: GenerateResumeResponse["resume"] }) {
  const contactParts = [
    data.contact?.email,
    data.contact?.phone,
    data.contact?.location?.split(/—| - | – |\(/)[0]?.trim(),
    data.contact?.linkedin,
    data.contact?.github,
  ].filter(Boolean);

  const heading = "mt-3 mb-1 border-b border-[#999] pb-px text-[12pt] font-bold uppercase tracking-[0.04em]";
  const entryTitle = "text-[11pt] font-bold";
  const entryDates = "ml-2 shrink-0 text-[10pt] text-[#555]";
  const bodyText = "text-[11pt]";
  const smallText = "text-[10pt] text-[#333]";

  return (
    <div className="min-h-full bg-white px-8 py-6 font-serif leading-[1.15] text-[11pt] text-[#111]">
      {/* Header */}
      <div className="mb-2 text-center">
        <h1 className="text-[22pt] font-bold">{data.name}</h1>
        <p className="mt-0.5 text-[9pt] text-[#222]">{contactParts.join(" | ")}</p>
      </div>

      {/* Education */}
      {(data.education?.length ?? 0) > 0 && (
        <section>
          <h2 className={heading}>Education</h2>
          {data.education!.map((ed, i) => (
            <div key={i} className="mb-1">
              <div className="flex items-baseline justify-between">
                <span className={entryTitle}>{ed.school}</span>
                {ed.location && <span className={entryDates}>{ed.location}</span>}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11pt] italic">{ed.degree}{ed.field ? ` in ${ed.field}` : ""}</span>
                <span className="ml-2 shrink-0 text-[10pt] italic text-[#555]">{ed.graduation}</span>
              </div>
              {ed.gpa && <p className={smallText}>GPA: {ed.gpa.includes("/") ? ed.gpa : `${ed.gpa} / 4.0`}</p>}
              {ed.coursework && <p className={smallText}>Relevant Coursework: {ed.coursework}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Technical Skills */}
      {(data.skills?.length ?? 0) > 0 && (
        <section>
          <h2 className={heading}>Technical Skills</h2>
          {data.skills!.map((s, i) =>
            typeof s === "string" ? (
              <p key={i} className={bodyText}>{s}</p>
            ) : (
              <p key={i} className={bodyText}>
                <span className="font-bold">{s.category}:</span> {s.items}
              </p>
            )
          )}
        </section>
      )}

      {/* Experience */}
      {(data.experience?.length ?? 0) > 0 && (
        <section>
          <h2 className={heading}>Experience</h2>
          {data.experience!.map((e, i) => (
            <div key={i} className="mb-1.5 mt-1">
              <div className="flex items-baseline justify-between">
                <span className={entryTitle}>{e.title} — {e.company}</span>
                <span className={entryDates}>{e.start} – {e.end || "Present"}</span>
              </div>
              <ul className="ml-3.5 list-disc">
                {e.bullets?.map((b, j) => (
                  <li key={j} className={bodyText}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Projects */}
      {(data.projects?.length ?? 0) > 0 && (
        <section>
          <h2 className={heading}>Projects</h2>
          {data.projects!.map((p, i) => (
            <div key={i} className="mb-1.5 mt-1">
              <div>
                <span className={entryTitle}>{p.name}</span>
                {p.url && <span className="ml-1.5 text-[9pt] text-[#555]">{p.url}</span>}
              </div>
              {p.bullets && p.bullets.length > 0 ? (
                <ul className="ml-3.5 list-disc">
                  {p.bullets.map((b, j) => (
                    <li key={j} className={bodyText}>{b}</li>
                  ))}
                </ul>
              ) : (
                p.description && <p className={smallText}>{p.description}</p>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
