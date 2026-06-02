/**
 * Analytics snapshot computed from the SQLite store. The dashboard fetches this
 * on mount and again whenever new posts arrive over SSE, so the numbers and
 * chart stay in sync with the live feed without duplicating aggregation logic
 * in the browser.
 */
import { NextResponse } from "next/server";
import {
  getCountSince,
  getHourlyCounts,
  getEarliestCreatedAt,
  getTotalCount,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AnalyticsPayload {
  postsToday: number;
  postsLastHour: number;
  avgPerDay: number;
  total: number;
  hourly: { hourStart: string; count: number }[];
}

export async function GET(): Promise<NextResponse<AnalyticsPayload>> {
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const oneHourAgo = new Date(now.getTime() - 3600_000);

  const postsToday = getCountSince(startOfToday.toISOString());
  const postsLastHour = getCountSince(oneHourAgo.toISOString());
  const total = getTotalCount();

  // Average posts/day across the observed window (>= 1 day to avoid huge
  // early-on numbers from a tiny window).
  const earliest = getEarliestCreatedAt();
  let avgPerDay = 0;
  if (earliest && total > 0) {
    const spanMs = now.getTime() - new Date(earliest).getTime();
    const spanDays = Math.max(spanMs / 86_400_000, 1);
    avgPerDay = total / spanDays;
  }

  return NextResponse.json({
    postsToday,
    postsLastHour,
    avgPerDay: Math.round(avgPerDay * 10) / 10,
    total,
    hourly: getHourlyCounts(),
  });
}
