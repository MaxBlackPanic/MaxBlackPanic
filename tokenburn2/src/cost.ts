// TokenBurn 2.0 — pure cost calculation module.
//
// This module is deliberately free of any I/O, React, or DOM dependency so it
// can be unit tested and so the numbers it produces are provable. Every cost is
// derived solely from token counts and the rates in pricing.ts.
//
// Cost formula (USD):
//   cost = (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000
//
// Cache adjustment (when a cached prefix is set):
//   inputCost = (cachedTokens * cacheRate + (inputTokens - cachedTokens) * inputRate) / 1e6
//
// Batch toggle applies BATCH_MULTIPLIER (0.5) to BOTH input and output rates.

import { MODELS, type Model } from "./pricing";

export type CostOptions = {
  /** Number of input tokens served from a cached prefix. */
  cachedTokens?: number;
  /** Whether this call is submitted as a batch / async job (half price). */
  batch?: boolean;
};

export type CostBreakdown = {
  inputCost: number;
  outputCost: number;
  total: number;
  /** Effective per-million rates actually applied (after batch / tier). */
  appliedInputRate: number;
  appliedOutputRate: number;
  appliedCacheRate: number;
  /** True when the input pushed the model into its higher context tier. */
  overTier: boolean;
};

/**
 * Cost of a single call given exact input and output token counts.
 * Pure: same inputs always yield the same result.
 */
export function costOf(
  inputTokens: number,
  outputTokens: number,
  m: Model,
  opts?: CostOptions
): CostBreakdown {
  const cached = Math.min(Math.max(opts?.cachedTokens ?? 0, 0), Math.max(inputTokens, 0));
  const batch = opts?.batch ? 0.5 : 1;

  const overTier = Boolean(m.contextTierAt && inputTokens > m.contextTierAt);

  const baseIn = overTier && m.tierInputRate != null ? m.tierInputRate : m.inputRate;
  const baseOut = overTier && m.tierOutputRate != null ? m.tierOutputRate : m.outputRate;

  const inR = baseIn * batch;
  const outR = baseOut * batch;
  // If the model has no explicit cache read rate, fall back to the normal input
  // rate (i.e. caching saves nothing) so we never overstate savings.
  const cacheR = (m.cacheReadRate ?? m.inputRate) * batch;

  const inputCost = (cached * cacheR + (inputTokens - cached) * inR) / 1e6;
  const outputCost = (outputTokens * outR) / 1e6;

  return {
    inputCost,
    outputCost,
    total: inputCost + outputCost,
    appliedInputRate: inR,
    appliedOutputRate: outR,
    appliedCacheRate: cacheR,
    overTier,
  };
}

export type CallScenario = {
  inputTokens: number;
  /** Forecast (expected) output tokens — an estimate, never exact. */
  forecastOutputTokens: number;
  /** Hard cap on output tokens, used for the worst case. */
  maxTokens: number;
  opts?: CostOptions;
};

/** Expected cost of a call using the forecast output length. An estimate. */
export function expectedCost(s: CallScenario, m: Model): CostBreakdown {
  return costOf(s.inputTokens, s.forecastOutputTokens, m, s.opts);
}

/**
 * Worst-case cost — the ceiling. Output is assumed to hit maxTokens exactly.
 * This is the only figure that should ever be presented as an upper bound.
 */
export function worstCaseCost(s: CallScenario, m: Model): CostBreakdown {
  return costOf(s.inputTokens, s.maxTokens, m, s.opts);
}

/** Per-call expected cost multiplied across a month of calls. */
export function monthlyCost(perCallTotal: number, callsPerMonth: number): number {
  return perCallTotal * Math.max(callsPerMonth, 0);
}

export type ModelComparison = {
  model: Model;
  expected: CostBreakdown;
  worstCase: CostBreakdown;
};

/**
 * Cost of the same scenario across every model (or a provided subset), sorted
 * cheapest-expected first. Powers the cross-model suggestion table.
 */
export function compareModels(
  s: CallScenario,
  models: Model[] = MODELS
): ModelComparison[] {
  return models
    .map((model) => ({
      model,
      expected: expectedCost(s, model),
      worstCase: worstCaseCost(s, model),
    }))
    .sort((a, b) => a.expected.total - b.expected.total);
}
