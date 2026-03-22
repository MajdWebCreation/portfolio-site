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
    "public/images/branding/ym-favicon-mark.png",
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
          background: "#05080d",
        }}
      >
        <img
          src={logoSrc}
          alt="YM Creations"
          width="368"
          height="368"
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    size,
  );
}
