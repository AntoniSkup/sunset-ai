export type MessageRole = "user" | "assistant" | "error";

export interface ChatMessage {
  id: string;
  content: string;
  role: MessageRole;
  timestamp: Date;
  isStreaming: boolean;
  error?: string | null;
}

export interface Conversation {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}
