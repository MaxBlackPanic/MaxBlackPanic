// TokenBurn 2.0 — token counting.
//
// Counting strategy by provider:
//   - OpenAI:            js-tiktoken o200k_base, exact, instant, no network.
//   - Anthropic / Gemini: call the serverless proxy (/api/count) when a key is
//                         configured server-side (exact). On failure or no key,
//                         fall back to a clearly-labelled offline estimate.
//
// Every count carries an `exact` flag and (for estimates) a ± range so the UI
// can be honest about which numbers can be trusted.

import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { Model } from "./pricing";

export type TokenCount = {
  tokens: number;
  exact: boolean;
  /** Lower / upper bounds for estimates. Equal to `tokens` when exact. */
  low: number;
  high: number;
  /** Short human label, e.g. "exact (tiktoken)" or "≈ estimate". */
  source: string;
};

// Chat overhead per message turn (role markers, framing). Added to the input
// total for chat-shaped prompts.
export const MESSAGE_OVERHEAD_PER_TURN = 4;

let _enc: Tiktoken | null = null;
function o200k(): Tiktoken {
  if (!_enc) _enc = getEncoding("o200k_base");
  return _enc;
}

/** Exact OpenAI count via tiktoken. */
export function countOpenAI(text: string): TokenCount {
  const tokens = text ? o200k().encode(text).length : 0;
  return { tokens, exact: true, low: tokens, high: tokens, source: "exact (tiktoken o200k)" };
}

/**
 * Heuristic for whether text is "hard" to estimate (code, non-Latin scripts),
 * which widens the estimate band. Latin prose is ~4 chars/token; code and CJK
 * deviate more.
 */
function estimationSpread(text: string): { ratio: number; spread: number } {
  const nonLatin = (text.match(/[^\x00-\x7F]/g) ?? []).length;
  const codey = (text.match(/[{}()<>;=\[\]/\\|`#]/g) ?? []).length;
  const len = Math.max(text.length, 1);
  const nonLatinFrac = nonLatin / len;
  const codeyFrac = codey / len;
  // Default Latin prose ~4 chars/token. Non-Latin text packs fewer chars per
  // token; widen the band when the text looks like code or non-Latin script.
  const ratio = nonLatinFrac > 0.2 ? 2.5 : 4;
  const spread = nonLatinFrac > 0.2 || codeyFrac > 0.05 ? 0.35 : 0.15;
  return { ratio, spread };
}

/** Offline char-ratio estimate for Anthropic / Gemini when no proxy is available. */
export function estimateOffline(text: string): TokenCount {
  if (!text) return { tokens: 0, exact: false, low: 0, high: 0, source: "≈ estimate (offline)" };
  const { ratio, spread } = estimationSpread(text);
  const tokens = Math.ceil(text.length / ratio);
  const low = Math.ceil(tokens * (1 - spread));
  const high = Math.ceil(tokens * (1 + spread));
  return { tokens, exact: false, low, high, source: "≈ estimate (offline)" };
}

type ProxyResponse = { tokens: number; exact: boolean };

/**
 * Count tokens for any model. OpenAI is always local & exact. Anthropic/Gemini
 * try the proxy first, then fall back to the offline estimate.
 */
export async function countTokens(text: string, model: Model): Promise<TokenCount> {
  if (model.tokeniser === "tiktoken-o200k") {
    return countOpenAI(text);
  }

  if (!text) return estimateOffline(text);

  try {
    const res = await fetch("/api/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: model.provider, model: model.id, text }),
    });
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    const data = (await res.json()) as ProxyResponse;
    if (typeof data.tokens !== "number") throw new Error("bad proxy response");
    if (data.exact) {
      return {
        tokens: data.tokens,
        exact: true,
        low: data.tokens,
        high: data.tokens,
        source: "exact (vendor endpoint)",
      };
    }
    // Proxy answered but couldn't be exact (e.g. no key) — treat as estimate.
    return estimateOffline(text);
  } catch {
    return estimateOffline(text);
  }
}

/** Chat overhead for a prompt split into N message turns. */
export function messageOverhead(turns: number): number {
  return Math.max(turns, 0) * MESSAGE_OVERHEAD_PER_TURN;
}
