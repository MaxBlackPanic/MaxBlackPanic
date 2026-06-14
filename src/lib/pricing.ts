/**
 * Pricing math. All math here is in floating-point USD; rates are per 1M
 * tokens. Unit-tested against hand-calculated reference values.
 */

import type { ModelInfo } from "./models";

export type Tier = "standard" | "batch" | "cached";

export interface CostInputs {
  inputTokens: number;
  outputTokens: number;
  /** Reasoning tokens. Billed at OUTPUT rate when the model supports it. */
  reasoningTokens?: number;
  /** Number of cached input tokens (cache HIT). Subset of inputTokens. */
  cachedInputTokens?: number;
  /** Cache WRITE tokens for this call (TTL chosen). */
  cacheWriteTokens?: number;
  cacheWriteTtl?: "5m" | "1h";
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  reasoningCost: number;
  cachedInputCost: number;
  cacheWriteCost: number;
  longContextSurchargeCost: number;
  total: number;
  /** Effective per-1M input rate used (post long-context surcharge). */
  effectiveInputRate: number;
  effectiveOutputRate: number;
}

const M = 1_000_000;

export function computeCost(
  model: ModelInfo,
  inputs: CostInputs,
  tier: Tier = "standard",
): CostBreakdown {
  const p = model.pricing;
  const reasoning = inputs.reasoningTokens ?? 0;
  const cachedIn = inputs.cachedInputTokens ?? 0;
  const cacheWriteTokens = inputs.cacheWriteTokens ?? 0;
  const billedInputTokens = Math.max(0, inputs.inputTokens - cachedIn);

  let inputRate = p.input;
  let outputRate = p.output;

  if (tier === "batch") {
    const mult = p.batchMultiplier ?? 0.5;
    inputRate *= mult;
    outputRate *= mult;
  }

  // Long-context surcharge applied only to the portion above threshold.
  let surchargeCost = 0;
  if (model.longContextSurcharge && inputs.inputTokens > model.longContextSurcharge.thresholdInputTokens) {
    const overflow = inputs.inputTokens - model.longContextSurcharge.thresholdInputTokens;
    const inputDelta = (overflow / M) * inputRate * (model.longContextSurcharge.inputMultiplier - 1);
    const outputDelta = (inputs.outputTokens / M) * outputRate * (model.longContextSurcharge.outputMultiplier - 1);
    surchargeCost = inputDelta + outputDelta;
  }

  const inputCost = (billedInputTokens / M) * inputRate;
  const outputCost = (inputs.outputTokens / M) * outputRate;
  const reasoningCost = (reasoning / M) * outputRate;

  const cachedInputRate = p.cachedInput ?? p.input * 0.1;
  const cachedInputCost = (cachedIn / M) * cachedInputRate;

  let cacheWriteCost = 0;
  if (cacheWriteTokens > 0) {
    const mult =
      inputs.cacheWriteTtl === "1h"
        ? p.cacheWrite1hMultiplier ?? 2.0
        : p.cacheWrite5mMultiplier ?? 1.25;
    cacheWriteCost = (cacheWriteTokens / M) * p.input * mult;
  }

  const total =
    inputCost + outputCost + reasoningCost + cachedInputCost + cacheWriteCost + surchargeCost;

  return {
    inputCost,
    outputCost,
    reasoningCost,
    cachedInputCost,
    cacheWriteCost,
    longContextSurchargeCost: surchargeCost,
    total,
    effectiveInputRate: inputRate,
    effectiveOutputRate: outputRate,
  };
}

export function projectVolume(perCallCost: number, callsPerDay: number) {
  return {
    perCall: perCallCost,
    perDay: perCallCost * callsPerDay,
    perMonth: perCallCost * callsPerDay * 30,
    perYear: perCallCost * callsPerDay * 365,
  };
}

export function formatUSD(n: number): string {
  if (!isFinite(n)) return "—";
  if (n === 0) return "$0.00";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  // Use fixed decimals down to $1e-7 (e.g. $0.0000330 — a tenth of a millicent).
  // Below that, fall back to scientific so we don't print 10+ decimals.
  if (abs < 1e-7) return `${sign}$${abs.toExponential(2)}`;
  if (abs < 0.0001) return `${sign}$${abs.toFixed(7)}`;
  if (abs < 0.01) return `${sign}$${abs.toFixed(5)}`;
  if (abs < 1) return `${sign}$${abs.toFixed(4)}`;
  if (abs < 1000) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
