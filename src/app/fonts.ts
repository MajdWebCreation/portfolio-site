import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";

/**
 * The two site fonts, shared by every root layout (public site and admin) so
 * both documents expose the same `--font-grotesk` / `--font-mono` variables.
 */
/*
  `subsets` decides which subsets get a `<link rel="preload">`, not which
  glyphs the site can render: next/font keeps the `@font-face` rule and the
  self-hosted file for every subset the family has, each behind its own
  `unicode-range`. Listing only `latin` therefore means the latin-ext file is
  fetched when a page actually needs one of its characters, instead of on
  every page regardless. No page does today -- neither the site content nor
  any article record contains a character in that range -- and IBM Plex Mono
  below has always been declared this way.
*/
export const grotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
