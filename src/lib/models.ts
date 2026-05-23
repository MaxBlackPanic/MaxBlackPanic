/**
 * Model + pricing catalog (USD per 1M tokens).
 *
 * `lastVerified` is shown next to each price in the UI. When the catalog
 * is updated, bump that date; the live-check banner compares against this.
 *
 * Sources are recorded in MODELS.md alongside this file.
 */

export type Vendor = "anthropic" | "openai" | "google" | "deepseek" | "xai" | "meta" | "mistral";

export type TokenizerFamily =
  | "o200k_base"
  | "cl100k_base"
  | "anthropic_empirical"
  | "anthropic_opus47"
  | "gemini_empirical"
  | "deepseek_empirical"
  | "grok_empirical"
  | "llama_empirical"
  | "mistral_empirical";

export type TaskClass =
  | "classification"
  | "extraction"
  | "summarisation"
  | "reasoning"
  | "code"
  | "creative"
  | "agentic"
  | "general";

export interface TierPricing {
  /** USD per 1M input tokens at standard pricing. */
  input: number;
  /** USD per 1M output tokens at standard pricing. */
  output: number;
  /** Cached input (cache HIT) USD per 1M tokens. Undefined if unsupported. */
  cachedInput?: number;
  /** Cache WRITE surcharge multiplier vs base input. */
  cacheWrite5mMultiplier?: number;
  cacheWrite1hMultiplier?: number;
  /** Batch discount multiplier (e.g. 0.5 = 50% off). */
  batchMultiplier?: number;
}

export interface LongContextSurcharge {
  /** Tokens at which surcharge kicks in. */
  thresholdInputTokens: number;
  /** Multiplier applied to input rate above threshold. */
  inputMultiplier: number;
  /** Multiplier applied to output rate above threshold. */
  outputMultiplier: number;
}

export interface ModelInfo {
  id: string;
  vendor: Vendor;
  family: string;
  label: string;
  tokenizer: TokenizerFamily;
  /** Max context window in tokens. */
  contextWindow: number;
  /** Max output tokens. */
  maxOutputTokens: number;
  pricing: TierPricing;
  /** Optional long-context surcharge (e.g. GPT-5.5 above 272K, Gemini Pro above 200K). */
  longContextSurcharge?: LongContextSurcharge;
  /** Image cost helper: tokens-per-input-image (Gemini) or per (w*h)/divisor formula (Claude). */
  imageTokens?:
    | { kind: "fixed"; tokens: number }
    | { kind: "area"; divisor: number };
  /** PDF token cost approximation: tokens per page (range). */
  pdfTokensPerPage?: { min: number; max: number };
  /** Whether this model supports extended thinking / reasoning tokens billed at output rate. */
  supportsReasoning: boolean;
  /** Default per-vendor model "tier" used in routing recommendations. */
  tier: "nano" | "small" | "mid" | "large" | "frontier";
  /** Recommended task classes this model handles well. */
  goodFor: TaskClass[];
  /** Source URL for pricing (also recorded in MODELS.md). */
  sourceUrl: string;
  /** ISO date the price above was verified. */
  lastVerified: string;
  /** Optional release/availability note. */
  notes?: string;
}

const TODAY = "2026-05-23";

/** Anthropic. Cache writes: 1.25x (5-min TTL), 2x (1-hr TTL). Batch: 50%. */
const anthropicCacheMultipliers = {
  cacheWrite5mMultiplier: 1.25,
  cacheWrite1hMultiplier: 2.0,
  batchMultiplier: 0.5,
};

/** OpenAI. Batch: 50%. Cached input on 5.4/5.5 families is 10% of base. */
const openaiCacheMultipliers = {
  batchMultiplier: 0.5,
};

/** Google. Context caching is 10% of base input + per-hour storage charge. */
const googleCacheMultipliers = {
  batchMultiplier: 0.5,
};

