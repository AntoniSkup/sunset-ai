"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const STATIC_TEXT = "Make a website ";
const PHRASES = [
  "for my business",
  "for my freelance portfolio",
  "for my coffee shop",
];

const TYPE_DELAY_MS = 50;
const DELETE_DELAY_MS = 30;
const PAUSE_AFTER_TYPE_MS = 3000;

export function TypewriterPlaceholder({ className }: { className?: string }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visibleLength, setVisibleLength] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phrase = PHRASES[phraseIndex];
  const displayedSuffix = phrase.slice(0, visibleLength);

  useEffect(() => {
    const delay = isDeleting ? DELETE_DELAY_MS : TYPE_DELAY_MS;

    if (isDeleting) {
      if (visibleLength === 0) {
        setPhraseIndex((i) => (i + 1) % PHRASES.length);
        setIsDeleting(false);
        return;
      }
      timeoutRef.current = setTimeout(() => {
        setVisibleLength((n) => n - 1);
      }, delay);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    if (visibleLength >= phrase.length) {
      timeoutRef.current = setTimeout(
        () => setIsDeleting(true),
        PAUSE_AFTER_TYPE_MS
      );
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    timeoutRef.current = setTimeout(() => {
      setVisibleLength((n) => n + 1);
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visibleLength, isDeleting, phrase.length]);

  return (
    <span className={cn("text-gray-400", className)}>
      {STATIC_TEXT}
      <span className="text-gray-400">{displayedSuffix}</span>
      <span
        className="inline-block h-[1em] w-0.5 animate-pulse bg-gray-400 align-baseline"
        aria-hidden
      />
    </span>
  );
}
