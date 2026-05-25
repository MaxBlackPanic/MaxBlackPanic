"use client";

import { Flame, Moon, Sun, BookOpen, BarChart3, Calculator } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTokenBurnStore } from "@/lib/store";

export function Header() {
  const { darkMode, toggleDarkMode } = useTokenBurnStore();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <Flame className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">
          Token<span className="tokenburn-flame">Burn</span>
        </h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          AI prompt cost & efficiency
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/forecast" className="gap-1.5">
            <Calculator className="h-3.5 w-3.5" />
            Forecast
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/calibration" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Calibration
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/about" className="gap-1.5">
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
