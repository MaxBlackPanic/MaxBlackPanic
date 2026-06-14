"use client";

import { useEffect, useState } from "react";
import { Database, Trash2, Upload, Download, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  addSamples,
  buildCalibrationExport,
  buildCalibrationReport,
  clearSamples,
  getAllSamples,
  parseUsagePayload,
  rowToSample,
  type CalibrationReport,
  MIN_SAMPLES_PER_ARCHETYPE,
} from "@/lib/calibration";
import { ARCHETYPE_DEFAULTS, type Archetype } from "@/lib/outputArchetypes";
import { downloadString, timestampedFilename } from "@/lib/exporter";
import { useTokenBurnStore } from "@/lib/store";

const ARCHETYPES: Archetype[] = [
  "classification",
  "extraction",
  "summarisation",
  "qa",
  "open",
  "code",
  "translation",
  "rewriting",
  "agentic",
];

export function SelfCalibration() {
  const { setCorrectionFactors } = useTokenBurnStore();
  const [paste, setPaste] = useState("");
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh() {
    try {
      const samples = await getAllSamples();
      const r = buildCalibrationReport(samples);
      setReport(r);
      setCorrectionFactors(r.factors);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ingest(text: string, source: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const parsed = JSON.parse(text);
      const rows = parseUsagePayload(parsed);
      if (rows.length === 0) throw new Error("No usage rows found in the payload.");
      const samples = rows.map(rowToSample).filter((s) => s !== null);
      if (samples.length === 0) throw new Error("Parsed rows had no input/output tokens.");
      await addSamples(samples as Parameters<typeof addSamples>[0]);
      setStatus(`Ingested ${samples.length} sample${samples.length === 1 ? "" : "s"} from ${source}.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    file.text().then((t) => ingest(t, file.name));
  }

  async function onClear() {
    if (!confirm("Clear all calibration samples? This wipes the IndexedDB store.")) return;
    await clearSamples();
    await refresh();
  }

  function exportReport() {
    if (!report) return;
    downloadString(
      JSON.stringify(buildCalibrationExport(report), null, 2),
      timestampedFilename("aitokenburn-calibration", "json"),
      "application/json",
    );
  }

  const totalSamples = report?.totalSamples ?? 0;
  const confidencePct = Math.round((report?.confidence ?? 0) * 100);
  const indicatorTone =
    confidencePct >= 80 ? "bg-emerald-500" : confidencePct >= 40 ? "bg-warn" : "bg-destructive";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" />
          Self-calibration
          <Badge variant="outline" className="text-[10px]">
            local IndexedDB · {totalSamples} sample{totalSamples === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Paste API response usage objects (OpenAI / Anthropic / Google shapes are auto-detected)
          or upload a batched JSON array. Per-archetype median correction factors are fitted
          locally once you have ≥{MIN_SAMPLES_PER_ARCHETYPE} samples per class.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Confidence meter */}
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Calibration confidence</span>
            <span className="tabular-nums font-medium">{confidencePct}% (target ≥80%)</span>
          </div>
          <Progress value={confidencePct} indicatorClassName={indicatorTone} />
        </div>

        {/* Ingest controls */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Paste a usage object (or an array)
          </Label>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder='{"usage":{"prompt_tokens":150,"completion_tokens":650},"model":"gpt-5-4","prompt":"summarise..."}'
            className="w-full resize-y rounded-md border bg-background p-2 font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || !paste.trim()}
              onClick={() => ingest(paste, "paste box")}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" /> Ingest paste
            </Button>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                onFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
              className="text-xs file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1 file:text-xs file:font-medium hover:file:bg-accent"
            />
            <Button size="sm" variant="outline" onClick={exportReport} disabled={!report} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export calibrated model
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear} className="gap-1.5 text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Clear samples
            </Button>
          </div>
          {status && <p className="text-xs text-emerald-500">{status}</p>}
          {error && (
            <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Per-archetype table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Archetype</th>
                <th className="px-2 py-1 text-right">Samples</th>
                <th className="px-2 py-1 text-right">Baseline ratio</th>
                <th className="px-2 py-1 text-right">Correction</th>
                <th className="px-2 py-1 text-right">Δ vs default</th>
              </tr>
            </thead>
            <tbody>
              {ARCHETYPES.map((a) => {
                const baseline = ARCHETYPE_DEFAULTS[a];
                const count = report?.counts[a] ?? 0;
                const factor = report?.factors[a];
                const delta = report?.deltaPct[a];
                const status =
                  count === 0
                    ? "no data"
                    : count < MIN_SAMPLES_PER_ARCHETYPE
                      ? `need ${MIN_SAMPLES_PER_ARCHETYPE - count} more`
                      : "calibrated";
                return (
                  <tr key={a} className="border-t">
                    <td className="px-2 py-1">{baseline.label}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {count}{" "}
                      <span className="text-[10px] text-muted-foreground">({status})</span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{baseline.ratio}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {factor !== undefined ? `${factor.toFixed(2)}×` : "—"}
                    </td>
                    <td
                      className={`px-2 py-1 text-right tabular-nums ${
                        delta === undefined
                          ? "text-muted-foreground"
                          : Math.abs(delta) > 30
                            ? "text-warn"
                            : "text-emerald-500"
                      }`}
                    >
                      {delta !== undefined ? `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Δ shows by how much actuals deviate from the seeded default ratio. Calibration is
          applied automatically to all subsequent predictions on the main analyser page. A README
          section documents how to wire up the optional local proxy mode for hands-off ingestion.
        </p>
      </CardContent>
    </Card>
  );
}
