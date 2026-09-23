import type { NextConfig } from "next";
import { buildReportOnlyPolicy } from "./src/lib/csp/policy";

/*
  Article images live in Supabase Storage, so next/image needs that host on
  the allow list. Derived from the same environment value the app uses, and
  narrowed to the public object path: nothing else on the host is loadable.
*/
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

/* Content Security Policy, report-only: built and documented in src/lib/csp/policy.ts, where the tests can read it. */
const cspReportOnly = buildReportOnlyPolicy({ development: process.env.NODE_ENV === "development", supabaseHost });

/*
  The headers every response carries. None of them changes how the site
  behaves today: HSTS only matters once the site is on https (it is), nosniff
  stops content-type guessing, the referrer policy keeps full URLs off other
  sites, the permissions policy declines APIs the site never asks for, and the
  framing headers refuse embedding -- the admin's PDF preview frames are
  same-document blob and srcdoc frames, which these do not touch.

  HSTS is set without includeSubDomains on purpose: whether every subdomain of
  the apex is served over https is not something this repository can know.
*/
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  async redirects() {
    return [
      // Dutch is the primary language of the site.
      { source: "/", destination: "/nl", permanent: true },
      // Unprefixed Dutch routes.
      { source: "/diensten", destination: "/nl/diensten", permanent: true },
      { source: "/diensten/:slug", destination: "/nl/diensten/:slug", permanent: true },
      { source: "/tarieven", destination: "/nl/tarieven", permanent: true },
      { source: "/projecten", destination: "/nl/projecten", permanent: true },
      { source: "/projectplanner", destination: "/nl/projectplanner", permanent: true },
      { source: "/werkwijze", destination: "/nl/werkwijze", permanent: true },
      { source: "/contact", destination: "/nl/contact", permanent: true },
      { source: "/blog", destination: "/nl/blog", permanent: true },
      { source: "/blog/:slug", destination: "/nl/blog/:slug", permanent: true },
      { source: "/algemene-voorwaarden", destination: "/nl/algemene-voorwaarden", permanent: true },
      { source: "/privacy", destination: "/nl/privacy", permanent: true },
      { source: "/cookies", destination: "/nl/cookies", permanent: true },
      { source: "/websitecheck", destination: "/nl/websitecheck", permanent: true },
      // Unprefixed English routes.
      { source: "/services", destination: "/en/services", permanent: true },
      { source: "/services/:slug", destination: "/en/services/:slug", permanent: true },
      { source: "/pricing", destination: "/en/pricing", permanent: true },
      { source: "/projects", destination: "/en/projects", permanent: true },
      { source: "/project-planner", destination: "/en/project-planner", permanent: true },
      { source: "/how-we-work", destination: "/en/how-we-work", permanent: true },
    ];
  },
};

export default nextConfig;
