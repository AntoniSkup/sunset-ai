import * as ai from "ai";
import { wrapAISDK } from "langsmith/experimental/vercel";

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
