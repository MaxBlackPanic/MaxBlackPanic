"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, AlertTriangle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatTokens, formatUSD, type Tier } from "@/lib/pricing";
import type { ModelInfo, Vendor } from "@/lib/models";

export interface ModelRow {
  model: ModelInfo;
  inputTokens: number;
  outputLow: number;
  outputExpected: number;
  outputHigh: number;
  /** Rolled-up "input column" total (billed input + cached + write + long-context surcharge). */
  inputCost: number;
  /** Rolled-up "output column" total (visible output + reasoning). */
  outputCost: number;
  totalCost: number;
  totalCostLow: number;
  totalCostHigh: number;
  contextUtilisation: number;
  tokenConfidence: "exact" | "high" | "medium" | "low";
  tokenUncertaintyFraction: number;
  /** Cost breakdown buckets for the waterfall chart. */
  costBuckets?: {
    billedInput: number;
    cachedInput: number;
    cacheWrite: number;
    longContextSurcharge: number;
    visibleOutput: number;
    reasoning: number;
  };
  /** Output's share of total cost as a 0–1 fraction. */
  outputShare?: number;
  /** Optional prediction metadata for the UI confidence chip. */
  prediction?: {
    tier: "deterministic" | "structural" | "archetype";
    archetype?: string;
    rationale: string;
  };
}

type SortKey =
  | "totalCost"
  | "inputCost"
  | "outputCost"
  | "outputShare"
  | "contextUtilisation"
  | "vendor"
  | "delta";

const VENDOR_BADGE: Record<Vendor, { label: string; className: string }> = {
  anthropic: { label: "Anthropic", className: "bg-amber-600/15 text-amber-500 border-amber-700/30" },
  openai: { label: "OpenAI", className: "bg-emerald-600/15 text-emerald-500 border-emerald-700/30" },
  google: { label: "Google", className: "bg-blue-600/15 text-blue-400 border-blue-700/30" },
  deepseek: { label: "DeepSeek", className: "bg-violet-600/15 text-violet-400 border-violet-700/30" },
  xai: { label: "xAI", className: "bg-zinc-600/15 text-zinc-300 border-zinc-600/30" },
  meta: { label: "Meta", className: "bg-sky-600/15 text-sky-400 border-sky-700/30" },
  mistral: { label: "Mistral", className: "bg-rose-600/15 text-rose-400 border-rose-700/30" },
};

interface Props {
  rows: ModelRow[];
  tier: Tier;
  onSelectCheapest?: (modelId: string) => void;
  /** Optional B-side rows for manual A/B compare. */
  rowsB?: ModelRow[];
}

