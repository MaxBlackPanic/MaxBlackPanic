/**
 * Cascading output predictor.
 *
 * Three tiers, applied in order. The first tier that yields a confident
 * estimate is used. Every prediction carries metadata about which tier
 * produced it so the UI can show confidence.
 *
 *   Tier 1 — deterministic: explicit max_tokens / word count / sentence
 *     count / "brief" / "comprehensive" / "one line".
 *   Tier 2 — structural: detected output shape — JSON schema, table of
 *     stated dimensions, numbered list of N items, code function, email,
 *     report with named sections.
 *   Tier 3 — archetype: rule-based classifier into one of 9 task classes
 *     and a calibrated output/input expansion ratio per class.
 *
 * Output is always a low/expected/high triple modelled as a log-normal
 * distribution.
 */

import type { ModelInfo, TaskClass } from "./models";
import { ARCHETYPE_DEFAULTS, classify, type Archetype, type ArchetypeConfig } from "./outputArchetypes";

export type PredictionTier = "deterministic" | "structural" | "archetype";

export interface OutputPrediction {
  low: number;
  expected: number;
  high: number;
  tier: PredictionTier;
  archetype?: Archetype;
  /** Log-normal sigma used to derive the band. */
  sigma: number;
  /** Human-readable explanation of which signal fired. */
  rationale: string;
  /** Legacy TaskClass mapping for back-compat with the analyser router. */
  taskClass: TaskClass;
  /** Optional per-archetype correction factor that was applied. 1.0 = none. */
  correctionFactor?: number;
  /** Whether the chosen archetype is reasoning-heavy (affects thinking-band UI). */
  reasoningHeavy?: boolean;
}

const ARCHETYPE_TO_TASK: Record<Archetype, TaskClass> = {
  classification: "classification",
  extraction: "extraction",
  summarisation: "summarisation",
  qa: "general",
  open: "creative",
  code: "code",
  translation: "general",
  rewriting: "general",
  agentic: "agentic",
};

/** Build a log-normal-band triple from an expected value + sigma. */
function lognormalBand(expected: number, sigma: number, cap: number): {
  low: number;
  expected: number;
  high: number;
} {
  const exp = Math.min(Math.max(1, Math.round(expected)), cap);
  const low = Math.max(1, Math.round(exp * Math.exp(-sigma)));
  const high = Math.min(cap, Math.round(exp * Math.exp(sigma)));
  return { low, expected: exp, high };
}

// ---------- Tier 1 — deterministic ----------------------------------

function tier1Deterministic(prompt: string, model: ModelInfo): OutputPrediction | null {
  const cap = model.maxOutputTokens;

  // max_tokens=N (explicit ceiling).
  const maxTok = prompt.match(/\bmax[_\s-]?tokens?\s*[:=]\s*(\d{2,6})\b/i);
  if (maxTok) {
    const n = Math.min(parseInt(maxTok[1], 10), cap);
    return {
      ...lognormalBand(n, 0, cap),
      low: Math.max(1, Math.round(n * 0.6)),
      high: n, // hard ceiling
      tier: "deterministic",
      sigma: 0,
      rationale: `Explicit max_tokens=${n}; treated as a hard upper bound.`,
      taskClass: "general",
    };
  }

  // "in N words" / "no more than N words"
  const words = prompt.match(/\b(?:in|under|no more than|at most|up to)\s+(\d{2,5})\s+words?\b/i);
  if (words) {
    const tokens = Math.round(parseInt(words[1], 10) * 1.33);
    return {
      ...lognormalBand(tokens, 0.25, cap),
      tier: "deterministic",
      sigma: 0.25,
      rationale: `Word cap detected (~${words[1]} words → ~${tokens} tokens).`,
      taskClass: "general",
    };
  }

  // "in N sentences"
  const sentences = prompt.match(/\b(?:in|under|no more than|at most)\s+(\d{1,3})\s+sentences?\b/i);
  if (sentences) {
    const tokens = parseInt(sentences[1], 10) * 25;
    return {
      ...lognormalBand(tokens, 0.3, cap),
      tier: "deterministic",
      sigma: 0.3,
      rationale: `Sentence cap (~${sentences[1]} sentences × 25 tok).`,
      taskClass: "general",
    };
  }

  // "one sentence" / "one line".
  if (/\b(one\s+sentence|a\s+single\s+sentence|tl;?dr)\b/i.test(prompt)) {
    return {
      ...lognormalBand(30, 0.4, cap),
      tier: "deterministic",
      sigma: 0.4,
      rationale: 'Detected "one sentence" / "TL;DR" — tight band.',
      taskClass: "general",
    };
  }
  if (/\bone-?line\b/i.test(prompt)) {
    return {
      ...lognormalBand(25, 0.4, cap),
      tier: "deterministic",
      sigma: 0.4,
      rationale: 'Detected "one line" — tight band.',
      taskClass: "general",
    };
  }

  return null;
}

