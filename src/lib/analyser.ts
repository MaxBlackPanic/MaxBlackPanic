/**
 * Prompt efficiency analyser.
 *
 * Returns a ranked list of suggestions. Each suggestion carries an estimated
 * token saving, a confidence rating, and (where deterministic) a one-click
 * `apply` function that rewrites the prompt.
 *
 * Detectors implemented:
 *  - Verbosity: filler phrases.
 *  - Redundant instructions.
 *  - Structural rewrite (paragraph -> tagged spec).
 *  - Whitespace / Markdown bloat.
 *  - Few-shot example overload.
 *  - Output constraint missing.
 *  - Cache opportunity.
 *  - Compression suggestion.
 *  - Model routing recommendation.
 */

import type { ModelInfo, TaskClass } from "./models";

export type SuggestionSeverity = "info" | "low" | "medium" | "high";
export type SuggestionConfidence = "low" | "medium" | "high";

export interface PromptSuggestion {
  id: string;
  title: string;
  detail: string;
  severity: SuggestionSeverity;
  confidence: SuggestionConfidence;
  /** Estimated saved tokens for this single fix (signed; negative means adds tokens). */
  estimatedTokenSaving: number;
  /** Inline range to underline in the editor [startOffset, endOffset). */
  ranges?: Array<{ start: number; end: number; hint?: string }>;
  /** If present, can be auto-applied to produce a rewritten prompt. */
  apply?: (text: string) => string;
  /** Optional category tag for grouping. */
  category:
    | "verbosity"
    | "redundancy"
    | "structure"
    | "whitespace"
    | "examples"
    | "output"
    | "cache"
    | "compression"
    | "routing";
}

// ----- Verbosity detection --------------------------------------------------

const FILLER_PHRASES: Array<{ re: RegExp; replacement: string; tokens: number }> = [
  { re: /\bplease\s+could\s+you\s+please\b/gi, replacement: "", tokens: 4 },
  { re: /\bplease\s+could\s+you\b/gi, replacement: "", tokens: 3 },
  { re: /\bcould\s+you\s+please\b/gi, replacement: "", tokens: 3 },
  { re: /\bi\s+would\s+like\s+you\s+to\b/gi, replacement: "", tokens: 5 },
  { re: /\bi\s+want\s+you\s+to\b/gi, replacement: "", tokens: 4 },
  { re: /\bi\s+need\s+you\s+to\b/gi, replacement: "", tokens: 4 },
  { re: /\bin\s+order\s+to\b/gi, replacement: "to", tokens: 2 },
  { re: /\bit\s+is\s+important\s+that\s+you\b/gi, replacement: "", tokens: 5 },
  { re: /\bplease\s+make\s+sure\s+(that\s+)?you\b/gi, replacement: "", tokens: 4 },
  { re: /\bmake\s+sure\s+(that\s+)?you\b/gi, replacement: "", tokens: 3 },
  { re: /\bif\s+you\s+would\s+be\s+so\s+kind\s+as\s+to\b/gi, replacement: "", tokens: 7 },
  { re: /\bgo\s+ahead\s+and\b/gi, replacement: "", tokens: 3 },
  { re: /\bfeel\s+free\s+to\b/gi, replacement: "", tokens: 3 },
  { re: /\bas\s+an\s+ai\s+(language\s+)?model\b/gi, replacement: "", tokens: 5 },
  { re: /\bbasically\b/gi, replacement: "", tokens: 1 },
  { re: /\bactually\b/gi, replacement: "", tokens: 1 },
  { re: /\bvery\s+important\b/gi, replacement: "important", tokens: 1 },
  { re: /\bthe\s+fact\s+that\b/gi, replacement: "that", tokens: 2 },
  { re: /\ba\s+number\s+of\b/gi, replacement: "several", tokens: 2 },
  { re: /\bwith\s+regard\s+to\b/gi, replacement: "about", tokens: 2 },
  { re: /\bin\s+the\s+event\s+that\b/gi, replacement: "if", tokens: 3 },
  { re: /\bat\s+this\s+point\s+in\s+time\b/gi, replacement: "now", tokens: 4 },
  { re: /\bdue\s+to\s+the\s+fact\s+that\b/gi, replacement: "because", tokens: 4 },
];

