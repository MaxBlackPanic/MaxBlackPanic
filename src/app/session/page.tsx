"use client";

import { useMemo, useState } from "react";
import { Workflow, Plus, X, Download, TrendingDown, AlertTriangle } from "lucide-react";
import { Header } from "@/components/Header";
import { PricingFreshnessBanner } from "@/components/PricingFreshnessBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SessionChart } from "@/components/SessionChart";

import { MODELS } from "@/lib/models";
import { formatTokens, formatUSD } from "@/lib/pricing";
import { PRESETS, simulateSession, type CacheTtl, type SessionTurn } from "@/lib/session";
import { downloadString, timestampedFilename } from "@/lib/exporter";

/**
 * Project / Session simulator.
 * Models the cumulative cost of multi-turn conversations, where every turn
 * re-bills the full accumulated context as input. Compares "no caching"
 * vs "caching (5m / 1h TTL)" side-by-side and shows the break-even turn.
 */
export default function SessionPage() {
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [ttl, setTtl] = useState<CacheTtl>("5m");
  const [turns, setTurns] = useState<SessionTurn[]>(PRESETS[0].build());

  const model = MODELS.find((m) => m.id === modelId)!;

  const result = useMemo(() => simulateSession(turns, { model, ttl }), [turns, model, ttl]);

  function addTurn() {
    setTurns((s) => [
      ...s,
      { id: `t${Date.now()}`, inputAddition: 100, expectedOutput: 400 },
    ]);
  }
  function removeTurn(i: number) {
    setTurns((s) => s.filter((_, idx) => idx !== i));
  }
  function updateTurn(i: number, field: "inputAddition" | "expectedOutput", v: number) {
    setTurns((s) => s.map((t, idx) => (idx === i ? { ...t, [field]: Math.max(0, v) } : t)));
  }
  function loadPreset(presetId: string) {
    const p = PRESETS.find((p) => p.id === presetId);
    if (p) setTurns(p.build());
  }

  function exportJSON() {
    const payload = {
      generatedAt: new Date().toISOString(),
      model: { id: model.id, label: model.label, vendor: model.vendor },
      ttl,
      turns,
      result: {
        totalNoCache: Number(result.totalNoCache.toFixed(6)),
        totalWithCache: Number(result.totalWithCache.toFixed(6)),
        breakEvenTurnIndex: result.breakEvenTurnIndex,
        finalSavings: Number(result.finalSavings.toFixed(6)),
        finalSavingsFraction: Number(result.finalSavingsFraction.toFixed(4)),
        perTurn: result.turns,
      },
    };
    downloadString(
      JSON.stringify(payload, null, 2),
      timestampedFilename("tokenburn-session", "json"),
      "application/json",
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <PricingFreshnessBanner />
      <main className="container mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4" />
              Session simulator
              <Badge variant="outline" className="text-[10px]">
                multi-turn cost
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Each turn re-bills the full accumulated context as input. Coding agents and long
              chats compound fast; prompt caching usually pays for itself by turn 2-3. The dashed
              warn-coloured line marks the break-even turn.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Model
                </Label>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="mt-1 h-9 rounded-md border bg-background px-2 text-sm"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Cache TTL
                </Label>
                <div
                  className="mt-1 inline-flex gap-1 rounded-md bg-muted p-1"
                  role="radiogroup"
                  aria-label="Cache TTL"
                >
                  {(["5m", "1h"] as CacheTtl[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTtl(t)}
                      role="radio"
                      aria-checked={ttl === t}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        ttl === t
                          ? "bg-background text-foreground shadow"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t} ({t === "5m" ? "1.25×" : "2×"} write)
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Presets
                </Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => loadPreset(p.id)}
                      title={p.description}
                      className="rounded-md border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={exportJSON} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> JSON
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="space-y-1 py-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total without caching
              </div>
              <div className="text-2xl font-bold tabular-nums text-destructive">
                {formatUSD(result.totalNoCache)}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {turns.length} turn{turns.length === 1 ? "" : "s"}, final context{" "}
                {formatTokens(result.turns[result.turns.length - 1]?.contextTokens ?? 0)} tokens.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 py-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total with caching ({ttl})
              </div>
              <div className="text-2xl font-bold tabular-nums text-emerald-500">
                {formatUSD(result.totalWithCache)}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Break-even on turn{" "}
                {result.breakEvenTurnIndex >= 0
                  ? result.breakEvenTurnIndex + 1
                  : "(never — too short)"}
                .
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 py-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                {result.finalSavings > 0 ? (
                  <TrendingDown className="h-3 w-3 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-warn" />
                )}
                Savings from caching
              </div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  result.finalSavings > 0 ? "text-emerald-500" : "text-warn"
                }`}
              >
                {result.finalSavings > 0 ? "−" : "+"}
                {formatUSD(Math.abs(result.finalSavings))}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  ({(Math.abs(result.finalSavingsFraction) * 100).toFixed(1)}%)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {result.finalSavings > 0
                  ? "Caching wins at this session length."
                  : "Cache writes outpace hits — too few turns to amortise."}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cumulative cost across turns</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionChart result={result} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Turns ({turns.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={addTurn} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add turn
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-right">Input addition</th>
                    <th className="px-2 py-1 text-right">Expected output</th>
                    <th className="px-2 py-1 text-right">Context</th>
                    <th className="px-2 py-1 text-right">No-cache $</th>
                    <th className="px-2 py-1 text-right">With cache $</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {turns.map((t, i) => {
                    const r = result.turns[i];
                    return (
                      <tr key={t.id} className="border-t hover:bg-accent/30">
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            min={0}
                            value={t.inputAddition}
                            onChange={(e) =>
                              updateTurn(i, "inputAddition", parseInt(e.target.value || "0", 10))
                            }
                            className="ml-auto w-24 rounded border bg-background px-1 py-0.5 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            min={0}
                            value={t.expectedOutput}
                            onChange={(e) =>
                              updateTurn(i, "expectedOutput", parseInt(e.target.value || "0", 10))
                            }
                            className="ml-auto w-24 rounded border bg-background px-1 py-0.5 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                          {formatTokens(r.contextTokens)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {formatUSD(r.noCacheCost)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {formatUSD(r.withCacheCost)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            onClick={() => removeTurn(i)}
                            aria-label={`Remove turn ${i + 1}`}
                            className="rounded text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
