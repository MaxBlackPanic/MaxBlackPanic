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

export function CostChart({ rows }: Props) {
  const data = rows.map((r) => ({
    name: r.model.label,
    input: Number(r.inputCost.toFixed(6)),
    output: Number(r.outputCost.toFixed(6)),
  }));

  return (
    <div className="h-72 w-full">
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
            formatter={(v: number) => formatUSD(v)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="input" stackId="cost" fill="hsl(24 95% 53%)" name="Input" />
          <Bar dataKey="output" stackId="cost" fill="hsl(0 73% 51%)" name="Output" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
