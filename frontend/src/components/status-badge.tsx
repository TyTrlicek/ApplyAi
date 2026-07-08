import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; className: string }
> = {
  need_to_apply: {
    label: "Need to Apply",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20",
  },
  applied: {
    label: "Applied",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20",
  },
  chose_not_to_apply: {
    label: "Chose Not to Apply",
    className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20",
  },
  interviewing: {
    label: "Interviewing",
    className: "bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20",
  },
  rejected_pre: {
    label: "Rejected (Pre-Interview)",
    className: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
  },
  rejected_post: {
    label: "Rejected (Post-Interview)",
    className: "bg-red-600/10 text-red-500 border-red-600/20 hover:bg-red-600/20",
  },
  stale_pre: {
    label: "Stale (Pre-Interview)",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20",
  },
  stale_post: {
    label: "Stale (Post-Interview)",
    className: "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20",
  },
  ghosted: {
    label: "Ghosted",
    className: "bg-zinc-600/10 text-zinc-500 border-zinc-600/20 hover:bg-zinc-600/20",
  },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

export { STATUS_CONFIG };
