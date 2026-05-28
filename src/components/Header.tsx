"use client";

import { Flame, Moon, Sun, BookOpen, BarChart3, Calculator, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTokenBurnStore } from "@/lib/store";

export function Header() {
  const { darkMode, toggleDarkMode } = useTokenBurnStore();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
      <Link
        href="/"
        className="group flex items-center gap-2 rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-accent/40"
        aria-label="TokenBurn home"
      >
        <Flame className="h-6 w-6 text-primary transition-transform group-hover:scale-110" />
        <h1 className="text-lg font-bold tracking-tight">
          Token<span className="tokenburn-flame">Burn</span>
        </h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          AI prompt cost &amp; efficiency
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link
            href="/"
            className="gap-1.5"
            title="Paste a prompt and see token counts, cost per model, and one-click rewrite suggestions."
          >
            <Home className="h-3.5 w-3.5" />
            Analyser
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            href="/forecast"
            className="gap-1.5"
            title="No-prompt cost sandbox. Punch in token counts and call volume to sketch monthly / annual budgets."
          >
            <Calculator className="h-3.5 w-3.5" />
            Forecast
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            href="/calibration"
            className="gap-1.5"
            title="Cross-check the empirical Anthropic / Gemini token counts against the vendor APIs using your own key."
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Calibration
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            href="/about"
            className="gap-1.5"
            title="What TokenBurn does, how the tokenisers are calibrated, and the privacy guarantees."
          >
            <BookOpen className="h-3.5 w-3.5" />
            About
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label="Toggle theme">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}

