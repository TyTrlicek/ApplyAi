"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { SourceBadge } from "@/components/source-badge";
import { api } from "@/lib/api";
import type { FetchResponse, Job } from "@/lib/types";
import { formatDate } from "@/lib/format";
import Link from "next/link";

interface Stats {
  totalJobs: number;
  needToApply: number;
  applied: number;
  fetchedToday: number;
}

function StatCard({
  title,
  value,
  icon: Icon,
  sub,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </p>
            {sub && (
              <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ActivityItem {
  id: string;
  type: "fetch" | "status" | "email";
  message: string;
  detail?: string;
  timestamp: string;
}

function ActivityFeed({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity yet. Trigger a fetch to get started.
      </p>
    );
  }

  const iconMap = {
    fetch: RefreshCw,
    status: CheckCircle2,
    email: Mail,
  };

  return (
    <ol className="space-y-4">
      {items.map((item) => {
        const Icon = iconMap[item.type];
        return (
          <li key={item.id} className="flex gap-3 text-sm">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-foreground">{item.message}</p>
              {item.detail && (
                <p className="mt-0.5 rounded border border-border bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">
                  {item.detail}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {item.timestamp}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<FetchResponse | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const all = await api.jobs.list({ limit: 500 });
        const needToApply = all.filter((j) => j.status === "need_to_apply").length;
        const applied = all.filter((j) => j.status === "applied").length;
        const today = new Date().toDateString();
        const fetchedToday = all.filter(
          (j) => new Date(j.first_seen).toDateString() === today
        ).length;
        setStats({ totalJobs: all.length, needToApply, applied, fetchedToday });
        setJobs(all.slice(0, 8));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchResult]);

  async function triggerFetch() {
    setFetching(true);
    try {
      const res = await api.fetch.trigger();
      setFetchResult(res);
      const now = new Date().toLocaleTimeString();
      const newItems: ActivityItem[] = res.results.map((r, i) => ({
        id: `fetch-${Date.now()}-${i}`,
        type: "fetch",
        message: `Fetched "${r.profile}" — ${r.inserted} new, ${r.updated} updated`,
        detail: `${r.seniority_filtered} senior, ${r.domain_filtered} off-domain, ${r.noise_filtered} noise filtered · ${r.duplicates_removed} deduped`,
        timestamp: now,
      }));
      setActivity((prev) => [...newItems, ...prev].slice(0, 20));
    } catch (err) {
      console.error("Fetch failed:", err);
      const newItem: ActivityItem = {
        id: `error-${Date.now()}`,
        type: "fetch",
        message: "Fetch failed — check that the backend is running",
        detail: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toLocaleTimeString(),
      };
      setActivity((prev) => [newItem, ...prev]);
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
        <h1 className="text-sm font-semibold text-foreground">Dashboard</h1>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={triggerFetch}
          disabled={fetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
          {fetching ? "Fetching…" : "Fetch Jobs"}
        </Button>
      </header>

      <div className="flex-1 space-y-4 p-4 md:space-y-6 md:p-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatCard
            title="Total Jobs"
            value={stats?.totalJobs ?? 0}
            icon={BriefcaseBusiness}
            loading={loading}
          />
          <StatCard
            title="Need to Apply"
            value={stats?.needToApply ?? 0}
            icon={Clock}
            sub="in queue"
            loading={loading}
          />
          <StatCard
            title="Applied"
            value={stats?.applied ?? 0}
            icon={CheckCircle2}
            loading={loading}
          />
          <StatCard
            title="Fetched Today"
            value={stats?.fetchedToday ?? 0}
            icon={TrendingUp}
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {/* Activity feed */}
          <Card className="col-span-1 md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed items={activity} loading={false} />
              {activity.length === 0 && !loading && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Activity will appear here after your first fetch.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent jobs */}
          <Card className="col-span-1 md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-medium">Recent Jobs</CardTitle>
              <Link
                href="/discover"
                className="text-xs text-primary hover:underline"
              >
                Review all →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-px">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-3">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : jobs.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">No jobs yet.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Click "Fetch Jobs" to pull from Indeed, LinkedIn, and Google.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-4 px-6 py-2.5 hover:bg-accent/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {job.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {job.company?.name ?? "—"} · {job.location ?? "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SourceBadge source={job.source} />
                        <StatusBadge status={job.status} />
                        <span className="w-14 text-right text-xs text-muted-foreground">
                          {formatDate(job.date_posted)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