function detectVerbosity(text: string): PromptSuggestion[] {
  const hits: Array<{ start: number; end: number; tokens: number; src: string }> = [];
  for (const { re, tokens } of FILLER_PHRASES) {
    for (const m of text.matchAll(re)) {
      hits.push({
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        tokens,
        src: m[0],
      });
    }
  }
  if (hits.length === 0) return [];
  const total = hits.reduce((a, h) => a + h.tokens, 0);
  return [
    {
      id: "verbosity",
      title: `Remove ${hits.length} filler ${hits.length === 1 ? "phrase" : "phrases"}`,
      detail:
        "Conversational filler like “please could you” or “in order to” adds 3–8 tokens each without changing the instruction.",
      severity: total > 30 ? "high" : total > 10 ? "medium" : "low",
      confidence: "high",
      estimatedTokenSaving: total,
      ranges: hits.map((h) => ({ start: h.start, end: h.end, hint: `−${h.tokens} tokens` })),
      apply: (t) => {
        let out = t;
        for (const { re, replacement } of FILLER_PHRASES) out = out.replace(re, replacement);
        // Tidy: collapse runs of inline spaces (preserving newlines), fix dangling
        // punctuation, drop trailing whitespace per line, and capitalise the first
        // letter of each sentence that the removal left lowercased.
        out = out
          .replace(/[ \t]{2,}/g, " ")
          .replace(/[ \t]+([.,;:!?])/g, "$1")
          .replace(/([.,;:!?])\s+(?=[.,;:!?])/g, "$1")
          .replace(/\b([.,])\s+only\b/gi, " only$1")
          .replace(/[ \t]+$/gm, "")
          .replace(/^[ \t]+/gm, (m, _o, s) => (s.endsWith("\n") ? m : ""));
        // Capitalise sentence starts after punctuation + space.
        out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p, c) => p + c.toUpperCase());
        return out.trim();
      },
      category: "verbosity",
    },
  ];
}

// ----- Redundant instructions ----------------------------------------------

