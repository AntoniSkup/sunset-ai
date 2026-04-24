"use client";

import { useEffect, useRef, useState } from "react";

interface UseTypewriterOptions {
  /**
   * When false, the hook mirrors `text` synchronously with no animation.
   * Use this for historical (non-streaming) messages so they render instantly.
   */
  enabled: boolean;
  /**
   * Baseline reveal speed in characters per second. The loop adapts upward
   * from this baseline when the incoming stream is ahead of the animation,
   * so bursty chunks don't pile up behind a slow typewriter.
   */
  charsPerSecond?: number;
}

/**
 * Animates streamed text with a lightweight typewriter reveal that keeps up
 * with network chunks.
 *
 * Design notes:
 * - A single `requestAnimationFrame` loop drives reveal at ~60fps; React only
 *   re-renders when the visible slice changes.
 * - Reveal speed scales with the backlog (`fullText.length - visibleIndex`),
 *   so large bursts from fast models don't leave the animation lagging behind
 *   the actual stream.
 * - When `enabled` flips false (stream complete, or message loaded from DB)
 *   the hook snaps to the full text so completed messages never feel slow.
 */
export function useTypewriter(
  text: string,
  { enabled, charsPerSecond = 180 }: UseTypewriterOptions
): string {
  const [displayed, setDisplayed] = useState<string>(() =>
    enabled ? "" : text
  );

  // When animation is disabled at mount (historical message, or mid-stream
  // refresh) we treat the visible text as already fully revealed. This avoids
  // re-playing text a later `enabled` flip would otherwise try to animate.
  const indexRef = useRef(enabled ? 0 : text.length);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const textRef = useRef(text);
  const cpsRef = useRef(charsPerSecond);

  textRef.current = text;
  cpsRef.current = charsPerSecond;

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      indexRef.current = text.length;
      setDisplayed(text);
      return;
    }

    // A shorter `text` than what we've already revealed means the source was
    // reset (e.g. a retry produced a new assistant message). Start over.
    if (indexRef.current > text.length) {
      indexRef.current = 0;
      setDisplayed("");
    }

    if (indexRef.current >= text.length) {
      return;
    }

    if (rafRef.current != null) {
      return;
    }

    lastTimeRef.current = 0;

    const tick = (now: number) => {
      const fullText = textRef.current;
      const last = lastTimeRef.current || now;
      const deltaMs = now - last;
      lastTimeRef.current = now;

      const backlog = fullText.length - indexRef.current;
      const speedMultiplier =
        backlog > 400 ? 8 : backlog > 200 ? 4 : backlog > 80 ? 2 : 1;
      const msPerChar = 1000 / (cpsRef.current * speedMultiplier);
      const advance = Math.max(1, Math.floor(deltaMs / msPerChar));

      indexRef.current = Math.min(indexRef.current + advance, fullText.length);
      setDisplayed(fullText.slice(0, indexRef.current));

      if (indexRef.current < fullText.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [text, enabled]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return displayed;
}
