import { Path, Svg, Text as SvgText } from "@react-pdf/renderer";
import { colors } from "@/lib/admin/pdf/theme";

/**
 * The YM Creations wordmark, drawn from public/images/branding/logo-black.svg:
 * the two letter paths plus the "creations" line, so the document carries
 * the same mark as the site without loading an image.
 */
export default function Logo({ width = 74 }: { width?: number }) {
  const height = (width * 430) / 620;
  return (
    <Svg width={width} height={height} viewBox="200 280 620 430">
      <Path d="M236 308h64l76 108 76-108h30L388 440v116h-56V440L236 308Z" fill={colors.ink} />
      <Path d="M508 308h90l48 96 74-96h54v248h-52V350l-90 198h-2l-96-198v206h-26V308Z" fill={colors.ink} />
      <SvgText x={512} y={662} textAnchor="middle" fill={colors.ink} style={{ fontFamily: "Helvetica", fontSize: 74, letterSpacing: 17 }}>
        creations
      </SvgText>
    </Svg>
  );
}
