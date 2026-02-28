"use client";

import { useEffect, useState } from "react";

function langFromPath(path: string): string {
  const ext = path.replace(/^.*\./, "").toLowerCase();
  const map: Record<string, string> = {
    tsx: "tsx",
    ts: "typescript",
    jsx: "jsx",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    html: "html",
    htm: "html",
    css: "css",
    json: "json",
    md: "markdown",
  };
  return map[ext] ?? "typescript";
}

interface CodeViewerProps {
  code: string;
  path: string;
  className?: string;
}

export function CodeViewer({ code, path, className = "" }: CodeViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function highlight() {
      try {
        const { codeToHtml } = await import("shiki/bundle/web");
        const lang = langFromPath(path);
        const out = await codeToHtml(code, {
          lang: lang as "tsx" | "typescript" | "jsx" | "javascript" | "html" | "css" | "json",
          theme: "github-dark",
        });
        if (!cancelled) setHtml(out);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Highlight failed");
          setHtml(null);
        }
      }
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, path]);

  if (error) {
    return (
      <div className={`p-4 text-sm text-destructive ${className}`}>
        {error}
      </div>
    );
  }

  if (html === null) {
    return (
      <div className={`flex items-center justify-center p-8 text-muted-foreground ${className}`}>
        <span className="animate-pulse">Highlighting…</span>
      </div>
    );
  }

  return (
    <div
      className={`overflow-auto text-sm ${className}`}
      style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
    >
      <pre className="m-0 p-4 min-h-full">
        <code
          className="block"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
}
