"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { PricingFreshnessBanner } from "@/components/PricingFreshnessBanner";
import { PromptEditor } from "@/components/PromptEditor";
import { ModelTable, type ModelRow } from "@/components/ModelTable";
import { CostChart } from "@/components/CostChart";
import { Suggestions } from "@/components/Suggestions";
import { DiffView } from "@/components/DiffView";
import { VolumeCalculator } from "@/components/VolumeCalculator";
import { SettingsPanel } from "@/components/SettingsPanel";
import { AttachmentsPanel } from "@/components/AttachmentsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileJson, Share2, Check, ArrowLeftRight } from "lucide-react";

import { useTokenBurnStore } from "@/lib/store";
import { MODELS } from "@/lib/models";
import { countPromptTokens } from "@/lib/tokenizer";
import { predictOutput } from "@/lib/outputPredictor";
import { computeCost, formatTokens } from "@/lib/pricing";
import { analysePrompt, type PromptSuggestion } from "@/lib/analyser";
import { rowsToCSV, rowsToJSON, downloadString, timestampedFilename } from "@/lib/exporter";
import { buildShareUrl, parseShareFromHash } from "@/lib/share";

export default function Home() {
  const {
    prompt,
    setPrompt,
    system,
    setSystem,
    showSystem,
    optimisedPrompt,
    setOptimisedPrompt,
    acceptOptimisation,
    revertOptimisation,
    abMode,
    setAbMode,
    promptB,
    setPromptB,
    swapAB,
    acceptB,
    history,
    tools,
    images,
    pdfPages,
    showAttachments,
    selectedModelIds,
    setSelectedModelIds,
    tier,
    reasoningBudget,
    cachedInputFraction,
    callsPerDay,
    setCallsPerDay,
    showVolume,
    darkMode,
  } = useTokenBurnStore();

  // Sync html.dark class with the store.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // One-shot URL share restore. Runs once on mount; clears the hash so the
  // restored payload doesn't shadow subsequent edits if the user shares
  // outward later.
  const [restoredFromShare, setRestoredFromShare] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || restoredFromShare) return;
    const payload = parseShareFromHash(window.location.hash);
    if (!payload) return;
    setPrompt(payload.prompt);
    if (typeof payload.promptB === "string") setPromptB(payload.promptB);
    if (typeof payload.abMode === "boolean") setAbMode(payload.abMode);
    if (typeof payload.system === "string") setSystem(payload.system);
    if (payload.tier) useTokenBurnStore.getState().setTier(payload.tier);
    if (Array.isArray(payload.models) && payload.models.length) {
      setSelectedModelIds(payload.models.filter((id) => MODELS.some((m) => m.id === id)));
    }
    if (typeof payload.reasoning === "number") {
      useTokenBurnStore.getState().setReasoningBudget(payload.reasoning);
    }
    if (typeof payload.cachedFrac === "number") {
      useTokenBurnStore.getState().setCachedInputFraction(payload.cachedFrac);
    }
    if (window.history?.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setRestoredFromShare(true);
  }, [restoredFromShare, setPrompt, setSystem, setSelectedModelIds, setPromptB, setAbMode]);

  // "Copied" affordance for the share button.
  const [shareCopiedAt, setShareCopiedAt] = useState<number | null>(null);
  useEffect(() => {
    if (shareCopiedAt === null) return;
    const t = setTimeout(() => setShareCopiedAt(null), 2000);
    return () => clearTimeout(t);
  }, [shareCopiedAt]);

  const selectedModels = useMemo(
    () => MODELS.filter((m) => selectedModelIds.includes(m.id)),
    [selectedModelIds],
  );

  const referenceModel = selectedModels.find((m) => m.vendor === "openai") ?? selectedModels[0] ?? MODELS[0];

  // Shared prompt-input shape so every consumer counts the same set of fields.
  const promptInput = useMemo(
    () => ({
      user: prompt,
      system: showSystem ? system || undefined : undefined,
      history: history || undefined,
      tools: tools.length ? tools : undefined,
      images: images.length ? images.map((i) => ({ width: i.width, height: i.height })) : undefined,
      pdfPages: pdfPages || undefined,
    }),
    [prompt, system, showSystem, history, tools, images, pdfPages],
  );

  const analysis = useMemo(() => {
    const inputTokens = countPromptTokens(promptInput, referenceModel).total;
    return analysePrompt(prompt, inputTokens);
  }, [promptInput, prompt, referenceModel]);

  const buildRow = useCallback(
    (m: typeof MODELS[number], pInput: typeof promptInput, userText: string): ModelRow => {
      const tokens = countPromptTokens(pInput, m);
      const out = predictOutput(tokens.total, userText, m);
      const cachedTokens =
        tier === "cached" ? Math.round(tokens.total * cachedInputFraction) : 0;
      const effectiveTier: "standard" | "batch" = tier === "cached" ? "standard" : tier;

      const expected = computeCost(
        m,
        {
          inputTokens: tokens.total,
          outputTokens: out.expected,
          reasoningTokens: m.supportsReasoning ? reasoningBudget : 0,
          cachedInputTokens: cachedTokens,
        },
        effectiveTier,
      );
      const low = computeCost(
        m,
        {
          inputTokens: tokens.total,
          outputTokens: out.low,
          reasoningTokens: m.supportsReasoning ? Math.min(reasoningBudget, 1024) : 0,
          cachedInputTokens: cachedTokens,
        },
        effectiveTier,
      );
      const high = computeCost(
        m,
        {
          inputTokens: tokens.total,
          outputTokens: out.high,
          reasoningTokens: m.supportsReasoning ? reasoningBudget : 0,
          cachedInputTokens: cachedTokens,
        },
        effectiveTier,
      );

      return {
        model: m,
        inputTokens: tokens.total,
        outputLow: out.low,
        outputExpected: out.expected,
        outputHigh: out.high,
        inputCost:
          expected.inputCost + expected.cachedInputCost + expected.longContextSurchargeCost,
        outputCost: expected.outputCost + expected.reasoningCost,
        totalCost: expected.total,
        totalCostLow: low.total,
        totalCostHigh: high.total,
        contextUtilisation: tokens.total / m.contextWindow,
        tokenConfidence: tokens.confidence,
        tokenUncertaintyFraction: tokens.uncertaintyFraction,
      };
    },
    [tier, reasoningBudget, cachedInputFraction],
  );

  const rows: ModelRow[] = useMemo(
    () => selectedModels.map((m) => buildRow(m, promptInput, prompt)),
    [selectedModels, promptInput, prompt, buildRow],
  );

  const promptInputB = useMemo(
    () => ({ ...promptInput, user: promptB }),
    [promptInput, promptB],
  );

  const rowsB: ModelRow[] | undefined = useMemo(
    () =>
      abMode ? selectedModels.map((m) => buildRow(m, promptInputB, promptB)) : undefined,
    [abMode, selectedModels, promptInputB, promptB, buildRow],
  );

  // Optimised prompt row (single, on the cheapest model) for diff view.
  const optimisedCost = useMemo(() => {
    if (!optimisedPrompt) return null;
    const cheapest = [...rows].sort((a, b) => a.totalCost - b.totalCost)[0];
    if (!cheapest) return null;
    const tokens = countPromptTokens(
      { ...promptInput, user: optimisedPrompt },
      cheapest.model,
    );
    const out = predictOutput(tokens.total, optimisedPrompt, cheapest.model);
    const cost = computeCost(
      cheapest.model,
      {
        inputTokens: tokens.total,
        outputTokens: out.expected,
        reasoningTokens: cheapest.model.supportsReasoning ? reasoningBudget : 0,
        cachedInputTokens:
          tier === "cached" ? Math.round(tokens.total * cachedInputFraction) : 0,
      },
      tier === "cached" ? "standard" : tier,
    );
    return {
      model: cheapest.model,
      tokens: tokens.total,
      cost: cost.total,
      originalTokens: cheapest.inputTokens,
      originalCost: cheapest.totalCost,
    };
  }, [optimisedPrompt, rows, promptInput, tier, reasoningBudget, cachedInputFraction]);

  function applySuggestion(s: PromptSuggestion) {
    if (!s.apply) return;
    const base = optimisedPrompt ?? prompt;
    setOptimisedPrompt(s.apply(base));
  }

  function applyAll() {
    let next = prompt;
    for (const s of analysis.suggestions) {
      if (s.apply) next = s.apply(next);
    }
    setOptimisedPrompt(next);
  }

  function selectCheapest(id: string) {
    setSelectedModelIds([id]);
  }

  function exportCSV() {
    const csv = rowsToCSV(rows, {
      tier,
      callsPerDay,
      includeVolume: showVolume,
      rowsB: abMode ? rowsB : undefined,
    });
    downloadString(csv, timestampedFilename("tokenburn-comparison", "csv"), "text/csv");
  }

  function exportJSON() {
    const json = rowsToJSON(rows, {
      tier,
      callsPerDay,
      includeVolume: showVolume,
      rowsB: abMode ? rowsB : undefined,
    });
    downloadString(json, timestampedFilename("tokenburn-comparison", "json"), "application/json");
  }

  async function copyShareLink() {
    try {
      const url = buildShareUrl({
        v: 1,
        prompt,
        promptB: abMode ? promptB : undefined,
        abMode: abMode || undefined,
        system: showSystem && system ? system : undefined,
        tier,
        models: selectedModelIds,
        reasoning: reasoningBudget || undefined,
        cachedFrac: cachedInputFraction || undefined,
      });
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else if (typeof window !== "undefined") {
        window.prompt("Copy this URL to share:", url);
      }
      setShareCopiedAt(Date.now());
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const hasEstimateOnlyVendors = rows.some((r) => r.tokenConfidence !== "exact");
  // Live token counts (exact, OpenAI reference) for the editor headers.
  const liveTokenCount = useMemo(
    () => countPromptTokens(promptInput, referenceModel).total,
    [promptInput, referenceModel],
  );
  const liveTokenCountB = useMemo(
    () => (abMode ? countPromptTokens(promptInputB, referenceModel).total : 0),
    [abMode, promptInputB, referenceModel],
  );

  // For A/B diff card.
  const abTotals = useMemo(() => {
    if (!abMode || !rowsB) return null;
    const cheapest = [...rows].sort((a, b) => a.totalCost - b.totalCost)[0];
    if (!cheapest) return null;
    const bRow = rowsB.find((r) => r.model.id === cheapest.model.id);
    if (!bRow) return null;
    return {
      modelLabel: cheapest.model.label,
      aTokens: cheapest.inputTokens,
      bTokens: bRow.inputTokens,
      aCost: cheapest.totalCost,
      bCost: bRow.totalCost,
    };
  }, [abMode, rows, rowsB]);

  return (
    <div className="min-h-screen">
      <Header />
      <PricingFreshnessBanner />
      <main className="container mx-auto max-w-[1600px] px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* LEFT: editor + system + diff */}
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {abMode && <Badge variant="default" className="text-[10px]">A</Badge>}
                  Prompt{abMode ? " A" : ""}
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {formatTokens(liveTokenCount)} tokens
                  </Badge>
                  {analysis.taskClass && (
                    <Badge variant="outline" className="text-[10px]">
                      task: {analysis.taskClass}
                    </Badge>
                  )}
                  {hasEstimateOnlyVendors && (
                    <Badge variant="warn" className="text-[10px]">
                      includes estimated counts
                    </Badge>
                  )}
                  {abMode && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={swapAB}
                      className="h-7 gap-1.5 text-xs"
                      title="Swap A and B"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Swap
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyShareLink}
                    className="h-7 gap-1.5 text-xs"
                    title="Copy a shareable link (the prompt is encoded into the URL fragment and never sent over the wire)"
                  >
                    {shareCopiedAt ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5" />
                        Share
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[420px] border-t">
                  <PromptEditor
                    value={prompt}
                    onChange={setPrompt}
                    suggestions={analysis.suggestions}
                    darkMode={darkMode}
                  />
                </div>
                {showSystem && (
                  <div className="border-t bg-muted/20 p-3">
                    <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      System prompt (shared by A &amp; B)
                    </div>
                    <textarea
                      value={system}
                      onChange={(e) => setSystem(e.target.value)}
                      placeholder="(optional) system instructions"
                      className="h-24 w-full resize-y rounded-md border bg-background p-2 text-sm font-mono"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {abMode && (
              <Card className="overflow-hidden border-emerald-700/40">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Badge variant="success" className="text-[10px]">B</Badge>
                    Prompt B
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {formatTokens(liveTokenCountB)} tokens
                    </Badge>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={acceptB}
                      className="h-7 gap-1.5 text-xs"
                      title="Promote B to the active prompt and exit A/B mode"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Accept B
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[420px] border-t">
                    <PromptEditor
                      value={promptB}
                      onChange={setPromptB}
                      suggestions={[]}
                      darkMode={darkMode}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {abMode && abTotals && (
              <DiffView
                before={prompt}
                after={promptB}
                beforeTokens={abTotals.aTokens}
                afterTokens={abTotals.bTokens}
                beforeCost={abTotals.aCost}
                afterCost={abTotals.bCost}
                onAccept={acceptB}
                onRevert={() => setAbMode(false)}
              />
            )}

            {!abMode && optimisedPrompt !== null && optimisedCost && (
              <DiffView
                before={prompt}
                after={optimisedPrompt}
                beforeTokens={optimisedCost.originalTokens}
                afterTokens={optimisedCost.tokens}
                beforeCost={optimisedCost.originalCost}
                afterCost={optimisedCost.cost}
                onAccept={acceptOptimisation}
                onRevert={revertOptimisation}
              />
            )}

            <Tabs defaultValue="table">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="table">Model comparison</TabsTrigger>
                  <TabsTrigger value="chart">Cost breakdown</TabsTrigger>
                  <TabsTrigger value="suggestions">
                    Suggestions ({analysis.suggestions.length})
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportCSV}
                    disabled={rows.length === 0}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportJSON}
                    disabled={rows.length === 0}
                    className="gap-1.5"
                  >
                    <FileJson className="h-3.5 w-3.5" />
                    JSON
                  </Button>
                </div>
              </div>
              <TabsContent value="table" className="space-y-3">
                <ModelTable
                  rows={rows}
                  rowsB={abMode ? rowsB : undefined}
                  tier={tier}
                  onSelectCheapest={selectCheapest}
                />
                {showVolume && (
                  <VolumeCalculator
                    rows={rows}
                    callsPerDay={callsPerDay}
                    onCallsChange={setCallsPerDay}
                    tier={tier}
                  />
                )}
              </TabsContent>
              <TabsContent value="chart">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Input vs output cost per model</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CostChart rows={rows} />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="suggestions">
                <Suggestions
                  suggestions={analysis.suggestions}
                  promptText={prompt}
                  onApply={applySuggestion}
                  onApplyAll={applyAll}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* RIGHT: settings + attachments */}
          <aside className="space-y-4">
            <SettingsPanel />
            {showAttachments && <AttachmentsPanel />}
          </aside>
        </div>

        <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          <p>
            TokenBurn runs all tokenisation client-side. Vendor count-token APIs are only called
            when you explicitly opt in. Pricing data last verified on the date shown beside each
            model — sources documented in MODELS.md.
          </p>
        </footer>
      </main>
    </div>
  );
}
