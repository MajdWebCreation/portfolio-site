import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  The invariants the quote issuance migration states, pinned as text. The
  behaviour itself is proven against a real database in
  issuance.integration.test.ts; this keeps the SQL from quietly losing a rule
  between those runs.
*/
const sql = readFileSync("supabase/migrations/20261011150000_quote_issuance.sql", "utf8");

describe("the quote issuance migration", () => {
  it("adds the artifact, the terms, the chain link and the legacy marker", () => {
    for (const column of [
      "document_path",
      "document_sha256",
      "document_bytes",
      "document_generated_at",
      "terms_edition",
      "terms_published_on",
      "supersedes_quote_id",
      "legacy_sent_without_document",
    ]) {
      expect(sql, column).toContain(`add column ${column}`);
    }
  });

  it("ties the number, the terms, the file and the send to each other", () => {
    expect(sql).toContain("check (document_path is null or not number_provisional)");
    expect(sql).toContain("check (document_path is null or terms_edition is not null)");
    expect(sql).toContain("check (sent_at is null or not number_provisional)");
    expect(sql).toContain("sent_at is null or document_path is not null or legacy_sent_without_document");
    expect(sql).toContain("document_sha256 ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("(terms_edition is null) = (terms_published_on is null)");
  });

  it("keeps a concept a concept until the mailer accepted it", () => {
    expect(sql).toContain("check (status = 'draft' or sent_at is not null)");
    expect(sql).not.toContain("quotes_status_needs_number");
  });

  /* Historic sent quotes are marked, never given a document they never had. */
  it("never gives a legacy quote a set of terms or a document after the fact", () => {
    expect(sql).toContain("if old.legacy_sent_without_document and (");
    expect(sql).toContain("die wordt niet achteraf ingevuld");
    const complete = sql.slice(sql.indexOf("create or replace function public.complete_quote_issue"));
    expect(complete.slice(0, complete.indexOf("$$;"))).toContain("if v_legacy then");
  });

  it("records a never-mailed quote as the concept it is before stating the rule", () => {
    expect(sql).toContain("set status = 'draft'\n where sent_at is null\n   and status <> 'draft'");
  });

  it("never lets a line change quotes", () => {
    expect(sql).toContain("if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then");
    expect(sql).toContain("or new.created_at            is distinct from old.created_at");
  });

  it("marks the legacy rows and nothing else", () => {
    expect(sql).toContain("set legacy_sent_without_document = true");
    expect(sql).toContain("where sent_at is not null\n   and document_path is null");
    expect(sql).not.toMatch(/set document_path\s*=\s*'/);
    expect(sql).toContain("not legacy_sent_without_document or (sent_at is not null and document_path is null)");
  });

  it("chains versions with a same-customer key, one successor and no way back", () => {
    expect(sql).toContain("foreign key (supersedes_quote_id, customer_id) references public.quotes (id, customer_id)");
    expect(sql).toContain("on delete restrict");
    expect(sql).toContain("create unique index quotes_supersedes_unique");
    expect(sql).toContain("where supersedes_quote_id is not null");
    expect(sql).toContain("if new.supersedes_quote_id is distinct from old.supersedes_quote_id then");
    expect(sql).toContain("if v_predecessor.sent_at is null then");
    expect(sql).toContain("if v_predecessor.status = 'accepted' then");
    expect(sql).toContain("if v_predecessor.customer_id <> new.customer_id then");
  });

  it("introduces no status for a replaced quote", () => {
    /* The status list is untouched: no new value, and the existing check constraint is not redefined. */
    expect(sql).not.toMatch(/status in \([^)]*superseded/);
    expect(sql).not.toMatch(/quotes_status_check/);
  });

  /* The freeze starts with the number; the PDF is rendered after. */
  it("freezes the quote from the moment it is numbered", () => {
    expect(sql).toContain("if old.number_provisional then\n    return new;");
    expect(sql).toContain("select number_provisional, number_value into v_provisional, v_number");
    expect(sql).not.toContain("if old.sent_at is null then\n    return new;");
  });

  it("writes terms, document and first send once each", () => {
    expect(sql).toContain("if old.terms_edition is not null and (");
    expect(sql).toContain("if old.document_path is not null and (");
    expect(sql).toContain("if old.sent_at is not null and new.sent_at is distinct from old.sent_at then");
    expect(sql).toContain("if new.status = 'draft' and old.status <> 'draft' then");
  });

  it("refuses an insert that is not a concept and the deletion of anything numbered", () => {
    expect(sql).toContain("if not new.number_provisional\n     or new.sent_at is not null");
    expect(sql).toContain("or new.legacy_sent_without_document");
    expect(sql).toContain("create trigger quotes_refuse_frozen_delete");
    expect(sql).toContain("create trigger quote_lines_refuse_frozen_changes\n  before insert or update or delete on public.quote_lines");
  });

  it("takes the number together with the terms, and refuses to issue without them", () => {
    const begin = sql.slice(sql.indexOf("create or replace function public.begin_quote_issue"));
    const body = begin.slice(0, begin.indexOf("$$;"));
    expect(body).toContain("for update");
    expect(body).toContain("p_terms_edition !~ '^\\d{4}$'");
    expect(body).toContain("v_number := private.next_quote_number(v_issue_date);");
    const write = body.slice(body.indexOf("update public.quotes\n       set number_value"));
    for (const column of ["number_value", "number_provisional", "terms_edition", "terms_published_on"]) {
      expect(write.slice(0, write.indexOf(";"))).toContain(column);
    }
    expect(body).toContain("if v_legacy then");
  });

  it("records the file once and refuses a different one", () => {
    const complete = sql.slice(sql.indexOf("create or replace function public.complete_quote_issue"));
    const body = complete.slice(0, complete.indexOf("$$;"));
    expect(body).toContain("for update");
    expect(body).toContain("if p_path is distinct from v_path");
    expect(body).toContain("een afwijkend document wordt niet vastgelegd");
    expect(body).toContain("'adopted', true");
    expect(body).toContain("where id = p_quote_id\n     and document_path is null;");
  });

  it("keeps both functions reachable only for a signed-in admin, and drops the old numbering entry point", () => {
    for (const signature of ["public.begin_quote_issue(uuid, text, date)", "public.complete_quote_issue(uuid, text, text, integer)"]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
    }
    expect(sql).not.toContain("security definer");
  });

  it("retires the old numbering entry point in the migration that follows", () => {
    const follow = readFileSync("supabase/migrations/20261011150100_drop_assign_quote_number.sql", "utf8");
    expect(follow).toContain("drop function if exists public.assign_quote_number(uuid);");
    expect(sql).not.toContain("drop function");
  });

  it("adds no customer rights and touches no invoice", () => {
    expect(sql).not.toContain("create policy");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)/i);
    expect(sql).not.toContain("public.invoices");
    expect(sql).not.toContain("invoice_lines");
  });
});
