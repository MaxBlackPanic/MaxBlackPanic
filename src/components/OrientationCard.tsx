"use client";

import { X, Wand2, Table, GitCompare, Calculator, BarChart3, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTokenBurnStore } from "@/lib/store";

/**
 * First-visit orientation hint shown above the main editor. Dismissible —
 * once dismissed, state is persisted to localStorage (tokenburn:v1).
 * Replayable from the About page via "Show orientation hints".
 */
export function OrientationCard() {
  const { orientationDismissed, dismissOrientation } = useTokenBurnStore();
  if (orientationDismissed) return null;

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="relative py-4">
        <button
          onClick={dismissOrientation}
          aria-label="Dismiss orientation"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          New here? Quick tour
        </div>

        <ul className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2 lg:grid-cols-3">
          <li className="flex gap-2">
            <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            <span>
              <span className="text-foreground font-medium">Paste a prompt above.</span> Token count
              and dollar cost per model update live. Click the <b>Suggestions</b> tab to see
              ranked rewrite tips with one-click <b>Apply all</b>.
            </span>
          </li>
          <li className="flex gap-2">
            <Table className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            <span>
              <span className="text-foreground font-medium">Settings on the right</span> pick the
              pricing tier (standard / batch / cached), reasoning budget, and which models to
              compare. Toggle <b>A/B compare mode</b> to paste two prompts side-by-side.
            </span>
          </li>
          <li className="flex gap-2">
            <GitCompare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            <span>
              <span className="text-foreground font-medium">Share</span> copies a hash-encoded URL
              of your prompt; <b>CSV</b> / <b>JSON</b> exports the comparison for spreadsheets.
              Nothing leaves your browser unless you opt in to vendor count-token APIs.
            </span>
          </li>
          <li className="flex gap-2">
            <Calculator className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            <span>
              <span className="text-foreground font-medium">Forecast tab</span> in the header — a
              no-prompt cost sandbox. Sketch monthly / annual budgets directly from token counts.
            </span>
          </li>
          <li className="flex gap-2">
            <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
            <span>
              <span className="text-foreground font-medium">Calibration tab</span> — cross-check
              the empirical Anthropic / Gemini token counts against the vendor APIs with your own
              session-scoped key.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0">📖</span>
            <span>
              <span className="text-foreground font-medium">About tab</span> — privacy details
              and how the tokeniser estimates are calibrated.
            </span>
          </li>
        </ul>

        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={dismissOrientation}>
            Got it — hide this
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
