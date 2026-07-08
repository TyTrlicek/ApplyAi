import type {
  FetchResponse,
  GenerateCoverLetterResponse,
  GenerateResumeResponse,
  Job,
  JobStatus,
  MapProfile,
  SearchProfile,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export interface JobsListParams {
  status?: JobStatus;
  source?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const api = {
  jobs: {
    list: (params: JobsListParams = {}) => {
      const q = new URLSearchParams();
      if (params.status) q.set("status", params.status);
      if (params.source) q.set("source", params.source);
      if (params.search) q.set("search", params.search);
      if (params.limit != null) q.set("limit", String(params.limit));
      if (params.offset != null) q.set("offset", String(params.offset));
      const qs = q.toString();
      return apiFetch<Job[]>(`/jobs/${qs ? `?${qs}` : ""}`);
    },
    get: (id: number) => apiFetch<Job>(`/jobs/${id}`),
    updateStatus: (id: number, status: JobStatus) =>
      apiFetch<Job>(`/jobs/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
  searches: {
    list: () => apiFetch<SearchProfile[]>("/searches/"),
  },
  fetch: {
    trigger: (profileIds?: number[], hoursOld?: number) =>
      apiFetch<FetchResponse>("/fetch/", {
        method: "POST",
        body: JSON.stringify({
          profile_ids: profileIds ?? null,
          hours_old: hoursOld ?? null,
        }),
      }),
  },
  generate: {
    resume: (jobId: number, refresh = false) =>
      apiFetch<GenerateResumeResponse>(`/jobs/${jobId}/resume${refresh ? "?refresh=true" : ""}`, { method: "POST" }),
    coverLetter: (jobId: number, refresh = false) =>
      apiFetch<GenerateCoverLetterResponse>(`/jobs/${jobId}/cover-letter${refresh ? "?refresh=true" : ""}`, { method: "POST" }),
    resumeDocxUrl: (jobId: number) => `${API_BASE}/jobs/${jobId}/resume.docx`,
    coverLetterDocxUrl: (jobId: number) => `${API_BASE}/jobs/${jobId}/cover-letter.docx`,
  },
  profile: {
    get: () => apiFetch<MapProfile>("/profile/"),
    save: (profile: MapProfile) =>
      apiFetch<MapProfile>("/profile/", {
        method: "PUT",
        body: JSON.stringify({ data: profile }),
      }),
  },
  health: () => apiFetch<{ status: string }>("/health"),
};

/** Fetch a .docx from `url` and trigger a browser download named `filename`. */
export async function downloadDocx(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
