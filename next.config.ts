import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
};

export default nextConfig;
