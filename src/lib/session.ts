/**
 * Multi-turn session cost simulator.
 *
 * On each turn, the full accumulated context (every prior input addition
 * + every prior output) is re-sent as input to the model, plus this turn's
 * new input addition, and a new output is generated.
 *
 * Models two scenarios side by side:
 *   - Without caching: every input token is billed at the full input rate.
 *   - With caching (5m or 1h TTL): tokens already in the cache cost 0.1×
 *     the input rate; new tokens being written into the cache cost 1.25×
 *     (5m) or 2× (1h) the input rate. Output is always billed at output rate.
 *
 * Per-turn cache bookkeeping (rolling cache pattern):
 *   - Cache hits this turn: every input token that was in the prior call's
 *     input becomes a hit on this call.
 *   - Cache writes this turn: input tokens that appear in input for the
 *     first time on this call.
 *
 * That gives the textbook breakdown:
 *   turn 0:  writes  = inputAddition[0]
 *   turn t:  hits    = ctx_before_this_turn − last turn's output  (already cached)
 *                                            + last turn's user msg (cached at t-1)
 *            writes  = last turn's output + this turn's inputAddition
 */

import type { ModelInfo } from "./models";

export interface SessionTurn {
  id: string;
  /** New input tokens added this turn (user message, plus optional new docs). */
  inputAddition: number;
  /** Expected output tokens for this turn (assistant reply). */
  expectedOutput: number;
}

export interface TurnCost {
  turnIndex: number;
  /** Total input context at this turn (cumulative). */
  contextTokens: number;
  cachedHits: number;
  cacheWrites: number;
  outputTokens: number;
  noCacheCost: number;
  withCacheCost: number;
  cumNoCache: number;
  cumWithCache: number;
}

export interface SimulationResult {
  turns: TurnCost[];
  totalNoCache: number;
  totalWithCache: number;
  /** First turn index where cumulative cached cost beat non-cached. -1 if never. */
  breakEvenTurnIndex: number;
  /** Final-turn savings (no-cache − with-cache, positive = caching wins). */
  finalSavings: number;
  /** Final-turn savings as a fraction (0–1). */
  finalSavingsFraction: number;
}

export type CacheTtl = "5m" | "1h";

export interface SimulateOptions {
  model: ModelInfo;
  ttl?: CacheTtl;
}

const M = 1_000_000;

export function simulateSession(
  turns: SessionTurn[],
  opts: SimulateOptions,
): SimulationResult {
  const { model, ttl = "5m" } = opts;
  const inputRate = model.pricing.input;
  const outputRate = model.pricing.output;
  const cachedRate = model.pricing.cachedInput ?? inputRate * 0.1;
  const writeMult =
    ttl === "1h"
      ? model.pricing.cacheWrite1hMultiplier ?? 2.0
      : model.pricing.cacheWrite5mMultiplier ?? 1.25;

  const out: TurnCost[] = [];
  let cumNoCache = 0;
  let cumWithCache = 0;
  let breakEvenTurnIndex = -1;

  // Running accumulators for context tracking.
  let priorInputs = 0; // sum of inputAddition[0..t-1]
  let priorOutputs = 0; // sum of expectedOutput[0..t-1]

  for (let t = 0; t < turns.length; t++) {
    const turn = turns[t];
    const contextTokens = priorInputs + priorOutputs + turn.inputAddition;

    // Without caching: bill the entire accumulated context as input.
    const noCacheInputCost = (contextTokens / M) * inputRate;
    const outputCost = (turn.expectedOutput / M) * outputRate;
    const noCacheCost = noCacheInputCost + outputCost;

    // With caching.
    // Hits = every token that was in the prior call's input.
    // For t=0: nothing prior, hits=0.
    // For t>=1: prior call's input was sum(inputAddition[0..t-1]) + sum(output[0..t-2]).
    //          = priorInputs (now-current sum) + (priorOutputs − output[t-1])
    //          But output[t-1] = turns[t-1].expectedOutput.
    let hits = 0;
    if (t > 0) {
      const lastOutput = turns[t - 1].expectedOutput;
      hits = priorInputs + (priorOutputs - lastOutput);
    }
    // Writes this turn: tokens appearing in input for the FIRST time on this call.
    // For t=0: just turn.inputAddition.
    // For t>=1: last turn's output (now in input for first time) + this turn's input addition.
    const writes =
      t === 0 ? turn.inputAddition : turns[t - 1].expectedOutput + turn.inputAddition;

    const cacheHitCost = (hits / M) * cachedRate;
    const cacheWriteCost = (writes / M) * inputRate * writeMult;
    const withCacheCost = cacheHitCost + cacheWriteCost + outputCost;

    cumNoCache += noCacheCost;
    cumWithCache += withCacheCost;

    if (breakEvenTurnIndex === -1 && cumWithCache < cumNoCache) {
      breakEvenTurnIndex = t;
    }

    out.push({
      turnIndex: t,
      contextTokens,
      cachedHits: hits,
      cacheWrites: writes,
      outputTokens: turn.expectedOutput,
      noCacheCost,
      withCacheCost,
      cumNoCache,
      cumWithCache,
    });

    priorInputs += turn.inputAddition;
    priorOutputs += turn.expectedOutput;
  }

  const finalSavings = cumNoCache - cumWithCache;
  const finalSavingsFraction = cumNoCache === 0 ? 0 : finalSavings / cumNoCache;

  return {
    turns: out,
    totalNoCache: cumNoCache,
    totalWithCache: cumWithCache,
    breakEvenTurnIndex,
    finalSavings,
    finalSavingsFraction,
  };
}

