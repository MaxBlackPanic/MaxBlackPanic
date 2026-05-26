"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_COMPARE_IDS } from "./models";
import type { Tier } from "./pricing";

export interface ImageAttachment {
  id: string;
  label: string;
  width: number;
  height: number;
}

interface TokenBurnState {
  prompt: string;
  system: string;
  showSystem: boolean;

  /** Optimised prompt — populated when the user applies suggestions. */
  optimisedPrompt: string | null;

  /** Manual A/B compare mode. When true, promptB is rendered as a second editor. */
  abMode: boolean;
  promptB: string;

  /** Optional conversation history concatenated as a single string. */
  history: string;
  /** Optional tool / function schemas (each is a JSON string). */
  tools: string[];
  /** Image attachments. */
  images: ImageAttachment[];
  /** PDF page count. */
  pdfPages: number;
  showAttachments: boolean;

  selectedModelIds: string[];
  tier: Tier;
  reasoningBudget: number;
  cachedInputFraction: number;
  /** Tokens being WRITTEN to the cache this call. Billed at base × multiplier. */
  cacheWriteTokens: number;
  cacheWriteTtl: "5m" | "1h";

  callsPerDay: number;
  showVolume: boolean;

  /** Exact-count opt-in. Persisted so users don't re-toggle on every visit. */
  exactCountEnabled: boolean;
  /** API keys are kept in memory only — never persisted. */
  anthropicApiKey: string;
  geminiApiKey: string;

  darkMode: boolean;

  setPrompt: (p: string) => void;
  setSystem: (s: string) => void;
  setShowSystem: (v: boolean) => void;

  setOptimisedPrompt: (p: string | null) => void;
  acceptOptimisation: () => void;
  revertOptimisation: () => void;

  setAbMode: (v: boolean) => void;
  setPromptB: (p: string) => void;
  /** Swap A and B. */
  swapAB: () => void;
  /** Promote B to A, clear B, exit A/B mode. */
  acceptB: () => void;

  setHistory: (h: string) => void;
  setTools: (t: string[]) => void;
  addTool: () => void;
  updateTool: (i: number, v: string) => void;
  removeTool: (i: number) => void;
  addImage: (img: ImageAttachment) => void;
  removeImage: (id: string) => void;
  setPdfPages: (n: number) => void;
  setShowAttachments: (v: boolean) => void;

  toggleModel: (id: string) => void;
  setSelectedModelIds: (ids: string[]) => void;
  setTier: (t: Tier) => void;
  setReasoningBudget: (n: number) => void;
  setCachedInputFraction: (f: number) => void;
  setCacheWriteTokens: (n: number) => void;
  setCacheWriteTtl: (ttl: "5m" | "1h") => void;

  setCallsPerDay: (n: number) => void;
  toggleVolume: () => void;

  setExactCountEnabled: (v: boolean) => void;
  setAnthropicApiKey: (k: string) => void;
  setGeminiApiKey: (k: string) => void;

  toggleDarkMode: () => void;

  /** Reset the prompt/system/attachments to the seeded defaults. */
  resetPrompt: () => void;
}

const DEFAULT_PROMPT = `You are a senior data analyst.

Please could you go ahead and analyse the following Q1 sales report and tell me which product categories grew the most, which declined, and which seem to have plateaued. In order to be helpful, I would like you to be thorough and detailed in your analysis. It is important that you respond in JSON. Respond in JSON only.

Q1 Sales Report:
- Widgets: $1.2M (vs $1.0M Q4)
- Gadgets: $800K (vs $900K Q4)
- Sprockets: $500K (vs $500K Q4)
- Cogs: $2.1M (vs $1.8M Q4)
- Doohickeys: $300K (vs $500K Q4)`;

const DEFAULT_PROMPT_B = `You are a senior data analyst.

Analyse the Q1 sales report below. Identify categories that grew, declined, or plateaued. Respond in JSON with keys: growing, declining, plateaued.

Q1 Sales Report:
- Widgets: $1.2M (vs $1.0M Q4)
- Gadgets: $800K (vs $900K Q4)
- Sprockets: $500K (vs $500K Q4)
- Cogs: $2.1M (vs $1.8M Q4)
- Doohickeys: $300K (vs $500K Q4)`;

