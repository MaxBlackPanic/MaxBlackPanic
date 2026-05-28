/**
 * Self-calibrating feedback loop.
 *
 * Users ingest real-world usage telemetry from their API responses. We:
 *  1. Store the (prompt, predicted_output, actual_output, archetype, vendor)
 *     samples in IndexedDB locally.
 *  2. For each archetype with ≥ MIN_SAMPLES samples, fit a per-archetype
 *     median correction factor = median(actual / predicted).
 *  3. Apply that factor to future predictions via predictOutput's
 *     PredictOptions.correctionFactors.
 *
 * Storage is local-only; nothing leaves the browser. Users can export the
 * calibrated model as JSON for sharing with their finance team.
 */

import { ARCHETYPE_DEFAULTS, classify, type Archetype } from "./outputArchetypes";
import type { Vendor } from "./models";

export interface UsageSample {
  id: string;
  timestamp: string;
  archetype: Archetype;
  vendor: Vendor;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  /** What we PREDICTED (expected). Used to compute the correction ratio. */
  predictedOutputTokens: number;
  /** Optional prompt text (kept locally; never sent anywhere). */
  promptExcerpt?: string;
}

export const MIN_SAMPLES_PER_ARCHETYPE = 5;

/* ============================================================
 * IndexedDB wrapper.
 * ============================================================ */