/* ============================================================
 * Presets — common multi-turn patterns from real workflows.
 * ============================================================ */

export interface SessionPreset {
  id: string;
  name: string;
  description: string;
  build: () => SessionTurn[];
}

let _seq = 0;
const id = () => `t${++_seq}`;

export const PRESETS: SessionPreset[] = [
  {
    id: "coding-agent",
    name: "Coding agent session",
    description:
      "25 turns of an autonomous coding agent. Large initial context (system prompt + tool defs + repo summary), then small user messages and growing tool-call outputs.",
    build: () => {
      const turns: SessionTurn[] = [];
      // Turn 0: big system + tools + repo snapshot
      turns.push({ id: id(), inputAddition: 8000, expectedOutput: 1200 });
      // Subsequent turns: small user msg, growing tool/output context
      for (let i = 1; i < 25; i++) {
        turns.push({
          id: id(),
          inputAddition: 150 + Math.floor(i * 10),
          expectedOutput: 800 + Math.floor(i * 20),
        });
      }
      return turns;
    },
  },
  {
    id: "research-chat",
    name: "Long research conversation",
    description:
      "30 turns of a researcher drilling into a topic. Small back-and-forth messages with moderately long answers each turn.",
    build: () => {
      const turns: SessionTurn[] = [];
      turns.push({ id: id(), inputAddition: 500, expectedOutput: 400 });
      for (let i = 1; i < 30; i++) {
        turns.push({ id: id(), inputAddition: 80, expectedOutput: 600 });
      }
      return turns;
    },
  },
  {
    id: "doc-qa",
    name: "Document QA over large corpus",
    description:
      "1 huge initial context (e.g. a 50K-token document) followed by 10 short question/answer turns. The canonical caching win.",
    build: () => {
      const turns: SessionTurn[] = [];
      turns.push({ id: id(), inputAddition: 50_000, expectedOutput: 300 });
      for (let i = 1; i < 11; i++) {
        turns.push({ id: id(), inputAddition: 60, expectedOutput: 250 });
      }
      return turns;
    },
  },
  {
    id: "customer-support",
    name: "Customer support thread",
    description:
      "8 turns of a support agent + customer dialogue. Short messages each side.",
    build: () => {
      const turns: SessionTurn[] = [];
      for (let i = 0; i < 8; i++) {
        turns.push({ id: id(), inputAddition: 120, expectedOutput: 180 });
      }
      return turns;
    },
  },
];

export function getPreset(id: string): SessionPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
