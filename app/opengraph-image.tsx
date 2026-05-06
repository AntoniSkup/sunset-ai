import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/seo/site";

export const runtime = "edge";

/**
 * Default OG image used by metadata across both locales.
 *
 * The visual identity (logo + brand name + Polish tagline) is shared
 * across languages. Per-locale variants can be added later by branching
 * on a `?locale=` query param and emitting different copy — Open Graph
 * tags can carry multiple `og:image` URLs at the page-metadata layer
 * even though this single asset works for both today.
 */
const HEADLINE = "Twoja strona,";
const HEADLINE_HIGHLIGHT = "jedna wiadomość dalej.";
const SUBHEADLINE =
  "Opisz, czego chcesz. Stronka AI zaprojektuje, zbuduje i opublikuje konwertującą stronę w kilka sekund.";
const SHORT_DESCRIPTION = "Kreator stron AI";

export const alt = `${siteConfig.name} — ${SHORT_DESCRIPTION}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "#0b0b10",
          color: "#ffffff",
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(80% 70% at 50% 0%, rgba(255,99,19,0.55) 0%, rgba(255,138,61,0.0) 60%), radial-gradient(60% 60% at 100% 100%, rgba(255,138,61,0.35) 0%, rgba(255,138,61,0.0) 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(11,11,16,0) 60%, rgba(11,11,16,0.85) 100%)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background:
                "linear-gradient(135deg, #ff6313 0%, #ff8a3d 50%, #ffb066 100%)",
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: -0.5,
              display: "flex",
            }}
          >
            {siteConfig.name}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 960,
          }}
        >
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <span>{HEADLINE}</span>
            <span
              style={{
                background:
                  "linear-gradient(90deg, #ff6313 0%, #ff8a3d 50%, #ffb066 100%)",
                backgroundClip: "text",
                color: "transparent",
                display: "flex",
              }}
            >
              {HEADLINE_HIGHLIGHT}
            </span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.78)",
              lineHeight: 1.35,
              display: "flex",
              maxWidth: 880,
            }}
          >
            {SUBHEADLINE}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "rgba(255,255,255,0.7)",
            fontSize: 22,
          }}
        >
          <div style={{ display: "flex" }}>{SHORT_DESCRIPTION}</div>
          <div style={{ display: "flex" }}>
            {siteConfig.url.replace(/^https?:\/\//, "")}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
