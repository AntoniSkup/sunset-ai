"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisHorizontalIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type InspirationItem = {
  id: number;
  description: string;
  section: string;
  tags: string[];
  createdAt: string;
};

export function InspirationsPanel() {
  const [description, setDescription] = useState("");
  const [sectionInput, setSectionInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = description.trim().length > 0 || tags.length > 0;

  const normalizedTagPreview = useMemo(() => {
    const parsed = parseTags(tagInput);
    if (parsed.length === 0) return [];

    const deduped = Array.from(new Set(parsed));
    return deduped.filter((tag) => !tags.includes(tag));
  }, [tagInput, tags]);

  function sanitizeTag(value: string): string {
    return value
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  function normalizeSectionValue(raw: string): string {
    return raw
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 64);
  }

  function parseTags(rawValue: string): string[] {
    return rawValue
      .split(",")
      .map((value) => sanitizeTag(value))
      .filter(Boolean);
  }

  function extractFromDescriptionInput(rawValue: string): {
    description: string;
    tags: string[];
    section?: string;
  } {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return { description: "", tags: [] };
    }

    // 1) JSON support:
    // - { "description": "...", "section": "...", "tags": ["..."] }
    // - ["tag-1", "tag-2"]
    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        const parsedTags = parsed
          .filter((value): value is string => typeof value === "string")
          .flatMap((value) => parseTags(value));

        return { description: "", tags: parsedTags };
      }

      if (parsed && typeof parsed === "object") {
        const parsedDescription =
          typeof (parsed as { description?: unknown }).description === "string"
            ? (parsed as { description: string }).description.trim()
            : "";

        const parsedSection =
          typeof (parsed as { section?: unknown }).section === "string"
            ? (parsed as { section: string }).section.trim()
            : "";

        const parsedTagsRaw = (parsed as { tags?: unknown }).tags;
        const parsedTags = Array.isArray(parsedTagsRaw)
          ? parsedTagsRaw
              .filter((value): value is string => typeof value === "string")
              .flatMap((value) => parseTags(value))
          : [];

        return {
          description: parsedDescription,
          tags: parsedTags,
          ...(parsedSection ? { section: parsedSection } : {}),
        };
      }
    } catch {
      // Not JSON, continue with freeform extraction below.
    }

    // 2) Quoted list support:
    // "tag-a",
    // "tag-b",
    // ...
    const quoted = Array.from(trimmed.matchAll(/["']([^"']+)["']/g)).map(
      (match) => match[1] ?? ""
    );

    if (quoted.length >= 2) {
      return {
        description: "",
        tags: quoted.flatMap((value) => parseTags(value)),
      };
    }

    return { description: trimmed, tags: [] };
  }

  useEffect(() => {
    let isMounted = true;

    async function loadItems() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch("/api/admin/inspirations", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load inspirations");
        }

        const data = (await response.json()) as { items?: InspirationItem[] };
        if (!isMounted) return;
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (loadError) {
        if (!isMounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load inspirations"
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      isMounted = false;
    };
  }, []);

  function addTag(rawValue: string) {
    const nextTags = parseTags(rawValue);
    if (nextTags.length === 0) return;

    setTags((current) => {
      const merged = new Set(current);
      for (const tag of nextTags) {
        merged.add(tag);
      }
      return Array.from(merged);
    });
    setTagInput("");
  }

  function removeTag(tagToRemove: string) {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  }

  function resetForm() {
    setDescription("");
    setSectionInput("");
    setTagInput("");
    setTags([]);
  }

  function handleTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addTag(tagInput);
  }

  async function handleAddInspiration() {
    if (!canSubmit) return;

    const extracted = extractFromDescriptionInput(description);
    const descriptionFromInput = extracted.description.trim();
    const mergedTags = Array.from(new Set([...tags, ...extracted.tags]));
    const fromManualSection = normalizeSectionValue(sectionInput);
    const fromJsonSection =
      extracted.section !== undefined
        ? normalizeSectionValue(extracted.section)
        : "";
    const finalSection = fromManualSection || fromJsonSection || "unknown";

    const finalDescription =
      descriptionFromInput || "Imported tag-driven inspiration entry.";

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch("/api/admin/inspirations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: finalDescription,
          section: finalSection,
          tags: mergedTags,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save inspiration");
      }

      const data = (await response.json()) as { item?: InspirationItem };
      if (!data.item) {
        throw new Error("Server did not return created inspiration");
      }

      setItems((current) => [data.item!, ...current]);
      resetForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save inspiration"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteInspiration(id: number) {
    try {
      setError(null);
      const response = await fetch(`/api/admin/inspirations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete inspiration");
      }

      setItems((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete inspiration"
      );
    }
  }

  const columns = useMemo<ColumnDef<InspirationItem>[]>(
    () => [
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <p className="line-clamp-3 max-w-[560px] whitespace-pre-wrap text-sm leading-6">
            {row.original.description}
          </p>
        ),
      },
      {
        accessorKey: "section",
        header: "Section",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.section}</span>
        ),
        size: 140,
      },
      {
        accessorKey: "tags",
        header: "Tags",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.tags.length > 0 ? (
            <div className="flex max-w-[360px] flex-wrap gap-1.5">
              {row.original.tags.map((tag) => (
                <span
                  key={`${row.original.id}-${tag}`}
                  className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No tags</span>
          ),
        filterFn: (row, _columnId, filterValue) => {
          if (!filterValue) return true;
          const search = String(filterValue).toLowerCase();
          return row.original.tags.some((tag) =>
            tag.toLowerCase().includes(search)
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString()}
          </span>
        ),
        sortingFn: (a, b) =>
          new Date(a.original.createdAt).getTime() -
          new Date(b.original.createdAt).getTime(),
        size: 200,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        size: 56,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open row actions"
                >
                  <EllipsisHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => handleDeleteInspiration(row.original.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card className="border-border/70 self-start">
        <CardHeader>
          <CardTitle>Add inspiration</CardTitle>
          <CardDescription>
            Paste a description, JSON, or quoted tag list — we&apos;ll extract
            sections and tags automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="inspiration-description"
              className="text-sm font-medium"
            >
              Description
            </label>
            <textarea
              id="inspiration-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Paste or write the detailed inspiration outline..."
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-36 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
            />
            <p className="text-xs text-muted-foreground">
              Paste regular text, a JSON object with <code>description</code>,{" "}
              <code>section</code>, and <code>tags</code>, or a quoted tag list.
              We auto-extract tags and section when present.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="inspiration-section" className="text-sm font-medium">
              Section
            </label>
            <Input
              id="inspiration-section"
              value={sectionInput}
              onChange={(event) => setSectionInput(event.target.value)}
              placeholder="e.g. hero, footer, map (optional; defaults to unknown)"
            />
            <p className="text-xs text-muted-foreground">
              Overrides <code>section</code> from pasted JSON when filled.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="inspiration-tags" className="text-sm font-medium">
              Tags
            </label>
            <div className="flex gap-2">
              <Input
                id="inspiration-tags"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder='Add tags (e.g. "fintech", "dark-ui", "saas")'
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addTag(tagInput)}
              >
                Add tag
              </Button>
            </div>
            {normalizedTagPreview.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Tag preview:{" "}
                <span className="font-mono">
                  {normalizedTagPreview.join(", ")}
                </span>
              </p>
            ) : null}
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-opacity hover:opacity-80"
                    aria-label={`Remove ${tag}`}
                  >
                    {tag}
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No tags yet. Add as many freeform tags as you want.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleAddInspiration}
              disabled={!canSubmit || isSaving}
            >
              {isSaving ? "Saving..." : "Add inspiration"}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              Reset
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>
            Inspirations{" "}
            <span className="text-muted-foreground text-sm font-normal">
              ({items.length})
            </span>
          </CardTitle>
          <CardDescription>
            All saved inspiration entries. Filter by description, section, or
            tags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading inspirations...
            </p>
          ) : (
            <DataTable
              columns={columns}
              data={items}
              searchPlaceholder="Search by description, section, or tags..."
              emptyState="No entries yet. Add your first inspiration on the left."
              pageSize={25}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
