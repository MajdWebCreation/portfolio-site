import type { NextConfig } from "next";

/*
  Article images live in Supabase Storage, so next/image needs that host on
  the allow list. Derived from the same environment value the app uses, and
  narrowed to the public object path: nothing else on the host is loadable.
*/
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
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
