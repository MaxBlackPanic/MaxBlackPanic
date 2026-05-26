/**
 * Output token prediction. Inherently lossy — we always return a low/expected/high range.
 *
 * Strategy:
 *  1. If the prompt declares an explicit max_tokens / word count / sentence count,
 *     anchor expected to that.
 *  2. Otherwise classify the task and apply a length-scale heuristic:
 *       classification : 0.1 * input
 *       extraction     : 0.3 * input
 *       summarisation  : 0.4 * input
 *       reasoning      : 1.2 * input
 *       code           : 1.5 * input
 *       creative       : 2.0 * input
 *       agentic/general: 1.0 * input
 *  3. Detect length cues: "brief"/"one sentence" → shrink; "comprehensive"/"detailed" → grow.
 *  4. Range = expected × {0.5, 1, 2} clamped to model max_output.
 */

import type { ModelInfo, TaskClass } from "./models";

export interface OutputPrediction {
  low: number;
  expected: number;
  high: number;
  rationale: string;
  taskClass: TaskClass;
}

const LENGTH_FACTORS: Record<TaskClass, number> = {
  classification: 0.1,
  extraction: 0.3,
  summarisation: 0.4,
  reasoning: 1.2,
  code: 1.5,
  creative: 2.0,
  agentic: 1.0,
  general: 1.0,
};

const TASK_KEYWORDS: Array<{ class: TaskClass; words: RegExp }> = [
  { class: "classification", words: /\b(classif(y|ier)|label|categori[sz]e|tag\s+as|which\s+of\s+the\s+following)\b/i },
  { class: "extraction", words: /\b(extract|pull\s+out|find\s+all|list\s+the|parse\s+the|return\s+the\s+json)\b/i },
  { class: "summarisation", words: /\b(summari[sz]e|tl;?dr|in\s+a\s+sentence|abstract\s+of|key\s+points)\b/i },
  { class: "code", words: /\b(write|implement|refactor|debug|fix)\b.*\b(code|function|class|component|module|script|test)\b/i },
  { class: "reasoning", words: /\b(reason|prove|step[- ]?by[- ]?step|chain[- ]?of[- ]?thought|derive|analy[sz]e|why)\b/i },
  { class: "creative", words: /\b(write\s+(a|an)\s+(\w+\s+)?(poem|story|essay|article|novel|script)|creative|fiction|narrative|in\s+the\s+style\s+of)\b/i },
  { class: "agentic", words: /\b(tool\s*call|function\s*call|agent|planner|use\s+the\s+(api|browser|terminal)|multi[- ]?step\s+plan)\b/i },
];

function classifyTask(prompt: string): TaskClass {
  for (const k of TASK_KEYWORDS) {
    if (k.words.test(prompt)) return k.class;
  }
  return "general";
}

function detectExplicitLimit(prompt: string): number | null {
  // max_tokens=NNNN style
  const maxTok = prompt.match(/\bmax[_\s-]?tokens?\s*[:=]\s*(\d{2,6})\b/i);
  if (maxTok) return Math.min(parseInt(maxTok[1], 10), 200_000);

  // "in N words" / "no more than N words"
  const words = prompt.match(/\b(?:in|under|no more than|at most|up to)\s+(\d{2,5})\s+words?\b/i);
  if (words) return Math.ceil(parseInt(words[1], 10) * 1.33);

  // "in N sentences"
  const sentences = prompt.match(/\b(?:in|under|no more than|at most)\s+(\d{1,3})\s+sentences?\b/i);
  if (sentences) return parseInt(sentences[1], 10) * 25;

  // "one sentence"
  if (/\b(one\s+sentence|a\s+single\s+sentence|tl;?dr)\b/i.test(prompt)) return 30;
  if (/\bone-?line\b/i.test(prompt)) return 25;

  return null;
}

function lengthCueMultiplier(prompt: string): number {
  let m = 1;
  if (/\b(brief|short|concise|terse)\b/i.test(prompt)) m *= 0.5;
  if (/\b(comprehensive|detailed|thorough|exhaustive|in[- ]?depth)\b/i.test(prompt)) m *= 2;
  if (/\b(bullet[- ]?points?|bulleted|list\s+of)\b/i.test(prompt)) m *= 0.7;
  return m;
}

export function predictOutput(
  inputTokens: number,
  prompt: string,
  model: ModelInfo,
): OutputPrediction {
  const taskClass = classifyTask(prompt);
  const explicit = detectExplicitLimit(prompt);
  const cap = model.maxOutputTokens;

  let expected: number;
  let rationale: string;

  if (explicit !== null) {
    expected = Math.min(explicit, cap);
    rationale = `Explicit length cap detected (${explicit} tokens); using as expected output.`;
  } else {
    const factor = LENGTH_FACTORS[taskClass];
    const cue = lengthCueMultiplier(prompt);
    expected = Math.round(Math.max(50, inputTokens * factor * cue));
    rationale = `Task=${taskClass}; factor=${factor}×; length-cue mult=${cue}×.`;
  }

  const low = Math.max(20, Math.round(expected * 0.5));
  const high = Math.min(cap, Math.round(expected * 2));
  const expectedClamped = Math.min(expected, cap);

  return { low, expected: expectedClamped, high, rationale, taskClass };
}
