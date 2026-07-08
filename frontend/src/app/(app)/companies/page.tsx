"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, X, Search, Building2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { MapProfile } from "@/lib/types";
import { COMPANY_LISTS, normalizeName } from "@/lib/company-lists";

export default function CompaniesPage() {
  const [profile, setProfile] = useState<MapProfile | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeList, setActiveList] = useState(COMPANY_LISTS[0].id);
  const [listSearch, setListSearch] = useState("");
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    api.profile.get().then((p) => {
      setProfile(p);
      setTargets(p.targetedCompanies ?? []);
    });
  }, []);

  const currentList = COMPANY_LISTS.find((l) => l.id === activeList)!;

  const filteredCompanies = useMemo(() => {
    const q = normalizeName(listSearch);
    return q
      ? currentList.companies.filter((c) => normalizeName(c).includes(q))
      : currentList.companies;
  }, [currentList, listSearch]);

  const targetSet = useMemo(
    () => new Set(targets.map(normalizeName)),
    [targets]
  );

  function isTargeted(company: string) {
    return targetSet.has(normalizeName(company));
  }

  function toggle(company: string) {
    setTargets((prev) =>
      isTargeted(company)
        ? prev.filter((t) => normalizeName(t) !== normalizeName(company))
        : [...prev, company]
    );
    setSaved(false);
  }

  function addCustom() {
    const name = customInput.trim();
    if (!name || isTargeted(name)) return;
    setTargets((prev) => [...prev, name]);
    setCustomInput("");
    setSaved(false);
  }

  function removeTarget(company: string) {
    setTargets((prev) => prev.filter((t) => t !== company));
    setSaved(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      await api.profile.save({ ...profile, targetedCompanies: targets });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = JSON.stringify(targets) !== JSON.stringify(profile?.targetedCompanies ?? []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
        <h1 className="text-sm font-semibold text-foreground">Target Companies</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {targets.length} targeted
          </span>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={save}
            disabled={!hasChanges || saving}
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: company browser */}
        <div className="flex w-[55%] flex-col border-r border-border">
          {/* List tabs */}
          <div className="flex items-center gap-1 border-b border-border px-4 py-2">
            {COMPANY_LISTS.map((list) => (
              <button
                key={list.id}
                onClick={() => { setActiveList(list.id); setListSearch(""); }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeList === list.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {list.label}
                <span className="ml-1.5 text-muted-foreground">
                  {list.companies.length}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="border-b border-border px-4 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                placeholder={`Search ${currentList.label}…`}
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Company list */}
          <div className="flex-1 overflow-y-auto">
            {profile === null ? (
              <div className="space-y-1 p-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredCompanies.map((company) => {
                  const targeted = isTargeted(company);
                  return (
                    <button
                      key={company}
                      onClick={() => toggle(company)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-accent/40 ${
                        targeted ? "bg-primary/5" : ""
                      }`}
                    >
                      <span className="text-xs text-foreground">{company}</span>
                      {targeted ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      )}
                    </button>
                  );
                })}
                {filteredCompanies.length === 0 && (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    No companies match &ldquo;{listSearch}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: your targets */}
        <div className="flex w-[45%] flex-col">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium text-foreground">Your Targets</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Jobs from these companies are highlighted in Pipeline
            </p>
          </div>

          {/* Add custom */}
          <div className="border-b border-border px-4 py-2">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Building2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-7 pl-7 text-xs"
                  placeholder="Add custom company…"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustom()}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={addCustom}
                disabled={!customInput.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Targets list */}
          <div className="flex-1 overflow-y-auto p-4">
            {targets.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                No targets yet. Add companies from the list on the left.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {targets.map((company) => (
                  <Badge
                    key={company}
                    variant="outline"
                    className="gap-1 border-border pr-1 text-xs text-foreground"
                  >
                    {company}
                    <button
                      onClick={() => removeTarget(company)}
                      className="ml-0.5 rounded hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
