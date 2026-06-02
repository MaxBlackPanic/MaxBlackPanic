import { describe, it, expect } from "vitest";
import { countOpenAI, estimateOffline, messageOverhead, countTokens } from "./tokens";
import { getModel } from "./pricing";

describe("countOpenAI", () => {
  it("returns 0 for empty text and is exact", () => {
    const c = countOpenAI("");
    expect(c.tokens).toBe(0);
    expect(c.exact).toBe(true);
  });

  it("counts a known short string exactly", () => {
    const c = countOpenAI("hello world");
    expect(c.exact).toBe(true);
    expect(c.tokens).toBeGreaterThan(0);
    expect(c.low).toBe(c.tokens);
    expect(c.high).toBe(c.tokens);
  });
});

describe("estimateOffline", () => {
  it("is never exact and carries a range", () => {
    const c = estimateOffline("The quick brown fox jumps over the lazy dog.");
    expect(c.exact).toBe(false);
    expect(c.low).toBeLessThanOrEqual(c.tokens);
    expect(c.high).toBeGreaterThanOrEqual(c.tokens);
  });

  it("uses ~4 chars/token for Latin prose", () => {
    const text = "a".repeat(400);
    const c = estimateOffline(text);
    expect(c.tokens).toBe(100);
  });

  it("widens the band for non-Latin text", () => {
    const latin = estimateOffline("hello there friend, how are you today");
    const cjk = estimateOffline("你好世界你好世界你好世界你好世界你好世界");
    const latinSpread = (latin.high - latin.low) / latin.tokens;
    const cjkSpread = (cjk.high - cjk.low) / cjk.tokens;
    expect(cjkSpread).toBeGreaterThan(latinSpread);
  });
});

describe("messageOverhead", () => {
  it("adds 4 tokens per turn", () => {
    expect(messageOverhead(1)).toBe(4);
    expect(messageOverhead(3)).toBe(12);
  });
  it("never negative", () => {
    expect(messageOverhead(-2)).toBe(0);
  });
});

describe("countTokens routing", () => {
  it("uses exact tiktoken for OpenAI models without network", async () => {
    const c = await countTokens("hello world", getModel("gpt-5.4"));
    expect(c.exact).toBe(true);
    expect(c.source).toContain("tiktoken");
  });
});
