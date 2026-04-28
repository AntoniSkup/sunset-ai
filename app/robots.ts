import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/dashboard/",
          "/builder",
          "/builder/",
          "/start",
          "/sign-in",
          "/sign-up",
          "/login",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
