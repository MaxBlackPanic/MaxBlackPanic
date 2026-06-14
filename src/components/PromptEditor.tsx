"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import type { editor as monacoEditor } from "monaco-editor";
import type { PromptSuggestion } from "@/lib/analyser";
import { useIsMobile } from "@/lib/useIsMobile";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions: PromptSuggestion[];
  darkMode: boolean;
}

export function PromptEditor({ value, onChange, suggestions, darkMode }: Props) {
  // Monaco is a desktop-first editor (poor touch selection / virtual
  // keyboard handling). Swap for a styled textarea under 768px so phones
  // get a real editing experience.
  const isMobile = useIsMobile(768);

  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

  useEffect(() => {
    if (isMobile) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    type Deco = monacoEditor.IModelDeltaDecoration;
    const newDecos: Deco[] = [];
    for (const s of suggestions) {
      if (!s.ranges) continue;
      const cls =
        s.category === "verbosity"
          ? "tb-issue-verbosity"
          : s.category === "redundancy"
            ? "tb-issue-redundancy"
            : s.category === "whitespace"
              ? "tb-issue-whitespace"
              : s.category === "cache"
                ? "tb-issue-cache"
                : "tb-issue-verbosity";
      for (const r of s.ranges) {
        const start = model.getPositionAt(r.start);
        const end = model.getPositionAt(r.end);
        newDecos.push({
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: {
            inlineClassName: cls,
            hoverMessage: { value: `**${s.title}** — ${r.hint ?? s.detail}` },
          },
        });
      }
    }
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecos);
  }, [suggestions, value, isMobile]);

  if (isMobile) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-md border bg-card">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="h-full w-full resize-none border-0 bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none focus:ring-0"
          placeholder="Paste your prompt here…"
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-md border bg-card">
      <Monaco
        height="100%"
        defaultLanguage="markdown"
        theme={darkMode ? "vs-dark" : "vs-light"}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
        }}
        options={{
          wordWrap: "on",
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          renderWhitespace: "boundary",
          tabSize: 2,
          smoothScrolling: true,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
