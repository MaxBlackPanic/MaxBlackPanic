"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUSD } from "@/lib/pricing";
import type { ModelRow } from "./ModelTable";

interface Props {
  rows: ModelRow[];
}

const CATEGORIES = [
  { key: "billedInput", name: "Billed input", color: "hsl(24 95% 53%)" },
  { key: "cachedInput", name: "Cached input", color: "hsl(38 92% 50%)" },
  { key: "cacheWrite", name: "Cache write", color: "hsl(45 100% 70%)" },
  { key: "longContextSurcharge", name: "Long-ctx surcharge", color: "hsl(280 70% 55%)" },
  { key: "visibleOutput", name: "Output", color: "hsl(0 73% 51%)" },
  { key: "reasoning", name: "Reasoning", color: "hsl(330 80% 55%)" },
] as const;

export function CostChart({ rows }: Props) {
  const data = rows.map((r) => {
    const b = r.costBuckets ?? {
      // Back-compat: distribute the rolled-up totals if buckets weren't provided.
      billedInput: r.inputCost,
      cachedInput: 0,
      cacheWrite: 0,
      longContextSurcharge: 0,
      visibleOutput: r.outputCost,
      reasoning: 0,
    };
    return {
      name: r.model.label,
      billedInput: Number(b.billedInput.toFixed(6)),
      cachedInput: Number(b.cachedInput.toFixed(6)),
      cacheWrite: Number(b.cacheWrite.toFixed(6)),
      longContextSurcharge: Number(b.longContextSurcharge.toFixed(6)),
      visibleOutput: Number(b.visibleOutput.toFixed(6)),
      reasoning: Number(b.reasoning.toFixed(6)),
    };
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="name"
            angle={-30}
            textAnchor="end"
            interval={0}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            height={60}
          />
          <YAxis
            tickFormatter={(n) => formatUSD(n)}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--accent) / 0.4)" }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
            formatter={(v: number, name: string) => [formatUSD(v), name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {CATEGORIES.map((c) => (
            <Bar key={c.key} dataKey={c.key} stackId="cost" fill={c.color} name={c.name} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
