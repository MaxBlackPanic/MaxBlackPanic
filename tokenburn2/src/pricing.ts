// TokenBurn 2.0 — pricing configuration.
//
// All rates are USD per MILLION tokens. There is no database: this file is the
// single source of truth for pricing. When vendor rates change, update the
// numbers below AND bump PRICING_VERIFIED so the UI can show users how fresh
// these figures are.
//
// Verify against the official pricing pages before trusting these numbers.

export const PRICING_VERIFIED = "2026-05-30";

// Cached input is billed at a fraction of the normal input rate. Individual
// models may override this via `cacheReadRate`; this is the fallback ratio.
export const CACHE_DISCOUNT = 0.1; // ~10% of input rate

// Batch / async jobs are billed at half price on both input and output.
export const BATCH_MULTIPLIER = 0.5;

export type Provider = "anthropic" | "openai" | "google";

export type Tokeniser =
  | "tiktoken-o200k"
  | "anthropic-endpoint"
  | "gemini-endpoint";

export type Model = {
  id: string;
  label: string;
  provider: Provider;
  /** USD per million input tokens. */
  inputRate: number;
  /** USD per million output tokens. */
  outputRate: number;
  /** USD per million cached input tokens, if the model supports cache reads. */
  cacheReadRate?: number;
  /** Input token count above which a higher pricing tier applies. */
  contextTierAt?: number;
  /** Input rate (USD/M) once over the context tier. */
  tierInputRate?: number;
  /** Output rate (USD/M) once over the context tier. */
  tierOutputRate?: number;
  tokeniser: Tokeniser;
};

export const MODELS: Model[] = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", provider: "anthropic", inputRate: 5, outputRate: 25, cacheReadRate: 0.5, tokeniser: "anthropic-endpoint" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", inputRate: 3, outputRate: 15, cacheReadRate: 0.3, tokeniser: "anthropic-endpoint" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", inputRate: 1, outputRate: 5, cacheReadRate: 0.1, tokeniser: "anthropic-endpoint" },
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", inputRate: 5, outputRate: 30, cacheReadRate: 0.5, tokeniser: "tiktoken-o200k" },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", inputRate: 2.5, outputRate: 15, cacheReadRate: 0.25, tokeniser: "tiktoken-o200k" },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai", inputRate: 1.75, outputRate: 14, tokeniser: "tiktoken-o200k" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", provider: "google", inputRate: 2, outputRate: 12, contextTierAt: 200000, tierInputRate: 4, tierOutputRate: 18, tokeniser: "gemini-endpoint" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "google", inputRate: 1.5, outputRate: 9, cacheReadRate: 0.15, tokeniser: "gemini-endpoint" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", provider: "google", inputRate: 0.25, outputRate: 1.5, tokeniser: "gemini-endpoint" },
];

/** Default model on first load — a mid-tier choice. */
export const DEFAULT_MODEL_ID = "claude-sonnet-4-6";

export type TaskType = "classify" | "shortAnswer" | "email" | "analysis" | "longform";

// Task-based default output forecasts (tokens), used to pre-fill the
// expected-output field. These are starting points, not promises.
export const OUTPUT_DEFAULTS: Record<TaskType, number> = {
  classify: 20,
  shortAnswer: 120,
  email: 400,
  analysis: 1500,
  longform: 4000,
};

export const TASK_LABELS: Record<TaskType, string> = {
  classify: "Classification / label (~20 tokens)",
  shortAnswer: "Short answer (~120 tokens)",
  email: "Email / message (~400 tokens)",
  analysis: "Analysis / report (~1,500 tokens)",
  longform: "Long-form / document (~4,000 tokens)",
};

export function getModel(id: string): Model {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}
