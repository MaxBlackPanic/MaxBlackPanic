/**
 * Tokenisation engine.
 *
 * Strategy by vendor:
 *  - OpenAI: exact local count via gpt-tokenizer (o200k_base / cl100k_base).
 *  - Anthropic: empirical multiplier on top of cl100k_base; flag Opus 4.7
 *    with its newer tokeniser at a higher multiplier. Optional exact count
 *    via the /v1/messages/count_tokens endpoint when the user opts in.
 *  - Gemini: SentencePiece-aware empirical estimate on top of cl100k_base.
 *    Optional exact count via Google AI Studio countTokens.
 *  - Others: empirical estimate only, flagged ±10% in the UI.
 */

import { encode as encodeO200k } from "gpt-tokenizer/encoding/o200k_base";
import { encode as encodeCl100k } from "gpt-tokenizer/encoding/cl100k_base";
import type { ModelInfo, TokenizerFamily, Vendor } from "./models";

export interface TokenizeResult {
  tokens: number;
  /** "exact" if from a vendor tokeniser or API; "estimate" otherwise. */
  confidence: "exact" | "high" | "medium" | "low";
  /** ± fraction (0.08 = ±8%). 0 for exact. */
  uncertaintyFraction: number;
  method: string;
}

/** Code-block detector: triple backticks or 4+ leading-space indentation. */
function looksLikeCode(text: string): number {
  let codeChars = 0;
  const fence = /```[\s\S]*?```/g;
  for (const m of text.matchAll(fence)) codeChars += m[0].length;
  const inlines = text.match(/`[^`\n]+`/g);
  if (inlines) for (const i of inlines) codeChars += i.length;
  return Math.min(1, codeChars / Math.max(1, text.length));
}

function jsonHeaviness(text: string): number {
  const braces = (text.match(/[{}\[\]:,"]/g) || []).length;
  return Math.min(1, braces / Math.max(1, text.length / 4));
}

/** Calibrated Anthropic empirical multiplier on cl100k_base. */
function anthropicMultiplier(tokenizer: TokenizerFamily, text: string): number {
  const code = looksLikeCode(text);
  const json = jsonHeaviness(text);
  const base = tokenizer === "anthropic_opus47" ? 1.3 : 1.12;
  // Code and JSON tend to tokenise closer to parity; nudge down slightly.
  const adjustment = 1 - 0.05 * code - 0.03 * json;
  return base * adjustment;
}

/** Calibrated Gemini empirical multiplier on cl100k_base. */
function geminiMultiplier(text: string): number {
  const code = looksLikeCode(text);
  // English prose ~1.05x; code closer to parity (0.98x).
  return 1.05 - 0.07 * code;
}

/** Loose multipliers for non-frontier vendors; tag as low-confidence. */
function looseMultiplier(family: TokenizerFamily): number {
  switch (family) {
    case "deepseek_empirical":
      return 1.0;
    case "grok_empirical":
      return 1.05;
    case "llama_empirical":
      return 1.1;
    case "mistral_empirical":
      return 1.08;
    default:
      return 1.0;
  }
}

export function countTokensForText(text: string, model: ModelInfo): TokenizeResult {
  if (!text) {
    return { tokens: 0, confidence: "exact", uncertaintyFraction: 0, method: "empty" };
  }

  switch (model.tokenizer) {
    case "o200k_base": {
      const tokens = encodeO200k(text).length;
      return {
        tokens,
        confidence: "exact",
        uncertaintyFraction: 0,
        method: "gpt-tokenizer/o200k_base",
      };
    }
    case "cl100k_base": {
      const tokens = encodeCl100k(text).length;
      return {
        tokens,
        confidence: "exact",
        uncertaintyFraction: 0,
        method: "gpt-tokenizer/cl100k_base",
      };
    }
    case "anthropic_empirical":
    case "anthropic_opus47": {
      const base = encodeCl100k(text).length;
      const mult = anthropicMultiplier(model.tokenizer, text);
      const tokens = Math.round(base * mult);
      return {
        tokens,
        confidence: "medium",
        uncertaintyFraction: 0.08,
        method: `cl100k×${mult.toFixed(3)} (Anthropic empirical)`,
      };
    }
    case "gemini_empirical": {
      const base = encodeCl100k(text).length;
      const mult = geminiMultiplier(text);
      const tokens = Math.round(base * mult);
      return {
        tokens,
        confidence: "medium",
        uncertaintyFraction: 0.1,
        method: `cl100k×${mult.toFixed(3)} (SentencePiece empirical)`,
      };
    }
    default: {
      const base = encodeCl100k(text).length;
      const mult = looseMultiplier(model.tokenizer);
      const tokens = Math.round(base * mult);
      return {
        tokens,
        confidence: "low",
        uncertaintyFraction: 0.1,
        method: `cl100k×${mult.toFixed(3)} (loose empirical)`,
      };
    }
  }
}

export interface PromptInput {
  /** Free-form user prompt content. */
  user: string;
  /** Optional system prompt. */
  system?: string;
  /** Optional tool/function schemas as JSON strings. */
  tools?: string[];
  /** Optional prior conversation turns (concatenated). */
  history?: string;
  /** Image attachments. */
  images?: Array<{ width: number; height: number }>;
  /** PDF pages count. */
  pdfPages?: number;
}

export interface PromptTokenBreakdown {
  user: number;
  system: number;
  tools: number;
  history: number;
  images: number;
  pdfs: number;
  total: number;
  confidence: TokenizeResult["confidence"];
  uncertaintyFraction: number;
  method: string;
}

export function countPromptTokens(prompt: PromptInput, model: ModelInfo): PromptTokenBreakdown {
  const user = countTokensForText(prompt.user, model);
  const system = prompt.system ? countTokensForText(prompt.system, model) : null;
  const toolText = (prompt.tools || []).join("\n");
  const tools = toolText ? countTokensForText(toolText, model) : null;
  const history = prompt.history ? countTokensForText(prompt.history, model) : null;

  let imageTokens = 0;
  if (prompt.images?.length && model.imageTokens) {
    if (model.imageTokens.kind === "fixed") {
      imageTokens = prompt.images.length * model.imageTokens.tokens;
    } else {
      for (const img of prompt.images) {
        imageTokens += Math.ceil((img.width * img.height) / model.imageTokens.divisor);
      }
    }
  }

  let pdfTokens = 0;
  if (prompt.pdfPages && model.pdfTokensPerPage) {
    const mid = (model.pdfTokensPerPage.min + model.pdfTokensPerPage.max) / 2;
    pdfTokens = Math.round(prompt.pdfPages * mid);
  }

  const total =
    user.tokens +
    (system?.tokens ?? 0) +
    (tools?.tokens ?? 0) +
    (history?.tokens ?? 0) +
    imageTokens +
    pdfTokens;

  // Worst (highest) uncertainty wins.
  const confidences: TokenizeResult["confidence"][] = ["exact", "high", "medium", "low"];
  const rank = (c: TokenizeResult["confidence"]) => confidences.indexOf(c);
  const all = [user, system, tools, history].filter(Boolean) as TokenizeResult[];
  let worst: TokenizeResult = user;
  for (const r of all) if (rank(r.confidence) > rank(worst.confidence)) worst = r;

  return {
    user: user.tokens,
    system: system?.tokens ?? 0,
    tools: tools?.tokens ?? 0,
    history: history?.tokens ?? 0,
    images: imageTokens,
    pdfs: pdfTokens,
    total,
    confidence: worst.confidence,
    uncertaintyFraction: worst.uncertaintyFraction,
    method: user.method,
  };
}

/* ============================================================
 * Optional vendor exact-count APIs.
 * These require a user-supplied key, stored in sessionStorage,
 * and only fire when the user explicitly opts in.
 * ============================================================ */

export async function anthropicExactCount(
  apiKey: string,
  model: ModelInfo,
  prompt: PromptInput,
): Promise<number> {
  if (model.vendor !== "anthropic") throw new Error("anthropicExactCount: wrong vendor");
  const messages = [{ role: "user", content: prompt.user }];
  const body: Record<string, unknown> = { model: model.id, messages };
  if (prompt.system) body.system = prompt.system;

  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic count_tokens failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { input_tokens: number };
  return json.input_tokens;
}

export async function geminiExactCount(
  apiKey: string,
  model: ModelInfo,
  prompt: PromptInput,
): Promise<number> {
  if (model.vendor !== "google") throw new Error("geminiExactCount: wrong vendor");
  const text = [prompt.system, prompt.history, prompt.user].filter(Boolean).join("\n\n");
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:countTokens?key=` +
    encodeURIComponent(apiKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini countTokens failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { totalTokens: number };
  return json.totalTokens;
}

export function vendorSupportsExactCount(vendor: Vendor): boolean {
  return vendor === "anthropic" || vendor === "google" || vendor === "openai";
}