const REDUNDANT_DIRECTIVES = [
  { name: "be concise", re: /\b(be\s+concise|keep\s+it\s+short|stay\s+brief|be\s+brief)\b/gi },
  { name: "respond in JSON", re: /\b(respond|return|reply|output)\s+(only\s+)?(in\s+)?(json|valid\s+json)(\s+only)?\s*\.?/gi },
  { name: "do not explain", re: /\b(do\s+not|don['’]t)\s+(explain|apolog(ize|ise)|preamble)\b/gi },
  { name: "step by step", re: /\bstep[- ]?by[- ]?step\b/gi },
  { name: "no markdown", re: /\b(no|without|do\s+not\s+use)\s+markdown\b/gi },
];

function detectRedundancy(text: string): PromptSuggestion[] {
  const out: PromptSuggestion[] = [];
  for (const d of REDUNDANT_DIRECTIVES) {
    const matches = Array.from(text.matchAll(d.re));
    if (matches.length > 1) {
      const ranges = matches.map((m) => ({
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        hint: "duplicate directive",
      }));
      const saving = (matches.length - 1) * 4;
      out.push({
        id: `redundancy-${d.name.replace(/\s+/g, "-")}`,
        title: `“${d.name}” repeated ${matches.length} times`,
        detail: "Repeated directives don't reinforce — consolidate to a single instruction.",
        severity: "medium",
        confidence: "high",
        estimatedTokenSaving: saving,
        ranges,
        apply: (t) => {
          let seen = false;
          return t.replace(d.re, (m) => {
            if (seen) return "";
            seen = true;
            return m;
          });
        },
        category: "redundancy",
      });
    }
  }
  return out;
}

// ----- Structure rewrite ----------------------------------------------------

function detectStructure(text: string, inputTokens: number): PromptSuggestion[] {
  const looksUnstructured =
    inputTokens > 200 &&
    !/<role>|<task>|<output_format>|<context>|<instructions>/i.test(text) &&
    text.split(/\n\s*\n/).length < 3;
  if (!looksUnstructured) return [];

  return [
    {
      id: "structure",
      title: "Convert paragraph prompt to a tagged spec",
      detail:
        "Structured prompts using <role>, <task>, <context>, <output_format> sections typically run 15–30% shorter for the same semantic content and reduce ambiguity.",
      severity: "medium",
      confidence: "medium",
      estimatedTokenSaving: Math.round(inputTokens * 0.18),
      apply: (t) => {
        // Heuristic stub — split paragraphs into spec sections.
        const paragraphs = t.split(/\n\s*\n+/).filter(Boolean);
        const role = paragraphs[0] ?? "";
        const task = paragraphs[1] ?? paragraphs[0] ?? "";
        const rest = paragraphs.slice(2).join("\n\n");
        return [
          "<role>",
          role.trim(),
          "</role>",
          "<task>",
          task.trim(),
          "</task>",
          rest.trim() ? "<context>\n" + rest.trim() + "\n</context>" : "",
          "<output_format>\nReturn the result with no preamble.\n</output_format>",
        ]
          .filter(Boolean)
          .join("\n");
      },
      category: "structure",
    },
  ];
}

// ----- Whitespace / Markdown bloat -----------------------------------------

function detectWhitespace(text: string): PromptSuggestion[] {
  const tabs = (text.match(/\t/g) || []).length;
  const doubleSpaces = (text.match(/ {2,}/g) || []).length;
  const blankRuns = (text.match(/\n{3,}/g) || []).length;
  const trailing = (text.match(/[ \t]+$/gm) || []).length;
  const totalIssues = tabs + doubleSpaces + blankRuns + trailing;
  if (totalIssues === 0) return [];

  // Each tab/extra-space/extra-newline costs roughly 1 token in BPE tokenisers.
  const saving = tabs + doubleSpaces + blankRuns * 2 + trailing;
  return [
    {
      id: "whitespace",
      title: `Normalise whitespace (${totalIssues} issues)`,
      detail:
        "Tabs, double spaces, trailing whitespace, and runs of blank lines each consume their own token in most BPE tokenisers.",
      severity: saving > 20 ? "medium" : "low",
      confidence: "high",
      estimatedTokenSaving: saving,
      apply: (t) =>
        t
          .replace(/\t/g, "  ")
          .replace(/[ \t]+$/gm, "")
          .replace(/ {2,}/g, " ")
          .replace(/\n{3,}/g, "\n\n"),
      category: "whitespace",
    },
  ];
}

// ----- Few-shot overload ----------------------------------------------------

function detectExamples(text: string): PromptSuggestion[] {
  // Count blocks introduced by "Example N:" or "### Example" or "<example>" tags.
  const numbered = text.match(/^\s*example\s*\d+\s*[:.]/gim) || [];
  const tagged = text.match(/<example[\s>]/gi) || [];
  const totalExamples = Math.max(numbered.length, tagged.length);
  if (totalExamples < 4) return [];

  return [
    {
      id: "examples",
      title: `Reduce ${totalExamples} few-shot examples to 2`,
      detail:
        "Few-shot accuracy gains drop sharply after the second example for most tasks. Removing the rest typically cuts prompt size 30–50%.",
      severity: "medium",
      confidence: "medium",
      estimatedTokenSaving: Math.round((totalExamples - 2) * 80),
      category: "examples",
    },
  ];
}

// ----- Boilerplate / "the following X" -------------------------------------

const BOILERPLATE_PHRASES: Array<{ re: RegExp; replacement: string; tokens: number }> = [
  { re: /\bthe\s+following\s+(text|content|document|input|data|message|prompt)\s*[:.,]?/gi, replacement: "below:", tokens: 3 },
  { re: /\bas\s+(an|the)\s+(expert|professional|experienced)\b[,]?\s*/gi, replacement: "", tokens: 3 },
  { re: /\byour\s+task\s+is\s+to\s+/gi, replacement: "", tokens: 4 },
  { re: /\bthe\s+goal\s+is\s+to\s+/gi, replacement: "", tokens: 4 },
  { re: /\bbefore\s+(you\s+)?(begin|start|respond),?\s+(please\s+)?/gi, replacement: "", tokens: 4 },
  { re: /\bwithout\s+further\s+ado,?\s+/gi, replacement: "", tokens: 3 },
];

function detectBoilerplate(text: string): PromptSuggestion[] {
  const hits: Array<{ start: number; end: number; tokens: number }> = [];
  for (const { re, tokens } of BOILERPLATE_PHRASES) {
    for (const m of text.matchAll(re)) {
      hits.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, tokens });
    }
  }
  if (hits.length === 0) return [];
  const total = hits.reduce((a, h) => a + h.tokens, 0);
  return [
    {
      id: "boilerplate",
      title: `Strip ${hits.length} boilerplate ${hits.length === 1 ? "phrase" : "phrases"}`,
      detail:
        "Phrases like “your task is to”, “as an expert”, or “the following document” add tokens without adding instruction. The model already knows it has a task and what's adjacent in the prompt.",
      severity: total > 15 ? "medium" : "low",
      confidence: "high",
      estimatedTokenSaving: total,
      ranges: hits.map((h) => ({ start: h.start, end: h.end, hint: `−${h.tokens} tokens` })),
      apply: (t) => {
        let out = t;
        for (const { re, replacement } of BOILERPLATE_PHRASES) out = out.replace(re, replacement);
        return out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/gm, "").trim();
      },
      category: "verbosity",
    },
  ];
}

