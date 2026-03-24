import { tasks } from "@trigger.dev/sdk/v3";

export async function triggerChatTurnTask(turnRunId: string) {
  const handle = await tasks.trigger("run-chat-turn", { turnRunId });
  return handle;
}
