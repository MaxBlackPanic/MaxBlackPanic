import { describe, it, expect } from "vitest";
import { predictOutput } from "./outputPredictor";
import { getModel } from "./models";
import { classify } from "./outputArchetypes";

describe("outputPredictor / Tier 1 — deterministic", () => {
  it("honours explicit max_tokens as a hard upper bound", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(1000, "Do the thing. max_tokens=120", m);
    expect(r.tier).toBe("deterministic");
    expect(r.expected).toBe(120);
    expect(r.high).toBe(120); // hard ceiling
    expect(r.low).toBeLessThan(120);
  });

  it("clamps max_tokens to the model's output cap", () => {
    const m = getModel("gemini-2-5-flash-lite"); // cap = 8192
    const r = predictOutput(1000, "max_tokens=99999", m);
    expect(r.expected).toBeLessThanOrEqual(m.maxOutputTokens);
  });

  it("converts 'in N words' to a token estimate at 1.33×", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(500, "Summarise in 100 words.", m);
    expect(r.tier).toBe("deterministic");
    expect(r.expected).toBe(Math.round(100 * 1.33)); // 133
  });

  it("honours 'one sentence' / TL;DR with a tight band", () => {
    const m = getModel("gpt-5-4-mini");
    const r = predictOutput(2000, "Explain quantum entanglement in one sentence.", m);
    expect(r.tier).toBe("deterministic");
    expect(r.expected).toBeLessThanOrEqual(30);
    expect(r.high - r.low).toBeLessThan(60);
  });
});

describe("outputPredictor / Tier 2 — structural", () => {
  it("estimates lists of N items at ~30 tok/item, within 5% of hand-calc", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(500, "Give me 10 examples of palindromes.", m);
    expect(r.tier).toBe("structural");
    // Hand calc: 10 × 30 = 300.
    expect(r.expected).toBeGreaterThanOrEqual(285);
    expect(r.expected).toBeLessThanOrEqual(315);
  });

  it("estimates tables from stated dimensions within 5% of hand-calc", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(500, "Build a table with 5 rows and 4 columns.", m);
    expect(r.tier).toBe("structural");
    // Hand calc: 5 × 4 × 8 + 5 × 2 = 170.
    expect(r.expected).toBeGreaterThanOrEqual(162);
    expect(r.expected).toBeLessThanOrEqual(179);
  });

  it("estimates JSON object from named keys", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(500, "Return a JSON object with keys: name, age, city, role.", m);
    expect(r.tier).toBe("structural");
    // Hand calc: 4 keys × 20 + 10 = 90.
    expect(r.expected).toBeGreaterThanOrEqual(85);
    expect(r.expected).toBeLessThanOrEqual(95);
  });

  it("estimates function + tests as a combined structural footprint", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(500, "Write a function with unit tests for fibonacci.", m);
    expect(r.tier).toBe("structural");
    expect(r.expected).toBeGreaterThanOrEqual(400);
    expect(r.expected).toBeLessThanOrEqual(500);
  });

  it("falls through to archetype when no structural signal is present", () => {
    const m = getModel("gpt-5-4");
    const r = predictOutput(500, "Tell me about the history of Rome.", m);
    expect(r.tier).toBe("archetype");
  });
});

