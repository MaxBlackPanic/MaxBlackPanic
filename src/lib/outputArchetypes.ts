/**
 * Output expansion ratios per task archetype.
 *
 * Each ratio is `expected_output_tokens / input_tokens` for a "typical"
 * prompt of that class. These are seed defaults — the calibration feedback
 * loop overrides them per-user once telemetry is ingested.
 *
 * Reference: src/lib/calibration.ts ApplyCorrection().
 */

export type Archetype =
  | "classification"
  | "extraction"
  | "summarisation"
  | "qa"
  | "open"
  | "code"
  | "translation"
  | "rewriting"
  | "agentic";

export interface ArchetypeConfig {
  /** Expected output / input ratio. */
  ratio: number;
  /** Log-normal sigma controlling band width (0.4 = ±50%, 0.8 = ±2× spread). */
  sigma: number;
  /**
   * Minimum expected output. For very short prompts (e.g. "Why is the sky blue?")
   * the ratio model collapses to noise; this floors it at a realistic minimum.
   */
  minExpected: number;
  /** Human-readable summary for the UI. */
  label: string;
  /** Whether reasoning tokens typically dominate (Tier 5 module). */
  reasoningHeavy: boolean;
}

export const ARCHETYPE_DEFAULTS: Record<Archetype, ArchetypeConfig> = {
  classification: { ratio: 0.005, sigma: 0.7, minExpected: 5, label: "Classification", reasoningHeavy: false },
  extraction: { ratio: 0.25, sigma: 0.7, minExpected: 20, label: "Extraction", reasoningHeavy: false },
  summarisation: { ratio: 0.15, sigma: 0.6, minExpected: 50, label: "Summarisation", reasoningHeavy: false },
  qa: { ratio: 1.5, sigma: 1.5, minExpected: 150, label: "Question answering", reasoningHeavy: false },
  open: { ratio: 6.0, sigma: 1.2, minExpected: 600, label: "Open generation", reasoningHeavy: false },
  code: { ratio: 8.0, sigma: 1.2, minExpected: 300, label: "Code generation", reasoningHeavy: true },
  translation: { ratio: 1.1, sigma: 0.35, minExpected: 5, label: "Translation", reasoningHeavy: false },
  rewriting: { ratio: 1.2, sigma: 0.55, minExpected: 30, label: "Rewriting", reasoningHeavy: false },
  agentic: { ratio: 4.0, sigma: 1.3, minExpected: 200, label: "Agentic / tool-use (per turn)", reasoningHeavy: true },
};

/**
 * Rule-based archetype classifier. Returns the best-matching archetype and
 * a confidence score. Order of detection matters — first match wins, with
 * "open" as the catch-all.
 */
const CLASSIFIER: Array<{ archetype: Archetype; re: RegExp; weight: number }> = [
  // Classification — explicit label / pick / categorise patterns.
  { archetype: "classification", re: /\bclassif(y|ier|ication)\b/i, weight: 1 },
  { archetype: "classification", re: /\b(categori[sz]e|label|tag\s+as|which\s+of\s+the\s+following)\b/i, weight: 0.9 },
  { archetype: "classification", re: /\b(positive|negative|neutral|spam|not[- ]spam|toxic|safe)\b.*\b(class|label|categor)/i, weight: 0.9 },

  // Extraction — pull/parse/find/return-json from text.
  { archetype: "extraction", re: /\b(extract|pull\s+out|find\s+all|enumerate)\b/i, weight: 1 },
  { archetype: "extraction", re: /\b(parse|return\s+the\s+json|return\s+as\s+json|to\s+structured\s+(json|data))\b/i, weight: 0.9 },

  // Translation.
  { archetype: "translation", re: /\btranslate\b.*\binto\b/i, weight: 1 },
  { archetype: "translation", re: /\btranslate\s+(this|the\s+following)\b/i, weight: 0.95 },
  { archetype: "translation", re: /\bin\s+(french|german|spanish|japanese|chinese|korean|portuguese|italian|russian|arabic)\b/i, weight: 0.6 },

  // Summarisation.
  { archetype: "summarisation", re: /\bsummari[sz]e\b/i, weight: 1 },
  { archetype: "summarisation", re: /\b(tl;?dr|key\s+points|in\s+a\s+sentence|abstract\s+of)\b/i, weight: 0.85 },

  // Code.
  { archetype: "code", re: /\b(write|implement|refactor|debug|fix|port)\b.*\b(code|function|class|component|module|script|test|method)\b/i, weight: 1 },
  { archetype: "code", re: /\b(in\s+)?(python|typescript|javascript|rust|go|java|c\+\+|kotlin|swift)\b/i, weight: 0.4 },
  { archetype: "code", re: /```[a-z]*\n[\s\S]+?```/, weight: 0.5 },

  // Rewriting.
  { archetype: "rewriting", re: /\b(rewrite|reword|paraphrase|rephrase|edit\s+for|proofread|polish)\b/i, weight: 1 },

  // Agentic / tool use.
  { archetype: "agentic", re: /\b(tool\s*call|function\s*call|agent|planner|use\s+the\s+(api|browser|terminal)|multi[- ]?step\s+plan)\b/i, weight: 1 },
  { archetype: "agentic", re: /<tools?>|<function/i, weight: 0.7 },

  // Question answering — heuristic: ends with a question mark or starts with "what/why/how/when/where/who/which".
  { archetype: "qa", re: /\?\s*$/, weight: 0.7 },
  { archetype: "qa", re: /^\s*(what|why|how|when|where|who|which|can|does|is|are|will|should)\b/i, weight: 0.7 },

  // Open generation.
  { archetype: "open", re: /\b(write\s+(a|an)\s+(\w+\s+)?(poem|story|essay|article|novel|script|blog\s+post|tutorial|guide))\b/i, weight: 1 },
  { archetype: "open", re: /\b(creative|fiction|narrative|in\s+the\s+style\s+of|long\s+form)\b/i, weight: 0.85 },
];

export interface ClassificationResult {
  archetype: Archetype;
  confidence: number;
  matches: Array<{ archetype: Archetype; weight: number }>;
}

export function classify(prompt: string): ClassificationResult {
  const scores: Partial<Record<Archetype, number>> = {};
  const matches: ClassificationResult["matches"] = [];
  for (const c of CLASSIFIER) {
    if (c.re.test(prompt)) {
      scores[c.archetype] = (scores[c.archetype] ?? 0) + c.weight;
      matches.push({ archetype: c.archetype, weight: c.weight });
    }
  }
  let best: Archetype = "open";
  let bestScore = 0;
  for (const [a, s] of Object.entries(scores) as Array<[Archetype, number]>) {
    if (s > bestScore) {
      best = a;
      bestScore = s;
    }
  }
  // Confidence: 0–1 sigmoid on the score (1 weight ≈ ~0.5 confidence).
  const confidence = bestScore === 0 ? 0 : 1 - 1 / (1 + bestScore);
  return { archetype: best, confidence, matches };
}