// ---------- Tier 2 — structural -------------------------------------

interface StructuralEstimate {
  expected: number;
  sigma: number;
  rationale: string;
}

function tier2Structural(prompt: string, model: ModelInfo): OutputPrediction | null {
  const cap = model.maxOutputTokens;
  const estimates: StructuralEstimate[] = [];

  // Numbered/bulleted list of N items.
  const listOfN = prompt.match(/\b(?:list\s+of|provide|return|give\s+me)\s+(\d{1,3})\s+(?:items?|examples?|points?|bullets?|reasons?|ways?|tips?|ideas?)\b/i);
  if (listOfN) {
    const n = parseInt(listOfN[1], 10);
    const expected = n * 30; // 30 tokens per item, average
    estimates.push({
      expected,
      sigma: 0.35,
      rationale: `Numbered list of ${n} items × ~30 tok ≈ ${expected} tok.`,
    });
  }

  // Table with R rows and C columns.
  const table = prompt.match(/\btable\s+(?:with\s+)?(\d{1,4})\s+rows?\s+(?:and|by|×|x)\s+(\d{1,3})\s+columns?\b/i);
  if (table) {
    const r = parseInt(table[1], 10);
    const c = parseInt(table[2], 10);
    const expected = r * c * 8 + r * 2; // 8 tok per cell + separators
    estimates.push({
      expected,
      sigma: 0.3,
      rationale: `Table ${r}×${c} cells × 8 tok + separators.`,
    });
  }

  // JSON object with explicit keys list.
  const jsonKeys = prompt.match(
    /json\s+(?:object\s+)?(?:with\s+)?(?:keys|fields|properties)[:\s]+([\w_\-, ]{3,200})/i,
  );
  if (jsonKeys) {
    const keys = jsonKeys[1]
      .split(/[,\s]+/)
      .filter((k) => k.length > 0 && !/^(with|and|are|the)$/i.test(k));
    if (keys.length >= 2) {
      const expected = keys.length * 20 + 10; // 20 tok per key/value pair + braces
      estimates.push({
        expected,
        sigma: 0.4,
        rationale: `JSON object with ${keys.length} keys × ~20 tok.`,
      });
    }
  }

  // Email / letter.
  if (/\b(write|draft|compose)\s+(an?\s+)?(email|letter|memo)\b/i.test(prompt)) {
    estimates.push({
      expected: 180,
      sigma: 0.5,
      rationale: "Email / letter structure (subject + greeting + body + sign-off).",
    });
  }

  // Report with named sections.
  const sections = prompt.match(/\b(?:with\s+)?sections?\s*[:.]?\s*([\w\s,]+)/i);
  if (sections && /\b(report|document|brief|analysis)\b/i.test(prompt)) {
    const sectionList = sections[1].split(/[,;]+/).filter((s) => s.trim().length > 2);
    if (sectionList.length >= 2) {
      const expected = sectionList.length * 150 + 50;
      estimates.push({
        expected,
        sigma: 0.55,
        rationale: `Report with ${sectionList.length} named sections × ~150 tok.`,
      });
    }
  }

  // Code function with tests.
  if (/\b(function|method)\b.*\b(with|plus|and)\b.*\b(tests?|test\s+cases?)\b/i.test(prompt)) {
    estimates.push({
      expected: 450,
      sigma: 0.6,
      rationale: "Function + test cases (function ~200 tok + tests ~250 tok).",
    });
  } else if (/\bwrite\s+(an?|the)\s+(function|method)\b/i.test(prompt)) {
    estimates.push({
      expected: 200,
      sigma: 0.55,
      rationale: "Single function (~200 tok).",
    });
  } else if (/\bwrite\s+(an?|the)\s+(class|component)\b/i.test(prompt)) {
    estimates.push({
      expected: 500,
      sigma: 0.7,
      rationale: "Class / component (~500 tok).",
    });
  }

  if (estimates.length === 0) return null;

  // Multiple structural signals: sum them.
  const expected = estimates.reduce((sum, e) => sum + e.expected, 0);
  // Combine sigmas: take the max (variance dominates).
  const sigma = Math.max(...estimates.map((e) => e.sigma));
  return {
    ...lognormalBand(expected, sigma, cap),
    tier: "structural",
    sigma,
    rationale: estimates.map((e) => e.rationale).join(" + "),
    taskClass: "general",
  };
}