describe("outputPredictor / Tier 3 — archetype", () => {
  it("classification picks tiny output", () => {
    const m = getModel("claude-haiku-4-5");
    const r = predictOutput(1000, "Classify this review as positive, negative, or neutral.", m);
    expect(r.tier).toBe("archetype");
    expect(r.archetype).toBe("classification");
    expect(r.expected).toBeLessThan(50);
  });

  it("code generation produces a band with low<expected<high, capped at 3× input", () => {
    const m = getModel("gpt-5-3-codex");
    const r = predictOutput(500, "Write a Python function to compute Levenshtein distance.", m);
    expect(r.tier).toBe("archetype");
    expect(r.archetype).toBe("code");
    // ratio=8.0 raw → 4000, capped at max(min*5=1500, input*3=1500) = 1500.
    expect(r.expected).toBe(1500);
    expect(r.high).toBeGreaterThan(r.expected);
    expect(r.low).toBeLessThan(r.expected);
  });

  it("code with small input is floored at minExpected", () => {
    const m = getModel("gpt-5-3-codex");
    const r = predictOutput(10, "Write a Python fibonacci function.", m);
    expect(r.archetype).toBe("code");
    // raw = 10*8 = 80, floored to minExpected=300.
    expect(r.expected).toBe(300);
  });

  it("translation has a tight band (sigma=0.3)", () => {
    const m = getModel("gpt-5-4-mini");
    const r = predictOutput(500, "Translate the following into Japanese: Hello, world!", m);
    expect(r.tier).toBe("archetype");
    expect(r.archetype).toBe("translation");
    expect(r.sigma).toBeLessThan(0.4);
  });

  it("applies user correction factor when provided", () => {
    const m = getModel("gpt-5-4");
    const base = predictOutput(1000, "Tell me about Rome.", m);
    const corrected = predictOutput(1000, "Tell me about Rome.", m, {
      correctionFactors: { open: 0.5 },
    });
    if (base.archetype === "open") {
      expect(corrected.expected).toBeLessThan(base.expected);
      expect(corrected.correctionFactor).toBe(0.5);
    } else {
      // If classifier didn't pick "open" for that text, just ensure correction passes through.
      expect(corrected.correctionFactor).toBe(1);
    }
  });
});

