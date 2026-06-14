// TokenBurn 2.0 — suggestion engine.
//
// Produces specific, dollar-quantified ways to spend less. Every suggestion
// reports the saving per call AND per month so a token count becomes a budget
// decision. Suggestions are pure functions of the current scenario.

import {
  costOf,
  expectedCost,
  compareModels,
  monthlyCost,
  type CallScenario,
  type CostOptions,
} from "./cost";
import { MODELS, type Model } from "./pricing";

export type Suggestion = {
  id: string;
  title: string;
  detail: string;
  /** Dollar saving per call (>= 0). */
  savingPerCall: number;
  /** Dollar saving per month (>= 0). */
  savingPerMonth: number;
};

export type SuggestionInput = {
  scenario: CallScenario;
  model: Model;
  callsPerMonth: number;
  /** Tokens in the stable system-prompt / context prefix (cache candidate). */
  prefixTokens: number;
  /** Whether the user has already set a maxTokens cap. */
  maxTokensSet: boolean;
};

// Below this saving we don't bother surfacing a suggestion.
const MIN_SAVING_PER_MONTH = 0.01;

export function buildSuggestions(input: SuggestionInput): Suggestion[] {
  const { scenario, model, callsPerMonth, prefixTokens, maxTokensSet } = input;
  const out: Suggestion[] = [];

  const baseExpected = expectedCost(scenario, model).total;

  // (a) Caching a long, stable prefix.
  if (prefixTokens >= 1024 && !scenario.opts?.cachedTokens) {
    const cachedOpts: CostOptions = { ...scenario.opts, cachedTokens: prefixTokens };
    const cachedTotal = expectedCost({ ...scenario, opts: cachedOpts }, model).total;
    const perCall = baseExpected - cachedTotal;
    if (perCall > 0) {
      out.push({
        id: "cache-prefix",
        title: "Cache your stable prefix",
        detail: `Your context prefix is ~${prefixTokens.toLocaleString()} tokens. Caching it bills those at ${
          model.cacheReadRate != null ? `$${model.cacheReadRate}/M` : "the cache rate"
        } instead of $${model.inputRate}/M on repeat calls.`,
        savingPerCall: perCall,
        savingPerMonth: monthlyCost(perCall, callsPerMonth),
      });
    }
  }

  // (b) Cheaper models that preserve the workload.
  const cheaper = compareModels(scenario)
    .filter((row) => row.model.id !== model.id && row.expected.total < baseExpected)
    .slice(0, 3);
  for (const row of cheaper) {
    const perCall = baseExpected - row.expected.total;
    if (monthlyCost(perCall, callsPerMonth) >= MIN_SAVING_PER_MONTH) {
      const pct = Math.round((perCall / baseExpected) * 100);
      out.push({
        id: `switch-${row.model.id}`,
        title: `Try ${row.model.label}`,
        detail: `Same prompt and output forecast costs ${pct}% less on ${row.model.label}. Verify it holds your quality bar before switching.`,
        savingPerCall: perCall,
        savingPerMonth: monthlyCost(perCall, callsPerMonth),
      });
    }
  }

  // (c) No maxTokens set — recommend one and show the worst case it imposes.
  if (!maxTokensSet) {
    const recommended = Math.max(scenario.forecastOutputTokens * 2, 256);
    const worstAtRec = costOf(scenario.inputTokens, recommended, model, scenario.opts).total;
    out.push({
      id: "set-maxtokens",
      title: "Set a max output length",
      detail: `No output cap is set, so a single runaway response is unbounded. A cap of ~${recommended.toLocaleString()} tokens (2× your forecast) bounds worst case to $${worstAtRec.toFixed(4)} per call.`,
      // Bounding cost isn't a guaranteed saving, so we don't claim one.
      savingPerCall: 0,
      savingPerMonth: 0,
    });
  }

  // (d) Output large relative to prompt — likely verbosity.
  if (
    scenario.forecastOutputTokens > 0 &&
    scenario.inputTokens > 0 &&
    scenario.forecastOutputTokens > scenario.inputTokens * 3
  ) {
    const trimmed = Math.ceil(scenario.forecastOutputTokens / 2);
    const trimmedTotal = expectedCost(
      { ...scenario, forecastOutputTokens: trimmed },
      model
    ).total;
    const perCall = baseExpected - trimmedTotal;
    if (perCall > 0) {
      out.push({
        id: "constrain-output",
        title: "Constrain the output length",
        detail: `Your forecast output (~${scenario.forecastOutputTokens.toLocaleString()} tokens) is large versus the prompt. Asking for a concise answer (e.g. half the length) would roughly halve output cost.`,
        savingPerCall: perCall,
        savingPerMonth: monthlyCost(perCall, callsPerMonth),
      });
    }
  }

  return out;
}

// Re-export for convenience in the UI layer.
export { MODELS };
