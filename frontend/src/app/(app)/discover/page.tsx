"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Filter, Search, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { SourceBadge } from "@/components/source-badge";
import { JobDetailSheet } from "@/components/job-detail-sheet";
import { api } from "@/lib/api";
import type { Job, JobStatus } from "@/lib/types";
import { formatDate, formatSalary } from "@/lib/format";
import { isKnownCompany } from "@/lib/known-companies";
import { isTargeted } from "@/lib/company-lists";

const STATUS_OPTIONS: { value: JobStatus | "all"; label: string }[] = [
  { value: "all",              label: "All statuses" },
  { value: "need_to_apply",    label: "Need to Apply" },
  { value: "applied",          label: "Applied" },
  { value: "chose_not_to_apply", label: "Chose Not to Apply" },
  { value: "interviewing",     label: "Interviewing" },
  { value: "rejected_pre",     label: "Rejected (Pre-Interview)" },
  { value: "rejected_post",    label: "Rejected (Post-Interview)" },
  { value: "stale_pre",        label: "Stale (Pre-Interview)" },
  { value: "stale_post",       label: "Stale (Post-Interview)" },
  { value: "ghosted",          label: "Ghosted" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "indeed", label: "Indeed" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "google", label: "Google" },
];

export default function DiscoverPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [knownOnly, setKnownOnly] = useState(false);
  const [targetsOnly, setTargetsOnly] = useState(false);
  const [targetedCompanies, setTargetedCompanies] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayedJobs = jobs
    .filter((j) => !knownOnly || isKnownCompany(j.company?.name))
    .filter((j) => !targetsOnly || isTargeted(j.company?.name, targetedCompanies));

  const load = useCallback(
    async (searchTerm = search, status = statusFilter, source = sourceFilter) => {
      setLoading(true);
      try {
        const data = await api.jobs.list({
          search: searchTerm || undefined,
          status: status === "all" ? undefined : status,
          source: source === "all" ? undefined : source,
          limit: 200,
        });
        setJobs(data);
        setSelected(new Set());
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, sourceFilter]
  );

  useEffect(() => {
    load("", "all", "all");
    api.profile.get().then((p) => setTargetedCompanies(p.targetedCompanies ?? []));
  }, []);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => load(val, statusFilter, sourceFilter), 300);
  }

  function handleStatusFilter(val: string | null) {
    if (!val) return;
    const s = val as JobStatus | "all";
    setStatusFilter(s);
    load(search, s, sourceFilter);
  }

  function handleSourceFilter(val: string | null) {
    if (!val) return;
    setSourceFilter(val);
    load(search, statusFilter, val);
  }

  async function handleStatusChange(jobId: number, status: JobStatus) {
    const updated = await api.jobs.updateStatus(jobId, status);
    setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
    if (selectedJob?.id === jobId) setSelectedJob(updated);
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === displayedJobs.length ? new Set() : new Set(displayedJobs.map((j) => j.id))
    );
  }

  async function bulkUpdateStatus(status: JobStatus) {
    await Promise.all(
      [...selected].map((id) => api.jobs.updateStatus(id, status))
    );
    setJobs((prev) =>
      prev.map((j) => (selected.has(j.id) ? { ...j, status } : j))
    );
    setSelected(new Set());
  }

  function openJob(job: Job) {
    setSelectedJob(job);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
          <h1 className="text-sm font-semibold text-foreground">Discover</h1>
          <span className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${displayedJobs.length}${displayedJobs.length !== jobs.length ? ` of ${jobs.length}` : ""} jobs`}
          </span>
        </header>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2.5 md:px-6">
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search jobs or companies…"
              className="h-8 pl-8 text-sm"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => handleSearchChange("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={handleStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={handleSourceFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => setKnownOnly((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              knownOnly
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
            title="Show only well-known companies (S&P 500, Fortune 1000, major tech & defense)"
          >
            <Building2 className="h-3.5 w-3.5" />
            Known Co.
          </button>

          <button
            onClick={() => setTargetsOnly((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              targetsOnly
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
            title="Show only your targeted companies"
          >
            <Building2 className="h-3.5 w-3.5" />
            Targets
            {targetedCompanies.length > 0 && (
              <span className={`ml-0.5 ${targetsOnly ? "text-primary/70" : "text-muted-foreground"}`}>
                {targetedCompanies.length}
              </span>
            )}
          </button>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selected.size} selected
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted">
                  Set status
                  <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                    <DropdownMenuItem
                      key={o.value}
                      className="text-xs"
                      onClick={() => bulkUpdateStatus(o.value as JobStatus)}
                    >
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 pl-6">
                  <Checkbox
                    checked={selected.size === displayedJobs.length && displayedJobs.length > 0}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="text-xs">Title</TableHead>
                <TableHead className="hidden text-xs sm:table-cell">Company</TableHead>
                <TableHead className="hidden text-xs lg:table-cell">Location</TableHead>
                <TableHead className="hidden text-xs lg:table-cell">Salary</TableHead>
                <TableHead className="hidden text-xs sm:table-cell">Source</TableHead>
                <TableHead className="hidden text-xs md:table-cell">Posted</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell className="pl-6">
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="h-4 w-14" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : displayedJobs.length === 0
                ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-16 text-center text-sm text-muted-foreground"
                      >
                        No jobs found. Adjust filters or trigger a fetch.
                      </TableCell>
                    </TableRow>
                  )
                : displayedJobs.map((job) => (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer border-border hover:bg-accent/40"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-no-row-click]")) return;
                        openJob(job);
                      }}
                    >
                      <TableCell
                        className="pl-6"
                        data-no-row-click
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(job.id);
                        }}
                      >
                        <Checkbox
                          checked={selected.has(job.id)}
                          onCheckedChange={() => toggleSelect(job.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        <span className="line-clamp-1 max-w-[200px]">{job.title}</span>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        {job.company?.name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {job.is_remote ? "Remote" : job.location ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {formatSalary(job) ?? "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <SourceBadge source={job.source} />
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {formatDate(job.date_posted)}
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
                            {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                              <DropdownMenuItem
                                key={o.value}
                                className="text-xs"
                                onClick={() => handleStatusChange(job.id, o.value as JobStatus)}
                              >
                                {o.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
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
