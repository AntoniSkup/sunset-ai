import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { processDailyCredits } from "@/lib/billing/daily-credits";

/**
 * Cron endpoint to grant daily bonus credits to all accounts (Free: 5/day, Pro: 5/day up to 150/cycle).
 * Call via Vercel Cron or external scheduler. Protect with CRON_SECRET header if set.
 */
export async function GET() {
  const secret = process.env.CRON_SECRET;
  if (secret && secret !== "") {
    const authHeader = (await headers()).get("authorization");
    const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (bearer !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await processDailyCredits();
    return NextResponse.json({
      ok: true,
      accountsProcessed: result.accountsProcessed,
      grantsCreated: result.grantsCreated,
    });
  } catch (error) {
    console.error("[DailyCredits] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Daily credits failed",
      },
      { status: 500 }
    );
  }
}
