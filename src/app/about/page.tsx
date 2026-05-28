"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTokenBurnStore } from "@/lib/store";

export default function AboutPage() {
  const showOrientation = useTokenBurnStore((s) => s.showOrientation);
  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto max-w-3xl space-y-4 px-4 py-8 text-sm leading-relaxed">
        <Card>
          <CardHeader>
            <CardTitle>About TokenBurn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              TokenBurn is a token-cost calculator and prompt efficiency analyser, designed to be
              accurate enough that a finance team or platform engineer can trust its numbers for
              monthly budget forecasting.
            </p>

            <h3 className="font-semibold">How the numbers are produced</h3>
            <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
              <li>
                OpenAI counts are bit-exact and computed locally with{" "}
                <code>gpt-tokenizer</code> (o200k_base / cl100k_base).
              </li>
              <li>
                Anthropic counts use a calibrated empirical multiplier on top of cl100k_base
                (Opus 4.7 gets a 1.30× factor to account for its newer tokeniser). Opt in to call
                the official <code>count_tokens</code> endpoint for exact values.
              </li>
              <li>
                Gemini counts use a SentencePiece-aware empirical model on top of cl100k_base.
                Opt in to call the official <code>countTokens</code> endpoint for exact values.
              </li>
              <li>
                DeepSeek, Grok, Llama, and Mistral counts are flagged ±10% estimates only.
              </li>
            </ul>

            <h3 className="font-semibold">Privacy</h3>
            <p className="text-muted-foreground">
              Your prompt never leaves the browser unless you explicitly opt in to exact-count
              mode. API keys are kept in memory for the session only — never persisted to disk
              or transmitted to TokenBurn&apos;s servers.
            </p>

            <h3 className="font-semibold">Pricing accuracy</h3>
            <p className="text-muted-foreground">
              Every model row shows its last-verified date and links to the vendor&apos;s pricing
              page. The <code>models.ts</code> catalog is also documented in <code>MODELS.md</code>
              for review.
            </p>

            <h3 className="font-semibold">License & contributing</h3>
            <p className="text-muted-foreground">
              MIT. See <code>CONTRIBUTING</code> in the README for how to bump prices or add
              models.
            </p>

            <h3 className="font-semibold">Lost? Replay the orientation hints</h3>
            <p className="text-muted-foreground">
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-sm" onClick={showOrientation}>
                <Link href="/">Show me around again</Link>
              </Button>{" "}
              — restores the welcome card on the main analyser page.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
