"use client";

import { useMemo, useState } from "react";
import { Calculator, Download } from "lucide-react";
import { Header } from "@/components/Header";
import { PricingFreshnessBanner } from "@/components/PricingFreshnessBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ModelTable, type ModelRow } from "@/components/ModelTable";
import { CostChart } from "@/components/CostChart";

import { MODELS, DEFAULT_COMPARE_IDS, type ModelInfo } from "@/lib/models";
import { computeCost, formatUSD, projectVolume, type Tier } from "@/lib/pricing";
import { rowsToCSV, rowsToJSON, downloadString, timestampedFilename } from "@/lib/exporter";

/**
 * "What-if" sandbox. Pure numbers: input tokens, output tokens, calls per
 * day, cache fraction, tier — no prompt required. Designed for finance
 * teams sketching budgets before any prompt exists.
 */

type Scenario = "single" | "cache-comparison" | "tier-comparison";

export default function ForecastPage() {
  const [inputTokens, setInputTokens] = useState(2000);
  const [outputTokens, setOutputTokens] = useState(800);
  const [callsPerDay, setCallsPerDay] = useState(10_000);
  const [tier, setTier] = useState<Tier>("standard");
  const [cachedFrac, setCachedFrac] = useState(0);
  const [reasoning, setReasoning] = useState(0);
  const [includeReasoningModels, setIncludeReasoningModels] = useState(true);
  const [scenario, setScenario] = useState<Scenario>("single");

  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_COMPARE_IDS);

  const selectedModels = useMemo(
    () => MODELS.filter((m) => selectedIds.includes(m.id)),
    [selectedIds],
  );

  function buildRow(m: ModelInfo, t: Tier, frac: number): ModelRow {
    const cachedTokens = t === "cached" ? Math.round(inputTokens * frac) : 0;
    const effectiveTier: "standard" | "batch" = t === "cached" ? "standard" : t;
    const cost = computeCost(
      m,
      {
        inputTokens,
        outputTokens,
        reasoningTokens: includeReasoningModels && m.supportsReasoning ? reasoning : 0,
        cachedInputTokens: cachedTokens,
      },
      effectiveTier,
    );
    const outputBucket = cost.outputCost + cost.reasoningCost;
    return {
      model: m,
      inputTokens,
      outputLow: outputTokens,
      outputExpected: outputTokens,
      outputHigh: outputTokens,
      inputCost:
        cost.inputCost + cost.cachedInputCost + cost.cacheWriteCost + cost.longContextSurchargeCost,
      outputCost: outputBucket,
      totalCost: cost.total,
      totalCostLow: cost.total,
      totalCostHigh: cost.total,
      contextUtilisation: inputTokens / m.contextWindow,
      tokenConfidence: "exact" as const,
      tokenUncertaintyFraction: 0,
      costBuckets: {
        billedInput: cost.inputCost,
        cachedInput: cost.cachedInputCost,
        cacheWrite: cost.cacheWriteCost,
        longContextSurcharge: cost.longContextSurchargeCost,
        visibleOutput: cost.outputCost,
        reasoning: cost.reasoningCost,
      },
      outputShare: cost.total > 0 ? outputBucket / cost.total : 0,
    };
  }

  const rows = useMemo(
    () => selectedModels.map((m) => buildRow(m, tier, cachedFrac)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedModels, tier, cachedFrac, inputTokens, outputTokens, reasoning, includeReasoningModels],
  );

  const cacheComparisonRows = useMemo(
    () => (scenario === "cache-comparison" ? selectedModels.map((m) => buildRow(m, "cached", cachedFrac)) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario, selectedModels, cachedFrac, inputTokens, outputTokens, reasoning, includeReasoningModels],
  );

  const batchComparisonRows = useMemo(
    () => (scenario === "tier-comparison" ? selectedModels.map((m) => buildRow(m, "batch", cachedFrac)) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario, selectedModels, cachedFrac, inputTokens, outputTokens, reasoning, includeReasoningModels],
  );

  const cheapest = useMemo(() => [...rows].sort((a, b) => a.totalCost - b.totalCost)[0], [rows]);
  const mostExpensive = useMemo(() => [...rows].sort((a, b) => b.totalCost - a.totalCost)[0], [rows]);

  const cheapestProjection = useMemo(
    () => (cheapest ? projectVolume(cheapest.totalCost, callsPerDay) : null),
    [cheapest, callsPerDay],
  );
  const expensiveProjection = useMemo(
    () => (mostExpensive ? projectVolume(mostExpensive.totalCost, callsPerDay) : null),
    [mostExpensive, callsPerDay],
  );

  function exportCSV() {
    const rowsB =
      scenario === "cache-comparison"
        ? cacheComparisonRows
        : scenario === "tier-comparison"
          ? batchComparisonRows
          : undefined;
    const csv = rowsToCSV(rows, { tier, callsPerDay, includeVolume: true, rowsB });
    downloadString(csv, timestampedFilename("tokenburn-forecast", "csv"), "text/csv");
  }
  function exportJSON() {
    const rowsB =
      scenario === "cache-comparison"
        ? cacheComparisonRows
        : scenario === "tier-comparison"
          ? batchComparisonRows
          : undefined;
    const json = rowsToJSON(rows, { tier, callsPerDay, includeVolume: true, rowsB });
    downloadString(json, timestampedFilename("tokenburn-forecast", "json"), "application/json");
  }

  return (
    <div className="min-h-screen">
      <Header />
      <PricingFreshnessBanner />
      <main className="container mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Cost forecast
              <Badge variant="outline" className="text-[10px]">
                no prompt required
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Sketch a monthly / annual budget directly from token counts. All math runs in your
              browser and reuses the same pricing catalog as the main analyser.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
              <NumberField
                label="Input tokens / call"
                value={inputTokens}
                onChange={setInputTokens}
                step={100}
                min={0}
              />
              <NumberField
                label="Output tokens / call"
                value={outputTokens}
                onChange={setOutputTokens}
                step={100}
                min={0}
              />
              <NumberField
                label="Calls / day"
                value={callsPerDay}
                onChange={setCallsPerDay}
                step={100}
                min={0}
              />
              <NumberField
                label="Reasoning tokens"
                value={reasoning}
                onChange={setReasoning}
                step={512}
                min={0}
              />
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Tier
                </Label>
                <div className="mt-1 inline-flex gap-1 rounded-md bg-muted p-1">
                  {(["standard", "batch", "cached"] as Tier[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTier(t)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        tier === t
                          ? "bg-background text-foreground shadow"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {tier === "cached" && (
              <div className="flex items-center gap-3">
                <Label className="text-xs">Cache hit fraction</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cachedFrac}
                  onChange={(e) =>
                    setCachedFrac(
                      Math.min(1, Math.max(0, parseFloat(e.target.value || "0"))),
                    )
                  }
                  className="h-8 w-24 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">
                  0–1. Higher = more cache hits, lower bill.
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Label className="text-xs">Include reasoning surcharge</Label>
                <Switch
                  checked={includeReasoningModels}
                  onCheckedChange={setIncludeReasoningModels}
                />
                <Label className="text-xs text-muted-foreground">Scenario</Label>
                <div className="inline-flex gap-1 rounded-md bg-muted p-1">
                  {(["single", "cache-comparison", "tier-comparison"] as Scenario[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setScenario(s)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        scenario === s
                          ? "bg-background text-foreground shadow"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "single"
                        ? "Single"
                        : s === "cache-comparison"
                          ? "vs cached"
                          : "vs batch"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportJSON} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> JSON
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projection summary */}
        <div className="grid gap-3 md:grid-cols-3">
          <ProjectionCard
            tone="success"
            label="Cheapest selected"
            modelLabel={cheapest?.model.label}
            projection={cheapestProjection}
          />
          <ProjectionCard
            tone="warn"
            label="Most expensive selected"
            modelLabel={mostExpensive?.model.label}
            projection={expensiveProjection}
          />
          <Card>
            <CardContent className="space-y-1 py-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Annual savings if you route to cheapest
              </div>
              <div className="text-3xl font-bold tabular-nums text-blue-400">
                {cheapestProjection && expensiveProjection
                  ? formatUSD(expensiveProjection.perYear - cheapestProjection.perYear)
                  : "—"}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Versus running on the most expensive selected model at this volume.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Per-model cost ({tier})</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelTable
              rows={rows}
              rowsB={
                scenario === "cache-comparison"
                  ? cacheComparisonRows
                  : scenario === "tier-comparison"
                    ? batchComparisonRows
                    : undefined
              }
              tier={tier}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Input vs output cost per model</CardTitle>
          </CardHeader>
          <CardContent>
            <CostChart rows={rows} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Model selection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {MODELS.map((m) => {
                const on = selectedIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() =>
                      setSelectedIds((s) =>
                        s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id],
                      )
                    }
                    className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                      on
                        ? "border-primary/40 bg-primary/15 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || "0", 10)))}
        className="mt-1 h-9 text-sm"
      />
    </div>
  );
}

function ProjectionCard({
  label,
  modelLabel,
  projection,
  tone,
}: {
  label: string;
  modelLabel?: string;
  projection: { perCall: number; perDay: number; perMonth: number; perYear: number } | null;
  tone: "success" | "warn";
}) {
  const toneClass = tone === "success" ? "text-emerald-500" : "text-warn";
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className={`text-xs font-medium ${toneClass}`}>{modelLabel ?? "—"}</span>
        </div>
        {projection ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">/ call</span>
              <span className="tabular-nums">{formatUSD(projection.perCall)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">/ day</span>
              <span className="tabular-nums">{formatUSD(projection.perDay)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">/ month</span>
              <span className="font-semibold tabular-nums">{formatUSD(projection.perMonth)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">/ year</span>
              <span className="text-xl font-bold tabular-nums">
                {formatUSD(projection.perYear)}
              </span>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Select a model to see projections.</div>
        )}
      </CardContent>
    </Card>
  );
}
