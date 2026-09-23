/*
  Content Security Policy, in report-only mode.

  Nothing is blocked yet. The browser applies the policy below as if it were
  enforced, but instead of refusing a request it posts a report to
  /api/csp-report and carries on. That is deliberate: the public pages are
  static and Next injects inline scripts for hydration, so a strict nonce
  policy is not available without making every page dynamic, and the fallback
  ('unsafe-inline') has to be seen working against real traffic before it is
  allowed to break anything. Move to `Content-Security-Policy` only once the
  reports have been quiet.

  What each source is for:
    script   gtag.js, loaded only after analytics consent
             (consent/analytics-scripts.tsx); Microsoft Clarity's tag and
             script, loaded only after consent for behaviour recordings
             (consent/clarity-script.tsx)
    connect  Google Analytics collection; Clarity's collection endpoints;
             the Supabase host for the admin's browser-side image upload
    img      the Supabase public bucket (admin preview), GA beacons, blob and
             data URLs the admin's PDF preview and next/og use
    frame    blob: for the admin's PDF preview iframes
    form     server actions post to the site itself; a direct debit
             activation then redirects to Mollie's checkout, and Chrome checks
             that redirect against form-action as well
  Development adds 'unsafe-eval', which the dev server's tooling needs.

  Clarity: Microsoft documents its hosts as www.clarity.ms, the lettered
  collection hosts a–z.clarity.ms and c.bing.com, and recommends
  `https://*.clarity.ms` for them (learn.microsoft.com/clarity, "Clarity
  Content Security Policy", checked 23 September 2026). The tag itself
  loads its script from scripts.clarity.ms, which that wildcard covers. It
  is allowed in script-src and connect-src only -- no img-src, no default.
  c.bing.com is left out on purpose: it serves Microsoft's cross-site
  cookie synchronisation (MUID), which this site's configuration does not
  want (advertising storage is denied). In report-only mode a request to it
  is reported, not blocked; whether Clarity needs it for anything the site
  uses is to be judged from those reports before the policy is enforced.
*/
export const clarityOrigins = ["https://*.clarity.ms"] as const;

export function buildReportOnlyPolicy(input: { development: boolean; supabaseHost: string | null }): string {
  const supabase = input.supabaseHost ? ` https://${input.supabaseHost}` : "";
  const clarity = clarityOrigins.join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${input.development ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com ${clarity}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://www.googletagmanager.com https://*.google-analytics.com${supabase}`,
    "font-src 'self'",
    `connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com ${clarity}${supabase}`,
    "frame-src blob:",
    "frame-ancestors 'none'",
    "form-action 'self' https://www.mollie.com",
    "base-uri 'self'",
    "object-src 'none'",
    "report-uri /api/csp-report",
    "report-to csp",
  ].join("; ");
}
