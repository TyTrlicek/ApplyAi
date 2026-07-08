"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type {
  Certification,
  Extracurricular,
  MapProfile,
  ProjectEntry,
  WorkEntry,
  WorkStyle,
} from "@/lib/types";

const DEFAULT_PROFILE: MapProfile = {
  bio: "",
  personal: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", positioningNotes: "" },
  experience: [],
  education: { school: "", degree: "", field: "", graduation: "", gpa: "", honors: "", coursework: "" },
  techStack: { languages: "", frameworks: "", tools: "", cloud: "", other: "" },
  projects: [],
  certifications: [],
  extracurriculars: [],
  prefs: { locations: "", salaryMin: "", workStyle: "in-office" },
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ProfilePage() {
  const [profile, setProfile] = useState<MapProfile>(DEFAULT_PROFILE);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.profile.get().then((data) => {
      if (data && Object.keys(data).length > 0) {
        setProfile({ ...DEFAULT_PROFILE, ...data });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function setPersonal(key: keyof MapProfile["personal"], val: string) {
    setProfile((p) => ({ ...p, personal: { ...p.personal, [key]: val } }));
  }

  function setEducation(key: keyof MapProfile["education"], val: string) {
    setProfile((p) => ({ ...p, education: { ...p.education, [key]: val } }));
  }

  function setTechStack(key: keyof MapProfile["techStack"], val: string) {
    setProfile((p) => ({ ...p, techStack: { ...p.techStack, [key]: val } }));
  }

  function setPrefs(key: keyof MapProfile["prefs"], val: string) {
    setProfile((p) => ({ ...p, prefs: { ...p.prefs, [key]: val } }));
  }

  // Work experience
  function addWork() {
    setProfile((p) => ({
      ...p,
      experience: [...p.experience, { id: crypto.randomUUID(), company: "", title: "", start: "", end: "", bullets: "", context: "" }],
    }));
  }
  function removeWork(id: string) {
    setProfile((p) => ({ ...p, experience: p.experience.filter((e) => e.id !== id) }));
  }
  function updateWork(id: string, field: keyof WorkEntry, val: string) {
    setProfile((p) => ({
      ...p,
      experience: p.experience.map((e) => (e.id === id ? { ...e, [field]: val } : e)),
    }));
  }

  // Projects
  function addProject() {
    setProfile((p) => ({
      ...p,
      projects: [...p.projects, { id: crypto.randomUUID(), name: "", description: "", url: "", context: "" }],
    }));
  }
  function removeProject(id: string) {
    setProfile((p) => ({ ...p, projects: p.projects.filter((pr) => pr.id !== id) }));
  }
  function updateProject(id: string, field: keyof ProjectEntry, val: string) {
    setProfile((p) => ({
      ...p,
      projects: p.projects.map((pr) => (pr.id === id ? { ...pr, [field]: val } : pr)),
    }));
  }

  // Certifications
  function addCert() {
    setProfile((p) => ({
      ...p,
      certifications: [...p.certifications, { id: crypto.randomUUID(), name: "", issuer: "", date: "" }],
    }));
  }
  function removeCert(id: string) {
    setProfile((p) => ({ ...p, certifications: p.certifications.filter((c) => c.id !== id) }));
  }
  function updateCert(id: string, field: keyof Certification, val: string) {
    setProfile((p) => ({
      ...p,
      certifications: p.certifications.map((c) => (c.id === id ? { ...c, [field]: val } : c)),
    }));
  }

  // Extracurriculars
  function addExtra() {
    setProfile((p) => ({
      ...p,
      extracurriculars: [...p.extracurriculars, { id: crypto.randomUUID(), org: "", role: "", dates: "", description: "" }],
    }));
  }
  function removeExtra(id: string) {
    setProfile((p) => ({ ...p, extracurriculars: p.extracurriculars.filter((e) => e.id !== id) }));
  }
  function updateExtra(id: string, field: keyof Extracurricular, val: string) {
    setProfile((p) => ({
      ...p,
      extracurriculars: p.extracurriculars.map((e) => (e.id === id ? { ...e, [field]: val } : e)),
    }));
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      await api.profile.save(profile);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  const { bio, personal, experience, education, techStack, projects, certifications, extracurriculars, prefs } = profile;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Editor */}
      <div className="flex flex-1 flex-col overflow-y-auto border-r border-border">
        <header className="flex h-14 items-center border-b border-border px-4 md:px-6">
          <h1 className="text-sm font-semibold text-foreground">Profile — Master Applicant Profile</h1>
        </header>

        <div className="space-y-8 p-4 md:p-6">

          {/* Bio / Brain Dump */}
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bio &amp; Brain Dump
            </h2>
            <p className="mb-3 text-xs text-muted-foreground/70">
              Write anything about yourself in plain English — career story, goals, personality, context behind achievements, things that don't fit a form. The AI reads this raw.
            </p>
            <Textarea
              rows={6}
              placeholder="E.g. I'm a new grad CS student from UT Dallas with a strong interest in defense tech and systems software. I interned at ShieldAI where I worked on autonomy stacks for drones. I'm most energized by hard engineering problems at companies with clear mission..."
              value={bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              className="text-sm"
            />
          </section>

          <Separator />

          {/* Personal */}
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Personal Info
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["name", "Full Name"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["location", "Location"],
                  ["linkedin", "LinkedIn URL"],
                  ["github", "GitHub URL"],
                ] as [keyof MapProfile["personal"], string][]
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    value={personal[key]}
                    onChange={(e) => setPersonal(key, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              <div className="col-span-1 space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  Positioning Notes <span className="text-muted-foreground/50">(AI only — applied to every resume)</span>
                </Label>
                <Textarea
                  rows={3}
                  placeholder="e.g. I'm a new grad — don't position me as senior. Frame me as an AI/agent engineer first, full-stack second. I'm a US citizen — mention this for defense roles. Willing to relocate anywhere in the US."
                  value={personal.positioningNotes}
                  onChange={(e) => setPersonal("positioningNotes", e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Work Experience */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Work Experience
              </h2>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addWork}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-4">
              {experience.length === 0 && (
                <p className="text-sm text-muted-foreground">No experience added yet.</p>
              )}
              {experience.map((entry) => (
                <Card key={entry.id} className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {entry.title && entry.company ? `${entry.title} — ${entry.company}` : entry.company || "New Entry"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeWork(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Company</Label>
                      <Input value={entry.company} onChange={(e) => updateWork(entry.id, "company", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Title</Label>
                      <Input value={entry.title} onChange={(e) => updateWork(entry.id, "title", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Start</Label>
                      <Input placeholder="Jan 2024" value={entry.start} onChange={(e) => updateWork(entry.id, "start", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">End</Label>
                      <Input placeholder="Present" value={entry.end} onChange={(e) => updateWork(entry.id, "end", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="col-span-1 space-y-1.5 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Bullet Points (one per line)</Label>
                      <Textarea rows={4} value={entry.bullets} onChange={(e) => updateWork(entry.id, "bullets", e.target.value)} className="text-sm" placeholder="• Led migration of…&#10;• Built and deployed…" />
                    </div>
                    <div className="col-span-1 space-y-1.5 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">
                        Context <span className="text-muted-foreground/50">(AI only — not shown on resume)</span>
                      </Label>
                      <Textarea
                        rows={3}
                        value={entry.context}
                        onChange={(e) => updateWork(entry.id, "context", e.target.value)}
                        className="text-sm"
                        placeholder="Team size, tech stack used, what you're proud of, why you left, anything the bullets don't capture…"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <Separator />

          {/* Education */}
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Education
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">School</Label>
                <Input value={education.school} onChange={(e) => setEducation("school", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Degree</Label>
                <Input placeholder="B.S." value={education.degree} onChange={(e) => setEducation("degree", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Field of Study</Label>
                <Input placeholder="Computer Science" value={education.field} onChange={(e) => setEducation("field", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Graduation</Label>
                <Input placeholder="Dec 2025" value={education.graduation} onChange={(e) => setEducation("graduation", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">GPA</Label>
                <Input placeholder="3.8 / 4.0" value={education.gpa} onChange={(e) => setEducation("gpa", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Honors / Awards</Label>
                <Input placeholder="Dean's List, Summa Cum Laude…" value={education.honors} onChange={(e) => setEducation("honors", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="col-span-1 space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Relevant Coursework</Label>
                <Input placeholder="Operating Systems, Algorithms, Computer Networks, Machine Learning…" value={education.coursework} onChange={(e) => setEducation("coursework", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </section>

          <Separator />

          {/* Tech Stack */}
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tech Stack
            </h2>
            <p className="mb-3 text-xs text-muted-foreground/70">Comma-separated within each category.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["languages", "Languages", "Python, TypeScript, C++, Go, Rust…"],
                  ["frameworks", "Frameworks & Libraries", "React, FastAPI, PyTorch, Next.js…"],
                  ["tools", "Tools & Platforms", "Git, Docker, Kubernetes, PostgreSQL, Redis…"],
                  ["cloud", "Cloud & Infrastructure", "AWS, GCP, Azure, Terraform, CI/CD…"],
                  ["other", "Other", "Agile, REST APIs, GraphQL, gRPC…"],
                ] as [keyof MapProfile["techStack"], string, string][]
              ).map(([key, label, placeholder]) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    placeholder={placeholder}
                    value={techStack[key]}
                    onChange={(e) => setTechStack(key, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Projects */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Projects
              </h2>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addProject}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-4">
              {projects.length === 0 && (
                <p className="text-sm text-muted-foreground">No projects added yet.</p>
              )}
              {projects.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium">{p.name || "New Project"}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeProject(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input value={p.name} onChange={(e) => updateProject(p.id, "name", e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">URL</Label>
                      <Input value={p.url} onChange={(e) => updateProject(p.id, "url", e.target.value)} className="h-8 text-sm" placeholder="https://github.com/…" />
                    </div>
                    <div className="col-span-1 space-y-1.5 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Textarea rows={2} value={p.description} onChange={(e) => updateProject(p.id, "description", e.target.value)} className="text-sm" />
                    </div>
                    <div className="col-span-1 space-y-1.5 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">
                        Context <span className="text-muted-foreground/50">(AI only)</span>
                      </Label>
                      <Textarea
                        rows={2}
                        value={p.context}
                        onChange={(e) => updateProject(p.id, "context", e.target.value)}
                        className="text-sm"
                        placeholder="Tech used, scale, outcome, why you built it, what was hard…"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <Separator />

          {/* Certifications */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Certifications
              </h2>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addCert}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-3">
              {certifications.length === 0 && (
                <p className="text-sm text-muted-foreground">No certifications added yet.</p>
              )}
              {certifications.map((c) => (
                <div key={c.id} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Certification</Label>
                    <Input value={c.name} onChange={(e) => updateCert(c.id, "name", e.target.value)} className="h-8 text-sm" placeholder="AWS Solutions Architect" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Issuer</Label>
                    <Input value={c.issuer} onChange={(e) => updateCert(c.id, "issuer", e.target.value)} className="h-8 text-sm" placeholder="Amazon Web Services" />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <Input value={c.date} onChange={(e) => updateCert(c.id, "date", e.target.value)} className="h-8 text-sm" placeholder="Mar 2024" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCert(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Extracurriculars */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Extracurriculars &amp; Leadership
              </h2>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addExtra}>
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-4">
              {extracurriculars.length === 0 && (
                <p className="text-sm text-muted-foreground">No extracurriculars added yet.</p>
              )}
              {extracurriculars.map((e) => (
                <Card key={e.id} className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium">{e.org || "New Entry"}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeExtra(e.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Organization</Label>
                      <Input value={e.org} onChange={(ev) => updateExtra(e.id, "org", ev.target.value)} className="h-8 text-sm" placeholder="ACM, Robotics Club…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Role</Label>
                      <Input value={e.role} onChange={(ev) => updateExtra(e.id, "role", ev.target.value)} className="h-8 text-sm" placeholder="President, Member…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Dates</Label>
                      <Input value={e.dates} onChange={(ev) => updateExtra(e.id, "dates", ev.target.value)} className="h-8 text-sm" placeholder="Aug 2022 – May 2024" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Input value={e.description} onChange={(ev) => updateExtra(e.id, "description", ev.target.value)} className="h-8 text-sm" placeholder="What you did, impact…" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <Separator />

          {/* Preferences */}
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preferences
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Target Locations</Label>
                <Input placeholder="Dallas, TX; Remote; NYC" value={prefs.locations} onChange={(e) => setPrefs("locations", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Min Salary ($)</Label>
                <Input type="number" placeholder="80000" value={prefs.salaryMin} onChange={(e) => setPrefs("salaryMin", e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Work Style</Label>
                <Select value={prefs.workStyle} onValueChange={(v) => setPrefs("workStyle", v as WorkStyle)}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-office">In-Office</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <div className="pb-6">
            <Button
              size="sm"
              className="text-xs"
              onClick={handleSave}
              disabled={saveState === "saving"}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Error — try again" : "Save Profile"}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview panel */}
      <div className="hidden w-80 shrink-0 overflow-y-auto bg-muted/20 md:flex md:flex-col">
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Preview</span>
        </div>
        <div className="p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {personal.name && <p className="mb-1 font-semibold text-foreground">{personal.name}</p>}
          {personal.positioningNotes && <p className="mb-3 italic text-muted-foreground/70">{personal.positioningNotes}</p>}
          {bio && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase text-foreground">Bio</p>
              <p className="line-clamp-4 whitespace-pre-wrap">{bio}</p>
            </div>
          )}
          {experience.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase text-foreground">Experience</p>
              {experience.map((e) => (
                <div key={e.id} className="mb-2">
                  <p className="font-medium text-foreground">{e.title}{e.company ? ` — ${e.company}` : ""}</p>
                  <p>{e.start}{e.start ? " – " : ""}{e.end || (e.start ? "Present" : "")}</p>
                </div>
              ))}
            </div>
          )}
          {(techStack.languages || techStack.frameworks || techStack.tools) && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase text-foreground">Tech Stack</p>
              {techStack.languages && <p><span className="text-foreground">Languages:</span> {techStack.languages}</p>}
              {techStack.frameworks && <p><span className="text-foreground">Frameworks:</span> {techStack.frameworks}</p>}
              {techStack.tools && <p><span className="text-foreground">Tools:</span> {techStack.tools}</p>}
              {techStack.cloud && <p><span className="text-foreground">Cloud:</span> {techStack.cloud}</p>}
            </div>
          )}
          {certifications.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase text-foreground">Certifications</p>
              {certifications.map((c) => (
                <p key={c.id}>{c.name}{c.issuer ? ` (${c.issuer})` : ""}</p>
              ))}
            </div>
          )}
          {!personal.name && experience.length === 0 && !bio && (
            <p className="italic text-muted-foreground/50">Fill out your profile to see the AI preview here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
