"use server";

import { z } from "zod";
import { and, eq, sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  User,
  users,
  teams,
  teamMembers,
  activityLogs,
  type NewUser,
  type NewTeam,
  type NewTeamMember,
  type NewActivityLog,
  ActivityType,
  invitations,
} from "@/lib/db/schema";
import { comparePasswords, hashPassword, setSession } from "@/lib/auth/session";
import { redirect } from "@/i18n/navigation";
import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { createCheckoutSession } from "@/lib/payments/stripe";
import { getUser, getUserWithTeam } from "@/lib/db/queries";
import { getOrCreateAccountForUser } from "@/lib/billing/accounts";
import { ensureDailyCreditsForAccount } from "@/lib/billing/daily-credits";
import {
  validatedAction,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { routing } from "@/i18n/routing";

/**
 * Resolve the locale to persist on a newly created user. We trust the
 * NEXT_LOCALE cookie set by the i18n middleware (which itself derives from
 * URL prefix → cookie → Accept-Language → default), but validate against
 * the configured locale list so a tampered cookie can't write garbage.
 */
async function resolveSignUpLocale(): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("NEXT_LOCALE")?.value;
  return hasLocale(routing.locales, fromCookie)
    ? fromCookie
    : routing.defaultLocale;
}

/**
 * Persist a user's preferred locale.
 *
 * - Updates `users.locale` so server-side concerns (transactional emails,
 *   AI prompt language, sitemap-style canonicalization) have a stable
 *   source of truth without needing the request cookie.
 * - Mirrors the choice into the `NEXT_LOCALE` cookie so subsequent
 *   non-prefixed navigation (e.g. clicking a `<Link href="/dashboard">`
 *   that doesn't carry a locale option) lands in the right locale.
 *
 * Validates against `routing.locales` so a tampered argument is a no-op.
 * Best-effort for unauthenticated callers — only the cookie is set then.
 */
export async function setUserLocale(locale: string): Promise<void> {
  if (!hasLocale(routing.locales, locale)) return;

  const user = await getUser();
  if (user) {
    try {
      await db.update(users).set({ locale }).where(eq(users.id, user.id));
    } catch (err) {
      console.error("Failed to update users.locale:", err);
    }
  }

  (await cookies()).set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  try {
    const newActivity: NewActivityLog = {
      teamId,
      userId,
      action: type,
      ipAddress: ipAddress || "",
    };
    await db.insert(activityLogs).values(newActivity);
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  const userWithTeam = await db
    .select({
      user: users,
      team: teams,
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(users.email, email))
    .limit(1);

  if (userWithTeam.length === 0) {
    return {
      errorKey: "errors.invalidCredentials",
      email,
      password,
    };
  }

  const { user: foundUser, team: foundTeam } = userWithTeam[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return {
      errorKey: "errors.invalidCredentials",
      email,
      password,
    };
  }

  await Promise.all([
    setSession(foundUser),
    logActivity(foundTeam?.id, foundUser.id, ActivityType.SIGN_IN),
  ]);

  const redirectTo = formData.get("redirect") as string | null;
  if (redirectTo === "checkout") {
    const priceId = formData.get("priceId") as string;
    return createCheckoutSession({ team: foundTeam, priceId });
  }

  redirect("/start", await getLocale());
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional(),
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      errorKey: "errors.emailExists",
      email,
      password,
    };
  }

  const passwordHash = await hashPassword(password);
  const signUpLocale = await resolveSignUpLocale();

  const newUser: NewUser = {
    email,
    passwordHash,
    role: "owner", // Default role, will be overridden if there's an invitation
    locale: signUpLocale,
  };

  let createdUser;
  try {
    [createdUser] = await db.insert(users).values(newUser).returning();
  } catch (error: any) {
    if (error?.code === "23505" || error?.message?.includes("unique")) {
      return {
        errorKey: "errors.emailExists",
        email,
        password,
      };
    }
    console.error("Error creating user:", error);
    return {
      errorKey: "errors.createUserFailed",
      email,
      password,
    };
  }

  if (!createdUser) {
    return {
      errorKey: "errors.createUserFailed",
      email,
      password,
    };
  }

  let teamId: number;
  let userRole: string;
  let createdTeam: typeof teams.$inferSelect | null = null;

  if (inviteId) {
    // Check if there's a valid invitation
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, parseInt(inviteId)),
          eq(invitations.email, email),
          eq(invitations.status, "pending")
        )
      )
      .limit(1);

    if (invitation) {
      teamId = invitation.teamId;
      userRole = invitation.role;

      await db
        .update(invitations)
        .set({ status: "accepted" })
        .where(eq(invitations.id, invitation.id));

      await logActivity(teamId, createdUser.id, ActivityType.ACCEPT_INVITATION);

      [createdTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
    } else {
      return { errorKey: "errors.invalidInvitation", email, password };
    }
  } else {
    // Create a new team if there's no invitation
    const newTeam: NewTeam = {
      name: `${email}'s Team`,
    };

    try {
      [createdTeam] = await db.insert(teams).values(newTeam).returning();
    } catch (error) {
      console.error("Error creating team:", error);
      return {
        errorKey: "errors.createTeamFailed",
        email,
        password,
      };
    }

    if (!createdTeam) {
      return {
        errorKey: "errors.createTeamFailed",
        email,
        password,
      };
    }

    teamId = createdTeam.id;
    userRole = "owner";

    await logActivity(teamId, createdUser.id, ActivityType.CREATE_TEAM);
  }

  const newTeamMember: NewTeamMember = {
    userId: createdUser.id,
    teamId: teamId,
    role: userRole,
  };

  try {
    await Promise.all([
      db.insert(teamMembers).values(newTeamMember),
      logActivity(teamId, createdUser.id, ActivityType.SIGN_UP),
      setSession(createdUser),
    ]);
    const account = await getOrCreateAccountForUser(createdUser.id);
    // Best-effort daily-credit grant. We never want a billing-side hiccup
    // (missing plan row, wallet race, etc.) to reject the user's sign-up:
    // the account + wallet are already in place, and the daily-credits
    // cron will backfill any missed grant on its next run.
    try {
      await ensureDailyCreditsForAccount(account.id);
    } catch (creditError) {
      console.error(
        "Daily credit grant failed during signup (non-fatal):",
        creditError
      );
    }
  } catch (error) {
    console.error("Error creating team member or setting session:", error);
    return {
      errorKey: "errors.signUpFailed",
      email,
      password,
    };
  }

  const redirectTo = formData.get("redirect") as string | null;
  if (redirectTo === "checkout") {
    const priceId = formData.get("priceId") as string;
    return createCheckoutSession({ team: createdTeam, priceId });
  }

  redirect("/start", await getLocale());
});

