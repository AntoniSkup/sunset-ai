import { tool } from "@/lib/ai/langsmith-ai";
import { z } from "zod";
import { setChatFormNotificationEmail } from "@/lib/db/queries";

/**
 * `set_form_notification_email` LLM tool.
 *
 * Lets the model wire the chat's form-submission recipient to a specific
 * email when the user asks something like "send form submissions to
 * ops@acme.com" or "send leads from this site to me at hi@me.com".
 *
 * Pass `email: null` (or empty) to clear the override and fall back to the
 * chat owner's account email.
 *
 * Authorization is enforced at the query layer: the WHERE clause is scoped
 * on `(publicId = chatId AND userId = userId)`, so a misrouted call can
 * never overwrite somebody else's chat.
 */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const setFormNotificationEmailSchema = z.object({
  email: z
    .union([z.string(), z.null()])
    .describe(
      "Destination email for form submissions on this site. Must look like 'name@domain.tld'. Pass null or an empty string to clear the override and fall back to the chat owner's account email."
    ),
});

const setFormNotificationEmailExecute = async (
  { email }: z.infer<typeof setFormNotificationEmailSchema>,
  chatId: string,
  userId: number
): Promise<{
  success: boolean;
  cleared?: boolean;
  recipient?: string | null;
  error?: string;
}> => {
  if (!chatId) {
    return { success: false, error: "Chat ID is required" };
  }

  const trimmed = typeof email === "string" ? email.trim() : "";
  const isClearing = !trimmed;

  if (!isClearing && !EMAIL_REGEX.test(trimmed)) {
    return {
      success: false,
      error:
        "That doesn't look like a valid email address (expected something like name@domain.tld). Ask the user to confirm the address before retrying.",
    };
  }

  const updated = await setChatFormNotificationEmail(
    chatId,
    userId,
    isClearing ? null : trimmed
  );

  if (!updated) {
    return {
      success: false,
      error:
        "Couldn't update the notification email — chat not found or you don't own it.",
    };
  }

  return {
    success: true,
    cleared: isClearing,
    recipient: updated.formNotificationEmail,
  };
};

export function createSetFormNotificationEmailTool(
  chatId: string,
  userId: number
) {
  return tool({
    description:
      "Set (or clear) the email address that receives notifications when visitors submit forms on this site. Use when the user asks to change where form submissions are sent — e.g. 'send form submissions to ops@acme.com' or 'forward leads to me at hi@me.com'. Pass an empty string or null for `email` to clear the override and fall back to the user's account email. The setting is per-chat and persists across regenerations and publishes.",
    inputSchema: setFormNotificationEmailSchema,
    execute: async (input: z.infer<typeof setFormNotificationEmailSchema>) => {
      return setFormNotificationEmailExecute(input, chatId, userId);
    },
  } as any);
}
