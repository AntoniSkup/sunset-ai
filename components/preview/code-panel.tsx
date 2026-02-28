"use client";

import { useEffect, useState } from "react";
import { CodeViewer } from "./code-viewer";

interface CodePanelProps {
  chatId: string;
  revisionNumber: number | null;
  className?: string;
}

type FileItem = { path: string };

export function CodePanel({
  chatId,
  revisionNumber,
  className = "",
}: CodePanelProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingTree(true);
    setError(null);

    const params = new URLSearchParams();
    if (revisionNumber != null) {
      params.set("revisionNumber", String(revisionNumber));
    }
    const url = `/api/preview/${encodeURIComponent(chatId)}/code${params.toString() ? `?${params}` : ""}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load file list");
        return res.json();
      })
      .then((data: { files?: FileItem[] }) => {
        if (cancelled) return;
        const list = data.files ?? [];
        setFiles(list);
        setLoadingTree(false);
        if (list.length > 0) {
          setSelectedPath(list[0].path);
        } else {
          setSelectedPath(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setLoadingTree(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, revisionNumber]);

  useEffect(() => {
    if (!selectedPath) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setLoadingFile(true);
    setContent(null);

    const params = new URLSearchParams({ path: selectedPath });
    if (revisionNumber != null) {
      params.set("revisionNumber", String(revisionNumber));
    }
    const url = `/api/preview/${encodeURIComponent(chatId)}/code-file?${params}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load file");
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoadingFile(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load file");
          setLoadingFile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, selectedPath, revisionNumber]);

  if (error && !files.length) {
    return (
      <div className={`flex items-center justify-center p-8 text-muted-foreground ${className}`}>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 ${className}`}>
      <div className="w-56 shrink-0 border-r bg-muted/30 flex flex-col min-h-0">
        <div className="shrink-0 px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Files
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="py-1">
            {loadingTree ? (
              <div className="px-3 py-2 text-sm text-muted-foreground animate-pulse">
                Loading…
              </div>
            ) : (
              files.map(({ path }) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setSelectedPath(path)}
                  className={`block w-full text-left px-3 py-2 text-sm truncate transition-colors ${
                    selectedPath === path
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                  title={path}
                >
                  {path.split("/").pop() ?? path}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col bg-[#0d1117] text-[#c9d1d9]">
        {selectedPath && (
          <div className="shrink-0 px-4 py-2 border-b border-white/10 text-xs text-muted-foreground font-mono">
            {selectedPath}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loadingFile && !content ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading…
            </div>
          ) : content !== null && selectedPath ? (
            <CodeViewer
              code={content}
              path={selectedPath}
              className="h-full"
            />
          ) : !selectedPath && !loadingTree ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No files in this revision
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
