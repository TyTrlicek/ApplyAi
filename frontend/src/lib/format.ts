import type { Job } from "./types";

export function formatSalary(job: Job): string | null {
  if (!job.salary_min && !job.salary_max) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: job.salary_currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(n);

  const interval = job.salary_interval === "yearly" ? "/yr" : job.salary_interval === "hourly" ? "/hr" : "";

  if (job.salary_min && job.salary_max) {
    return `${fmt(job.salary_min)} – ${fmt(job.salary_max)}${interval}`;
  }
  if (job.salary_min) return `${fmt(job.salary_min)}+${interval}`;
  if (job.salary_max) return `Up to ${fmt(job.salary_max)}${interval}`;
  return null;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
