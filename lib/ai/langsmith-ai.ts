import * as ai from "ai";
import {
  wrapAISDK,
  createLangSmithProviderOptions,
} from "langsmith/experimental/vercel";
import { getAIModelId } from "@/lib/ai/get-ai-model";

/**
 * Vercel AI SDK entry points wrapped for LangSmith (RunTree) tracing.
 * Use these for any server-side model calls so we do not double-trace with OTEL.
 */
const wrapped = wrapAISDK(ai);

export const {
  streamText,
  generateText,
  generateObject,
  streamObject,
  tool,
  embed,
  convertToModelMessages,
  stepCountIs,
} = wrapped;

/**
 * Builds the LangSmith provider-options slice for a Vercel AI SDK call.
 *
 * Vercel AI Gateway exposes models as `<provider>/<model>` (e.g.
 * `anthropic/claude-sonnet-4-6`), which does not match LangSmith's built-in
 * pricing tables (they key on the bare model id + provider). We split the
 * gateway prefix into `ls_provider` + `ls_model_name` here so cost shows up
 * automatically for any model LangSmith already prices.
 */
export async function langSmithCallOptions<
  T extends (...args: never[]) => unknown,
>(opts?: {
  useLighterModel?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const modelId = await getAIModelId(opts?.useLighterModel);
  const slash = modelId.indexOf("/");
  const lsModel =
    slash > 0
      ? {
          ls_provider: modelId.slice(0, slash),
          ls_model_name: modelId.slice(slash + 1),
        }
      : { ls_model_name: modelId };
  return createLangSmithProviderOptions<T>({
    metadata: { ...lsModel, ...opts?.metadata },
  });
}
