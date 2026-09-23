/**
 * Microsoft Clarity in the browser: when the tag may exist, what it is told,
 * and how it is stopped.
 *
 * The tag is never a default. It is rendered only when the deployment names
 * a project, the visitor gave consent for behaviour recordings (a category of
 * its own, never implied by analytics), and the page is not one of the routes
 * below. Before that there is no script, no request to clarity.ms, no cookie
 * and no session id -- Clarity's cookieless "no-consent mode" is not used as
 * a substitute: without consent Clarity does not run at all.
 *
 * Nothing identifying is ever handed to Clarity from this code: no identify
 * call, no custom tags, no name, e-mail, inquiry or customer id. Forms and
 * pages with customer data carry `data-clarity-mask="true"` on their
 * container; nothing carries Clarity's unmask attribute (masking.test.ts
 * checks both).
 */

/**
 * `NEXT_PUBLIC_` values are inlined at build time, so this must stay a literal
 * lookup. A value that is not a plain project id is ignored rather than
 * interpolated into an inline script.
 */
export function clarityProjectId(): string | undefined {
  return normalizeClarityProjectId(process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID);
}

export function normalizeClarityProjectId(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value && /^[a-z0-9]{6,20}$/i.test(value) ? value : undefined;
}

/**
 * Where Clarity never runs, even with consent: the admin (it has its own root
 * layout without the consent layer, and is listed here as a second line), the
 * direct-debit activation page behind a personal token, and the payment and
 * direct-debit return pages. None of them is a page whose usability we study,
 * all of them show or carry customer or payment data, and Microsoft's terms
 * rule out using Clarity on content with financial information.
 */
const excludedPrefixes = ["/admin", "/incasso/", "/betaling/"];

export function clarityAllowedOnPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? "";
  if (path === "/admin" || path.startsWith("/admin/")) return false;
  /* Public routes carry the locale first: /nl/incasso/<token>, /en/betaling/afgerond. */
  const withoutLocale = path.replace(/^\/(nl|en)(?=\/|$)/, "");
  return !excludedPrefixes.some((prefix) => withoutLocale.startsWith(prefix) || `${withoutLocale}/` === prefix);
}

/** What the loader decides: all three conditions, or nothing. */
export function shouldLoadClarity(input: { projectId: string | undefined; recordingsConsent: boolean; pathname: string }): boolean {
  return Boolean(input.projectId) && input.recordingsConsent && clarityAllowedOnPath(input.pathname);
}

/**
 * Clarity Consent API V2, as sent the moment the tag is created: analytics
 * storage granted (the tag exists only because the visitor said yes to
 * recordings), advertising storage denied, always. Clarity is used here for
 * how the website is used, never for advertising.
 */
export const clarityConsentSignal = { ad_Storage: "denied", analytics_Storage: "granted" } as const;

/**
 * The inline loader: Microsoft's documented snippet (a queueing stub plus the
 * async tag from www.clarity.ms), with the Consent V2 call queued before the
 * tag has executed, so Clarity never starts without the signal.
 */
export function clarityLoaderScript(projectId: string): string {
  const id = normalizeClarityProjectId(projectId);
  if (!id) throw new Error("Invalid Clarity project id");
  return [
    `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};`,
    `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;`,
    `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`,
    `window.clarity("consentv2",${JSON.stringify(clarityConsentSignal)});`,
  ].join("");
}

type ClarityFunction = (...args: unknown[]) => void;

/**
 * Withdrawal. Microsoft documents `clarity('consent', false)` as the call
 * that erases Clarity's cookies and stops further tracking; it belongs to the
 * older Consent API, which Microsoft says will be deprecated, so it lives here
 * and nowhere else. The first-party cookies are expired as well, best effort,
 * in case the call is gone or the tag never finished loading. The caller then
 * reloads the page, so the tag is not in the document any more: no promise of
 * a running script is trusted to keep the visitor's no.
 */
export function withdrawClarity(): void {
  if (typeof window === "undefined") return;
  const clarity = (window as unknown as { clarity?: ClarityFunction }).clarity;
  try {
    clarity?.("consent", false);
  } catch {
    /* The tag may be half-loaded; the cookie removal and the reload below still hold. */
  }
  expireClarityCookies();
}

/** Clarity's documented first-party cookies, on every domain spelling they may have been set with. */
export const clarityFirstPartyCookies = ["_clck", "_clsk"] as const;

function expireClarityCookies() {
  const present = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => (clarityFirstPartyCookies as readonly string[]).includes(name));
  const host = window.location.hostname;
  const domains = [undefined, host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of present) {
    for (const domain of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}
