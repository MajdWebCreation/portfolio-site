import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

async function getLogoDataUrl() {
  const logoPath = path.join(
    process.cwd(),
    "public/images/branding/ym-logo-white.png",
  );
  const file = await readFile(logoPath);

  return `data:image/png;base64,${file.toString("base64")}`;
}

export default async function Icon() {
  const logoSrc = await getLogoDataUrl();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top, rgba(98, 214, 255, 0.18), transparent 36%), linear-gradient(180deg, #071018 0%, #04080d 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 360,
            width: 360,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 92,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015))",
          }}
        >
          <img
            src={logoSrc}
            alt="YM Creations"
            width="240"
            height="98"
            style={{ objectFit: "contain" }}
          />
        </div>
      </div>
    ),
    size,
  );
}

