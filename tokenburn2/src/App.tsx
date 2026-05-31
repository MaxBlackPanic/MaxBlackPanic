import { useEffect, useMemo, useState } from "react";
import {
  MODELS,
  DEFAULT_MODEL_ID,
  OUTPUT_DEFAULTS,
  TASK_LABELS,
  PRICING_VERIFIED,
  getModel,
  type TaskType,
} from "./pricing";
import { countTokens, messageOverhead, type TokenCount } from "./tokens";
import { expectedCost, worstCaseCost, compareModels, type CallScenario } from "./cost";
import { buildSuggestions } from "./suggestions";
import { useDebounced, useLocalStorage } from "./hooks";
import { money, tokens, tokenRange } from "./format";
import { CostHeadline } from "./components/CostHeadline";
import { SuggestionList } from "./components/SuggestionList";
import { DetailsPanel } from "./components/DetailsPanel";

// Assumed output cap used for the worst-case figure when the user hasn't set
// one. Worst case must always be present, so we fall back to this and flag it.
const ASSUMED_MAX_TOKENS = 4096;

const EMPTY_COUNT: TokenCount = {
  tokens: 0,
  exact: true,
  low: 0,
  high: 0,
  source: "exact (tiktoken o200k)",
};

type Settings = {
  modelId: string;
  task: TaskType;
  expectedOutput: number;
  maxTokens: string; // empty string = not set
  turns: number;
  batch: boolean;
  cachePrefix: boolean;
  callsPerMonth: number;
};

const DEFAULT_SETTINGS: Settings = {
  modelId: DEFAULT_MODEL_ID,
  task: "email",
  expectedOutput: OUTPUT_DEFAULTS.email,
  maxTokens: "",
  turns: 1,
  batch: false,
  cachePrefix: false,
  callsPerMonth: 1000,
};

