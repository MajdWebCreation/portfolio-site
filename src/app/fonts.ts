import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";

/**
 * The two site fonts, shared by every root layout (public site and admin) so
 * both documents expose the same `--font-grotesk` / `--font-mono` variables.
 */
export const grotesk = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
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
