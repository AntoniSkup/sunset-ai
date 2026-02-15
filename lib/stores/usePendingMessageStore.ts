"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface PendingMessage {
  id: string;
  chatId: string;
  message: string;
  createdAt: number;
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


