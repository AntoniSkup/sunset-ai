"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary. Catches errors that escape the root
 * `app/layout.tsx` (e.g. errors thrown while building the root shell
 * itself, before `[locale]/layout.tsx` loaded). Because it REPLACES the
 * root layout, it must render its own `<html>`/`<body>` and cannot rely
 * on next-intl, fonts, providers, etc.
 *
 * Component-tree errors below `[locale]` are handled by
 * `app/[locale]/error.tsx`, which gets translations and the full shell.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary] global", {
      message: error?.message,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#ea580c",
            }}
          >
            500
          </p>
          <h1
            style={{
              marginTop: "0.75rem",
              fontSize: "2rem",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: "1rem",
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred. You can try again, or head back to
            safety.
          </p>
          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                appearance: "none",
                border: "none",
                cursor: "pointer",
                background: "#f97316",
                color: "white",
                fontWeight: 500,
                fontSize: "0.875rem",
                padding: "0.625rem 1.25rem",
                borderRadius: "9999px",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                background: "#0f172a",
                color: "white",
                fontWeight: 500,
                fontSize: "0.875rem",
                padding: "0.625rem 1.25rem",
                borderRadius: "9999px",
                textDecoration: "none",
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
