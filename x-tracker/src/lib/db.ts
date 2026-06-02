/**
 * SQLite persistence via better-sqlite3. Single file, no external services.
 *
 * The DB connection is cached on `globalThis` so Next.js dev hot-reloads /
 * multiple module evaluations reuse one handle instead of opening the file
 * repeatedly (and re-running migrations).
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Tweet } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "tweets.db");

declare global {
  // eslint-disable-next-line no-var
  var __xtracker_db: Database.Database | undefined;
}

function openDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tweets (
      id         TEXT PRIMARY KEY,
      text       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      url        TEXT NOT NULL,
      is_repost  INTEGER NOT NULL DEFAULT 0,
      is_reply   INTEGER NOT NULL DEFAULT 0,
      is_quote   INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets (created_at);
  `);
  return db;
}

export const db: Database.Database = globalThis.__xtracker_db ?? openDb();
if (process.env.NODE_ENV !== "production") globalThis.__xtracker_db = db;

/** Shape of a row as stored, mapped back to the domain `Tweet`. */
interface Row {
  id: string;
  text: string;
  created_at: string;
  url: string;
  is_repost: number;
  is_reply: number;
  is_quote: number;
}

function rowToTweet(r: Row): Tweet {
  return {
    id: r.id,
    text: r.text,
    createdAt: r.created_at,
    url: r.url,
    isRepost: r.is_repost === 1,
    isReply: r.is_reply === 1,
    isQuote: r.is_quote === 1,
  };
}

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO tweets
    (id, text, created_at, url, is_repost, is_reply, is_quote, fetched_at)
  VALUES
    (@id, @text, @createdAt, @url, @isRepost, @isReply, @isQuote, @fetchedAt)
`);

/**
 * Insert a tweet only if its id is new. Returns true when a row was actually
 * inserted (i.e. the post is genuinely new), false if it already existed.
 */
export function insertIfNew(t: Tweet): boolean {
  const res = insertStmt.run({
    id: t.id,
    text: t.text,
    createdAt: t.createdAt,
    url: t.url,
    isRepost: t.isRepost ? 1 : 0,
    isReply: t.isReply ? 1 : 0,
    isQuote: t.isQuote ? 1 : 0,
    fetchedAt: new Date().toISOString(),
  });
  return res.changes > 0;
}

const recentStmt = db.prepare(`
  SELECT id, text, created_at, url, is_repost, is_reply, is_quote
  FROM tweets
  ORDER BY created_at DESC
  LIMIT ?
`);

/** Most recent posts, newest first. */
export function getRecent(limit: number): Tweet[] {
  return (recentStmt.all(limit) as Row[]).map(rowToTweet);
}

const countSinceStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM tweets WHERE created_at >= ?`,
);

/** Number of posts created at or after the given ISO timestamp. */
export function getCountSince(isoTimestamp: string): number {
  return (countSinceStmt.get(isoTimestamp) as { n: number }).n;
}

/** One bucket per hour. `hourStart` is the ISO timestamp at the top of the hour. */
export interface HourlyCount {
  hourStart: string;
  count: number;
}

/**
 * Counts of posts per hour for the last 24 hours, oldest bucket first.
 * Always returns exactly 24 buckets (zero-filled) so the chart is stable.
 */
export function getHourlyCounts(): HourlyCount[] {
  const now = new Date();
  // Align to the top of the current hour.
  const top = new Date(now);
  top.setMinutes(0, 0, 0);

  const buckets: HourlyCount[] = [];
  const counts = new Map<string, number>();

  for (let i = 23; i >= 0; i--) {
    const d = new Date(top.getTime() - i * 3600_000);
    const key = d.toISOString();
    counts.set(key, 0);
    buckets.push({ hourStart: key, count: 0 });
  }

  const since = new Date(top.getTime() - 23 * 3600_000).toISOString();
  const rows = db
    .prepare(`SELECT created_at FROM tweets WHERE created_at >= ?`)
    .all(since) as { created_at: string }[];

  for (const row of rows) {
    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) continue;
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const b of buckets) b.count = counts.get(b.hourStart) ?? 0;
  return buckets;
}

/** Earliest stored post timestamp (ISO), or null if the DB is empty. */
export function getEarliestCreatedAt(): string | null {
  const r = db.prepare(`SELECT MIN(created_at) AS m FROM tweets`).get() as {
    m: string | null;
  };
  return r.m;
}

/** Total number of stored posts. */
export function getTotalCount(): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM tweets`).get() as { n: number })
    .n;
}
