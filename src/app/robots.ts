import type { MetadataRoute } from "next";
import { businessInfo } from "@/lib/content/site-content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${businessInfo.websiteUrl}/sitemap.xml`,
    host: businessInfo.websiteUrl,
  };
}
