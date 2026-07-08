import { Badge } from "@/components/ui/badge";

const SOURCE_CONFIG: Record<string, { label: string; className: string }> = {
  indeed: {
    label: "Indeed",
    className: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  linkedin: {
    label: "LinkedIn",
    className: "bg-blue-600/10 text-blue-400 border-blue-600/20",
  },
  google: {
    label: "Google",
    className: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
};

export function SourceBadge({ source }: { source: string }) {
  const cfg = SOURCE_CONFIG[source.toLowerCase()] ?? {
    label: source,
    className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}