export const MODELS: ModelInfo[] = [
  // ============================ Anthropic ============================
  {
    id: "claude-opus-4-7",
    vendor: "anthropic",
    family: "Claude 4",
    label: "Claude Opus 4.7",
    tokenizer: "anthropic_opus47",
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    pricing: {
      input: 5.0,
      output: 25.0,
      cachedInput: 0.5,
      ...anthropicCacheMultipliers,
    },
    imageTokens: { kind: "area", divisor: 750 },
    pdfTokensPerPage: { min: 1500, max: 3000 },
    supportsReasoning: true,
    tier: "frontier",
    goodFor: ["reasoning", "code", "agentic", "creative", "general"],
    sourceUrl: "https://www.anthropic.com/pricing",
    lastVerified: TODAY,
  },
  {
    id: "claude-opus-4-6",
    vendor: "anthropic",
    family: "Claude 4",
    label: "Claude Opus 4.6",
    tokenizer: "anthropic_empirical",
    contextWindow: 1_000_000,
    maxOutputTokens: 32_000,
    pricing: {
      input: 5.0,
      output: 25.0,
      cachedInput: 0.5,
      ...anthropicCacheMultipliers,
    },
    imageTokens: { kind: "area", divisor: 750 },
    pdfTokensPerPage: { min: 1500, max: 3000 },
    supportsReasoning: true,
    tier: "frontier",
    goodFor: ["reasoning", "code", "agentic", "creative"],
    sourceUrl: "https://www.anthropic.com/pricing",
    lastVerified: TODAY,
  },
  {
    id: "claude-sonnet-4-6",
    vendor: "anthropic",
    family: "Claude 4",
    label: "Claude Sonnet 4.6",
    tokenizer: "anthropic_empirical",
    contextWindow: 1_000_000,
    maxOutputTokens: 32_000,
    pricing: {
      input: 3.0,
      output: 15.0,
      cachedInput: 0.3,
      ...anthropicCacheMultipliers,
    },
    imageTokens: { kind: "area", divisor: 750 },
    pdfTokensPerPage: { min: 1500, max: 3000 },
    supportsReasoning: true,
    tier: "large",
    goodFor: ["reasoning", "code", "general", "summarisation"],
    sourceUrl: "https://www.anthropic.com/pricing",
    lastVerified: TODAY,
  },
  {
    id: "claude-haiku-4-5",
    vendor: "anthropic",
    family: "Claude 4",
    label: "Claude Haiku 4.5",
    tokenizer: "anthropic_empirical",
    contextWindow: 1_000_000,
    maxOutputTokens: 16_000,
    pricing: {
      input: 1.0,
      output: 5.0,
      cachedInput: 0.1,
      ...anthropicCacheMultipliers,
    },
    imageTokens: { kind: "area", divisor: 750 },
    pdfTokensPerPage: { min: 1500, max: 3000 },
    supportsReasoning: true,
    tier: "small",
    goodFor: ["classification", "extraction", "summarisation", "general"],
    sourceUrl: "https://www.anthropic.com/pricing",
    lastVerified: TODAY,
  },

  // ============================ OpenAI ============================
  {
    id: "gpt-5-5",
    vendor: "openai",
    family: "GPT-5",
    label: "GPT-5.5",
    tokenizer: "o200k_base",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    pricing: {
      input: 5.0,
      output: 30.0,
      cachedInput: 0.5,
      ...openaiCacheMultipliers,
    },
    longContextSurcharge: {
      thresholdInputTokens: 272_000,
      inputMultiplier: 2.0,
      outputMultiplier: 1.5,
    },
    supportsReasoning: true,
    tier: "frontier",
    goodFor: ["reasoning", "code", "agentic", "general"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },
  {
    id: "gpt-5-5-pro",
    vendor: "openai",
    family: "GPT-5",
    label: "GPT-5.5 Pro",
    tokenizer: "o200k_base",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    pricing: {
      input: 30.0,
      output: 180.0,
      cachedInput: 3.0,
      ...openaiCacheMultipliers,
    },
    supportsReasoning: true,
    tier: "frontier",
    goodFor: ["reasoning", "agentic"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },
  {
    id: "gpt-5-4",
    vendor: "openai",
    family: "GPT-5",
    label: "GPT-5.4",
    tokenizer: "o200k_base",
    contextWindow: 256_000,
    maxOutputTokens: 64_000,
    pricing: {
      input: 2.5,
      output: 15.0,
      cachedInput: 0.25,
      ...openaiCacheMultipliers,
    },
    supportsReasoning: true,
    tier: "large",
    goodFor: ["reasoning", "code", "general", "summarisation"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },
  {
    id: "gpt-5-4-mini",
    vendor: "openai",
    family: "GPT-5",
    label: "GPT-5.4 Mini",
    tokenizer: "o200k_base",
    contextWindow: 256_000,
    maxOutputTokens: 64_000,
    pricing: {
      input: 0.5,
      output: 4.0,
      cachedInput: 0.05,
      ...openaiCacheMultipliers,
    },
    supportsReasoning: true,
    tier: "mid",
    goodFor: ["extraction", "summarisation", "general", "code"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },
  {
    id: "gpt-5-4-nano",
    vendor: "openai",
    family: "GPT-5",
    label: "GPT-5.4 Nano",
    tokenizer: "o200k_base",
    contextWindow: 128_000,
    maxOutputTokens: 16_000,
    pricing: {
      input: 0.2,
      output: 1.25,
      cachedInput: 0.02,
      ...openaiCacheMultipliers,
    },
    supportsReasoning: false,
    tier: "nano",
    goodFor: ["classification", "extraction"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },
  {
    id: "gpt-5-3-codex",
    vendor: "openai",
    family: "GPT-5",
    label: "GPT-5.3 Codex",
    tokenizer: "o200k_base",
    contextWindow: 256_000,
    maxOutputTokens: 64_000,
    pricing: {
      input: 1.75,
      output: 14.0,
      cachedInput: 0.175,
      ...openaiCacheMultipliers,
    },
    supportsReasoning: true,
    tier: "large",
    goodFor: ["code", "agentic"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },
  {
    id: "gpt-4o",
    vendor: "openai",
    family: "GPT-4",
    label: "GPT-4o (legacy)",
    tokenizer: "o200k_base",
    contextWindow: 128_000,
    maxOutputTokens: 16_000,
    pricing: {
      input: 2.5,
      output: 10.0,
      cachedInput: 1.25,
      ...openaiCacheMultipliers,
    },
    supportsReasoning: false,
    tier: "mid",
    goodFor: ["general", "summarisation"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
    notes: "Legacy. Prefer GPT-5.4 unless pinned for reproducibility.",
  },
  {
    id: "o3",
    vendor: "openai",
    family: "o-series",
    label: "o3 (legacy reasoning)",
    tokenizer: "o200k_base",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    pricing: { input: 2.0, output: 8.0, cachedInput: 0.5, ...openaiCacheMultipliers },
    supportsReasoning: true,
    tier: "large",
    goodFor: ["reasoning"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },
  {
    id: "o4-mini",
    vendor: "openai",
    family: "o-series",
    label: "o4-mini (legacy reasoning)",
    tokenizer: "o200k_base",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    pricing: { input: 1.1, output: 4.4, cachedInput: 0.275, ...openaiCacheMultipliers },
    supportsReasoning: true,
    tier: "mid",
    goodFor: ["reasoning", "code"],
    sourceUrl: "https://openai.com/api/pricing/",
    lastVerified: TODAY,
  },

  // ============================ Google ============================
  {
    id: "gemini-3-1-pro",
    vendor: "google",
    family: "Gemini 3",
    label: "Gemini 3.1 Pro",
    tokenizer: "gemini_empirical",
    contextWindow: 2_000_000,
    maxOutputTokens: 64_000,
    pricing: {
      input: 2.0,
      output: 12.0,
      cachedInput: 0.2,
      ...googleCacheMultipliers,
    },
    longContextSurcharge: {
      thresholdInputTokens: 200_000,
      inputMultiplier: 2.0,
      outputMultiplier: 1.5,
    },
    imageTokens: { kind: "fixed", tokens: 560 },
    supportsReasoning: true,
    tier: "frontier",
    goodFor: ["reasoning", "agentic", "code", "general"],
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    lastVerified: TODAY,
  },
  {
    id: "gemini-3-5-flash",
    vendor: "google",
    family: "Gemini 3",
    label: "Gemini 3.5 Flash",
    tokenizer: "gemini_empirical",
    contextWindow: 1_000_000,
    maxOutputTokens: 32_000,
    pricing: {
      input: 1.5,
      output: 9.0,
      cachedInput: 0.15,
      ...googleCacheMultipliers,
    },
    imageTokens: { kind: "fixed", tokens: 560 },
    supportsReasoning: true,
    tier: "large",
    goodFor: ["reasoning", "general", "summarisation", "code"],
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    lastVerified: TODAY,
  },
  {
    id: "gemini-3-flash",
    vendor: "google",
    family: "Gemini 3",
    label: "Gemini 3 Flash",
    tokenizer: "gemini_empirical",
    contextWindow: 1_000_000,
    maxOutputTokens: 16_000,
    pricing: {
      input: 0.5,
      output: 3.0,
      cachedInput: 0.05,
      ...googleCacheMultipliers,
    },
    imageTokens: { kind: "fixed", tokens: 560 },
    supportsReasoning: false,
    tier: "small",
    goodFor: ["extraction", "classification", "summarisation"],
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    lastVerified: TODAY,
  },
  {
    id: "gemini-2-5-pro",
    vendor: "google",
    family: "Gemini 2",
    label: "Gemini 2.5 Pro",
    tokenizer: "gemini_empirical",
    contextWindow: 2_000_000,
    maxOutputTokens: 8_192,
    pricing: {
      input: 1.25,
      output: 10.0,
      cachedInput: 0.125,
      ...googleCacheMultipliers,
    },
    longContextSurcharge: {
      thresholdInputTokens: 200_000,
      inputMultiplier: 2.0,
      outputMultiplier: 1.5,
    },
    supportsReasoning: false,
    tier: "large",
    goodFor: ["reasoning", "general", "summarisation"],
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    lastVerified: TODAY,
  },
  {
    id: "gemini-2-5-flash-lite",
    vendor: "google",
    family: "Gemini 2",
    label: "Gemini 2.5 Flash-Lite",
    tokenizer: "gemini_empirical",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    pricing: {
      input: 0.1,
      output: 0.4,
      cachedInput: 0.01,
      ...googleCacheMultipliers,
    },
    supportsReasoning: false,
    tier: "nano",
    goodFor: ["classification", "extraction"],
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    lastVerified: TODAY,
  },

  // ============================ Others (estimate only) ============================
  {
    id: "deepseek-v3",
    vendor: "deepseek",
    family: "DeepSeek",
    label: "DeepSeek V3",
    tokenizer: "deepseek_empirical",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    pricing: { input: 0.27, output: 1.1, cachedInput: 0.07, batchMultiplier: 0.5 },
    supportsReasoning: false,
    tier: "mid",
    goodFor: ["general", "code"],
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    lastVerified: TODAY,
  },
  {
    id: "grok-4",
    vendor: "xai",
    family: "Grok",
    label: "Grok 4",
    tokenizer: "grok_empirical",
    contextWindow: 256_000,
    maxOutputTokens: 16_000,
    pricing: { input: 3.0, output: 15.0, batchMultiplier: 0.5 },
    supportsReasoning: true,
    tier: "large",
    goodFor: ["reasoning", "general"],
    sourceUrl: "https://x.ai/api",
    lastVerified: TODAY,
  },
  {
    id: "llama-3-3-405b",
    vendor: "meta",
    family: "Llama",
    label: "Llama 3.3 405B (hosted)",
    tokenizer: "llama_empirical",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    pricing: { input: 3.5, output: 3.5 },
    supportsReasoning: false,
    tier: "large",
    goodFor: ["general", "code"],
    sourceUrl: "https://llama.developer.meta.com/docs/pricing",
    lastVerified: TODAY,
  },
  {
    id: "mistral-large-2",
    vendor: "mistral",
    family: "Mistral",
    label: "Mistral Large 2",
    tokenizer: "mistral_empirical",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    pricing: { input: 2.0, output: 6.0, batchMultiplier: 0.5 },
    supportsReasoning: false,
    tier: "large",
    goodFor: ["general", "code", "reasoning"],
    sourceUrl: "https://mistral.ai/technology/#pricing",
    lastVerified: TODAY,
  },
];

export const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelInfo {
  const m = MODEL_BY_ID.get(id);
  if (!m) throw new Error(`Unknown model id: ${id}`);
  return m;
}

export function modelsByVendor(vendor: Vendor): ModelInfo[] {
  return MODELS.filter((m) => m.vendor === vendor);
}

/** Frontier comparison set used as the default selection in the UI. */
export const DEFAULT_COMPARE_IDS: string[] = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-5-5",
  "gpt-5-4",
  "gpt-5-4-mini",
  "gpt-5-4-nano",
  "gemini-3-1-pro",
  "gemini-3-5-flash",
  "gemini-3-flash",
];

/** Vendors whose tokenisation has a low-confidence empirical estimate only. */
export const ESTIMATE_ONLY_VENDORS: Vendor[] = ["deepseek", "xai", "meta", "mistral"];