const DB_NAME = "tokenburn-calibration";
const DB_VERSION = 1;
const STORE = "samples";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("archetype", "archetype", { unique: false });
        store.createIndex("vendor", "vendor", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function addSample(sample: UsageSample): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(sample);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addSamples(samples: UsageSample[]): Promise<number> {
  if (samples.length === 0) return 0;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let added = 0;
    for (const s of samples) {
      store.put(s);
      added++;
    }
    tx.oncomplete = () => resolve(added);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllSamples(): Promise<UsageSample[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as UsageSample[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearSamples(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ============================================================
 * Calibration math.
 * ============================================================ */

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface CalibrationReport {
  /** Per-archetype median correction = actual / predicted. 1.0 = no correction needed. */
  factors: Partial<Record<Archetype, number>>;
  /** Sample counts per archetype. */
  counts: Record<Archetype, number>;
  /** Median delta % (signed) per archetype: positive = we under-predict, negative = we over-predict. */
  deltaPct: Partial<Record<Archetype, number>>;
  /** Confidence 0–1 = min(1, total_samples / 30). Surfaced as a meter in the UI. */
  confidence: number;
  /** Total samples across all archetypes. */
  totalSamples: number;
}

export function buildCalibrationReport(samples: UsageSample[]): CalibrationReport {
  const counts: Record<Archetype, number> = {
    classification: 0,
    extraction: 0,
    summarisation: 0,
    qa: 0,
    open: 0,
    code: 0,
    translation: 0,
    rewriting: 0,
    agentic: 0,
  };
  const ratios: Partial<Record<Archetype, number[]>> = {};
  for (const s of samples) {
    counts[s.archetype]++;
    if (s.predictedOutputTokens > 0) {
      (ratios[s.archetype] ||= []).push(s.outputTokens / s.predictedOutputTokens);
    }
  }

  const factors: CalibrationReport["factors"] = {};
  const deltaPct: CalibrationReport["deltaPct"] = {};
  for (const [a, rs] of Object.entries(ratios) as Array<[Archetype, number[]]>) {
    if (rs.length >= MIN_SAMPLES_PER_ARCHETYPE) {
      const m = median(rs);
      factors[a] = m;
      deltaPct[a] = (m - 1) * 100;
    }
  }

  const totalSamples = samples.length;
  const confidence = Math.min(1, totalSamples / 30);

  return { factors, counts, deltaPct, confidence, totalSamples };
}

/* ============================================================
 * Telemetry ingestion — parse vendor usage payloads.
 * ============================================================ */

export interface IngestRow {
  prompt?: string;
  modelId?: string;
  /** If you already classified the archetype, supply it; otherwise we classify from prompt. */
  archetype?: Archetype;
  /** Vendor name; auto-detected from model id if omitted. */
  vendor?: Vendor;
  inputTokens: number;
  outputTokens: number;
  predictedOutputTokens?: number;
}

/**
 * Parses a flexible payload into IngestRows. Accepts:
 *  - OpenAI: { usage: { prompt_tokens, completion_tokens }, model }
 *  - Anthropic: { usage: { input_tokens, output_tokens }, model }
 *  - Google: { usageMetadata: { promptTokenCount, candidatesTokenCount }, model }
 *  - Native IngestRow shape
 *  - An ARRAY of any of the above
 */
export function parseUsagePayload(input: unknown): IngestRow[] {
  if (Array.isArray(input)) {
    return input.flatMap((x) => parseUsagePayload(x));
  }
  if (!input || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;

  // Native shape.
  if (typeof obj.inputTokens === "number" && typeof obj.outputTokens === "number") {
    return [obj as unknown as IngestRow];
  }

  const modelId = (obj.model as string | undefined) ?? (obj.modelId as string | undefined);
  const prompt = obj.prompt as string | undefined;

  // OpenAI / Anthropic shape: { usage: {...} }
  const usage = obj.usage as Record<string, number> | undefined;
  if (usage) {
    const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
    if (inputTokens > 0 && outputTokens > 0) {
      return [{ modelId, prompt, inputTokens, outputTokens }];
    }
  }

  // Google shape: { usageMetadata: {...} }
  const um = obj.usageMetadata as Record<string, number> | undefined;
  if (um) {
    const inputTokens = um.promptTokenCount ?? 0;
    const outputTokens = um.candidatesTokenCount ?? 0;
    if (inputTokens > 0 && outputTokens > 0) {
      return [{ modelId, prompt, inputTokens, outputTokens }];
    }
  }

  return [];
}

/** Build a sample, classifying the archetype from the prompt if not provided. */
export function rowToSample(row: IngestRow): UsageSample | null {
  if (!row.inputTokens || !row.outputTokens) return null;
  const archetype: Archetype = row.archetype ?? (row.prompt ? classify(row.prompt).archetype : "open");
  const vendor = row.vendor ?? guessVendor(row.modelId);
  if (!vendor) return null;

  // If predicted not provided, compute it from the baseline archetype model.
  const predictedOutputTokens =
    row.predictedOutputTokens ??
    Math.max(
      ARCHETYPE_DEFAULTS[archetype].minExpected,
      Math.min(row.inputTokens * 3, row.inputTokens * ARCHETYPE_DEFAULTS[archetype].ratio),
    );

  return {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    archetype,
    vendor,
    modelId: row.modelId ?? "unknown",
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    predictedOutputTokens,
    promptExcerpt: row.prompt?.slice(0, 200),
  };
}

function guessVendor(modelId?: string): Vendor | null {
  if (!modelId) return "openai";
  const id = modelId.toLowerCase();
  if (id.includes("claude")) return "anthropic";
  if (id.includes("gemini")) return "google";
  if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || id.includes("o4"))
    return "openai";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("grok")) return "xai";
  if (id.includes("llama")) return "meta";
  if (id.includes("mistral")) return "mistral";
  return null;
}

/* ============================================================
 * Export the calibrated model as JSON.
 * ============================================================ */

export interface CalibrationExport {
  exportedAt: string;
  totalSamples: number;
  confidence: number;
  factors: Partial<Record<Archetype, number>>;
  counts: Record<Archetype, number>;
  deltaPct: Partial<Record<Archetype, number>>;
}

export function buildCalibrationExport(report: CalibrationReport): CalibrationExport {
  return {
    exportedAt: new Date().toISOString(),
    totalSamples: report.totalSamples,
    confidence: report.confidence,
    factors: report.factors,
    counts: report.counts,
    deltaPct: report.deltaPct,
  };
}
