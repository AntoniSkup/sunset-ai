import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import { getUser, getTeamForUser } from "@/lib/db/queries";

import { SWRConfig } from "swr";
import { Analytics } from "@vercel/analytics/next";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

const gaId = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  title: "Sunset AI",
  description: "Get started quickly with Next.js, Postgres, and Stripe.",
};

export const viewport: Viewport = {
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} bg-white dark:bg-gray-950 text-black dark:text-white`}
    >
      <body className={`${ibmPlexSans.className} min-h-[100dvh] bg-[#f8fafc]`}>
        <Script
          id="Cookiebot"
          src="https://consent.cookiebot.com/uc.js"
          data-cbid="fa66f7ec-cddf-41c1-97bc-cb485fd72ff4"
          strategy="beforeInteractive"
        />
        <SWRConfig
          value={{
            fallback: {
              // We do NOT await here
              // Only components that read this data will suspend
              "/api/user": getUser(),
              "/api/team": getTeamForUser(),
            },
          }}
        >
          {children}
        </SWRConfig>
        {gaId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        ) : null}
        <Analytics />
      </body>
    </html>
  );
}
