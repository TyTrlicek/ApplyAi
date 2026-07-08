"use client";

import Link from "next/link";
import { ExternalLink, FileText, MapPin, Building2, Calendar, DollarSign } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import { SourceBadge } from "@/components/source-badge";
import type { Job, JobStatus } from "@/lib/types";
import { formatSalary, formatDate } from "@/lib/format";

interface JobDetailSheetProps {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (jobId: number, status: JobStatus) => void;
}

export function JobDetailSheet({
  job,
  open,
  onClose,
  onStatusChange,
}: JobDetailSheetProps) {
  if (!job) return null;

  const salary = formatSalary(job);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-[520px] flex-col gap-0 p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold leading-snug text-foreground">
                {job.title}
              </SheetTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {job.company?.name ?? "Unknown Company"}
              </p>
            </div>
            <SourceBadge source={job.source} />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-6">
            {/* Meta row */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {job.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{job.is_remote ? "Remote" : job.location}</span>
                </div>
              )}
              {salary && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5 shrink-0" />
                  <span>{salary}</span>
                </div>
              )}
              {job.company && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{job.company.name}</span>
                </div>
              )}
              {job.date_posted && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>Posted {formatDate(job.date_posted)}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Status + actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={job.status}
                onValueChange={(v) =>
                  onStatusChange(job.id, v as JobStatus)
                }
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="need_to_apply">Need to Apply</SelectItem>
                  <SelectItem value="decided_not">Not Applying</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                </SelectContent>
              </Select>

              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5 text-xs")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Posting
                </a>
              )}
              {job.apply_url && (
                <a
                  href={job.apply_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ size: "sm" }), "h-8 gap-1.5 text-xs")}
                >
                  Apply
                </a>
              )}
            </div>

            <Link
              href={`/prepare/${job.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full gap-1.5 text-xs")}
            >
              <FileText className="h-3.5 w-3.5" />
              Prepare Application
            </Link>

            <Separator />

            {/* Description */}
            {job.description ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Description
                </p>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                  {job.description}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description available.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
