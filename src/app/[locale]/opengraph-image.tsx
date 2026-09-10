import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { businessInfo, isValidLocale } from "@/lib/content/site-content";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "YM Creations";

const copy = {
  nl: {
    line: "Maatwerk websites, webshops en webapplicaties",
    label: "Digitale producten op maat",
  },
  en: {
    line: "Custom websites, webshops and web applications",
    label: "Custom digital products",
  },
} as const;

/**
 * Share image generated in code: the brand mark on ink with the positioning
 * line, so links carry the same tone as the site instead of a stock photo.
 */
export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const text = copy[isValidLocale(locale) ? locale : "nl"];
  const mark = await readFile(
    path.join(process.cwd(), "public/images/branding/ym-favicon-mark.png"),
  );
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          background: "#101827",
          color: "#f4f3ee",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src={markSrc} alt="" width={140} height={140} style={{ objectFit: "contain" }} />
          <div style={{ fontSize: 22, letterSpacing: 2, color: "#a9bcf5", textTransform: "uppercase" }}>
            {text.label}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 980 }}>
            {text.line}
          </div>
          <div style={{ fontSize: 26, color: "rgba(244,243,238,0.7)" }}>
            {businessInfo.websiteUrl.replace("https://", "")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
