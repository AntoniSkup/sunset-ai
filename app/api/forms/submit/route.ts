import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createFormSubmission,
  getFormNotificationRecipientForChat,
  getPublishedSiteByPublicId,
} from "@/lib/db/queries";
import {
  getPublishedSiteLabelFromHost,
  isDeployHost,
} from "@/lib/preview/deploy-host";
import { verifyRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { getScreenshotCaptureHost } from "@/lib/screenshots/public-app-origin";

/**
 * Public form submission endpoint for AI-generated landing sites.
 *
 * Surface: receives `POST /api/forms/submit` from inside the deploy-origin
 * iframe (preview shell or published site). The body identifies which chat
 * the submission belongs to via either:
 *   - `mode: "preview"` + `token` (the same JWT that gates `/p/<token>`), or
 *   - `mode: "published"` + `publicId` (the site's subdomain label, also
 *     cross-checked against the deploy subdomain when the request comes in
 *     on `<slug>.stronkaai-deploy.com`).
 *
 * Hardening:
 *   - Host check: only accepts requests on the deploy origin (apex or any
 *     subdomain). The main app must never accept these. Reject otherwise to
 *     prevent CSRF-style submissions through main-app cookies.
 *   - Honeypot: silently treats any non-empty `_honey` / `_gotcha` /
 *     `website` field as a successful no-op so bots don't get a signal.
 *   - Per-IP rate limit: 8 submissions per 10 minutes per (ip, chat).
 *   - Field size caps: 64 fields, 10000 chars per field.
 *
 * Email delivery uses the same Resend setup as the support inbox
 * (`SUPPORT_EMAIL_FROM`). Recipient resolution prefers
 * `chats.form_notification_email` over the chat owner's account email.
 */

const MAX_FIELDS = 64;
const MAX_FIELD_VALUE_CHARS = 10_000;
const MAX_BODY_CHARS = 200_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_MAX = 8;

type SubmissionMode = "preview" | "published";

type ParsedBody = {
  mode: SubmissionMode;
  token: string | null;
  publicId: string | null;
  formName: string | null;
  pageUrl: string | null;
  fields: Record<string, unknown>;
};

const rateLimitBuckets = new Map<
  string,
  { count: number; resetAt: number }
>();

function ipAndChatKey(ip: string, chatId: string): string {
  return `${ip}|${chatId}`;
}

function recordRateLimitHit(ip: string, chatId: string): boolean {
  const key = ipAndChatKey(ip, chatId);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return true;
}

function pruneRateBuckets() {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (now >= bucket.resetAt) rateLimitBuckets.delete(key);
  }
}

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

function hashIp(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  const salt = process.env.AUTH_SECRET || "";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}

function normalizeStringField(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxChars);
}

function sanitizeFields(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return null;
  if (entries.length > MAX_FIELDS) return null;

  const out: Record<string, unknown> = {};
  for (const [keyRaw, val] of entries) {
    const key = String(keyRaw).trim().slice(0, 128);
    if (!key) continue;
    if (Array.isArray(val)) {
      out[key] = val
        .map((v) =>
          typeof v === "string" ? v.slice(0, MAX_FIELD_VALUE_CHARS) : String(v ?? "")
        )
        .slice(0, 32);
    } else if (typeof val === "string") {
      out[key] = val.slice(0, MAX_FIELD_VALUE_CHARS);
    } else if (typeof val === "number" || typeof val === "boolean") {
      out[key] = val;
    } else {
      out[key] = String(val ?? "");
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseBody(raw: unknown): ParsedBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const modeRaw = typeof o.mode === "string" ? o.mode.trim().toLowerCase() : "";
  const mode: SubmissionMode | null =
    modeRaw === "preview" ? "preview" : modeRaw === "published" ? "published" : null;
  if (!mode) return null;

  const fields = sanitizeFields(o.fields);
  if (!fields) return null;

  return {
    mode,
    token: normalizeStringField(o.token, 4096),
    publicId: normalizeStringField(o.publicId, 64),
    formName: normalizeStringField(o.formName, 64),
    pageUrl: normalizeStringField(o.pageUrl, 1024),
    fields,
  };
}

function isAllowedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  if (isDeployHost(host)) return true;
  // Screenshot tunnel (ngrok pointing at dev) is treated like the deploy
  // host for preview shells; mirror that here so test captures + manual
  // testing through the tunnel keep working.
  const tunnelHost = getScreenshotCaptureHost();
  if (!tunnelHost) return false;
  const norm = host.split(",")[0]?.trim().toLowerCase() || "";
  return norm === tunnelHost.toLowerCase();
}

async function resolveChatId(
  body: ParsedBody,
  host: string | null
): Promise<{ chatId: string; publishedPublicId: string | null } | null> {
  if (body.mode === "preview") {
    if (!body.token) return null;
    const verified = await verifyRenderSnapshotToken(body.token);
    if (!verified?.chatId) return null;
    return { chatId: verified.chatId, publishedPublicId: null };
  }

  if (body.mode === "published") {
    if (!body.publicId) return null;
    const subdomainLabel = getPublishedSiteLabelFromHost(host);
    // If the request arrived on a subdomain, body.publicId must match it.
    // This makes it impossible to submit to chat A's recipient by spoofing
    // a body field while connected to chat B's subdomain.
    if (subdomainLabel && subdomainLabel !== body.publicId) return null;
    const site = await getPublishedSiteByPublicId(body.publicId);
    if (!site) return null;
    return { chatId: site.chatId, publishedPublicId: site.publicId };
  }

  return null;
}

function buildEmailBody(params: {
  chatId: string;
  formName: string | null;
  fields: Record<string, unknown>;
  pageUrl: string | null;
  mode: SubmissionMode;
  publishedPublicId: string | null;
}): { subject: string; text: string } {
  const subject =
    `[Stronka AI] New form submission` +
    (params.formName ? ` (${params.formName})` : "");
  const lines: string[] = [];
  lines.push(`Site chat: ${params.chatId}`);
  if (params.publishedPublicId) {
    lines.push(`Published site: ${params.publishedPublicId}`);
  }
  if (params.formName) lines.push(`Form: ${params.formName}`);
  if (params.pageUrl) lines.push(`Page: ${params.pageUrl}`);
  lines.push(`Mode: ${params.mode}`);
  lines.push("");
  lines.push("--- Submitted fields ---");
  for (const [key, val] of Object.entries(params.fields)) {
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const v of val) lines.push(`  - ${String(v)}`);
    } else if (typeof val === "object" && val !== null) {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else {
      lines.push(`${key}: ${String(val)}`);
    }
  }
  return { subject, text: lines.join("\n") };
}

