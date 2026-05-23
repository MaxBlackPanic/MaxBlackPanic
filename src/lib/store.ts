"use client";

import { create } from "zustand";
import { DEFAULT_COMPARE_IDS } from "./models";
import type { Tier } from "./pricing";

interface TokenBurnState {
  prompt: string;
  system: string;
  showSystem: boolean;

  /** Optimised prompt — populated when the user applies suggestions. */
  optimisedPrompt: string | null;

  selectedModelIds: string[];
  tier: Tier;
  reasoningBudget: number;
  cachedInputFraction: number;

  callsPerDay: number;
  showVolume: boolean;

  exactCountEnabled: boolean;
  anthropicApiKey: string;
  geminiApiKey: string;

  darkMode: boolean;

  setPrompt: (p: string) => void;
  setSystem: (s: string) => void;
  setShowSystem: (v: boolean) => void;

  setOptimisedPrompt: (p: string | null) => void;
  acceptOptimisation: () => void;
  revertOptimisation: () => void;

  toggleModel: (id: string) => void;
  setSelectedModelIds: (ids: string[]) => void;
  setTier: (t: Tier) => void;
  setReasoningBudget: (n: number) => void;
  setCachedInputFraction: (f: number) => void;

  setCallsPerDay: (n: number) => void;
  toggleVolume: () => void;

  setExactCountEnabled: (v: boolean) => void;
  setAnthropicApiKey: (k: string) => void;
  setGeminiApiKey: (k: string) => void;

  toggleDarkMode: () => void;
}

const DEFAULT_PROMPT = `You are a senior data analyst.

Please could you go ahead and analyse the following Q1 sales report and tell me which product categories grew the most, which declined, and which seem to have plateaued. In order to be helpful, I would like you to be thorough and detailed in your analysis. It is important that you respond in JSON. Respond in JSON only.

Q1 Sales Report:
- Widgets: $1.2M (vs $1.0M Q4)
- Gadgets: $800K (vs $900K Q4)
- Sprockets: $500K (vs $500K Q4)
- Cogs: $2.1M (vs $1.8M Q4)
- Doohickeys: $300K (vs $500K Q4)`;

export const useTokenBurnStore = create<TokenBurnState>((set) => ({
  prompt: DEFAULT_PROMPT,
  system: "",
  showSystem: false,
  optimisedPrompt: null,

  selectedModelIds: DEFAULT_COMPARE_IDS,
  tier: "standard",
  reasoningBudget: 0,
  cachedInputFraction: 0,

  callsPerDay: 1000,
  showVolume: false,

  exactCountEnabled: false,
  anthropicApiKey: "",
  geminiApiKey: "",

  darkMode: true,

  setPrompt: (prompt) => set({ prompt }),
  setSystem: (system) => set({ system }),
  setShowSystem: (showSystem) => set({ showSystem }),

  setOptimisedPrompt: (optimisedPrompt) => set({ optimisedPrompt }),
  acceptOptimisation: () =>
    set((s) => (s.optimisedPrompt ? { prompt: s.optimisedPrompt, optimisedPrompt: null } : s)),
  revertOptimisation: () => set({ optimisedPrompt: null }),

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

  setCallsPerDay: (callsPerDay) => set({ callsPerDay }),
  toggleVolume: () => set((s) => ({ showVolume: !s.showVolume })),

  setExactCountEnabled: (exactCountEnabled) => set({ exactCountEnabled }),
  setAnthropicApiKey: (anthropicApiKey) => set({ anthropicApiKey }),
  setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),

  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
}));
