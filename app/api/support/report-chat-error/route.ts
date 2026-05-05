import { NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";

const MAX_MESSAGE = 4000;

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  if (!supportEmail) {
    return NextResponse.json(
      {
        error: "Support inbox not configured on server",
        useMailto: true,
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const message =
    typeof o.message === "string" ? o.message.trim().slice(0, MAX_MESSAGE) : "";
  const errorText =
    typeof o.errorText === "string" ? o.errorText.trim().slice(0, 2000) : "";
  const errorId = typeof o.errorId === "string" ? o.errorId.slice(0, 128) : "";
  const chatId =
    typeof o.chatId === "string" ? o.chatId.slice(0, 64) : undefined;

  if (!message) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    );
  }

  const emailBody = [
    `User: ${user.email} (id: ${user.id})`,
    chatId ? `Chat: ${chatId}` : "Chat: (unknown)",
    errorId ? `Error ref: ${errorId}` : "",
    "",
    "--- App error ---",
    errorText || "(none)",
    "",
    "--- User report ---",
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) {
    return NextResponse.json(
      { error: "Email sending not configured", useMailto: true },
      { status: 503 }
    );
  }

  const from =
    process.env.SUPPORT_EMAIL_FROM?.trim() ||
    "Stronka AI <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from,
      to: [supportEmail],
      subject: `[Stronka AI] Chat error report — ${user.email}`,
      text: emailBody,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[report-chat-error] Resend error:", res.status, errText);
    return NextResponse.json(
      { error: "Failed to send report" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
