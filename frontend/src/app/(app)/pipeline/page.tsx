"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Columns3, LayoutList, Mail } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { SourceBadge } from "@/components/source-badge";
import { JobDetailSheet } from "@/components/job-detail-sheet";
import { api } from "@/lib/api";
import type { Job, JobStatus } from "@/lib/types";
import { formatDate } from "@/lib/format";

type View = "kanban" | "table";

interface PipelineColumn {
  id: string;
  label: string;
  status?: JobStatus;
  future?: boolean;
  color: string;
}

const COLUMNS: PipelineColumn[] = [
  { id: "need_to_apply", label: "Need to Apply", status: "need_to_apply", color: "bg-blue-500/20 text-blue-400" },
  { id: "applied", label: "Applied", status: "applied", color: "bg-emerald-500/20 text-emerald-400" },
  { id: "phone_screen", label: "Phone Screen", future: true, color: "bg-violet-500/20 text-violet-400" },
  { id: "technical", label: "Technical", future: true, color: "bg-orange-500/20 text-orange-400" },
  { id: "onsite", label: "Onsite", future: true, color: "bg-yellow-500/20 text-yellow-400" },
  { id: "offer", label: "Offer", future: true, color: "bg-green-500/20 text-green-400" },
  { id: "ghosted", label: "Ghosted / Rejected", future: true, color: "bg-zinc-500/20 text-zinc-400" },
];

function KanbanCard({
  job,
  onClick,
  onStatusChange,
}: {
  job: Job;
  onClick: () => void;
  onStatusChange: (id: number, status: JobStatus) => void;
}) {
  return (
    <div
      className="group cursor-pointer rounded-md border border-border bg-card p-3 hover:border-border/80 hover:bg-accent/30 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
          {job.title}
        </p>
        {/* Email badge placeholder — will light up when email integration lands */}
        <Mail className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60" />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">
        {job.company?.name ?? "—"}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <SourceBadge source={job.source} />
        <span className="text-xs text-muted-foreground">
          {formatDate(job.date_posted)}
        </span>
      </div>
    </div>
  );
}

function FutureColumn({ col }: { col: PipelineColumn }) {
  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${col.color}`}>
          {col.label}
        </span>
        <Badge variant="outline" className="border-border text-xs text-muted-foreground">
          Coming soon
        </Badge>
      </div>
      <div className="flex-1 rounded-md border border-dashed border-border/50 p-3">
        <p className="text-center text-xs text-muted-foreground/50">
          Email integration will auto-populate this column
        </p>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("kanban");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    api.jobs.list({ limit: 500 }).then((data) => {
      setJobs(data);
      setLoading(false);
    });
  }, []);

  async function handleStatusChange(jobId: number, status: JobStatus) {
    const updated = await api.jobs.updateStatus(jobId, status);
    setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
    if (selectedJob?.id === jobId) setSelectedJob(updated);
  }

  function openJob(job: Job) {
    setSelectedJob(job);
    setSheetOpen(true);
  }

  const byStatus = (status: JobStatus) => jobs.filter((j) => j.status === status);

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
          <h1 className="text-sm font-semibold text-foreground">Pipeline</h1>
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              variant={view === "kanban" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => setView("kanban")}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Kanban
            </Button>
            <Button
              variant={view === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => setView("table")}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Table
            </Button>
          </div>
        </header>

        {view === "kanban" ? (
          /* Kanban */
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full gap-4 p-6">
              {COLUMNS.map((col) => {
                if (col.future) return <FutureColumn key={col.id} col={col} />;
                const colJobs = byStatus(col.status!);
                return (
                  <div key={col.id} className="flex w-64 shrink-0 flex-col">
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${col.color}`}>
                        {col.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {loading ? "…" : colJobs.length}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                      {loading
                        ? Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 w-full rounded-md" />
                          ))
                        : colJobs.length === 0
                        ? (
                            <div className="rounded-md border border-dashed border-border/50 p-4">
                              <p className="text-center text-xs text-muted-foreground/50">
                                Empty
                              </p>
                            </div>
                          )
                        : colJobs.map((job) => (
                            <KanbanCard
                              key={job.id}
                              job={job}
                              onClick={() => openJob(job)}
                              onStatusChange={handleStatusChange}
                            />
                          ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Table */
          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="pl-6 text-xs">Title</TableHead>
                  <TableHead className="hidden text-xs sm:table-cell">Company</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Source</TableHead>
                  <TableHead className="hidden text-xs lg:table-cell">Posted</TableHead>
                  <TableHead className="hidden text-xs lg:table-cell">First Seen</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="pl-6">
                          <Skeleton className="h-4 w-48" />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-14" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-14" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                      </TableRow>
                    ))
                  : jobs.length === 0
                  ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-16 text-center text-sm text-muted-foreground"
                        >
                          No jobs in pipeline yet.
                        </TableCell>
                      </TableRow>
                    )
                  : jobs.map((job) => (
                      <TableRow
                        key={job.id}
                        className="cursor-pointer border-border hover:bg-accent/40"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("[data-no-row-click]")) return;
                          openJob(job);
                        }}
                      >
                        <TableCell className="pl-6 font-medium text-foreground">
                          <span className="line-clamp-1 max-w-[200px]">{job.title}</span>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          {job.company?.name ?? "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <SourceBadge source={job.source} />
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {formatDate(job.date_posted)}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {formatDate(job.first_seen)}
                        </TableCell>
                        <TableCell
                          data-no-row-click
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger className="flex items-center gap-1 rounded hover:opacity-80">
                              <StatusBadge status={job.status} />
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={() => handleStatusChange(job.id, "need_to_apply")}
                              >
                                Need to Apply
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={() => handleStatusChange(job.id, "decided_not")}
                              >
                                Not Applying
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={() => handleStatusChange(job.id, "applied")}
                              >
                                Applied
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <JobDetailSheet
        job={selectedJob}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onStatusChange={handleStatusChange}
      />
    </>
  );
}
