"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUSD } from "@/lib/pricing";
import type { SimulationResult } from "@/lib/session";

interface Props {
  result: SimulationResult;
}

export function SessionChart({ result }: Props) {
  const data = result.turns.map((t) => ({
    turn: t.turnIndex + 1,
    noCache: Number(t.cumNoCache.toFixed(6)),
    withCache: Number(t.cumWithCache.toFixed(6)),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="turn"
            label={{
              value: "Turn",
              position: "insideBottom",
              offset: -4,
              fill: "hsl(var(--muted-foreground))",
              fontSize: 11,
            }}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(n) => formatUSD(n)}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--accent-foreground) / 0.4)" }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
            formatter={(v: number) => formatUSD(v)}
            labelFormatter={(t) => `Turn ${t}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {result.breakEvenTurnIndex >= 0 && (
            <ReferenceLine
              x={result.breakEvenTurnIndex + 1}
              stroke="hsl(var(--warn))"
              strokeDasharray="3 3"
              label={{
                value: "break-even",
                position: "top",
                fill: "hsl(var(--warn))",
                fontSize: 10,
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="noCache"
            name="Cumulative cost (no caching)"
            stroke="hsl(0 73% 51%)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="withCache"
            name="Cumulative cost (with caching)"
            stroke="hsl(142 76% 36%)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
