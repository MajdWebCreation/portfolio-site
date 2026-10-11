import type { MetadataRoute } from "next";
import { businessInfo } from "@/lib/content/site-content";

/**
 * The public site is for everyone; the admin and the customer portal are
 * not pages to find. Both already say `noindex` on every page; naming them
 * here keeps well-behaved crawlers from asking in the first place.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/portaal"],
    },
    sitemap: `${businessInfo.websiteUrl}/sitemap.xml`,
    host: businessInfo.websiteUrl,
  };
}
