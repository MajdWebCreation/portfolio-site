/**
 * The look of every mail YM Creations sends.
 *
 * One sheet of warm white paper with a letterhead, sections separated by
 * space rather than by boxes, and the blue accent used once. It should read
 * as a letter on ymcreations.com stationery, not as a dashboard.
 *
 * Two things this file is careful about, both learned the hard way:
 *
 *  1. **Gmail throws the `<style>` block away.** Measured on a delivered
 *     message: Gmail drops `<head>`, every `<style>` tag, and even
 *     `text-size-adjust` out of inline styles. It keeps the rest of the
 *     inline styles and the `bgcolor` attributes, which is why the colours
 *     below survive.
 *
 *     This is what made the mail look wrong on a phone: a media query cannot
 *     fire there, so an earlier version rendered its desktop sizes and its
 *     32px padding inside a 390px screen. Nothing here depends on the
 *     stylesheet any more. There is one set of inline values, chosen to read
 *     well from roughly 360px to 560px, and no breakpoint at all.
 *
 *  2. **Dark mode.** Apple Mail and Outlook honour `color-scheme: light only`
 *     and the meta tags and leave the mail alone. The Gmail app cannot: the
 *     declarations that would opt out live in `<head>` and in `<style>`, and
 *     Gmail removes both, so its own colour inversion always wins there. The
 *     one trick that keeps a background light in Gmail (painting it with a
 *     gradient, which Gmail does not invert) protects the background but not
 *     the text, so it produces near-white text on a light panel — worse than
 *     the inversion. It is deliberately not used.
 *
 *     What is done instead: keep the number of light surfaces to one, so the
 *     inverted result is a single flat dark sheet rather than layered cards,
 *     and keep the accent small so the blue Gmail lightens stays a detail.
 *
 * Layout is tables with inline styles and `bgcolor` attributes, which is what
 * Outlook's Word renderer understands. The `<style>` block carries only the
 * light-only declaration, as a courtesy to the clients that read it; the mail
 * is complete without it.
 *
 * These are presentation helpers only: no sending, no data, no copy.
 */

/** The site's palette, as literal values — a mail cannot read CSS variables. */
const palette = {
  paper: "#f4f3ee",
  surface: "#fbfaf7",
  ink: "#101827",
  body: "#2c3547",
  muted: "#5d6677",
  line: "#d6d5cd",
  lineSoft: "#e3e2da",
  accent: "#2149c9",
} as const;

const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const mono = "SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace";

const label = `font-family:${mono};font-size:11px;line-height:1.5;letter-spacing:0.14em;text-transform:uppercase;color:${palette.muted};`;
const paragraph = `margin:0;font-family:${sans};font-size:16px;line-height:1.6;color:${palette.body};`;
const rowLabel = `font-family:${sans};font-size:15px;line-height:1.5;color:${palette.muted};`;

/** Space between blocks. One rhythm, so nothing needs a box to look separate. */
const blockGap = 22;

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** A link that stays visible in every client, including the ones that recolour. */
export function emailLink(href: string, text: string): string {
  return `<a href="${escapeEmailHtml(href)}" style="color:${palette.accent};text-decoration:underline;">${escapeEmailHtml(text)}</a>`;
}

/** Body copy. Pass already-escaped HTML; use `escapeEmailHtml` on anything typed by a person. */
export function emailText(html: string, options: { top?: number } = {}): string {
  return `<p style="${paragraph}margin-top:${options.top ?? 14}px;">${html}</p>`;
}

/** A small uppercase label above a block, the way the site marks sections. */
function sectionLabel(text: string): string {
  return `<p style="${label}margin:0 0 6px;">${escapeEmailHtml(text)}</p>`;
}

/** Label plus text. Separated by space, not by a border: this is a letter. */
export function emailSection(input: { label: string; html: string }): string {
  return `
    <div style="margin-top:${blockGap}px;">
      ${sectionLabel(input.label)}
      <p style="${paragraph}">${input.html}</p>
    </div>`;
}

/**
 * Someone else's words — the visitor's own message. A rule in the margin, the
 * way a quotation is set in print, rather than a panel inside a panel.
 */
export function emailPanel(input: { label: string; html: string; preserveLineBreaks?: boolean }): string {
  const wrap = input.preserveLineBreaks ? "white-space:pre-wrap;" : "";
  return `
    <div style="margin-top:${blockGap}px;border-left:2px solid ${palette.line};padding-left:14px;">
      ${sectionLabel(input.label)}
      <div style="${paragraph}${wrap}">${input.html}</div>
    </div>`;
}

