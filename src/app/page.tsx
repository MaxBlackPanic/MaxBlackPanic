"use client";

import { useEffect, useMemo } from "react";
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
import { Download } from "lucide-react";

import { useTokenBurnStore } from "@/lib/store";
import { MODELS } from "@/lib/models";
import { countPromptTokens } from "@/lib/tokenizer";
import { predictOutput } from "@/lib/outputPredictor";
import { computeCost } from "@/lib/pricing";
import { analysePrompt, type PromptSuggestion } from "@/lib/analyser";
import { rowsToCSV, downloadString, timestampedFilename } from "@/lib/exporter";

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

  const rows: ModelRow[] = useMemo(() => {
    return selectedModels.map((m) => {
      const tokens = countPromptTokens(promptInput, m);
      const out = predictOutput(tokens.total, prompt, m);
      const cachedTokens = tier === "cached" ? Math.round(tokens.total * cachedInputFraction) : 0;

      const expected = computeCost(
        m,
        {
          inputTokens: tokens.total,
          outputTokens: out.expected,
          reasoningTokens: m.supportsReasoning ? reasoningBudget : 0,
          cachedInputTokens: cachedTokens,
        },
        tier === "cached" ? "standard" : tier,
      );
      const low = computeCost(
        m,
        {
          inputTokens: tokens.total,
          outputTokens: out.low,
          reasoningTokens: m.supportsReasoning ? Math.min(reasoningBudget, 1024) : 0,
          cachedInputTokens: cachedTokens,
        },
        tier === "cached" ? "standard" : tier,
      );
      const high = computeCost(
        m,
        {
          inputTokens: tokens.total,
          outputTokens: out.high,
          reasoningTokens: m.supportsReasoning ? reasoningBudget : 0,
          cachedInputTokens: cachedTokens,
        },
        tier === "cached" ? "standard" : tier,
      );

      return {
        model: m,
        inputTokens: tokens.total,
        outputLow: out.low,
        outputExpected: out.expected,
        outputHigh: out.high,
        inputCost: expected.inputCost + expected.cachedInputCost + expected.longContextSurchargeCost,
        outputCost: expected.outputCost + expected.reasoningCost,
        totalCost: expected.total,
        totalCostLow: low.total,
        totalCostHigh: high.total,
        contextUtilisation: tokens.total / m.contextWindow,
        tokenConfidence: tokens.confidence,
        tokenUncertaintyFraction: tokens.uncertaintyFraction,
      };
    });
  }, [selectedModels, promptInput, prompt, tier, reasoningBudget, cachedInputFraction]);

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
    const csv = rowsToCSV(rows, { tier, callsPerDay, includeVolume: showVolume });
    downloadString(csv, timestampedFilename("tokenburn-comparison", "csv"), "text/csv");
  }

  const hasEstimateOnlyVendors = rows.some((r) => r.tokenConfidence !== "exact");

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
                <CardTitle className="text-base">Prompt</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                      System prompt
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

            {optimisedPrompt !== null && optimisedCost && (
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportCSV}
                  disabled={rows.length === 0}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
              <TabsContent value="table" className="space-y-3">
                <ModelTable rows={rows} tier={tier} onSelectCheapest={selectCheapest} />
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
