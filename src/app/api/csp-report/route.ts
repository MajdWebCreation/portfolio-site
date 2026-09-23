import { summariseViolation, violationsIn } from "@/lib/csp/report";

/**
 * Where the browser sends Content-Security-Policy violation reports.
 *
 * The policy in next.config.ts runs in report-only mode: nothing is blocked,
 * and every request a strict policy would have refused ends up here instead.
 * That is the evidence for deciding what the enforced policy may contain.
 *
 * Only the shape of the violation is logged; see lib/csp/report.ts for what
 * that leaves out. At most five entries per request, so a flood cannot
 * become a cost, and always 204: a reporter learns nothing from the answer.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  for (const entry of violationsIn(parsed).slice(0, 5)) {
    console.warn("CSP report", summariseViolation(entry));
  }

  return new Response(null, { status: 204 });
}