export default function App() {
  // Prompt content is not persisted (could be sensitive); settings are.
  const [prompt, setPrompt] = useState("");
  const [prefix, setPrefix] = useState("");
  const [settings, setSettings] = useLocalStorage<Settings>("tokenburn2.settings", DEFAULT_SETTINGS);
  const [showDetails, setShowDetails] = useState(false);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings({ ...settings, [k]: v });

  const model = getModel(settings.modelId);

  const debouncedPrompt = useDebounced(prompt, 150);
  const debouncedPrefix = useDebounced(prefix, 150);

  // Async token counting (local for OpenAI, proxy/offline for others).
  const [promptCount, setPromptCount] = useState<TokenCount>(EMPTY_COUNT);
  const [prefixCount, setPrefixCount] = useState<TokenCount>(EMPTY_COUNT);
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCounting(true);
    Promise.all([
      countTokens(debouncedPrompt, model),
      countTokens(debouncedPrefix, model),
    ]).then(([p, pre]) => {
      if (cancelled) return;
      setPromptCount(p);
      setPrefixCount(pre);
      setCounting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedPrompt, debouncedPrefix, model]);

  const overhead = messageOverhead(settings.turns);

  const inputTokens = promptCount.tokens + prefixCount.tokens + overhead;
  const inputLow = promptCount.low + prefixCount.low + overhead;
  const inputHigh = promptCount.high + prefixCount.high + overhead;
  const inputExact = promptCount.exact && prefixCount.exact;

  const cachedTokens = settings.cachePrefix ? prefixCount.tokens : 0;
  const maxTokensSet = settings.maxTokens.trim() !== "";
  const maxTokens = maxTokensSet
    ? Math.max(parseInt(settings.maxTokens, 10) || 0, 0)
    : ASSUMED_MAX_TOKENS;

  const scenario: CallScenario = useMemo(
    () => ({
      inputTokens,
      forecastOutputTokens: Math.max(settings.expectedOutput, 0),
      maxTokens,
      opts: { cachedTokens, batch: settings.batch },
    }),
    [inputTokens, settings.expectedOutput, maxTokens, cachedTokens, settings.batch]
  );

  const expected = useMemo(() => expectedCost(scenario, model), [scenario, model]);
  const worstCase = useMemo(() => worstCaseCost(scenario, model), [scenario, model]);
  const comparison = useMemo(() => compareModels(scenario), [scenario]);

  const suggestions = useMemo(
    () =>
      buildSuggestions({
        scenario,
        model,
        callsPerMonth: settings.callsPerMonth,
        prefixTokens: prefixCount.tokens,
        maxTokensSet,
      }),
    [scenario, model, settings.callsPerMonth, prefixCount.tokens, maxTokensSet]
  );

  const monthlyExpected = expected.total * Math.max(settings.callsPerMonth, 0);

  // Output forecast is always an estimate; so the "likely total" is too.
  const estimated = !inputExact;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">🔥 TokenBurn 2.0</h1>
        <p className="mt-1 text-slate-600">
          See what a prompt will cost before you send it — and how to spend less.
        </p>
      </header>

      <main className="space-y-8">
        {/* Inputs */}
        <section className="space-y-4">
          <div>
            <label htmlFor="prompt" className="mb-1 block text-sm font-medium text-slate-700">
              Prompt
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste or type your prompt…"
              rows={8}
              className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
              <span className="tabular">
                Input:{" "}
                {inputExact ? tokens(inputTokens) : tokenRange(inputLow, inputHigh, inputTokens)} tokens
              </span>
              <span className={inputExact ? "text-emerald-600" : "text-amber-600"}>
                {inputExact ? "exact" : "≈ estimate"} · {promptCount.source}
              </span>
              <span>+{overhead} chat overhead</span>
              {counting && <span className="text-slate-400">counting…</span>}
            </div>
          </div>

          <div>
            <label htmlFor="prefix" className="mb-1 block text-sm font-medium text-slate-700">
              System prompt / stable context{" "}
              <span className="font-normal text-slate-400">(cache candidate, optional)</span>
            </label>
            <textarea
              id="prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="A long, reusable system prompt or context block…"
              rows={3}
              className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
            <div className="mt-1 text-xs text-slate-500">
              <span className="tabular">{tokens(prefixCount.tokens)} tokens</span> · counted as part
              of input
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Model" htmlFor="model">
              <select
                id="model"
                value={settings.modelId}
                onChange={(e) => set("modelId", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Task type (sets default output)" htmlFor="task">
              <select
                id="task"
                value={settings.task}
                onChange={(e) => {
                  const task = e.target.value as TaskType;
                  setSettings({ ...settings, task, expectedOutput: OUTPUT_DEFAULTS[task] });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              >
                {(Object.keys(TASK_LABELS) as TaskType[]).map((t) => (
                  <option key={t} value={t}>
                    {TASK_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Expected output (tokens) — estimate" htmlFor="expected">
              <input
                id="expected"
                type="number"
                min={0}
                value={settings.expectedOutput}
                onChange={(e) => set("expectedOutput", parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm tabular focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </Field>

            <Field label="Max output tokens (cap) — sets worst case" htmlFor="maxtokens">
              <input
                id="maxtokens"
                type="number"
                min={0}
                value={settings.maxTokens}
                placeholder={`not set (assuming ${ASSUMED_MAX_TOKENS})`}
                onChange={(e) => set("maxTokens", e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm tabular focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </Field>

            <Field label="Message turns (chat overhead)" htmlFor="turns">
              <input
                id="turns"
                type="number"
                min={1}
                value={settings.turns}
                onChange={(e) => set("turns", Math.max(parseInt(e.target.value, 10) || 1, 1))}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm tabular focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </Field>

            <Field label="Calls per month" htmlFor="calls">
              <input
                id="calls"
                type="number"
                min={0}
                value={settings.callsPerMonth}
                onChange={(e) => set("callsPerMonth", parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm tabular focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-6">
            <Toggle
              id="batch"
              label="Batch / async (−50%)"
              checked={settings.batch}
              onChange={(v) => set("batch", v)}
            />
            <Toggle
              id="cache"
              label="Cache the context prefix"
              checked={settings.cachePrefix}
              onChange={(v) => set("cachePrefix", v)}
            />
          </div>
        </section>

        {/* Results */}
        <section>
          <CostHeadline
            inputCost={expected.inputCost}
            expectedTotal={expected.total}
            worstCaseTotal={worstCase.total}
            estimated={estimated}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="tabular text-slate-700">
              Monthly (expected ×{tokens(Math.max(settings.callsPerMonth, 0))}):{" "}
              <span className="font-semibold">{money(monthlyExpected)}</span>
            </div>
            <div className="text-xs text-slate-400">
              Pricing verified {PRICING_VERIFIED}
              {!maxTokensSet && " · worst case assumes a " + ASSUMED_MAX_TOKENS + "-token cap"}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Multimodal inputs (images, audio, files) are out of scope in v2 — counts cover text only.
          </p>
        </section>

        {/* Suggestions */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">Spend less</h2>
          <SuggestionList suggestions={suggestions} />
        </section>

        {/* Details */}
        <section>
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-expanded={showDetails}
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
          {showDetails && (
            <div className="mt-4">
              <DetailsPanel
                model={model}
                inputTokens={inputTokens}
                forecastOutputTokens={Math.max(settings.expectedOutput, 0)}
                maxTokens={maxTokens}
                cachedTokens={cachedTokens}
                batch={settings.batch}
                expected={expected}
                worstCase={worstCase}
                comparison={comparison}
                callsPerMonth={settings.callsPerMonth}
              />
            </div>
          )}
        </section>
      </main>

      <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-400">
        TokenBurn 2.0 keeps your prompt in your browser. OpenAI counts are exact via tiktoken;
        Anthropic &amp; Gemini counts are exact only when the optional proxy is configured,
        otherwise labelled estimates. No API keys are stored in the browser.
      </footer>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
      />
      {label}
    </label>
  );
}
