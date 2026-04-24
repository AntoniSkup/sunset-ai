"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface PendingMessage {
  id: string;
  chatId: string;
  message: string;
  attachments?: Array<{
    id: number;
    alias: string;
    blobUrl: string;
    mimeType: string;
    intent: "reference" | "site_asset" | "both";
    altHint?: string | null;
    label?: string | null;
  }>;
  createdAt: number;
  /**
   * When the turn-run was already enqueued before navigation (e.g. from the
   * /start page handler), this carries the resulting run id and realtime
   * session so the chat component can skip the duplicate POST and connect
   * straight to the streaming run. The chat still renders the message
   * optimistically from the surrounding fields; this metadata only controls
   * the streaming/connection side.
   */
  preEnqueued?: {
    runId: string;
    triggerRealtime: {
      runId: string;
      accessToken: string;
    } | null;
  };
}

interface PendingMessageStore {
  pendingMessage: PendingMessage | null;
  setPendingMessage: (pendingMessage: PendingMessage | null) => void;
}

export const usePendingMessageStore = create<PendingMessageStore>()(
  persist(
    (set) => ({
      pendingMessage: null,
      setPendingMessage: (pendingMessage) => set({ pendingMessage }),
    }),
    {
      name: "pending-message",
      storage: createJSONStorage(() => localStorage),
    }
  )
);


