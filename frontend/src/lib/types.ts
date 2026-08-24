export type JobStatus =
  | "need_to_apply"
  | "applied"
  | "chose_not_to_apply"
  | "interviewing"
  | "rejected_pre"
  | "rejected_post"
  | "stale_pre"
  | "stale_post"
  | "ghosted";

export type WorkStyle = "in-office" | "hybrid" | "remote";

export interface WorkEntry {
  id: string;
  company: string;
  title: string;
  start: string;
  end: string;
  bullets: string;
  context: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  context: string;
}

export interface TechStack {
  languages: string;
  frameworks: string;
  tools: string;
  cloud: string;
  other: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface Extracurricular {
  id: string;
  org: string;
  role: string;
  dates: string;
  description: string;
}

export interface MapProfile {
  bio: string;
  personal: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    positioningNotes: string;
  };
  experience: WorkEntry[];
  education: {
    school: string;
    degree: string;
    field: string;
    graduation: string;
    gpa: string;
    honors: string;
    coursework: string;
  };
  techStack: TechStack;
  projects: ProjectEntry[];
  certifications: Certification[];
  extracurriculars: Extracurricular[];
  prefs: {
    locations: string;
    salaryMin: string;
    workStyle: WorkStyle;
  };
  targetedCompanies?: string[];
  resumeFile?: {
    filename: string;
    path: string;
    uploadedAt: string;
  };
}

export interface Company {
  id: number;
  name: string;
}

export interface Job {
  id: number;
  title: string;
  company: Company | null;
  location: string | null;
  is_remote: boolean;
  url: string | null;
  apply_url: string | null;
  date_posted: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_interval: string | null;
  source: string;
  status: JobStatus;
  first_seen: string;
  last_seen: string;
  description: string | null;
  cached_resume: GenerateResumeResponse | null;
  cached_cover_letter: GenerateCoverLetterResponse | null;
}

export interface SearchProfile {
  id: number;
  name: string;
  search_term: string;
  location: string;
  is_remote: boolean;
  job_type: string | null;
  results_wanted: number;
  hours_old: number;
  sources: string;
  active: boolean;
  created_at: string;
}

export interface ResumeContact {
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
}

export interface ResumeExperience {
  company: string;
  title: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  location?: string;
  degree: string;
  field: string;
  graduation: string;
  gpa?: string;
  coursework?: string;
}

export interface ResumeSkillGroup {
  category: string;
  items: string;
}

export interface ResumeProject {
  name: string;
  url: string;
  bullets?: string[];
  description?: string; // legacy: older cached resumes used a prose description
}

export interface ResumeData {
  name: string;
  contact: ResumeContact;
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: (ResumeSkillGroup | string)[]; // string[] = legacy flat list
  projects: ResumeProject[];
}

export interface GenerateResumeResponse {
  resume: ResumeData;
  job: { title: string; company: string | null; location: string | null; description: string };
}

export interface GenerateCoverLetterResponse {
  cover_letter: string;
  job: { title: string; company: string | null; location: string | null; description: string };
  applicant_name: string;
}

export interface FormAnswersResponse {
  answers: string[];
}

export interface SchedulerStatus {
  active: boolean;
  hour: number;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_summary: { total_inserted?: number; total_updated?: number; error?: string } | null;
}

export interface FetchResult {
  profile: string;
  inserted: number;
  updated: number;
  seniority_filtered: number;
  domain_filtered: number;
  noise_filtered: number;
  duplicates_removed: number;
  degraded_sources: string[];
}

export interface FetchResponse {
  results: FetchResult[];
  total_inserted: number;
  total_updated: number;
}

export type ApplySessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting_for_login"
  | "waiting_for_review"
  | "submitted"
  | "error"
  | "cancelled";

export interface ApplyFilledField {
  field: string;
  value: string;
  ai_generated: boolean;
}

export interface ApplyStatusResponse {
  status: ApplySessionStatus;
  step: string | null;
  filled_fields: ApplyFilledField[];
  error: string | null;
  pid: number | null;
  started_at: string | null;
}