describe("outputPredictor / archetype band coverage", () => {
  /**
   * Mini labelled corpus. Each entry: prompt + actual_output_tokens.
   * The expected band [low, high] should contain `actual` at least 80% of the time.
   */
  const CORPUS: Array<{ prompt: string; actual: number; inputTokens: number }> = [
    { prompt: "Classify this email as spam or not spam.", actual: 5, inputTokens: 80 },
    { prompt: "Classify the sentiment of this review.", actual: 8, inputTokens: 60 },
    { prompt: "Categorise this issue as bug, feature, or question.", actual: 6, inputTokens: 50 },
    { prompt: "Label these messages as positive or negative class.", actual: 12, inputTokens: 100 },
    { prompt: "Extract all email addresses from the text.", actual: 40, inputTokens: 200 },
    { prompt: "Pull out the company names from this paragraph.", actual: 30, inputTokens: 180 },
    { prompt: "Find all numbers in the data.", actual: 60, inputTokens: 250 },
    { prompt: "Return the JSON with extracted entities.", actual: 80, inputTokens: 300 },
    { prompt: "Summarise this article.", actual: 150, inputTokens: 800 },
    { prompt: "Summarise this report in a few sentences.", actual: 80, inputTokens: 600 },
    { prompt: "Summarise the key points.", actual: 90, inputTokens: 500 },
    { prompt: "Summarise the meeting transcript.", actual: 200, inputTokens: 1500 },
    { prompt: "What is the capital of France?", actual: 4, inputTokens: 10 },
    { prompt: "Why is the sky blue?", actual: 250, inputTokens: 8 },
    { prompt: "How does photosynthesis work?", actual: 350, inputTokens: 8 },
    { prompt: "What are the main causes of inflation?", actual: 500, inputTokens: 12 },
    { prompt: "When was the Treaty of Westphalia signed?", actual: 50, inputTokens: 12 },
    { prompt: "Write a story about a robot that learns to paint.", actual: 1200, inputTokens: 15 },
    { prompt: "Write a poem about autumn.", actual: 200, inputTokens: 8 },
    { prompt: "Write an article about climate change.", actual: 1500, inputTokens: 10 },
    { prompt: "Write a novel chapter about a heist.", actual: 2000, inputTokens: 12 },
    { prompt: "Write a Python function to reverse a string.", actual: 80, inputTokens: 12 },
    { prompt: "Write a Python class for a linked list.", actual: 400, inputTokens: 12 },
    { prompt: "Write a TypeScript function to debounce calls.", actual: 200, inputTokens: 12 },
    { prompt: "Write a Java class for a binary search tree.", actual: 600, inputTokens: 14 },
    { prompt: "Refactor this code into smaller functions.", actual: 700, inputTokens: 500 },
    { prompt: "Debug this Python script.", actual: 400, inputTokens: 250 },
    { prompt: "Implement a Rust function for quicksort.", actual: 300, inputTokens: 12 },
    { prompt: "Translate the following into French: Good morning.", actual: 4, inputTokens: 12 },
    { prompt: "Translate this paragraph into German.", actual: 220, inputTokens: 200 },
    { prompt: "Translate the document into Spanish.", actual: 1100, inputTokens: 1000 },
    { prompt: "Translate the email into Japanese.", actual: 120, inputTokens: 110 },
    { prompt: "Rewrite this for clarity.", actual: 180, inputTokens: 150 },
    { prompt: "Paraphrase the following sentence.", actual: 25, inputTokens: 20 },
    { prompt: "Proofread this paragraph and suggest edits.", actual: 250, inputTokens: 200 },
    { prompt: "Polish this opening line.", actual: 30, inputTokens: 25 },
    { prompt: "Use the search tool to find recent articles, then summarise.", actual: 400, inputTokens: 60 },
    { prompt: "Plan a multi-step approach to solve this problem.", actual: 350, inputTokens: 80 },
    { prompt: "Call the function calculator with the right arguments.", actual: 50, inputTokens: 40 },
    { prompt: "Use the API to fetch user data and report.", actual: 300, inputTokens: 50 },
    // QA mix
    { prompt: "Who wrote Hamlet?", actual: 5, inputTokens: 8 },
    { prompt: "What is the meaning of life?", actual: 200, inputTokens: 10 },
    { prompt: "Where is Mount Everest located?", actual: 30, inputTokens: 8 },
    { prompt: "How do vaccines work?", actual: 300, inputTokens: 8 },
    // Mixed open
    { prompt: "Brainstorm marketing ideas for a coffee brand.", actual: 400, inputTokens: 25 },
    { prompt: "List 20 names for a startup in fintech.", actual: 600, inputTokens: 15 },
    { prompt: "Generate a business plan outline for a SaaS.", actual: 800, inputTokens: 18 },
    { prompt: "Describe the architecture of a microservices system.", actual: 700, inputTokens: 15 },
    { prompt: "Compare React and Vue.", actual: 600, inputTokens: 8 },
    { prompt: "Explain the theory of relativity.", actual: 700, inputTokens: 8 },
  ];

  it("expected estimate sits within [low, high] for ≥80% of the corpus", () => {
    const m = getModel("gpt-5-4");
    let hits = 0;
    for (const ex of CORPUS) {
      const r = predictOutput(ex.inputTokens, ex.prompt, m);
      if (ex.actual >= r.low && ex.actual <= r.high) hits++;
    }
    const coverage = hits / CORPUS.length;
    expect(coverage, `Coverage ${(coverage * 100).toFixed(1)}% (${hits}/${CORPUS.length})`).toBeGreaterThanOrEqual(0.8);
  });
});

describe("outputPredictor / classifier", () => {
  it("classifies common archetypes", () => {
    expect(classify("Classify this email.").archetype).toBe("classification");
    expect(classify("Extract all dates.").archetype).toBe("extraction");
    expect(classify("Summarise the article.").archetype).toBe("summarisation");
    expect(classify("Translate this into French.").archetype).toBe("translation");
    expect(classify("Write a Python function.").archetype).toBe("code");
    expect(classify("Rewrite this paragraph.").archetype).toBe("rewriting");
    expect(classify("Use the tool call to fetch data.").archetype).toBe("agentic");
    expect(classify("Write a story about a dog.").archetype).toBe("open");
    expect(classify("What is the capital of France?").archetype).toBe("qa");
  });

  it("falls back to 'open' when nothing fires", () => {
    expect(classify("Hello there friend").archetype).toBe("open");
  });
});
