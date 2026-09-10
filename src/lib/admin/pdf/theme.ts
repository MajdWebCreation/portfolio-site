import { StyleSheet } from "@react-pdf/renderer";

/**
 * A4 document theme: ink on paper, one accent, hairlines, Helvetica (built
 * into every PDF reader, so no font files are fetched at render time).
 */
export const colors = {
  ink: "#101827",
  body: "#2c3547",
  muted: "#5d6677",
  faint: "#8b93a3",
  line: "#d6d5cd",
  lineStrong: "#b9b8ae",
  accent: "#2149c9",
  paper: "#ffffff",
  surface: "#f4f3ee",
} as const;

/**
 * Page metrics. `marginBottom` reserves the strip the fixed footer occupies:
 * the footer is absolutely positioned, so content only stays clear of it as
 * long as this reserve is at least as tall as the footer itself.
 * `footer.height` is that measured height, kept next to it so the two cannot
 * drift apart.
 */
export const footer = {
  /** Distance from the bottom edge of the page to the footer baseline. */
  bottom: 24,
  /** Border, padding and three lines of company details. */
  height: 42,
} as const;

export const page = {
  marginX: 48,
  marginTop: 44,
  marginBottom: footer.bottom + footer.height + 12,
} as const;

export const styles = StyleSheet.create({
  page: {
    paddingTop: page.marginTop,
    paddingBottom: page.marginBottom,
    paddingHorizontal: page.marginX,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    // No lineHeight on the page: react-pdf drops render-prop text (page numbers) when it inherits one.
    color: colors.body,
    backgroundColor: colors.paper,
  },
  /** Running text: intro, notes. Size repeated for the same reason as `address`. */
  prose: { fontSize: 9.5, lineHeight: 1.45 },
  /**
   * Address blocks: tighter than prose, so the lines read as one block.
   * The size is repeated here because react-pdf only passes the leading down
   * to child Text nodes when the block sets both.
   */
  address: { fontSize: 9.5, lineHeight: 1.3 },
  mono: { fontFamily: "Courier", fontSize: 7.5, letterSpacing: 0.6, color: colors.muted, textTransform: "uppercase" },
  /** Column headers: the same label style, a step darker so the row reads as a header. */
  monoHead: { fontFamily: "Courier", fontSize: 7.5, letterSpacing: 0.6, color: colors.body, textTransform: "uppercase" },
  /** Footer company details: three tight columns, so the block stays two lines shorter than the reserve. */
  footerText: { fontSize: 8, lineHeight: 1.35 },
  bold: { fontFamily: "Helvetica-Bold", color: colors.ink },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
  small: { fontSize: 8.5 },
  hairline: { borderBottomWidth: 0.6, borderBottomColor: colors.line },
  hairlineStrong: { borderBottomWidth: 0.8, borderBottomColor: colors.lineStrong },
  row: { flexDirection: "row" },
  cellText: { paddingRight: 8 },
  right: { textAlign: "right" },
});