// ----- Preamble suppression detector ---------------------------------------

function detectPreambleSuppression(text: string): PromptSuggestion[] {
  // If the prompt has no explicit "don't preamble" instruction AND it looks
  // like a JSON / structured-output task, flag it.
  const wantsStructured = /\b(json|yaml|csv|markdown|html|xml)\b/i.test(text);
  const alreadySuppressed = /\b(no\s+preamble|do\s+not\s+explain|without\s+(any\s+)?(preamble|explanation|introduction|apologi))\b/i.test(text);
  if (!wantsStructured || alreadySuppressed) return [];
  return [
    {
      id: "preamble",
      title: "Suppress model preamble",
      detail:
        "Structured-output tasks regularly burn 30–80 output tokens on “Sure, here you go:” style preamble. Add: “Respond with the JSON only, no preamble.”",
      severity: "medium",
      confidence: "medium",
      estimatedTokenSaving: 0,
      category: "output",
    },
  ];
}

// ----- Emoji density -------------------------------------------------------

function detectEmojiBloat(text: string): PromptSuggestion[] {
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const matches = Array.from(text.matchAll(emojiRe));
  if (matches.length < 5) return [];
  const density = matches.length / Math.max(1, text.length);
  if (density < 0.005) return [];
  // Each emoji is typically 1–3 BPE tokens. Estimate 2 tokens each.
  const saving = matches.length * 2;
  return [
    {
      id: "emoji-bloat",
      title: `Remove ${matches.length} emoji`,
      detail:
        "Each emoji takes 1–3 tokens in most BPE tokenisers. Emoji rarely change task quality — strip them from prompts (keep them in OUTPUT instructions only if the deliverable demands them).",
      severity: saving > 30 ? "medium" : "low",
      confidence: "high",
      estimatedTokenSaving: saving,
      apply: (t) => t.replace(emojiRe, "").replace(/[ \t]{2,}/g, " ").trim(),
      category: "verbosity",
    },
  ];
}

// ----- Politeness coda -----------------------------------------------------

const POLITENESS_CODAS: RegExp[] = [
  /\bthank(s|\s+you)(\s+(very\s+much|so\s+much|in\s+advance))?\s*[!.]?$/im,
  /\b(looking\s+forward\s+to\s+(your\s+)?(response|reply)|i\s+appreciate\s+(your|the)\s+(help|assistance))\s*[!.]?$/im,
  /\bbest\s+(regards|wishes)\s*,?\s*$/im,
  /\bcheers\s*[!.]?$/im,
];

