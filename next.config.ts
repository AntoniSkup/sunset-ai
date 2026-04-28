import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
  serverExternalPackages: ["esbuild"],
};

export default withNextIntl(nextConfig);
