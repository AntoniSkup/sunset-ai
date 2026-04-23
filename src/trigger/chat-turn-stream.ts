import { streams } from "@trigger.dev/sdk/v3";
import {
  CHAT_TURN_TRIGGER_STREAM_KEY,
  type ChatTurnRealtimeStreamPart,
} from "@/lib/chat/realtime-stream";

export const chatTurnEventsStream = streams.define<ChatTurnRealtimeStreamPart>({
  id: CHAT_TURN_TRIGGER_STREAM_KEY,
});
