"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Mail, Plus, RefreshCw, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { SearchProfile } from "@/lib/types";

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      api.searches.list().then(setProfiles),
      api.health()
        .then(() => setApiHealthy(true))
        .catch(() => setApiHealthy(false)),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex h-14 items-center border-b border-border px-4 md:px-6">
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
      </header>

      <div className="w-full max-w-2xl space-y-8 p-4 md:p-6">
        {/* API Status */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            API Status
          </h2>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              {apiHealthy === null ? (
                <Skeleton className="h-4 w-40" />
              ) : apiHealthy ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-foreground">
                    Backend connected at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
                    </code>
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-foreground">
                    Backend not reachable. Is{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      uvicorn app.main:app --reload
                    </code>{" "}
                    running?
                  </span>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Search Profiles */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Search Profiles
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled
            >
              <Plus className="h-3.5 w-3.5" />
              New Profile
            </Button>
          </div>
          <div className="space-y-2">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))
              : profiles.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          "{p.search_term}" · {p.location} ·{" "}
                          {p.results_wanted} results ·{" "}
                          {p.hours_old}h window
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {p.sources.split(",").map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className="text-xs capitalize text-muted-foreground"
                          >
                            {s.trim()}
                          </Badge>
                        ))}
                        <Badge
                          variant={p.active ? "outline" : "secondary"}
                          className={
                            p.active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                              : "text-xs"
                          }
                        >
                          {p.active ? "Active" : "Paused"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>
        </section>

        <Separator />

        {/* Email Integration */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Email Integration
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Gmail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Connect Gmail to automatically detect status changes from
                application emails — interview invites, rejections, offers.
              </p>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                Connect Gmail — Coming Soon
              </Button>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Scheduler */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scheduler
          </h2>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-foreground">
                  Automatic daily fetch
                </p>
                <p className="text-xs text-muted-foreground">
                  Scheduled auto-fetch is coming in a future release. Use the
                  "Fetch Jobs" button on the Dashboard in the meantime.
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
                Coming Soon
              </Badge>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
