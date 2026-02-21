import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { getUser, getTeamForUser } from "@/lib/db/queries";

import { SWRConfig } from "swr";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

export const metadata: Metadata = {
  title: "Next.js SaaS Starter",
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
      </body>
    </html>
  );
}