export type MetaRow = { label: string; value: string };

/**
 * Details as rows: label in the margin, value against the right edge, hairline
 * between. Hairlines earn their place here because this is a table of data.
 * Stacks to one column on a phone.
 */
export function emailMeta(rows: MetaRow[], options: { label?: string } = {}): string {
  if (rows.length === 0) return "";

  const cells = rows
    .map((row, index) => {
      const border = index === 0 ? "none" : `1px solid ${palette.lineSoft}`;
      const top = index === 0 ? "0" : "9px";
      return `
      <tr>
        <td style="${rowLabel}padding:${top} 14px 9px 0;border-top:${border};vertical-align:top;">${escapeEmailHtml(row.label)}</td>
        <td align="right" style="font-family:${sans};font-size:16px;line-height:1.45;color:${palette.ink};padding:${top} 0 9px;border-top:${border};vertical-align:top;">${escapeEmailHtml(row.value)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div style="margin-top:${blockGap}px;">
      ${options.label ? sectionLabel(options.label) : ""}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        ${cells}
      </table>
    </div>`;
}

/** A short list, e.g. the scope a planner request selected. */
export function emailList(items: string[], emptyText: string): string {
  if (items.length === 0) {
    return `<span style="color:${palette.muted};">${escapeEmailHtml(emptyText)}</span>`;
  }

  return `<ul style="${paragraph}margin:0;padding-left:18px;">${items
    .map((item) => `<li style="margin:0 0 3px;">${escapeEmailHtml(item)}</li>`)
    .join("")}</ul>`;
}

/** A full hairline, where a mail needs one clear break before its closing block. */
export function emailDivider(): string {
  return `<div style="margin-top:${blockGap}px;border-top:1px solid ${palette.line};font-size:0;line-height:0;">&nbsp;</div>`;
}

/**
 * Wraps content in the shell: letterhead, the letter itself, the sign-off.
 *
 * All three sit on one sheet — one background colour, one border — so the
 * mail reads as a document and, where a client insists on inverting it, comes
 * out as one flat dark sheet instead of stacked cards.
 *
 * `preheader` is the line a client shows next to the subject in the inbox
 * list; it is hidden in the mail itself.
 */
export function emailShell(input: {
  locale: "nl" | "en";
  title: string;
  preheader?: string;
  content: string;
}): string {
  const footerLink = (href: string, text: string) =>
    `<a href="${href}" style="color:${palette.muted};text-decoration:none;">${escapeEmailHtml(text)}</a>`;

  return `<!doctype html>
<html lang="${input.locale}" bgcolor="${palette.paper}" style="background-color:${palette.paper};">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeEmailHtml(input.title)}</title>
<style>
  /* Honoured by Apple Mail and Outlook: keep this mail light. Gmail removes
     this whole block, so nothing may depend on it; see the note in shell.ts. */
  :root { color-scheme: light only; supported-color-schemes: light; }
</style>
</head>
<body bgcolor="${palette.paper}" style="margin:0;padding:0;background-color:${palette.paper};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;">
${
  input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeEmailHtml(input.preheader)}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.paper}" style="width:100%;background-color:${palette.paper};">
  <tr>
    <td align="center" bgcolor="${palette.paper}" style="background-color:${palette.paper};padding:22px 12px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.surface}" style="width:100%;max-width:560px;margin:0 auto;background-color:${palette.surface};border:1px solid ${palette.line};">
        <tr>
          <td bgcolor="${palette.surface}" style="background-color:${palette.surface};padding:28px;">

            <p style="${label}margin:0;color:${palette.ink};letter-spacing:0.2em;">YM Creations</p>
            <div style="margin-top:7px;width:28px;height:2px;background-color:${palette.accent};font-size:0;line-height:0;">&nbsp;</div>

            <h1 style="margin:24px 0 0;font-family:${sans};font-size:26px;line-height:1.25;font-weight:700;color:${palette.ink};">${escapeEmailHtml(input.title)}</h1>
            ${input.content}

            <div style="margin-top:28px;border-top:1px solid ${palette.line};padding-top:15px;font-family:${sans};font-size:13px;line-height:1.7;color:${palette.muted};">
              YM Creations<br />
              ${footerLink("mailto:contact@ymcreations.com", "contact@ymcreations.com")} &middot; ${footerLink("tel:+31653400220", "+31 6 53 40 02 20")}<br />
              ${footerLink("https://ymcreations.com", "ymcreations.com")}
            </div>

          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}
