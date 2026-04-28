import { z } from "zod";
import { getLocale } from "next-intl/server";
import { TeamDataWithMembers, User } from "@/lib/db/schema";
import type { Account } from "@/lib/db/schema";
import { getTeamForUser, getUser } from "@/lib/db/queries";
import { getOrCreateAccountForUser } from "@/lib/billing/accounts";
import { ensureDailyCreditsForAccount } from "@/lib/billing/daily-credits";
import { redirect } from "@/i18n/navigation";

/**
 * Server actions return translation KEYS, not pre-translated strings, so the
 * server stays locale-agnostic and the client renders the message in the
 * active UI locale via `useTranslations()`.
 *
 * - `errorKey` / `successKey` reference paths in `messages/<locale>.json`
 *   (e.g. `"errors.invalidCredentials"`).
 * - `messageParams` carries interpolation values for the translated string
 *   (`{detail}`, counts, names, etc.). Keep them serializable.
 * - `[key: string]: any` is preserved so actions can keep echoing form-field
 *   defaults back to the client (`email`, `password`, ...) for sticky inputs.
 */
export type ActionState = {
  errorKey?: string;
  successKey?: string;
  messageParams?: Record<string, string | number>;
  [key: string]: any;
};

type ValidatedActionFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData,
) => Promise<T>;

function validationErrorState(result: z.ZodSafeParseError<unknown>): ActionState {
  // Zod emits English messages we don't fully control. We surface a stable
  // key and pass the raw Zod message through as a `{detail}` param so the
  // translated wrapper can include it for debugging without faking i18n
  // coverage we don't have.
  return {
    errorKey: "errors.invalidInput",
    messageParams: {
      detail: result.error.issues[0]?.message ?? "Invalid input",
    },
  };
}

export function validatedAction<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionFunction<S, T>,
) {
  return async (prevState: ActionState, formData: FormData) => {
    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return validationErrorState(result);
    }

    return action(result.data, formData);
  };
}

type ValidatedActionWithUserFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData,
  user: User,
) => Promise<T>;

export function validatedActionWithUser<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionWithUserFunction<S, T>,
) {
  return async (prevState: ActionState, formData: FormData) => {
    const user = await getUser();
    if (!user) {
      throw new Error("User is not authenticated");
    }

    const result = schema.safeParse(Object.fromEntries(formData));
    if (!result.success) {
      return validationErrorState(result);
    }

    return action(result.data, formData, user);
  };
}

type ActionWithTeamFunction<T> = (
  formData: FormData,
  team: TeamDataWithMembers,
) => Promise<T>;

export function withTeam<T>(action: ActionWithTeamFunction<T>) {
  return async (formData: FormData): Promise<T> => {
    const user = await getUser();
    if (!user) {
      redirect("/sign-in", await getLocale());
    }

    const team = await getTeamForUser();
    if (!team) {
      throw new Error("Team not found");
    }

    return action(formData, team);
  };
}

type ActionWithAccountFunction<T> = (
  formData: FormData,
  account: Account
) => Promise<T>;

export function withAccount<T>(action: ActionWithAccountFunction<T>) {
  return async (formData: FormData): Promise<T> => {
    const user = await getUser();
    if (!user) {
      redirect("/sign-in", await getLocale());
    }

    const account = await getOrCreateAccountForUser(user.id);
    await ensureDailyCreditsForAccount(account.id);
    return action(formData, account);
  };
}
