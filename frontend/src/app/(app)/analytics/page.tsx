"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Funnel,
  FunnelChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";

const CHART_COLORS = [
  "oklch(0.585 0.19 264)",
  "oklch(0.55 0.17 300)",
  "oklch(0.60 0.14 200)",
  "oklch(0.65 0.15 150)",
  "oklch(0.50 0 0)",
];

function ChartCard({
  title,
  children,
  loading,
}: {
  title: string;
  children: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message?: string }) {
  return (
    <div className="flex h-40 items-center justify-center">
      <p className="text-xs text-muted-foreground">
        {message ?? "Not enough data yet"}
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.jobs.list({ limit: 500 }).then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, []);

  /* Derived data */
  const statusCounts = {
    need_to_apply: jobs.filter((j) => j.status === "need_to_apply").length,
    applied: jobs.filter((j) => j.status === "applied").length,
    decided_not: jobs.filter((j) => j.status === "decided_not").length,
  };

  const funnelData = [
    { name: "Total", value: jobs.length, fill: CHART_COLORS[0] },
    { name: "Need to Apply", value: statusCounts.need_to_apply, fill: CHART_COLORS[1] },
    { name: "Applied", value: statusCounts.applied, fill: CHART_COLORS[2] },
  ].filter((d) => d.value > 0);

  const sourceData = Object.entries(
    jobs.reduce<Record<string, number>>((acc, j) => {
      acc[j.source] = (acc[j.source] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const byWeek = jobs.reduce<Record<string, number>>((acc, j) => {
    const d = new Date(j.first_seen);
    const week = `${d.getMonth() + 1}/${Math.ceil(d.getDate() / 7) * 7 - 6}`;
    acc[week] = (acc[week] ?? 0) + 1;
    return acc;
  }, {});
  const weekData = Object.entries(byWeek)
    .map(([week, count]) => ({ week, count }))
    .slice(-8);

  const statusPie = [
    { name: "Need to Apply", value: statusCounts.need_to_apply },
    { name: "Applied", value: statusCounts.applied },
    { name: "Not Applying", value: statusCounts.decided_not },
  ].filter((d) => d.value > 0);

  const salaryData = jobs
    .filter((j) => j.salary_min && j.salary_min > 0)
    .map((j) => j.salary_min! / 1000)
    .reduce<{ range: string; count: number }[]>((acc, sal) => {
      const bucket = `${Math.floor(sal / 20) * 20}k`;
      const existing = acc.find((b) => b.range === bucket);
      if (existing) existing.count++;
      else acc.push({ range: bucket, count: 1 });
      return acc;
    }, [])
    .sort((a, b) => parseFloat(a.range) - parseFloat(b.range));

  const tooltipStyle = {
    backgroundColor: "oklch(0.155 0 0)",
    border: "1px solid oklch(1 0 0 / 8%)",
    borderRadius: "6px",
    fontSize: "12px",
    color: "oklch(0.92 0 0)",
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex h-14 items-center border-b border-border px-4 md:px-6">
        <h1 className="text-sm font-semibold text-foreground">Analytics</h1>
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
        {/* Application Funnel */}
        <ChartCard title="Application Funnel" loading={loading}>
          {funnelData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <FunnelChart>
                <Funnel dataKey="value" data={funnelData} isAnimationActive={false}>
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Funnel>
                <Tooltip contentStyle={tooltipStyle} />
              </FunnelChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Jobs Over Time */}
        <ChartCard title="Jobs Discovered (by week)" loading={loading}>
          {weekData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={weekData} barSize={16}>
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: "oklch(0.52 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "oklch(0.52 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Source Breakdown */}
        <ChartCard title="Jobs by Source" loading={loading}>
          {sourceData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={sourceData} layout="vertical" barSize={14}>
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "oklch(0.52 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "oklch(0.52 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Status Breakdown */}
        <ChartCard title="Status Breakdown" loading={loading}>
          {statusPie.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={statusPie}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    isAnimationActive={false}
                  >
                    {statusPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {statusPie.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {entry.name}{" "}
                      <span className="font-medium text-foreground">{entry.value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* Salary Distribution */}
        <ChartCard title="Salary Distribution (min, $k)" loading={loading}>
          {salaryData.length === 0 ? (
            <EmptyChart message="No salary data available yet" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={salaryData} barSize={16}>
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 10, fill: "oklch(0.52 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "oklch(0.52 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={CHART_COLORS[2]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Response Rate — placeholder for email integration */}
        <ChartCard title="Response Rate" loading={loading}>
          <EmptyChart message="Available after email integration is connected" />
        </ChartCard>
      </div>
    </div>
  );
}
