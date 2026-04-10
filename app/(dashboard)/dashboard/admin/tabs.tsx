"use client";

import { useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type InspirationItem = {
  id: string;
  description: string;
  tags: string[];
  createdAt: string;
};

export function InspirationsPanel() {
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [items, setItems] = useState<InspirationItem[]>([]);

  const canSubmit = description.trim().length > 0;

  const normalizedTagPreview = useMemo(() => sanitizeTag(tagInput), [tagInput]);

  function sanitizeTag(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "-");
  }

  function addTag(rawValue: string) {
    const next = sanitizeTag(rawValue);
    if (!next || tags.includes(next)) return;
    setTags((current) => [...current, next]);
    setTagInput("");
  }

  function removeTag(tagToRemove: string) {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  }

  function resetForm() {
    setDescription("");
    setTagInput("");
    setTags([]);
  }

  function handleTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addTag(tagInput);
  }

  function handleAddInspiration() {
    if (!canSubmit) return;

    const newItem: InspirationItem = {
      id: `${Date.now()}`,
      description: description.trim(),
      tags,
      createdAt: new Date().toISOString(),
    };

    setItems((current) => [newItem, ...current]);
    resetForm();
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>Inspiration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="inspiration-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="inspiration-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Paste or write the detailed hero inspiration outline..."
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-36 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
          />
          <p className="text-xs text-muted-foreground">
            This is frontend-only for now. Data will be persisted in the next
            step.
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
              placeholder="Add freeform tags (press Enter or comma)"
            />
            <Button type="button" variant="outline" onClick={() => addTag(tagInput)}>
              Add tag
            </Button>
          </div>
          {normalizedTagPreview && !tags.includes(normalizedTagPreview) ? (
            <p className="text-xs text-muted-foreground">
              Tag preview: <span className="font-mono">{normalizedTagPreview}</span>
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
            disabled={!canSubmit}
          >
            Add inspiration
          </Button>
          <Button type="button" variant="outline" onClick={resetForm}>
            Reset
          </Button>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Preview entries</h3>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No entries yet. Add your first inspiration above.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-muted/30 space-y-3 rounded-md border p-3"
                >
                  <p className="text-sm leading-6 whitespace-pre-wrap">
                    {item.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.length > 0 ? (
                      item.tags.map((tag) => (
                        <span
                          key={`${item.id}-${tag}`}
                          className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No tags</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