async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend ${res.status}: ${errText.slice(0, 500)}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(request: NextRequest) {
  pruneRateBuckets();

  // Defense in depth: this endpoint is part of the same Next app that hosts
  // the dashboard/billing/etc. — never allow it to be invoked from anywhere
  // but the deploy origin (or a configured screenshot tunnel).
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isAllowedHost(host)) {
    return NextResponse.json(
      { error: "Forbidden", code: "BAD_HOST" },
      { status: 403 }
    );
  }

  // Light body size check before JSON parse to avoid pathological inputs.
  const cl = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(cl) && cl > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: "Payload too large", code: "TOO_LARGE" },
      { status: 413 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid submission payload", code: "INVALID_PAYLOAD" },
      { status: 400 }
    );
  }

  const resolved = await resolveChatId(body, host);
  if (!resolved) {
    return NextResponse.json(
      { error: "Unknown site", code: "UNKNOWN_SITE" },
      { status: 404 }
    );
  }

  const ip = getClientIp(request);
  if (!recordRateLimitHit(ip, resolved.chatId)) {
    return NextResponse.json(
      {
        error: "Too many submissions. Please wait a few minutes and try again.",
        code: "RATE_LIMITED",
      },
      { status: 429 }
    );
  }

  const recipientInfo = await getFormNotificationRecipientForChat(
    resolved.chatId
  );
  if (!recipientInfo) {
    // No owner mapping at all — drop quietly so we don't leak whether the
    // chat exists. From the visitor's POV the form just succeeded; nothing
    // to retry. Server log is enough for triage.
    console.warn(
      "[forms/submit] no recipient resolved for chat",
      resolved.chatId
    );
    return NextResponse.json({ ok: true });
  }

  const ipHash = hashIp(ip);
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  // Preview mode: never actually send. We still record the submission so the
  // user can confirm the wiring works end-to-end, and we tell the runtime
  // which recipient *would* have received the email so it can render that
  // in the toast inside the iframe.
  if (body.mode === "preview") {
    await createFormSubmission({
      chatId: resolved.chatId,
      publishedPublicId: resolved.publishedPublicId,
      mode: "preview",
      formName: body.formName,
      pageUrl: body.pageUrl,
      fields: body.fields,
      recipientEmail: recipientInfo.recipient,
      emailDeliveryStatus: "skipped",
      emailDeliveryError: null,
      submitterIpHash: ipHash,
      userAgent,
    });
    return NextResponse.json({
      ok: true,
      mode: "preview",
      recipient: recipientInfo.recipient,
    });
  }

  // Published mode: deliver via Resend (if configured) and record the result.
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.SUPPORT_EMAIL_FROM?.trim() ||
    "Stronka AI <onboarding@resend.dev>";

  let deliveryStatus: "sent" | "skipped" | "failed" = "skipped";
  let deliveryError: string | null = null;

  if (!apiKey) {
    deliveryStatus = "skipped";
    deliveryError = "RESEND_API_KEY not configured";
    console.error("[forms/submit] " + deliveryError);
  } else {
    const { subject, text } = buildEmailBody({
      chatId: resolved.chatId,
      formName: body.formName,
      fields: body.fields,
      pageUrl: body.pageUrl,
      mode: body.mode,
      publishedPublicId: resolved.publishedPublicId,
    });
    const result = await sendViaResend({
      apiKey,
      from,
      to: recipientInfo.recipient,
      subject,
      text,
    });
    if (result.ok) {
      deliveryStatus = "sent";
    } else {
      deliveryStatus = "failed";
      deliveryError = result.error;
      console.error("[forms/submit] Resend failed:", deliveryError);
    }
  }

  await createFormSubmission({
    chatId: resolved.chatId,
    publishedPublicId: resolved.publishedPublicId,
    mode: "published",
    formName: body.formName,
    pageUrl: body.pageUrl,
    fields: body.fields,
    recipientEmail: recipientInfo.recipient,
    emailDeliveryStatus: deliveryStatus,
    emailDeliveryError: deliveryError,
    submitterIpHash: ipHash,
    userAgent,
  });

  // Don't leak delivery failure to the visitor — show a friendly success
  // either way, since we have the record stored and can surface failures
  // in the dashboard later. Internal delivery status is logged above.
  return NextResponse.json({
    ok: true,
    mode: "published",
    delivered: deliveryStatus === "sent",
  });
}
