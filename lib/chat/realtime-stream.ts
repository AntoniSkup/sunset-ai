export const CHAT_TURN_TRIGGER_STREAM_KEY = "chat-turn-events";

export type ChatTurnRealtimeEnvelope = {
  dbId: number;
  logicalEventId: number;
  chatId: number;
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ChatTurnRealtimeStreamPart = string;
