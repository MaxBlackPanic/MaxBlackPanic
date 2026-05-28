/**
 * Echo Probe — "spend cents to predict dollars".
 *
 * Opt-in. The user clicks "Probe", we send their prompt to a cheap oracle
 * model (Claude Haiku 4.5 by default; Gemini 3 Flash or GPT-5.4 Nano as
 * alternates) with a system message that FORBIDS answering the prompt and
 * instead asks for a structural outline + a single integer token estimate.
 *
 * Results are cached by SHA-256 fingerprint in localStorage so repeated
 * probes on the same prompt are free.
 *
 * Privacy: never runs without an explicit click. Uses the user's
 * session-scoped API key. Prompt only travels if the user clicks.
 */

import { getModel } from "./models";
import { countTokensForText, type PromptInput } from "./tokenizer";
import { computeCost } from "./pricing";

export type OracleVendor = "anthropic" | "google" | "openai";

export interface ProbeRequest {
  prompt: string;
  /** Oracle model id. Must support the chosen vendor's chat API. */
  oracleModelId: string;
  apiKey: string;
}

export interface ProbeResult {
  estimatedOutputTokens: number;
  confidenceLow: number;
  confidenceHigh: number;
  structuralOutline: string;
  probeInputTokens: number;
  probeOutputTokens: number;
  probeCostUSD: number;
  oracleModelId: string;
  fingerprint: string;
  /** ISO timestamp. */
  timestamp: string;
}

export const DEFAULT_ORACLE_ID = "claude-haiku-4-5";

export const ORACLE_OPTIONS: Array<{ id: string; label: string; vendor: OracleVendor }> = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", vendor: "anthropic" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", vendor: "google" },
  { id: "gpt-5-4-nano", label: "GPT-5.4 Nano", vendor: "openai" },
];

const SYSTEM_PROMPT = `You are a TOKEN ESTIMATION ORACLE. You do NOT answer the user prompt that follows. Your only job is to predict how long a thorough, well-formed answer would be in tokens.

Respond in this exact format (no preamble, no commentary):

ESTIMATE: <integer>
LOW: <integer>
HIGH: <integer>
OUTLINE:
- <one-line section description>
- <one-line section description>
- ...

Keep your total response under 180 tokens. The LOW/HIGH are your confidence band — pick them so the actual answer length falls within them at least 80% of the time.`;

const FENCE_RE = /ESTIMATE:\s*(\d{1,7})\s*[\r\n]+\s*LOW:\s*(\d{1,7})\s*[\r\n]+\s*HIGH:\s*(\d{1,7})\s*[\r\n]+\s*OUTLINE:\s*([\s\S]*?)$/i;

export function parseProbeResponse(text: string): {
  estimate: number;
  low: number;
  high: number;
  outline: string;
} | null {
  const m = text.match(FENCE_RE);
  if (!m) return null;
  const estimate = parseInt(m[1], 10);
  const low = parseInt(m[2], 10);
  const high = parseInt(m[3], 10);
  const outline = m[4].trim();
  if (!Number.isFinite(estimate) || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  return { estimate, low, high, outline };
}

/** SHA-256 fingerprint over (oracleId || \n || prompt). Hex-encoded. */
export async function fingerprintPrompt(oracleId: string, prompt: string): Promise<string> {
  const data = new TextEncoder().encode(`${oracleId}\n${prompt}`);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: trivial FNV-1a for environments without subtle crypto.
  let h = 0x811c9dc5 >>> 0;
  for (const b of data) {
    h ^= b;
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const CACHE_KEY = "tokenburn:echo-probe-cache:v1";

export function getCachedProbe(fingerprint: string): ProbeResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, ProbeResult>;
    return cache[fingerprint] ?? null;
  } catch {
    return null;
  }
}

export function cacheProbe(result: ProbeResult): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as Record<string, ProbeResult>) : {};
    cache[result.fingerprint] = result;
    // Keep at most 100 entries (FIFO eviction).
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      const sorted = Object.entries(cache).sort(
        (a, b) => Date.parse(a[1].timestamp) - Date.parse(b[1].timestamp),
      );
      for (let i = 0; i < keys.length - 100; i++) delete cache[sorted[i][0]];
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or disabled — silently ignore.
  }
}

/* ============================================================
 * Vendor calls.
 * ============================================================ */

async function callAnthropic(req: ProbeRequest, model: ReturnType<typeof getModel>) {
  const body = {
    model: model.id,
    max_tokens: 180,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: req.prompt }],
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = json.content.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("");
  return {
    text,
    inputTokens: json.usage.input_tokens,
    outputTokens: json.usage.output_tokens,
  };
}

async function callGemini(req: ProbeRequest, model: ReturnType<typeof getModel>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${encodeURIComponent(
    req.apiKey,
  )}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    generation_config: { maxOutputTokens: 180, temperature: 0 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
    usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return {
    text,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function callOpenAI(req: ProbeRequest, model: ReturnType<typeof getModel>) {
  const body = {
    model: model.id,
    max_tokens: 180,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: req.prompt },
    ],
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${req.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: json.choices[0]?.message?.content ?? "",
    inputTokens: json.usage.prompt_tokens,
    outputTokens: json.usage.completion_tokens,
  };
}

export async function runProbe(req: ProbeRequest): Promise<ProbeResult> {
  const model = getModel(req.oracleModelId);
  const vendor = model.vendor;
  if (vendor !== "anthropic" && vendor !== "google" && vendor !== "openai") {
    throw new Error(`Echo probe doesn't support vendor ${vendor}`);
  }

  const fingerprint = await fingerprintPrompt(req.oracleModelId, req.prompt);

  // Cache hit.
  const cached = getCachedProbe(fingerprint);
  if (cached) return cached;

  const call =
    vendor === "anthropic" ? callAnthropic : vendor === "google" ? callGemini : callOpenAI;
  const { text, inputTokens, outputTokens } = await call(req, model);

  const parsed = parseProbeResponse(text);
  if (!parsed) {
    throw new Error(`Oracle returned malformed response (no ESTIMATE/LOW/HIGH/OUTLINE): ${text.slice(0, 200)}`);
  }

  // Probe cost = real cost of the probe call itself.
  const cost = computeCost(
    model,
    { inputTokens, outputTokens },
    "standard",
  );

  const result: ProbeResult = {
    estimatedOutputTokens: parsed.estimate,
    confidenceLow: parsed.low,
    confidenceHigh: parsed.high,
    structuralOutline: parsed.outline,
    probeInputTokens: inputTokens,
    probeOutputTokens: outputTokens,
    probeCostUSD: cost.total,
    oracleModelId: req.oracleModelId,
    fingerprint,
    timestamp: new Date().toISOString(),
  };

  cacheProbe(result);
  return result;
}

/* Helper for the UI to estimate probe cost BEFORE the user clicks (using
 * the local tokeniser to predict input + an assumed 180 output cap). */
export function estimateProbeCost(prompt: string, oracleModelId: string): number {
  const model = getModel(oracleModelId);
  // Build a faux PromptInput just for the count.
  const probeInput: PromptInput = { user: SYSTEM_PROMPT + "\n\n" + prompt };
  const tokens = countTokensForText(probeInput.user, model).tokens;
  const cost = computeCost(model, { inputTokens: tokens, outputTokens: 180 }, "standard");
  return cost.total;
}