function detectPolitenessCoda(text: string): PromptSuggestion[] {
  const hits: Array<{ start: number; end: number }> = [];
  for (const re of POLITENESS_CODAS) {
    const m = text.match(re);
    if (m && typeof m.index === "number") {
      hits.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  if (hits.length === 0) return [];
  return [
    {
      id: "politeness-coda",
      title: "Drop closing politeness",
      detail:
        "“Thanks!”, “Looking forward to your response”, sign-offs etc. cost tokens and don't shape the answer. Models are well-trained on terse prompts.",
      severity: "low",
      confidence: "high",
      estimatedTokenSaving: hits.length * 4,
      ranges: hits,
      apply: (t) => {
        let out = t;
        for (const re of POLITENESS_CODAS) out = out.replace(re, "");
        return out.trimEnd();
      },
      category: "verbosity",
    },
  ];
}

// ----- Repeated emphasis stacking -----------------------------------------

function detectEmphasisStacking(text: string): PromptSuggestion[] {
  const markers = (text.match(/\b(important|note|warning|critical|attention|must)\s*:/gi) || [])
    .length;
  if (markers < 4) return [];
  return [
    {
      id: "emphasis-stacking",
      title: `${markers} stacked emphasis markers`,
      detail:
        "Many “IMPORTANT:” / “NOTE:” / “MUST:” markers in one prompt dilute each other. Keep at most two; promote the rest into the prose or drop them.",
      severity: "low",
      confidence: "medium",
      estimatedTokenSaving: Math.max(0, markers - 2) * 2,
      category: "redundancy",
    },
  ];
}

// ----- Output constraint ----------------------------------------------------

function detectOutputCap(text: string): PromptSuggestion[] {
  if (/\b(max[_\s-]?tokens?|in\s+\d+\s+(words|sentences)|one\s+sentence|tl;?dr|bullet\s+points?)\b/i.test(text)) {
    return [];
  }
  return [
    {
      id: "output-cap",
      title: "Add an output length cap",
      detail:
        "No max_tokens / word count / sentence limit detected. Uncapped output is the single largest source of unexpected cost. Add e.g. “Respond in ≤120 words.”",
      severity: "high",
      confidence: "high",
      estimatedTokenSaving: 0,
      category: "output",
    },
  ];
}

// ----- Cache opportunity ----------------------------------------------------

function detectCacheOpportunity(text: string, inputTokens: number): PromptSuggestion[] {
  if (inputTokens < 1500) return [];
  // Heuristic: if the first half of the prompt is static-looking (long, low pronoun density)
  // and the last quarter contains the user-specific bit, recommend caching.
  const half = text.slice(0, Math.floor(text.length / 2));
  const tail = text.slice(Math.floor(text.length * 0.75));
  const pronouns = (half.match(/\b(I|me|my|you|your|please)\b/gi) || []).length;
  const pronounDensity = pronouns / Math.max(1, half.length / 400);
  if (pronounDensity > 1.5) return [];

  return [
    {
      id: "cache",
      title: "Enable prompt caching for the static prefix",
      detail:
        "The first half of this prompt looks like a stable system/context block. Caching it cuts the input bill to ~10% on cache HITs (5-min or 1-hr TTL on Anthropic; equivalent tiers on OpenAI/Gemini).",
      severity: "high",
      confidence: "medium",
      estimatedTokenSaving: 0, // saving is dollar-based, not token-based — surface in volume calc.
      ranges: [{ start: 0, end: Math.floor(text.length * 0.5), hint: "cacheable" }],
      category: "cache",
    },
  ];
}

// ----- Compression suggestion ----------------------------------------------

function detectCompression(text: string, inputTokens: number): PromptSuggestion[] {
  if (inputTokens < 2000) return [];
  const stopwordDensity =
    (text.match(/\b(the|a|an|of|to|and|or|in|on|at|for|with|that|this)\b/gi) || []).length /
    Math.max(1, text.split(/\s+/).length);
  if (stopwordDensity < 0.25) return [];
  return [
    {
      id: "compression",
      title: "Apply LLMLingua-style compression to context",
      detail:
        "Context block is long and stopword-dense. Removing low-information tokens (stopwords in non-instructional sections) typically yields 20–40% size reduction with minimal task-quality loss.",
      severity: "medium",
      confidence: "low",
      estimatedTokenSaving: Math.round(inputTokens * 0.25),
      category: "compression",
    },
  ];
}

// ----- Routing recommendation ----------------------------------------------

const ROUTING: Record<TaskClass, { vendor: string; suggestion: string }[]> = {
  classification: [
    { vendor: "anthropic", suggestion: "claude-haiku-4-5" },
    { vendor: "openai", suggestion: "gpt-5-4-nano" },
    { vendor: "google", suggestion: "gemini-2-5-flash-lite" },
  ],
  extraction: [
    { vendor: "anthropic", suggestion: "claude-haiku-4-5" },
    { vendor: "openai", suggestion: "gpt-5-4-nano" },
    { vendor: "google", suggestion: "gemini-3-flash" },
  ],
  summarisation: [
    { vendor: "anthropic", suggestion: "claude-haiku-4-5" },
    { vendor: "openai", suggestion: "gpt-5-4-mini" },
    { vendor: "google", suggestion: "gemini-3-flash" },
  ],
  reasoning: [
    { vendor: "anthropic", suggestion: "claude-opus-4-7" },
    { vendor: "openai", suggestion: "gpt-5-5" },
    { vendor: "google", suggestion: "gemini-3-1-pro" },
  ],
  code: [
    { vendor: "anthropic", suggestion: "claude-sonnet-4-6" },
    { vendor: "openai", suggestion: "gpt-5-3-codex" },
    { vendor: "google", suggestion: "gemini-3-5-flash" },
  ],
  creative: [
    { vendor: "anthropic", suggestion: "claude-opus-4-7" },
    { vendor: "openai", suggestion: "gpt-5-4" },
    { vendor: "google", suggestion: "gemini-3-1-pro" },
  ],
  agentic: [
    { vendor: "anthropic", suggestion: "claude-opus-4-7" },
    { vendor: "openai", suggestion: "gpt-5-5" },
    { vendor: "google", suggestion: "gemini-3-1-pro" },
  ],
  general: [
    { vendor: "anthropic", suggestion: "claude-sonnet-4-6" },
    { vendor: "openai", suggestion: "gpt-5-4-mini" },
    { vendor: "google", suggestion: "gemini-3-flash" },
  ],
};

function detectRouting(taskClass: TaskClass): PromptSuggestion[] {
  const recs = ROUTING[taskClass];
  const list = recs.map((r) => r.suggestion).join(", ");
  return [
    {
      id: "routing",
      title: `Task classified as “${taskClass}” — consider routing to a cheaper model`,
      detail: `Recommended models per vendor for ${taskClass}: ${list}.`,
      severity: "info",
      confidence: "medium",
      estimatedTokenSaving: 0,
      category: "routing",
    },
  ];
}

// ----- Entry point ---------------------------------------------------------

export interface AnalysisResult {
  suggestions: PromptSuggestion[];
  /** Sum of saveable tokens across deterministic detectors. */
  totalSaveableTokens: number;
  taskClass: TaskClass;
}

function classifyForRouting(text: string): TaskClass {
  // Lightweight rule classifier — duplicated from outputPredictor on purpose
  // to avoid coupling analyser ↔ predictor.
  if (/\bclassif(y|ier)|label|categori[sz]e\b/i.test(text)) return "classification";
  if (/\bextract|parse|find\s+all|pull\s+out\b/i.test(text)) return "extraction";
  if (/\bsummari[sz]e|tl;?dr|key\s+points\b/i.test(text)) return "summarisation";
  if (/\b(write|implement|refactor|debug)\b.*\b(code|function|class)\b/i.test(text)) return "code";
  if (/\breason|prove|step[- ]?by[- ]?step|analy[sz]e\b/i.test(text)) return "reasoning";
  if (/\b(poem|story|essay|fiction|creative)\b/i.test(text)) return "creative";
  if (/\b(agent|tool[_\s]?call|plan(ner)?|multi[- ]?step)\b/i.test(text)) return "agentic";
  return "general";
}

export function analysePrompt(text: string, inputTokens: number): AnalysisResult {
  const taskClass = classifyForRouting(text);
  const suggestions: PromptSuggestion[] = [
    ...detectVerbosity(text),
    ...detectBoilerplate(text),
    ...detectRedundancy(text),
    ...detectStructure(text, inputTokens),
    ...detectWhitespace(text),
    ...detectEmojiBloat(text),
    ...detectPolitenessCoda(text),
    ...detectEmphasisStacking(text),
    ...detectExamples(text),
    ...detectOutputCap(text),
    ...detectPreambleSuppression(text),
    ...detectCacheOpportunity(text, inputTokens),
    ...detectCompression(text, inputTokens),
    ...detectRouting(taskClass),
  ];

  // Sort: highest token saving first, then severity.
  const sevOrder = { high: 3, medium: 2, low: 1, info: 0 } as const;
  suggestions.sort((a, b) => {
    if (b.estimatedTokenSaving !== a.estimatedTokenSaving) {
      return b.estimatedTokenSaving - a.estimatedTokenSaving;
    }
    return sevOrder[b.severity] - sevOrder[a.severity];
  });

  const totalSaveableTokens = suggestions
    .filter((s) => s.apply)
    .reduce((a, s) => a + s.estimatedTokenSaving, 0);

  return { suggestions, totalSaveableTokens, taskClass };
}
