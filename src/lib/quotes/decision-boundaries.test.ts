import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quoteOutcomeStatuses } from "@/lib/admin/quotes/types";

/**
 * There is one way for a quote to become accepted or rejected: a row in
 * quote_decisions, made by portal_decide_quote or admin_record_quote_decision.
 * Checked against the source and the migrations rather than trusted, so a
 * second path -- a new dropdown, a convenient update, a grant -- fails here
 * before it reaches the database's own refusal.
 */
const root = process.cwd();
const src = join(root, "src");
const migrations = join(root, "supabase", "migrations");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const all = sourceFiles(src).map((path) => ({ path: path.replace(root + "/", ""), source: readFileSync(path, "utf8") }));
const sql = readdirSync(migrations)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(migrations, name), "utf8") }));
const decisionMigration = sql.find(({ name }) => name.endsWith("_quote_decisions.sql"))!;

/** Each `.from("quotes")` call with the statement it starts, up to the first semicolon. */
function quoteStatements(source: string): string[] {
  return [...source.matchAll(/\.from\(\s*["'`]quotes["'`]\s*\)/g)].map((match) => source.slice(match.index!, source.indexOf(";", match.index!)));
}

describe("the decision on a quote", () => {
  it("is never written by the application to its table directly", () => {
    for (const file of all) {
      expect(file.source, file.path).not.toMatch(/\.from\(\s*["'`]quote_decisions["'`]\s*\)\s*\.(insert|update|upsert|delete)\(/);
    }
  });

  it("is made through two functions, each from one module", () => {
    const callers = (name: string) => all.filter(({ source }) => source.includes(`rpc("${name}"`)).map(({ path }) => path);
    expect(callers("portal_decide_quote")).toEqual(["src/lib/portal/quotes/actions.ts"]);
    expect(callers("admin_record_quote_decision")).toEqual(["src/lib/admin/quotes/decision-actions.ts"]);
  });

  it("has no status path around it: the quotes updates are the known three, and none writes accepted or rejected", () => {
    const updaters = all.filter(({ source }) => quoteStatements(source).some((statement) => statement.includes(".update("))).map(({ path }) => path);
    expect(updaters.sort()).toEqual(["src/lib/admin/documents/send.ts", "src/lib/admin/quotes/actions.ts", "src/lib/admin/quotes/lifecycle.ts"]);

    for (const file of all) {
      for (const statement of quoteStatements(file.source)) {
        expect(statement, file.path).not.toMatch(/["'`](accepted|rejected)["'`]/);
      }
    }

    /* The concept save writes no status at all; the send writes 'sent'; the selector only what the list allows. */
    const save = all.find(({ path }) => path === "src/lib/admin/quotes/actions.ts")!.source;
    const row = save.slice(save.indexOf("const row = {"), save.indexOf("};", save.indexOf("const row = {")));
    expect(row).not.toMatch(/\bstatus\b/);
    const send = all.find(({ path }) => path === "src/lib/admin/documents/send.ts")!.source;
    expect(send).toContain('{ status: "sent", sent_at: mail.sentAt, recipient_email: recipient.email }');
    const lifecycle = all.find(({ path }) => path === "src/lib/admin/quotes/lifecycle.ts")!.source;
    const outcome = lifecycle.slice(lifecycle.indexOf("export async function setQuoteOutcome"));
    expect(outcome.indexOf("isQuoteOutcomeStatus(status)")).toBeGreaterThan(0);
    expect(outcome.indexOf("isQuoteOutcomeStatus(status)")).toBeLessThan(outcome.indexOf('.update({ status })'));
    expect([...quoteOutcomeStatuses].sort()).toEqual(["expired", "sent"]);
  });

  it("is append-only in every migration: no role is ever granted a write on it", () => {
    for (const { name, text } of sql) {
      expect(text, name).not.toMatch(/grant[^;]*\b(insert|update|delete|truncate|all)\b[^;]*\bon\s+(table\s+)?public\.quote_decisions\b/i);
      if (name !== decisionMigration.name) {
        expect(text, name).not.toMatch(/drop\s+trigger[^;]*(quotes_status_guard|quote_decisions_refuse|quote_decisions_check_new|quote_decisions_apply)/i);
        expect(text, name).not.toMatch(/(disable|alter)\s+trigger[^;]*(quotes_status_guard|quote_decisions_)/i);
        expect(text, name).not.toMatch(/create\s+policy[^;]*on\s+public\.quote_decisions\s+for\s+(insert|update|delete|all)/i);
      }
    }
    const text = decisionMigration.text;
    expect(text).toContain("revoke all on table public.quote_decisions from public, anon, authenticated, service_role;");
    expect(text).toContain("grant select on table public.quote_decisions to authenticated, service_role;");
    expect(text).toMatch(/create trigger quote_decisions_refuse_update_delete\s+before update or delete on public\.quote_decisions/);
    expect(text).toMatch(/create trigger quote_decisions_refuse_truncate\s+before truncate on public\.quote_decisions/);
    expect(text).toMatch(/create trigger quotes_status_guard\s+before update on public\.quotes/);
    expect(text).toContain("constraint quote_decisions_one_per_quote unique (quote_id)");
  });

  it("copies the document and the terms from the quote, never from an argument", () => {
    const text = decisionMigration.text;
    for (const fn of ["portal_decide_quote", "admin_record_quote_decision"]) {
      const start = text.indexOf(`create or replace function public.${fn}(`);
      const signature = text.slice(start, text.indexOf(")", start));
      expect(signature, fn).not.toMatch(/p_terms_(edition|published)|p_document|p_actor|p_user|p_email|p_membership|p_decided|p_sha256/);
      const body = text.slice(start, text.indexOf("$$;", text.indexOf("as $$", start)));
      expect(body, fn).toContain("v_quote.document_sha256, v_quote.terms_edition, v_quote.terms_published_on");
      expect(body, fn).toContain("security definer\nset search_path = ''");
      expect(body, fn).toContain("for update;");
    }
    /* The portal's expected hash is compared, not stored. */
    const portal = text.slice(text.indexOf("create or replace function public.portal_decide_quote("));
    expect(portal).toContain("if p_expected_sha256 is distinct from v_quote.document_sha256 then");
    /* The membership is locked so a revoke cannot land in the middle. */
    expect(portal).toMatch(/m\.revoked_at is null\s+for share;/);
    for (const fn of ["portal_decide_quote(uuid, uuid, text, text, boolean, text)", "portal_quote_decision(uuid, uuid)", "admin_record_quote_decision(uuid, text, text, text, text)"]) {
      expect(text).toContain(`revoke all on function public.${fn} from public, anon;`);
      expect(text).toContain(`grant execute on function public.${fn} to authenticated;`);
    }
  });
});
