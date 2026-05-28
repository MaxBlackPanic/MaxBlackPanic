"use client";

import {
  Flame,
  Moon,
  Sun,
  BookOpen,
  BarChart3,
  Calculator,
  Home,
  Workflow,
  Menu,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useTokenBurnStore } from "@/lib/store";

const NAV = [
  {
    href: "/",
    label: "Analyser",
    icon: Home,
    title: "Paste a prompt and see token counts, cost per model, and one-click rewrite suggestions.",
  },
  {
    href: "/forecast",
    label: "Forecast",
    icon: Calculator,
    title: "No-prompt cost sandbox. Punch in token counts and call volume to sketch monthly / annual budgets.",
  },
  {
    href: "/session",
    label: "Session",
    icon: Workflow,
    title: "Multi-turn session simulator. Models cumulative context-compounding cost with and without prompt caching.",
  },
  {
    href: "/calibration",
    label: "Calibration",
    icon: BarChart3,
    title: "Cross-check the empirical Anthropic / Gemini token counts against the vendor APIs using your own key.",
  },
  {
    href: "/about",
    label: "About",
    icon: BookOpen,
    title: "What TokenBurn does, how the tokenisers are calibrated, and the privacy guarantees.",
  },
];

export function Header() {
  const { darkMode, toggleDarkMode } = useTokenBurnStore();
  const [navOpen, setNavOpen] = useState(false);
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
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
      {/* Desktop nav (md+). */}
      <div className="hidden items-center gap-2 md:flex">
        {NAV.map((n) => (
          <Button asChild key={n.href} variant="ghost" size="sm">
            <Link href={n.href} className="gap-1.5" title={n.title}>
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </Link>
          </Button>
        ))}
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label="Toggle theme">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      {/* Mobile menu (< md). */}
      <div className="flex items-center gap-1 md:hidden">
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label="Toggle theme">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <SheetContent side="right" className="px-4">
            <SheetHeader>
              <SheetTitle>TokenBurn</SheetTitle>
              <SheetDescription>AI prompt cost &amp; efficiency</SheetDescription>
            </SheetHeader>
            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setNavOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/40"
                >
                  <n.icon className="h-4 w-4" />
                  <span>{n.label}</span>
                </Link>
              ))}
            </nav>
            <p className="mt-auto text-[10px] text-muted-foreground">
              Tokenisation runs in your browser. Vendor count-token APIs only when you opt in.
            </p>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

