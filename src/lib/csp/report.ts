import { redactSecrets } from "@/lib/admin/communications/redact";

/**
 * What a Content-Security-Policy violation report is reduced to before it is
 * logged: which directive, which origin was blocked, on which page path.
 *
 * Never a query string -- a payment return URL carries its state there --
 * never a path segment that is a secret (an activation link is
 * /incasso/<token>), never a script sample, a source file, a referrer, a
 * user agent, a cookie or the raw body. Reports are visitor-supplied, so
 * nothing in them is trusted for anything beyond a log line.
 */
export type CspViolationSummary = {
  directive: string;
  /** The blocked origin, or the keyword the browser used (`inline`, `eval`, `data`). */
  blocked: string;
  /** The page's path with secrets removed; never its query or fragment. */
  page: string;
};

type LegacyReport = { "csp-report"?: Record<string, unknown> };
type ReportingApiEntry = { type?: string; body?: Record<string, unknown> };

const maxLength = 120;

/** The origin of a URL, or a bare keyword such as `inline`; never a path or query. */
function origin(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    return new URL(value).origin;
  } catch {
    // Keywords ("inline", "eval") and bare schemes ("data", "blob"): letters only.
    return value.replace(/[^a-z:-]/gi, "").slice(0, 20);
  }
}

/** The path of a URL with secrets cut out; the query and fragment are dropped. */
function pagePath(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    return redactSecrets(new URL(value).pathname).slice(0, maxLength);
  } catch {
    return "";
  }
}

function keyword(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-z-]/gi, "").slice(0, 40) : "";
}

export function summariseViolation(body: Record<string, unknown>): CspViolationSummary {
  return {
    directive: keyword(body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"] ?? body.violatedDirective),
    blocked: origin(body["blocked-uri"] ?? body.blockedURL),
    page: pagePath(body["document-uri"] ?? body.documentURL),
  };
}

/** The violation bodies in either format the browser may use; empty for anything else. */
export function violationsIn(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return (parsed as ReportingApiEntry[])
      .filter((entry) => entry?.type === "csp-violation" && entry.body && typeof entry.body === "object")
      .map((entry) => entry.body as Record<string, unknown>);
  }
  if (parsed && typeof parsed === "object" && "csp-report" in parsed) {
    const report = (parsed as LegacyReport)["csp-report"];
    return report && typeof report === "object" ? [report] : [];
  }
  return [];
}
