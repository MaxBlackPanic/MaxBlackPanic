"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatUSD, projectVolume, type Tier } from "@/lib/pricing";
import type { ModelRow } from "./ModelTable";

interface Props {
  rows: ModelRow[];
  callsPerDay: number;
  onCallsChange: (n: number) => void;
  tier: Tier;
}

export function VolumeCalculator({ rows, callsPerDay, onCallsChange, tier }: Props) {
  const cheapest = [...rows].sort((a, b) => a.totalCost - b.totalCost)[0];
  const mostExpensive = [...rows].sort((a, b) => b.totalCost - a.totalCost)[0];

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="cpd" className="text-xs uppercase tracking-wide text-muted-foreground">
              Calls per day
            </Label>
            <Input
              id="cpd"
              type="number"
              min={1}
              value={callsPerDay}
              onChange={(e) => onCallsChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="mt-1 w-32"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Tier: <span className="font-medium text-foreground">{tier}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ProjectionRow
            label="Cheapest selected"
            modelLabel={cheapest?.model.label}
            cost={cheapest?.totalCost ?? 0}
            cpd={callsPerDay}
            tone="success"
          />
          <ProjectionRow
            label="Most expensive selected"
            modelLabel={mostExpensive?.model.label}
            cost={mostExpensive?.totalCost ?? 0}
            cpd={callsPerDay}
            tone="warn"
          />
          <ProjectionRow
            label="Spread"
            modelLabel="Annual savings if you route to cheapest"
            cost={(mostExpensive?.totalCost ?? 0) - (cheapest?.totalCost ?? 0)}
            cpd={callsPerDay}
            tone="info"
            showOnlyAnnual
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectionRow({
  label,
  modelLabel,
  cost,
  cpd,
  tone,
  showOnlyAnnual,
}: {
  label: string;
  modelLabel?: string;
  cost: number;
  cpd: number;
  tone: "success" | "warn" | "info";
  showOnlyAnnual?: boolean;
}) {
  const v = projectVolume(cost, cpd);
  const toneClass =
    tone === "success" ? "text-emerald-500" : tone === "warn" ? "text-warn" : "text-blue-400";
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`text-xs font-medium ${toneClass}`}>{modelLabel ?? "—"}</span>
      </div>
      {!showOnlyAnnual && (
        <>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">/ day</span>
            <span className="font-semibold tabular-nums">{formatUSD(v.perDay)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">/ month</span>
            <span className="font-semibold tabular-nums">{formatUSD(v.perMonth)}</span>
          </div>
        </>
      )}
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">/ year</span>
        <span className="text-lg font-bold tabular-nums">{formatUSD(v.perYear)}</span>
      </div>
    </div>
  );
}