export async function signOut() {
  const user = (await getUser()) as User;
  const userWithTeam = await getUserWithTeam(user.id);
  await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  (await cookies()).delete("session");
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        errorKey: "errors.currentPasswordIncorrect",
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        errorKey: "errors.newPasswordSameAsCurrent",
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        errorKey: "errors.passwordMismatch",
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD),
    ]);

    return {
      successKey: "success.passwordUpdated",
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        errorKey: "errors.deleteAccountWrongPassword",
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

    // Soft delete
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')`, // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));

    if (userWithTeam?.teamId) {
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, user.id),
            eq(teamMembers.teamId, userWithTeam.teamId)
          )
        );
    }

    (await cookies()).delete("session");
    redirect("/sign-in", await getLocale());
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT),
    ]);

    return { name, successKey: "success.accountUpdated" };
  }
);

const removeTeamMemberSchema = z.object({
  memberId: z.number(),
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { errorKey: "errors.notInTeam" };
    }

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.teamId, userWithTeam.teamId)
        )
      );

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.REMOVE_TEAM_MEMBER
    );

    return { successKey: "success.memberRemoved" };
  }
);

const inviteTeamMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["member", "owner"]),
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { errorKey: "errors.notInTeam" };
    }

    const existingMember = await db
      .select()
      .from(users)
      .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
      .where(
        and(eq(users.email, email), eq(teamMembers.teamId, userWithTeam.teamId))
      )
      .limit(1);

    if (existingMember.length > 0) {
      return { errorKey: "errors.userAlreadyMember" };
    }

    // Check if there's an existing invitation
    const existingInvitation = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.teamId, userWithTeam.teamId),
          eq(invitations.status, "pending")
        )
      )
      .limit(1);

    if (existingInvitation.length > 0) {
      return { errorKey: "errors.invitationAlreadySent" };
    }

    // Create a new invitation
    await db.insert(invitations).values({
      teamId: userWithTeam.teamId,
      email,
      role,
      invitedBy: user.id,
      status: "pending",
    });

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.INVITE_TEAM_MEMBER
    );

    // TODO: Send invitation email and include ?inviteId={id} to sign-up URL
    // await sendInvitationEmail(email, userWithTeam.team.name, role)

    return { successKey: "success.invitationSent" };
  }
);
