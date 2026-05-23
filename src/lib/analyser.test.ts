import { describe, it, expect } from "vitest";
import { analysePrompt } from "./analyser";

describe("analyser / verbosity", () => {
  it("detects and removes common filler phrases", () => {
    const text =
      "Please could you go ahead and summarise this in order to help me understand it. I would like you to be brief.";
    const r = analysePrompt(text, 30);
    const v = r.suggestions.find((s) => s.id === "verbosity");
    expect(v).toBeDefined();
    expect(v!.estimatedTokenSaving).toBeGreaterThan(0);
    expect(v!.apply).toBeDefined();
    const after = v!.apply!(text);
    expect(after.length).toBeLessThan(text.length);
    expect(after.toLowerCase()).not.toContain("please could you");
  });

  it("rewrite preserves paragraph breaks and capitalises sentences", () => {
    const text =
      "You are an analyst.\n\nPlease could you analyse the data. I would like you to be thorough.";
    const r = analysePrompt(text, 25);
    const v = r.suggestions.find((s) => s.id === "verbosity")!;
    const after = v.apply!(text);
    // Paragraph break preserved.
    expect(after).toMatch(/analyst\.\n\n/);
    // Sentences start with capitals.
    expect(after).toMatch(/\nAnalyse the data/);
    expect(after).toMatch(/Be thorough/);
  });
});

describe("analyser / redundancy", () => {
  it("flags repeated directives", () => {
    const text =
      "Respond in JSON. Be concise. Also, respond in JSON only. Don't forget to respond in valid JSON.";
    const r = analysePrompt(text, 30);
    const redundancy = r.suggestions.find((s) => s.id.startsWith("redundancy-"));
    expect(redundancy).toBeDefined();
  });
});

describe("analyser / whitespace", () => {
  it("detects tabs and multiple blank lines", () => {
    const text = "Hello\t\tworld\n\n\n\nThis  has  double  spaces.";
    const r = analysePrompt(text, 20);
    const w = r.suggestions.find((s) => s.id === "whitespace");
    expect(w).toBeDefined();
    const after = w!.apply!(text);
    expect(after).not.toMatch(/\t/);
    expect(after).not.toMatch(/ {2,}/);
    expect(after).not.toMatch(/\n{3,}/);
  });
});

describe("analyser / output cap", () => {
  it("flags missing output cap when no length cue is present", () => {
    const r = analysePrompt("Write a detailed analysis of the document.", 20);
    expect(r.suggestions.some((s) => s.id === "output-cap")).toBe(true);
  });

  it("does NOT flag when an explicit max_tokens is present", () => {
    const r = analysePrompt("Write the answer. max_tokens=500", 20);
    expect(r.suggestions.some((s) => s.id === "output-cap")).toBe(false);
  });

  it("does NOT flag for one-sentence requests", () => {
    const r = analysePrompt("Summarise the document in one sentence.", 20);
    expect(r.suggestions.some((s) => s.id === "output-cap")).toBe(false);
  });
});

describe("analyser / routing", () => {
  it("classifies code task and recommends code-suited models", () => {
    const r = analysePrompt(
      "Write a Python function to compute the Levenshtein distance between two strings.",
      40,
    );
    expect(r.taskClass).toBe("code");
    const routing = r.suggestions.find((s) => s.id === "routing");
    expect(routing).toBeDefined();
    expect(routing!.detail).toContain("claude-sonnet-4-6");
  });

  it("classifies classification task", () => {
    const r = analysePrompt(
      "Classify the following customer message as positive, negative, or neutral.",
      40,
    );
    expect(r.taskClass).toBe("classification");
  });
});

describe("analyser / suggestions sorted by savings then severity", () => {
  it("highest token saving first", () => {
    const text =
      "Please could you please could you go ahead and in order to do this thing for me.\n\n\n\nTabs\there.  Double  spaces.";
    const r = analysePrompt(text, 40);
    for (let i = 1; i < r.suggestions.length; i++) {
      const a = r.suggestions[i - 1].estimatedTokenSaving;
      const b = r.suggestions[i].estimatedTokenSaving;
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });
});
