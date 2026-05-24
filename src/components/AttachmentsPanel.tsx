"use client";

import { useRef, useState } from "react";
import { Paperclip, Image as ImageIcon, FileText, Wrench, MessageSquare, X, Plus, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useTokenBurnStore } from "@/lib/store";

export function AttachmentsPanel() {
  const {
    history,
    setHistory,
    tools,
    addTool,
    updateTool,
    removeTool,
    images,
    addImage,
    removeImage,
    pdfPages,
    setPdfPages,
  } = useTokenBurnStore();

  const [imgW, setImgW] = useState(1024);
  const [imgH, setImgH] = useState(1024);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reads image dimensions from a File without uploading anything. Uses an
   * Object URL so the file bytes never leave the browser.
   */
  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file);
      try {
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error(`Failed to load ${file.name}`));
          img.src = url;
        });
        addImage({
          id: crypto.randomUUID(),
          label: `${file.name} (${dims.w}×${dims.h})`,
          width: dims.w,
          height: dims.h,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4" />
          Attachments &amp; context
        </CardTitle>
        <div className="flex gap-1">
          {images.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {images.length} img
            </Badge>
          )}
          {pdfPages > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {pdfPages}p PDF
            </Badge>
          )}
          {tools.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {tools.length} tool
            </Badge>
          )}
          {history && (
            <Badge variant="outline" className="text-[10px]">
              history
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Conversation history */}
        <section className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <MessageSquare className="h-3 w-3" /> Conversation history
          </Label>
          <textarea
            value={history}
            onChange={(e) => setHistory(e.target.value)}
            rows={3}
            placeholder="(optional) prior turns, concatenated. e.g.&#10;User: ...&#10;Assistant: ..."
            className="w-full resize-y rounded-md border bg-background p-2 font-mono text-xs"
          />
        </section>

        {/* Tool / function schemas */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Wrench className="h-3 w-3" /> Tool / function schemas
            </Label>
            <Button size="sm" variant="ghost" onClick={addTool} className="h-7 gap-1 px-2 text-xs">
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {tools.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Each tool schema is sent with the prompt and typically costs 500–2,000 tokens.
            </p>
          ) : (
            <ul className="space-y-2">
              {tools.map((t, i) => (
                <li key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Tool #{i + 1}</span>
                    <button
                      onClick={() => removeTool(i)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove tool"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <textarea
                    value={t}
                    onChange={(e) => updateTool(i, e.target.value)}
                    rows={4}
                    className="w-full resize-y rounded-md border bg-background p-2 font-mono text-xs"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Images */}
        <section className="space-y-2">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <ImageIcon className="h-3 w-3" /> Image attachments
          </Label>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 gap-1 text-xs"
            >
              <Upload className="h-3 w-3" /> Upload file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="text-[10px] text-muted-foreground">
              or specify dimensions manually:
            </span>
            <div>
              <Label className="text-[10px] text-muted-foreground">W (px)</Label>
              <Input
                type="number"
                min={32}
                value={imgW}
                onChange={(e) => setImgW(Math.max(1, parseInt(e.target.value || "0", 10)))}
                className="mt-0.5 h-8 w-20 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">H (px)</Label>
              <Input
                type="number"
                min={32}
                value={imgH}
                onChange={(e) => setImgH(Math.max(1, parseInt(e.target.value || "0", 10)))}
                className="mt-0.5 h-8 w-20 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                addImage({
                  id: crypto.randomUUID(),
                  label: `${imgW}×${imgH}`,
                  width: imgW,
                  height: imgH,
                })
              }
              className="h-8 gap-1 text-xs"
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {images.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {images.map((img) => (
                <li key={img.id}>
                  <button
                    onClick={() => removeImage(img.id)}
                    className="group inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-[11px] hover:bg-destructive/15"
                  >
                    {img.label}
                    <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-muted-foreground">
            Claude bills <code>(w×h)/750</code> tokens/image; Gemini 3 Flash bills a flat 560.
          </p>
        </section>

        {/* PDFs */}
        <section className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3 w-3" /> PDF pages
          </Label>
          <Input
            type="number"
            min={0}
            value={pdfPages}
            onChange={(e) => setPdfPages(parseInt(e.target.value || "0", 10))}
            className="h-8 w-24 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Anthropic bills ~1,500–3,000 tokens per page (density-dependent).
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
