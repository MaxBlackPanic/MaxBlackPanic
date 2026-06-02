"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsPayload } from "@/app/api/analytics/route";
import { absoluteTime, hourLabel } from "@/lib/time";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-gray-600">{hint}</div>}
    </div>
  );
}

interface ChartDatum {
  label: string;
  hourStart: string;
  count: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white">
        {d.count} post{d.count === 1 ? "" : "s"}
      </div>
      <div className="text-gray-500">{absoluteTime(d.hourStart)}</div>
    </div>
  );
}

export function Analytics({ data }: { data: AnalyticsPayload | null }) {
  const chartData: ChartDatum[] = (data?.hourly ?? []).map((h) => ({
    label: hourLabel(h.hourStart),
    hourStart: h.hourStart,
    count: h.count,
  }));

  return (
    <section aria-label="Analytics" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
        Analytics
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today" value={data?.postsToday ?? "—"} hint="posts" />
        <StatCard
          label="Last hour"
          value={data?.postsLastHour ?? "—"}
          hint="posts"
        />
        <StatCard
          label="Avg / day"
          value={data ? data.avgPerDay : "—"}
          hint="observed"
        />
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Posts per hour · last 24h
          </h3>
          <span className="text-[11px] text-gray-600">
            {data ? `${data.total} tracked` : ""}
          </span>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
            >
              <defs>
                <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#1f2937" }}
                interval={3}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "rgba(56,189,248,0.08)" }}
              />
              <Bar
                dataKey="count"
                fill="url(#barFill)"
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