export function ModelTable({ rows, tier, onSelectCheapest, rowsB }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const bById = useMemo(
    () => new Map((rowsB ?? []).map((r) => [r.model.id, r])),
    [rowsB],
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "totalCost":
          av = a.totalCost;
          bv = b.totalCost;
          break;
        case "inputCost":
          av = a.inputCost;
          bv = b.inputCost;
          break;
        case "outputCost":
          av = a.outputCost;
          bv = b.outputCost;
          break;
        case "contextUtilisation":
          av = a.contextUtilisation;
          bv = b.contextUtilisation;
          break;
        case "vendor":
          av = a.model.vendor;
          bv = b.model.vendor;
          break;
        case "outputShare":
          av = a.outputShare ?? 0;
          bv = b.outputShare ?? 0;
          break;
        case "delta": {
          const aB = bById.get(a.model.id);
          const bB = bById.get(b.model.id);
          av = aB ? a.totalCost - aB.totalCost : 0;
          bv = bB ? b.totalCost - bB.totalCost : 0;
          break;
        }
      }
      const dir = sortDir === "asc" ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir, bById]);

  const cheapestId = sorted[0]?.model.id;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const headerBtn = (label: string, key: SortKey) => (
    <button
      onClick={() => toggleSort(key)}
      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60" />
    </button>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="scrollbar-thin overflow-x-auto rounded-md border" role="region" aria-label="Model cost comparison">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{headerBtn("Model", "vendor")}</th>
              <th className="px-3 py-2 text-right">Input</th>
              <th className="px-3 py-2 text-right">Output (exp)</th>
              <th className="px-3 py-2 text-right">{headerBtn("Input cost", "inputCost")}</th>
              <th className="px-3 py-2 text-right">{headerBtn("Output cost", "outputCost")}</th>
              <th className="px-3 py-2 text-right">{headerBtn("Out %", "outputShare")}</th>
              <th className="px-3 py-2 text-right">
                {rowsB ? headerBtn("A total", "totalCost") : headerBtn("Total / call", "totalCost")}
              </th>
              {rowsB && (
                <>
                  <th className="px-3 py-2 text-right">B total</th>
                  <th className="px-3 py-2 text-right">{headerBtn("Δ (A − B)", "delta")}</th>
                </>
              )}
              <th className="px-3 py-2 text-right">
                {headerBtn("Context", "contextUtilisation")}
              </th>
              <th className="px-3 py-2 text-right">Verified</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const m = row.model;
              const v = VENDOR_BADGE[m.vendor];
              const utilPct = Math.round(row.contextUtilisation * 100);
              const indicatorClass =
                utilPct >= 80
                  ? "bg-destructive"
                  : utilPct >= 60
                    ? "bg-warn"
                    : "bg-emerald-500";
              const isCheapest = m.id === cheapestId;
              return (
                <tr key={m.id} className="border-t hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`${v.className} text-xs`}>
                        {v.label}
                      </Badge>
                      <span className="font-medium">{m.label}</span>
                      {isCheapest && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Cheapest of the selected models</TooltipContent>
                        </Tooltip>
                      )}
                      {row.tokenConfidence !== "exact" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <AlertTriangle className="h-3.5 w-3.5 text-warn" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Token count is an estimate (±
                            {Math.round(row.tokenUncertaintyFraction * 100)}%)
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatTokens(row.inputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    <span className="text-foreground">{formatTokens(row.outputExpected)}</span>
                    <span className="text-xs"> ({formatTokens(row.outputLow)}–{formatTokens(row.outputHigh)})</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUSD(row.inputCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUSD(row.outputCost)}</td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const pct = Math.round((row.outputShare ?? 0) * 100);
                      const tone =
                        pct >= 80 ? "bg-destructive" : pct >= 60 ? "bg-warn" : "bg-emerald-500";
                      return (
                        <div className="flex items-center justify-end gap-2">
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {pct}%
                          </span>
                          <div className="w-12">
                            <Progress value={pct} indicatorClassName={tone} />
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-end leading-tight">
                          <span>{formatUSD(row.totalCost)}</span>
                          <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
                            ({formatUSD(row.totalCostLow)}–{formatUSD(row.totalCostHigh)})
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Low / expected / high — output is range-predicted. Tier: {tier}.
                      </TooltipContent>
                    </Tooltip>
                  </td>
                  {rowsB && (() => {
                    const b = bById.get(m.id);
                    if (!b) {
                      return (
                        <>
                          <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                        </>
                      );
                    }
                    const delta = row.totalCost - b.totalCost;
                    const pct = row.totalCost === 0 ? 0 : (delta / row.totalCost) * 100;
                    const sign = delta > 0 ? "−" : delta < 0 ? "+" : "";
                    const deltaToneClass =
                      delta > 0
                        ? "text-emerald-500"
                        : delta < 0
                          ? "text-destructive"
                          : "text-muted-foreground";
                    return (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {formatUSD(b.totalCost)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${deltaToneClass}`}>
                          {sign}
                          {formatUSD(Math.abs(delta))}
                          <span className="ml-1 text-[10px] opacity-70">({Math.abs(pct).toFixed(1)}%)</span>
                        </td>
                      </>
                    );
                  })()}
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {utilPct}%
                      </span>
                      <div className="w-16">
                        <Progress value={utilPct} indicatorClassName={indicatorClass} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                          {m.lastVerified}
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>
                        Pricing source: {m.sourceUrl}
                      </TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {onSelectCheapest && cheapestId && (
          <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Optimise for cost?</span>
            <Button size="sm" variant="outline" onClick={() => onSelectCheapest(cheapestId)}>
              Select cheapest
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
