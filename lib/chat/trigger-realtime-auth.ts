import { auth } from "@trigger.dev/sdk/v3";

export type TriggerRealtimeSession = {
  runId: string;
  accessToken: string;
};

export async function createTriggerRealtimeSessionForRun(
  triggerRunId: string | null | undefined
): Promise<TriggerRealtimeSession | null> {
  const runId = typeof triggerRunId === "string" ? triggerRunId.trim() : "";
  if (!runId) return null;

  try {
    const accessToken = await auth.createPublicToken({
      scopes: {
        read: {
          runs: [runId],
        },
      },
    });

    if (!accessToken || typeof accessToken !== "string") return null;
    return { runId, accessToken };
  } catch (error) {
    console.error("[chat] Failed creating Trigger realtime token", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