const INITIAL = {
  prompt: DEFAULT_PROMPT,
  system: "",
  showSystem: false,
  optimisedPrompt: null as string | null,

  abMode: false,
  promptB: DEFAULT_PROMPT_B,

  history: "",
  tools: [] as string[],
  images: [] as ImageAttachment[],
  pdfPages: 0,
  showAttachments: false,

  selectedModelIds: DEFAULT_COMPARE_IDS,
  tier: "standard" as Tier,
  reasoningBudget: 0,
  cachedInputFraction: 0,
  cacheWriteTokens: 0,
  cacheWriteTtl: "5m" as const,

  callsPerDay: 1000,
  showVolume: false,

  exactCountEnabled: false,
  anthropicApiKey: "",
  geminiApiKey: "",

  darkMode: true,
};

export const useTokenBurnStore = create<TokenBurnState>()(
  persist(
    (set) => ({
      ...INITIAL,

      setPrompt: (prompt) => set({ prompt }),
      setSystem: (system) => set({ system }),
      setShowSystem: (showSystem) => set({ showSystem }),

      setOptimisedPrompt: (optimisedPrompt) => set({ optimisedPrompt }),
      acceptOptimisation: () =>
        set((s) =>
          s.optimisedPrompt ? { prompt: s.optimisedPrompt, optimisedPrompt: null } : s,
        ),
      revertOptimisation: () => set({ optimisedPrompt: null }),

      setAbMode: (abMode) => set({ abMode }),
      setPromptB: (promptB) => set({ promptB }),
      swapAB: () => set((s) => ({ prompt: s.promptB, promptB: s.prompt })),
      acceptB: () =>
        set((s) => ({ prompt: s.promptB, promptB: DEFAULT_PROMPT_B, abMode: false })),

      setHistory: (history) => set({ history }),
      setTools: (tools) => set({ tools }),
      addTool: () =>
        set((s) => ({
          tools: [...s.tools, '{\n  "name": "new_tool",\n  "parameters": {}\n}'],
        })),
      updateTool: (i, v) =>
        set((s) => ({ tools: s.tools.map((t, idx) => (idx === i ? v : t)) })),
      removeTool: (i) => set((s) => ({ tools: s.tools.filter((_, idx) => idx !== i) })),
      addImage: (img) => set((s) => ({ images: [...s.images, img] })),
      removeImage: (id) => set((s) => ({ images: s.images.filter((i) => i.id !== id) })),
      setPdfPages: (pdfPages) => set({ pdfPages: Math.max(0, pdfPages) }),
      setShowAttachments: (showAttachments) => set({ showAttachments }),

      toggleModel: (id) =>
        set((s) => ({
          selectedModelIds: s.selectedModelIds.includes(id)
            ? s.selectedModelIds.filter((x) => x !== id)
            : [...s.selectedModelIds, id],
        })),
      setSelectedModelIds: (selectedModelIds) => set({ selectedModelIds }),
      setTier: (tier) => set({ tier }),
      setReasoningBudget: (reasoningBudget) => set({ reasoningBudget }),
      setCachedInputFraction: (cachedInputFraction) => set({ cachedInputFraction }),
      setCacheWriteTokens: (cacheWriteTokens) => set({ cacheWriteTokens: Math.max(0, cacheWriteTokens) }),
      setCacheWriteTtl: (cacheWriteTtl) => set({ cacheWriteTtl }),

      setCallsPerDay: (callsPerDay) => set({ callsPerDay }),
      toggleVolume: () => set((s) => ({ showVolume: !s.showVolume })),

      setExactCountEnabled: (exactCountEnabled) => set({ exactCountEnabled }),
      setAnthropicApiKey: (anthropicApiKey) => set({ anthropicApiKey }),
      setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),

      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

      resetPrompt: () =>
        set({
          prompt: DEFAULT_PROMPT,
          promptB: DEFAULT_PROMPT_B,
          abMode: false,
          system: "",
          history: "",
          tools: [],
          images: [],
          pdfPages: 0,
          optimisedPrompt: null,
        }),
    }),
    {
      name: "tokenburn:v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // SSR fallback — no-op storage.
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      // Don't persist API keys or the transient optimised prompt.
      partialize: (s) => ({
        prompt: s.prompt,
        promptB: s.promptB,
        abMode: s.abMode,
        system: s.system,
        showSystem: s.showSystem,
        history: s.history,
        tools: s.tools,
        images: s.images,
        pdfPages: s.pdfPages,
        showAttachments: s.showAttachments,
        selectedModelIds: s.selectedModelIds,
        tier: s.tier,
        reasoningBudget: s.reasoningBudget,
        cachedInputFraction: s.cachedInputFraction,
        cacheWriteTokens: s.cacheWriteTokens,
        cacheWriteTtl: s.cacheWriteTtl,
        callsPerDay: s.callsPerDay,
        showVolume: s.showVolume,
        exactCountEnabled: s.exactCountEnabled,
        darkMode: s.darkMode,
      }),
      version: 1,
    },
  ),
);
