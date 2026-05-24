/**
 * CSV export of the model comparison + volume projection.
 *
 * Output is RFC-4180 compliant: cells with commas, quotes, or newlines are
 * quoted, and embedded quotes are doubled. Header row first.
 */

import type { ModelRow } from "@/components/ModelTable";
import type { Tier } from "./pricing";

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

export interface ExportOptions {
  tier: Tier;
  callsPerDay: number;
  includeVolume: boolean;
}

export function rowsToCSV(rows: ModelRow[], opts: ExportOptions): string {
  const header = [
    "model_id",
    "model_label",
    "vendor",
    "input_tokens",
    "output_low",
    "output_expected",
    "output_high",
    "input_cost_usd",
    "output_cost_usd",
    "total_cost_per_call_usd",
    "total_cost_low_usd",
    "total_cost_high_usd",
    "context_utilisation",
    "token_confidence",
    "token_uncertainty_fraction",
    "tier",
    "pricing_last_verified",
    "pricing_source_url",
  ];
  if (opts.includeVolume) {
    header.push(
      "calls_per_day",
      "monthly_cost_usd",
      "annual_cost_usd",
    );
  }

  const lines = [csvRow(header)];
  for (const r of rows) {
    const row: Array<string | number> = [
      r.model.id,
      r.model.label,
      r.model.vendor,
      r.inputTokens,
      r.outputLow,
      r.outputExpected,
      r.outputHigh,
      r.inputCost.toFixed(6),
      r.outputCost.toFixed(6),
      r.totalCost.toFixed(6),
      r.totalCostLow.toFixed(6),
      r.totalCostHigh.toFixed(6),
      r.contextUtilisation.toFixed(4),
      r.tokenConfidence,
      r.tokenUncertaintyFraction.toFixed(4),
      opts.tier,
      r.model.lastVerified,
      r.model.sourceUrl,
    ];
    if (opts.includeVolume) {
      row.push(
        opts.callsPerDay,
        (r.totalCost * opts.callsPerDay * 30).toFixed(2),
        (r.totalCost * opts.callsPerDay * 365).toFixed(2),
      );
    }
    lines.push(csvRow(row));
  }
  return lines.join("\n") + "\n";
}

export function downloadString(content: string, filename: string, mime: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function timestampedFilename(prefix: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}-${stamp}.${ext}`;
}
