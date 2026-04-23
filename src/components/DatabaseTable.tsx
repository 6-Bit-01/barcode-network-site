"use client";

import { useState, useMemo } from "react";
import { StatusBadge, SectionDot } from "@/components/LiveEffects";
import { getEntryImage } from "@/lib/placeholder";
import Image from "next/image";
import Link from "next/link";

type Entry = {
  id: string;
  name: string;
  image: string;
  category: "Entity" | "Personnel" | "Sponsor" | "Interface" | "Production";
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PENDING" | "UNKNOWN";
  clearance: "PUBLIC" | "INTERNAL" | "RESTRICTED";
  role: string;
  origin: "KNOWN" | "UNKNOWN" | "UNVERIFIED" | "WITHHELD";
  summary: string;
  tags: string[];
  notes: string;
};

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const statusColors: Record<string, string> = {
  ACTIVE: "border-accent/30 text-accent",
  PENDING: "border-yellow-500/30 text-yellow-500",
  INACTIVE: "border-muted/30 text-muted",
  ARCHIVED: "border-blue-400/30 text-blue-400",
  UNKNOWN: "border-red-400/30 text-red-400",
};

const clearanceColors: Record<string, string> = {
  PUBLIC: "text-accent/60",
  INTERNAL: "text-yellow-500/60",
  RESTRICTED: "text-red-400/60",
};

const categoryOrder = ["Personnel", "Production", "Entity", "Interface", "Sponsor"] as const;

const categoryLabels: Record<string, string> = {
  Personnel: "// PERSONNEL",
  Production: "// PRODUCTIONS",
  Entity: "// ENTITIES",
  Interface: "// INTERFACES",
  Sponsor: "// SPONSORS",
};

export function DatabaseTable({ entries }: { entries: Entry[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const categories = useMemo(
    () => ["ALL", ...Array.from(new Set(entries.map((e) => e.category)))],
    [entries]
  );

  const statuses = useMemo(
    () => ["ALL", ...Array.from(new Set(entries.map((e) => e.status)))],
    [entries]
  );

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const q = search.toLowerCase();
      const matchesSearch =
        search === "" ||
        entry.name.toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.role.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.toLowerCase().includes(q));

      const matchesCategory =
        categoryFilter === "ALL" || entry.category === categoryFilter;

      const matchesStatus =
        statusFilter === "ALL" || entry.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [entries, search, categoryFilter, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    for (const entry of filtered) {
      if (!groups[entry.category]) groups[entry.category] = [];
      groups[entry.category].push(entry);
    }
    return groups;
  }, [filtered]);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        {/* Search */}
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/40 text-xs">
            &gt;
          </span>
          <input
            type="text"
            placeholder="SEARCH DOSSIERS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border text-sm text-foreground/80 placeholder:text-muted/30 px-6 py-2.5 focus:outline-none focus:border-accent/50 transition-colors font-mono uppercase tracking-wider"
          />
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-surface border border-border text-xs text-muted uppercase tracking-wider px-4 py-2.5 focus:outline-none focus:border-accent/50 transition-colors appearance-none cursor-pointer"
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat === "ALL" ? "All Categories" : cat}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface border border-border text-xs text-muted uppercase tracking-wider px-4 py-2.5 focus:outline-none focus:border-accent/50 transition-colors appearance-none cursor-pointer"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "All Statuses" : s}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <SectionDot />
          <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
            Network Dossiers
          </h2>
        </div>
        <span className="text-xs text-muted/50 font-mono">
          {filtered.length} / {entries.length} RECORDS
        </span>
      </div>

      {/* Grouped by Category */}
      {filtered.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted/50 font-mono border border-border">
          NO MATCHING RECORDS FOUND
        </div>
      ) : (
        <div className="space-y-8">
          {categoryOrder
            .filter((cat) => grouped[cat] && grouped[cat].length > 0)
            .map((cat) => (
              <div key={cat}>
                {/* Category Header */}
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-accent/20">
                  <span className="text-accent text-xs font-mono tracking-[0.4em] uppercase">
                    {categoryLabels[cat] || cat}
                  </span>
                  <span className="text-muted/30 text-xs font-mono">
                    [{grouped[cat].length}]
                  </span>
                </div>

                {/* Entries in this category */}
                <div className="space-y-0">
                  {grouped[cat].map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/database/${slugify(entry.name)}`}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-4 py-3 border-b border-border/30 hover:bg-surface-light transition-colors group cursor-pointer"
                    >
                      {/* Thumbnail */}
                      <div className="hidden sm:block w-10 h-10 shrink-0 relative border border-accent/20 bg-surface overflow-hidden crt-mini">
                        <Image
                          src={getEntryImage(entry)}
                          alt={entry.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                          unoptimized
                        />
                      </div>

                      {/* ID */}
                      <span className="text-xs text-muted/60 font-mono w-16 shrink-0">
                        {entry.id}
                      </span>

                      {/* Name + Role */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground font-bold group-hover:text-accent transition-colors">
                          {entry.name}
                        </span>
                        <span className="text-muted/30 mx-2 hidden sm:inline">—</span>
                        <span className="block sm:inline text-xs text-muted/60">
                          {entry.role}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="shrink-0">
                        {entry.status === "ACTIVE" ? (
                          <StatusBadge status={entry.status} />
                        ) : (
                          <span className={`text-xs uppercase tracking-widest px-1.5 py-0.5 border ${statusColors[entry.status] || "border-muted/30 text-muted"}`}>
                            {entry.status}
                          </span>
                        )}
                      </div>

                      {/* Clearance */}
                      <span className={`text-xs uppercase tracking-wider shrink-0 ${clearanceColors[entry.clearance] || "text-muted/60"}`}>
                        {entry.clearance}
                      </span>

                      {/* Tags (desktop only) */}
                      <div className="hidden lg:flex flex-wrap gap-1 shrink-0 max-w-48">
                        {entry.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs text-muted/50 border border-border/50 px-1.5 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}