// ---------- Tier 3 — archetype --------------------------------------

function tier3Archetype(
  prompt: string,
  inputTokens: number,
  model: ModelInfo,
  archetypeOverrides?: Partial<Record<Archetype, ArchetypeConfig>>,
  correctionFactors?: Partial<Record<Archetype, number>>,
): OutputPrediction {
  const cap = model.maxOutputTokens;
  const { archetype, confidence } = classify(prompt);
  const cfg = archetypeOverrides?.[archetype] ?? ARCHETYPE_DEFAULTS[archetype];
  const correction = correctionFactors?.[archetype] ?? 1.0;
  // Floor at archetype.minExpected (very short prompts) AND cap at
  // max(minExpected*5, input*3) so the ratio doesn't blow up for large
  // inputs (e.g. refactoring a 500-token snippet doesn't predict 4000 tok).
  const ratioRaw = inputTokens * cfg.ratio;
  const ceiling = Math.max(cfg.minExpected * 5, inputTokens * 3);
  // Cap the raw ratio output, then apply per-user correction last so
  // calibration always has an effect even when the cap is binding.
  const expected = Math.min(ceiling, Math.max(cfg.minExpected, ratioRaw)) * correction;

  return {
    ...lognormalBand(expected, cfg.sigma, cap),
    tier: "archetype",
    archetype,
    sigma: cfg.sigma,
    rationale: `Archetype=${cfg.label} (confidence ${(confidence * 100).toFixed(0)}%); ratio=${cfg.ratio}× input, floor=${cfg.minExpected}${
      correction !== 1 ? `, calibration correction=${correction.toFixed(2)}×` : ""
    }.`,
    taskClass: ARCHETYPE_TO_TASK[archetype],
    correctionFactor: correction,
    reasoningHeavy: cfg.reasoningHeavy,
  };
}

// ---------- Public entry point --------------------------------------

export interface PredictOptions {
  /** Per-user calibration corrections (output by the feedback loop). */
  correctionFactors?: Partial<Record<Archetype, number>>;
  /** Per-user overrides for the archetype ratios. */
  archetypeOverrides?: Partial<Record<Archetype, ArchetypeConfig>>;
}

export function predictOutput(
  inputTokens: number,
  prompt: string,
  model: ModelInfo,
  options: PredictOptions = {},
): OutputPrediction {
  const t1 = tier1Deterministic(prompt, model);
  if (t1) return t1;
  const t2 = tier2Structural(prompt, model);
  if (t2) return t2;
  return tier3Archetype(prompt, inputTokens, model, options.archetypeOverrides, options.correctionFactors);
}
