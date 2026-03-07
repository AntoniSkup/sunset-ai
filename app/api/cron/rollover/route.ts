import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { processRollover } from "@/lib/billing/rollover";

/**
 * Cron endpoint to close overdue subscription cycles and create rollover grants.
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
    const { closed, rolloversCreated } = await processRollover();
    return NextResponse.json({ ok: true, closed, rolloversCreated });
  } catch (error) {
    console.error("[Rollover] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rollover failed" },
      { status: 500 }
    );
  }
}
