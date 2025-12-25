import type { UIMessage } from "ai";

export type MessageRole = "user" | "assistant";

export interface Conversation {
  messages: UIMessage[];
  isLoading: boolean;
  error: string | null;
}
