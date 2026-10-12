import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Decisions on quotes against a real Postgres, a real Auth server and real
 * Storage: who may accept or reject which quote, that a decision names the
 * exact stored document and terms, that it is made once and never changes,
 * that the admin's offline decision lands on the same record, that the
 * status cannot be set around it, and that a failing mail never costs a
 * decision.
 *
 * Local only (`npx supabase start`, Node 22):
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
process.env.SUPABASE_SECRET_KEY = serviceKey;
process.env.CONTACT_TO_EMAIL = "intern@ymcreations.test";

const jar = new Map<string, string>();
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
class Redirected extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new Redirected("404");
  },
}));

const deliverEmail = vi.fn();
vi.mock("@/lib/admin/communications/provider", () => ({ deliverEmail: (...args: unknown[]) => deliverEmail(...args) }));
vi.mock("@/lib/mollie/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mollie/config")>()),
  isMollieConfigured: () => false,
}));

let admin: SupabaseClient<Database>;
let visitor: SupabaseClient<Database>;
let service: SupabaseClient<Database>;
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => admin,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "00000000-0000-4000-8000-000000000000", email: null, displayName: null }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => visitor }));

const { decideQuoteAction } = await import("@/lib/portal/quotes/actions");
const { readPortalQuote, readPortalQuoteDecision, readPortalQuotes } = await import("@/lib/portal/quotes/read");
const { portalQuoteState } = await import("@/lib/portal/quotes/model");
const { recordQuoteDecision, retryQuoteDecisionMail } = await import("@/lib/admin/quotes/decision-actions");
const { getQuoteDecision } = await import("@/lib/admin/quotes/decisions");
const { setQuoteOutcome, createQuoteRevision } = await import("@/lib/admin/quotes/lifecycle");
const { sendQuoteToCustomer } = await import("@/lib/admin/documents/send");
const { notifyPendingQuoteDecisions } = await import("@/lib/quotes/decision-notify");
const { resetRateLimits } = await import("@/lib/payments/rate-limit");
const { portalCustomerCookie } = await import("@/lib/portal/auth");
const { readPortalRequest } = await import("@/lib/portal/requests/read");

type Db = SupabaseClient<Database>;
type Decision = "accepted" | "rejected";
const password = "portal-quote-decisions-password";
const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
/*
  Quotes here are numbered in a year of their own: the counter is per year,
  and other files assert that it moved exactly once while they ran.
*/
const issueDate = "2031-03-02";

const ids = { alfa: "", beta: "", adminUser: "", alfaUser: "", alfa2User: "", betaUser: "", multiUser: "", revokedUser: "", lateUser: "", alfaMembership: "" };
const emails = { alfaUser: "", alfaContact: "" };
const clients = {} as Record<"alfa" | "alfa2" | "beta" | "multi" | "revoked" | "late" | "anon", Db>;

async function signedIn(email: string): Promise<Db> {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function createUser(label: string): Promise<{ id: string; email: string }> {
  const email = `quote-decision-${label}-${stamp}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`user ${label}: ${error.message}`);
  return { id: data.user!.id, email };
}

async function createCustomer(name: string): Promise<{ id: string; email: string }> {
  const email = `contact-qd-${name.toLowerCase()}-${stamp}@example.test`;
  const { data, error } = await service
    .from("customers")
    .insert({ company_name: `${name} ${stamp}`, contact_name: `Contact ${name}`, email, street: "S 1", postal_code: "1011 AA", city: "A", country: "Nederland" })
    .select("id")
    .single();
  if (error) throw new Error(`customer ${name}: ${error.message}`);
  return { id: data!.id, email };
}

async function member(userId: string, customerId: string, email: string): Promise<string> {
  const { data, error } = await service.from("customer_users").insert({ user_id: userId, customer_id: customerId, invited_email: email }).select("id").single();
  if (error) throw new Error(`membership: ${error.message}`);
  return data!.id;
}

/** As the database superuser, for what no role may do: the stage for a legacy quote, a quote past its date. */
function psql(sql: string): string {
  return execFileSync("docker", ["exec", "supabase_db_portfolio-site", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc", sql], { stdio: "pipe" }).toString();
}

function psqlFails(sql: string): string {
  try {
    psql(sql);
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? error);
  }
  throw new Error(`expected failure: ${sql}`);
}

async function concept(customerId: string): Promise<string> {
  const { data, error } = await service
    .from("quotes")
    .insert({
      number_value: `OFF-CONCEPT-${Math.random().toString(36).slice(-6)}`, number_provisional: true, status: "draft", customer_id: customerId,
      customer_company_name: "K", customer_contact_name: "C", customer_email: `q-${stamp}@example.test`,
      customer_street: "S 1", customer_postal_code: "1011 AA", customer_city: "A", customer_country: "Nederland",
      issue_date: issueDate, valid_until: "2099-12-31", subject: "Nieuwe website",
    })
    .select("id")
    .single();
  if (error) throw new Error(`quote: ${error.message}`);
  const lines = await service.rpc("save_quote_lines", { p_quote_id: data!.id, p_lines: [{ description: "Website", quantityHundredths: 100, unitPriceCents: 150000, vatRate: 21 }] as never });
  if (lines.error) throw new Error(`lines: ${lines.error.message}`);
  return data!.id;
}

/** A quote the customer received: numbered, stored, mailed -- the admin's own send flow. */
async function sent(customerId: string, id?: string): Promise<string> {
  const quoteId = id ?? (await concept(customerId));
  /* A revision is dated today by createQuoteRevision; still a concept, so it can move to this file's year. */
  if (id) await service.from("quotes").update({ issue_date: issueDate, valid_until: "2099-12-31" }).eq("id", id);
  const result = await sendQuoteToCustomer(quoteId);
  if (!result.ok) throw new Error(`send: ${result.error}`);
  return quoteId;
}

async function quoteRow(id: string) {
  const { data } = await service.from("quotes").select("*").eq("id", id).single();
  return data!;
}

async function decisionsOf(quoteId: string) {
  const { data } = await service.from("quote_decisions").select("*").eq("quote_id", quoteId);
  return data ?? [];
}

async function notification(decisionId: string) {
  const { data } = await service.from("quote_decision_notifications").select("*").eq("decision_id", decisionId).maybeSingle();
  return data;
}

function decide(client: Db, customerId: string, quoteId: string, decision: Decision, options: { sha?: string; confirmed?: boolean; reason?: string | null } = {}) {
  return (async () => {
    const sha = options.sha ?? (await quoteRow(quoteId)).document_sha256!;
    return client.rpc("portal_decide_quote", {
      p_customer_id: customerId,
      p_quote_id: quoteId,
      p_decision: decision,
      p_expected_sha256: sha,
      p_terms_confirmed: options.confirmed ?? decision === "accepted",
      p_rejection_reason: options.reason ?? null,
    });
  })();
}

async function form(customerId: string, quoteId: string, decision: Decision, fields: Record<string, string> = {}): Promise<FormData> {
  const data = new FormData();
  data.set("customerId", customerId);
  data.set("quoteId", quoteId);
  data.set("decision", decision);
  data.set("documentSha256", (await quoteRow(quoteId)).document_sha256!);
  if (decision === "accepted") data.set("confirmTerms", "on");
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function act(client: Db, data: FormData, remembered?: string) {
  visitor = client;
  if (remembered) jar.set(portalCustomerCookie, remembered);
  else jar.delete(portalCustomerCookie);
  return decideQuoteAction({ status: "idle" }, data);
}

function customerMails(decisionId: string) {
  return deliverEmail.mock.calls.filter(([email]) => (email as { idempotencyKey?: string }).idempotencyKey === `quote-decision/${decisionId}/customer`);
}

function internalMails(decisionId: string) {
  return deliverEmail.mock.calls.filter(([email]) => (email as { idempotencyKey?: string }).idempotencyKey === `quote-decision/${decisionId}/internal`);
}

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });

  const adminUser = await createUser("admin");
  ids.adminUser = adminUser.id;
  const profile = await service.from("admin_profiles").insert({ user_id: adminUser.id, display_name: "Quote decisions" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);
  admin = await signedIn(adminUser.email);

  const alfa = await createCustomer("Alfa");
  const beta = await createCustomer("Beta");
  ids.alfa = alfa.id;
  ids.beta = beta.id;
  emails.alfaContact = alfa.email;
  /* A billing address that differs: a quote's confirmation is general correspondence and must not go there. */
  await service.from("customers").update({ billing_email: `facturen-qd-${stamp}@example.test` }).eq("id", ids.alfa);

  const users = Object.fromEntries(
    await Promise.all((["alfa", "alfa2", "beta", "multi", "revoked", "late"] as const).map(async (label) => [label, await createUser(label)] as const)),
  ) as Record<"alfa" | "alfa2" | "beta" | "multi" | "revoked" | "late", { id: string; email: string }>;
  ids.alfaUser = users.alfa.id;
  ids.alfa2User = users.alfa2.id;
  ids.betaUser = users.beta.id;
  ids.multiUser = users.multi.id;
  ids.revokedUser = users.revoked.id;
  ids.lateUser = users.late.id;
  emails.alfaUser = users.alfa.email;

  ids.alfaMembership = await member(users.alfa.id, ids.alfa, users.alfa.email);
  await member(users.alfa2.id, ids.alfa, users.alfa2.email);
  await member(users.beta.id, ids.beta, users.beta.email);
  await member(users.multi.id, ids.alfa, users.multi.email);
  await member(users.multi.id, ids.beta, users.multi.email);
  await member(users.late.id, ids.alfa, users.late.email);
  const revokedMembership = await member(users.revoked.id, ids.alfa, users.revoked.email);
  await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("id", revokedMembership);

  for (const label of ["alfa", "alfa2", "beta", "multi", "revoked", "late"] as const) clients[label] = await signedIn(users[label].email);
  clients.anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
}, 300_000);

afterAll(async () => {
  if (!local || !service) return;
  for (const id of [ids.adminUser, ids.alfaUser, ids.alfa2User, ids.betaUser, ids.multiUser, ids.revokedUser, ids.lateUser]) if (id) await service.auth.admin.deleteUser(id);
}, 120_000);

beforeEach(() => {
  resetRateLimits();
  deliverEmail.mockReset();
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });
});

describe.runIf(local)("a customer accepting a quote in the portal", () => {
  it("is recorded once, on exactly the stored document and terms, by the signed-in account", async () => {
    const id = await sent(ids.alfa);
    const quote = await quoteRow(id);
    const before = await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, id);
    expect(before).toMatchObject({ state: "open", documentSha256: quote.document_sha256, termsEdition: quote.terms_edition });

    const result = await act(clients.alfa, await form(ids.alfa, id, "accepted"));
    expect(result).toEqual({ status: "decided", decision: "accepted", already: false });

    const [decision, ...rest] = await decisionsOf(id);
    expect(rest).toHaveLength(0);
    expect(decision).toMatchObject({
      customer_id: ids.alfa,
      decision: "accepted",
      source: "portal",
      rejection_reason: null,
      note: null,
      actor_user_id: ids.alfaUser,
      actor_email: emails.alfaUser,
      membership_id: ids.alfaMembership,
      terms_confirmed: true,
      quote_number: quote.number_value,
      quote_document_path: quote.document_path,
      quote_document_sha256: quote.document_sha256,
      terms_edition: quote.terms_edition,
      terms_published_on: quote.terms_published_on,
    });
    expect((await quoteRow(id)).status).toBe("accepted");

    const events = await service.from("portal_events").select("action, target_kind, target_id, actor_user_id").eq("target_id", id);
    expect(events.data).toEqual([{ action: "quote_accepted", target_kind: "quote", target_id: id, actor_user_id: ids.alfaUser }]);

    /* The customer's confirmation, at the contact address -- not the login, not the billing address -- and the internal notice. */
    const [customerMail] = customerMails(decision!.id).map(([email]) => email as { to: string; subject: string; text: string });
    expect(customerMails(decision!.id)).toHaveLength(1);
    expect(customerMail!.to).toBe(emails.alfaContact);
    expect(customerMail!.subject).toContain(quote.number_value);
    expect(customerMail!.text).toContain(`Algemene Voorwaarden B2B ${quote.terms_edition}`);
    expect(internalMails(decision!.id)).toHaveLength(1);
    expect((internalMails(decision!.id)[0]![0] as { to: string }).to).toBe("intern@ymcreations.test");
    const notice = await notification(decision!.id);
    expect(notice!.customer_notified_at).not.toBeNull();
    expect(notice!.internal_notified_at).not.toBeNull();
    const logged = await service.from("customer_communications").select("category, quote_id, recipient").eq("quote_id", id).eq("category", "quote_decision_received");
    expect(logged.data).toEqual([{ category: "quote_decision_received", quote_id: id, recipient: emails.alfaContact }]);

    /* The portal shows the decision, and nothing to decide any more. */
    const after = await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, id);
    expect(after.state).toBe("decided");
    expect(after.decision).toMatchObject({ kind: "accepted", source: "portal", decidedBy: emails.alfaUser });
    const list = await readPortalQuotesAs(clients.alfa, ids.alfa);
    expect(portalQuoteState(list.find((item) => item.id === id)!, today)).toBe("accepted");
  }, 120_000);

  it("needs the box ticked, in the form and in the database", async () => {
    const id = await sent(ids.alfa);
    const data = await form(ids.alfa, id, "accepted");
    data.delete("confirmTerms");
    expect(await act(clients.alfa, data)).toMatchObject({ status: "invalid", field: "confirmation" });

    const unconfirmed = await decide(clients.alfa, ids.alfa, id, "accepted", { confirmed: false });
    expect(unconfirmed.error?.code).toBe("22023");
    const withReason = await decide(clients.alfa, ids.alfa, id, "accepted", { reason: "x" });
    expect(withReason.error?.code).toBe("22023");
    expect(await decisionsOf(id)).toHaveLength(0);
    expect((await quoteRow(id)).status).toBe("sent");
  }, 60_000);
});

describe.runIf(local)("a customer rejecting a quote", () => {
  it("without a reason", async () => {
    const id = await sent(ids.alfa);
    expect(await act(clients.alfa, await form(ids.alfa, id, "rejected"))).toEqual({ status: "decided", decision: "rejected", already: false });
    const [decision] = await decisionsOf(id);
    expect(decision).toMatchObject({ decision: "rejected", rejection_reason: null, source: "portal", terms_confirmed: false });

    const blank = await sent(ids.alfa);
    expect((await decide(clients.alfa, ids.alfa, blank, "rejected", { reason: "\u00a0 \u3000" })).data?.[0]?.rejection_reason).toBeNull();
    expect((await quoteRow(id)).status).toBe("rejected");
  }, 60_000);

  it("with a reason, kept as typed and shown back", async () => {
    const id = await sent(ids.alfa);
    const result = await act(clients.alfa, await form(ids.alfa, id, "rejected", { rejectionReason: "  Te duur voor nu.\nMisschien later.  " }));
    expect(result.status).toBe("decided");
    const [decision] = await decisionsOf(id);
    expect(decision!.rejection_reason).toBe("Te duur voor nu.\nMisschien later.");
    const shown = await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, id);
    expect(shown.decision).toMatchObject({ kind: "rejected", rejectionReason: "Te duur voor nu.\nMisschien later." });

    const tooLong = await sent(ids.alfa);
    expect(await act(clients.alfa, await form(ids.alfa, tooLong, "rejected", { rejectionReason: "x".repeat(2001) }))).toMatchObject({ status: "invalid", field: "rejectionReason" });
    expect((await decide(clients.alfa, ids.alfa, tooLong, "rejected", { reason: "x".repeat(2001) })).error?.code).toBe("22023");
    expect((await decide(clients.alfa, ids.alfa, tooLong, "rejected", { reason: "bidi ‮" })).error?.code).toBe("22023");
    expect(await decisionsOf(tooLong)).toHaveLength(0);
  }, 60_000);
});

describe.runIf(local)("the same decision twice", () => {
  it("double accept: one decision, one confirmation, the second answer says so", async () => {
    const id = await sent(ids.alfa);
    const first = await act(clients.alfa, await form(ids.alfa, id, "accepted"));
    const second = await act(clients.alfa, await form(ids.alfa, id, "accepted"));
    expect(first).toMatchObject({ status: "decided", already: false });
    expect(second).toMatchObject({ status: "decided", already: true });
    const decisions = await decisionsOf(id);
    expect(decisions).toHaveLength(1);
    expect(customerMails(decisions[0]!.id)).toHaveLength(1);
  }, 60_000);

  it("double reject: one decision, the first reason stays", async () => {
    const id = await sent(ids.alfa);
    await act(clients.alfa, await form(ids.alfa, id, "rejected", { rejectionReason: "Eerste" }));
    const again = await act(clients.alfa, await form(ids.alfa, id, "rejected", { rejectionReason: "Tweede" }));
    expect(again).toMatchObject({ status: "decided", already: true });
    const decisions = await decisionsOf(id);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.rejection_reason).toBe("Eerste");
  }, 60_000);

  it("an answer that was lost: the retry finds the decision and sends the mails it never sent", async () => {
    const id = await sent(ids.alfa);
    /* The decision committed, but the response never reached the server action: no mail went. */
    const lost = await decide(clients.alfa, ids.alfa, id, "accepted");
    expect(lost.data?.[0]?.outcome).toBe("decided");
    const decisionId = lost.data![0]!.decision_id!;
    expect(customerMails(decisionId)).toHaveLength(0);

    const retried = await act(clients.alfa, await form(ids.alfa, id, "accepted"));
    expect(retried).toMatchObject({ status: "decided", already: true });
    expect(await decisionsOf(id)).toHaveLength(1);
    expect(customerMails(decisionId)).toHaveLength(1);
    expect(internalMails(decisionId)).toHaveLength(1);
  }, 60_000);

  it("two accepts at the same moment, by two colleagues: one decision", async () => {
    const id = await sent(ids.alfa);
    const answers = await Promise.all([decide(clients.alfa, ids.alfa, id, "accepted"), decide(clients.alfa2, ids.alfa, id, "accepted")]);
    expect(answers.map((answer) => answer.error)).toEqual([null, null]);
    expect(answers.map((answer) => answer.data![0]!.outcome).sort()).toEqual(["already_decided", "decided"]);
    expect(await decisionsOf(id)).toHaveLength(1);
  }, 60_000);

  it("accept and reject at the same moment: exactly one wins, the other is refused", async () => {
    for (let round = 0; round < 3; round += 1) {
      const id = await sent(ids.alfa);
      const [accept, reject] = await Promise.all([decide(clients.alfa, ids.alfa, id, "accepted"), decide(clients.alfa2, ids.alfa, id, "rejected")]);
      const outcomes = [accept.data![0]!.outcome, reject.data![0]!.outcome].sort();
      expect(outcomes).toEqual(["conflict", "decided"]);
      const decisions = await decisionsOf(id);
      expect(decisions).toHaveLength(1);
      expect((await quoteRow(id)).status).toBe(decisions[0]!.decision);
    }
  }, 120_000);

  it("concurrent submits of the same decision send one confirmation", async () => {
    const id = await sent(ids.alfa);
    const data = await form(ids.alfa, id, "accepted");
    visitor = clients.alfa;
    jar.delete(portalCustomerCookie);
    const answers = await Promise.all([1, 2, 3].map(() => decideQuoteAction({ status: "idle" }, data)));
    expect(answers.every((answer) => answer.status === "decided")).toBe(true);
    expect(answers.filter((answer) => answer.status === "decided" && !answer.already)).toHaveLength(1);
    const [decision] = await decisionsOf(id);
    expect(customerMails(decision!.id)).toHaveLength(1);
    expect(internalMails(decision!.id)).toHaveLength(1);
  }, 60_000);
});

describe.runIf(local)("a decision on record", () => {
  it("cannot be turned around in the portal: accept then reject, reject then accept", async () => {
    const accepted = await sent(ids.alfa);
    await decide(clients.alfa, ids.alfa, accepted, "accepted");
    const reject = await decide(clients.alfa2, ids.alfa, accepted, "rejected");
    expect(reject.data![0]).toMatchObject({ outcome: "conflict", decision: "accepted" });
    expect(await act(clients.alfa, await form(ids.alfa, accepted, "rejected"))).toMatchObject({ status: "refused" });

    const rejected = await sent(ids.alfa);
    await decide(clients.alfa, ids.alfa, rejected, "rejected");
    const accept = await decide(clients.alfa, ids.alfa, rejected, "accepted");
    expect(accept.data![0]).toMatchObject({ outcome: "conflict", decision: "rejected" });
    expect((await quoteRow(accepted)).status).toBe("accepted");
    expect((await quoteRow(rejected)).status).toBe("rejected");
  }, 60_000);

  it("is never updated or deleted -- not by an admin, not by the service role, not by the owner", async () => {
    const id = await sent(ids.alfa);
    await decide(clients.alfa, ids.alfa, id, "accepted");
    const [decision] = await decisionsOf(id);

    for (const client of [admin, service]) {
      const update = await client.from("quote_decisions").update({ decision: "rejected" }).eq("id", decision!.id);
      expect(update.error).not.toBeNull();
      const remove = await client.from("quote_decisions").delete().eq("id", decision!.id);
      expect(remove.error).not.toBeNull();
      const insert = await client.from("quote_decisions").insert({ ...decision!, id: crypto.randomUUID() });
      expect(insert.error).not.toBeNull();
    }
    expect(psqlFails(`update public.quote_decisions set rejection_reason = 'x' where id = '${decision!.id}'`)).toContain("ligt vast");
    expect(psqlFails(`delete from public.quote_decisions where id = '${decision!.id}'`)).toContain("ligt vast");
    expect(psqlFails("truncate public.quote_decisions cascade")).toContain("ligt vast");
    expect(await decisionsOf(id)).toEqual([decision]);
  }, 60_000);

  it("keeps the quote's document, hash and status fixed", async () => {
    const id = await sent(ids.alfa);
    await decide(clients.alfa, ids.alfa, id, "accepted");
    const before = await quoteRow(id);

    expect((await service.from("quotes").update({ document_sha256: "b".repeat(64) }).eq("id", id)).error).not.toBeNull();
    expect((await admin.from("quotes").update({ document_path: "elsewhere.pdf" }).eq("id", id)).error).not.toBeNull();
    for (const status of ["sent", "expired", "rejected", "draft"]) {
      expect((await admin.from("quotes").update({ status }).eq("id", id)).error, status).not.toBeNull();
      expect((await service.from("quotes").update({ status }).eq("id", id)).error, status).not.toBeNull();
    }
    expect(psqlFails(`update public.quotes set status = 'sent' where id = '${id}'`)).toContain("beslist");
    expect(await quoteRow(id)).toEqual(before);
  }, 60_000);

  it("refuses a record whose snapshot is not the quote's own, even from the owner", async () => {
    const id = await sent(ids.alfa);
    const quote = await quoteRow(id);
    const error = psqlFails(
      `insert into public.quote_decisions (quote_id, customer_id, decision, source, actor_user_id, membership_id, quote_number, quote_document_path, quote_document_sha256, terms_edition, terms_published_on)
       values ('${id}', '${ids.alfa}', 'accepted', 'portal', '${ids.alfaUser}', '${ids.alfaMembership}', '${quote.number_value}', '${quote.document_path}', '${"c".repeat(64)}', '${quote.terms_edition}', '${quote.terms_published_on}')`,
    );
    expect(error).toContain("vastgelegde document");
    expect(await decisionsOf(id)).toHaveLength(0);
    expect((await quoteRow(id)).status).toBe("sent");
  }, 60_000);
});

describe.runIf(local)("who may decide", () => {
  it("only a member of the quote's own customer, for that customer", async () => {
    const betaQuote = await sent(ids.beta);
    const alfaQuote = await sent(ids.alfa);
    const sha = (await quoteRow(betaQuote)).document_sha256!;

    const foreign = await decide(clients.alfa, ids.beta, betaQuote, "accepted", { sha });
    expect(foreign.error?.code).toBe("42501");
    const underOwn = await decide(clients.alfa, ids.alfa, betaQuote, "accepted", { sha });
    expect(underOwn.error?.code).toBe("42501");
    const unknown = await decide(clients.alfa, ids.alfa, crypto.randomUUID(), "accepted", { sha });
    expect(unknown.error?.code).toBe("42501");
    expect((await clients.alfa.rpc("portal_quote_decision", { p_customer_id: ids.alfa, p_quote_id: betaQuote })).error?.code).toBe("42501");

    const anon = await decide(clients.anon, ids.beta, betaQuote, "accepted", { sha });
    expect(anon.error).not.toBeNull();
    const anonRead = await clients.anon.rpc("portal_quote_decision", { p_customer_id: ids.beta, p_quote_id: betaQuote });
    expect(anonRead.error).not.toBeNull();

    /* An admin is not a portal member: the admin set and the member set are different sets. */
    expect((await decide(admin, ids.beta, betaQuote, "accepted", { sha })).error?.code).toBe("42501");
    expect((await decide(clients.revoked, ids.alfa, alfaQuote, "accepted")).error?.code).toBe("42501");

    /* A member cannot use the admin's door either. */
    const offline = await clients.alfa.rpc("admin_record_quote_decision", { p_quote_id: alfaQuote, p_decision: "accepted", p_source: "email", p_rejection_reason: null, p_note: null });
    expect(offline.error?.code).toBe("42501");

    expect(await decisionsOf(betaQuote)).toHaveLength(0);
    expect(await decisionsOf(alfaQuote)).toHaveLength(0);
  }, 60_000);

  it("not after the membership was revoked between reading the page and submitting", async () => {
    const id = await sent(ids.alfa);
    const page = await readPortalQuoteDecisionAs(clients.late, ids.alfa, id);
    expect(page.state).toBe("open");
    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("user_id", ids.lateUser).eq("customer_id", ids.alfa);

    const data = await form(ids.alfa, id, "accepted");
    await expect(act(clients.late, data)).rejects.toThrow("redirect:");
    expect((await decide(clients.late, ids.alfa, id, "accepted")).error?.code).toBe("42501");
    expect(await decisionsOf(id)).toHaveLength(0);
  }, 60_000);

  it("a member of two customers decides for the one the session acts for, never the form's", async () => {
    const betaQuote = await sent(ids.beta);
    /* The session acts for Alfa; a page left open from Beta says Beta. */
    const stale = await act(clients.multi, await form(ids.beta, betaQuote, "accepted"), ids.alfa);
    expect(stale.status).toBe("stale_customer");
    expect((await decide(clients.multi, ids.alfa, betaQuote, "accepted")).error?.code).toBe("42501");
    expect(await decisionsOf(betaQuote)).toHaveLength(0);

    const acting = await act(clients.multi, await form(ids.beta, betaQuote, "accepted"), ids.beta);
    expect(acting).toMatchObject({ status: "decided" });
    const [decision] = await decisionsOf(betaQuote);
    expect(decision).toMatchObject({ customer_id: ids.beta, actor_user_id: ids.multiUser });
  }, 60_000);
});

describe.runIf(local)("which quotes can be decided", () => {
  it("never a concept, a numbered quote that was not sent, or a legacy quote without its document", async () => {
    const draft = await concept(ids.alfa);
    expect((await decide(clients.alfa, ids.alfa, draft, "accepted", { sha: "a".repeat(64) })).error?.code).toBe("42501");

    const numbered = await concept(ids.alfa);
    const issue = await admin.rpc("begin_quote_issue", { p_quote_id: numbered, p_terms_edition: "2026", p_terms_published_on: "2026-09-29" });
    /* (numbered in this file's own year, see issueDate) */
    expect(issue.error).toBeNull();
    expect((await decide(clients.alfa, ids.alfa, numbered, "accepted", { sha: "a".repeat(64) })).error?.code).toBe("42501");
    const offlineNumbered = await admin.rpc("admin_record_quote_decision", { p_quote_id: numbered, p_decision: "accepted", p_source: "email", p_rejection_reason: null, p_note: null });
    expect(offlineNumbered.data?.[0]?.outcome).toBe("not_document");

    const legacy = crypto.randomUUID();
    psql(`set session_replication_role = replica;
      insert into public.quotes (id, number_value, number_provisional, status, customer_id, customer_company_name, customer_contact_name, customer_email,
        customer_street, customer_postal_code, customer_city, customer_country, issue_date, valid_until, subject, sent_at, legacy_sent_without_document)
      values ('${legacy}', 'YM-O-LEGACY-${stamp}', false, 'sent', '${ids.alfa}', 'K', 'C', 'c@example.test', 'S 1', '1011 AA', 'A', 'Nederland',
        '${today}', '2099-12-31', 'Oud', now(), true);`);
    expect((await decide(clients.alfa, ids.alfa, legacy, "accepted", { sha: "a".repeat(64) })).error?.code).toBe("42501");
    const offlineLegacy = await admin.rpc("admin_record_quote_decision", { p_quote_id: legacy, p_decision: "accepted", p_source: "phone", p_rejection_reason: null, p_note: null });
    expect(offlineLegacy.data?.[0]?.outcome).toBe("not_document");
    expect(psqlFails(`update public.quotes set status = 'accepted' where id = '${legacy}'`)).toContain("vastgelegde beslissing");

    for (const id of [draft, numbered, legacy]) expect(await decisionsOf(id)).toHaveLength(0);
  }, 60_000);

  it("not past its date in the portal -- the admin may still record one", async () => {
    const id = await sent(ids.alfa);
    psql(`set session_replication_role = replica; update public.quotes set issue_date = '2026-01-01', valid_until = '2026-02-01' where id = '${id}';`);

    const view = await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, id);
    expect(view.state).toBe("expired");
    expect((await decide(clients.alfa, ids.alfa, id, "accepted")).data?.[0]?.outcome).toBe("expired");
    expect(await act(clients.alfa, await form(ids.alfa, id, "accepted"))).toMatchObject({ status: "refused", message: expect.stringContaining("verlopen") });
    expect((await decide(clients.alfa, ids.alfa, id, "rejected")).data?.[0]?.outcome).toBe("expired");
    expect(await decisionsOf(id)).toHaveLength(0);

    /* A late acceptance YM Creations chooses to honour, or one that came in on time by mail. */
    const offline = await recordQuoteDecision(id, { decision: "accepted", source: "email", note: "Mail van 31 januari." });
    expect(offline).toEqual({ ok: true, value: "decided" });
  }, 60_000);

  it("not when the admin marked it expired", async () => {
    const id = await sent(ids.alfa);
    expect(await setQuoteOutcome(id, "expired")).toEqual({ ok: true, value: "expired" });
    expect((await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, id)).state).toBe("expired");
    expect((await decide(clients.alfa, ids.alfa, id, "accepted")).data?.[0]?.outcome).toBe("expired");
  }, 60_000);

  it("a version with a concept successor stays open; once the successor is issued, only the new one can be decided", async () => {
    const v1 = await sent(ids.alfa);
    const revision = await createQuoteRevision(v1);
    if (!revision.ok) throw new Error(revision.error);
    const v2 = revision.value;
    expect((await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, v1)).state).toBe("open");

    /* The page of v1 was loaded; then v2 went out. */
    const oldPage = await form(ids.alfa, v1, "accepted");
    await sent(ids.alfa, v2);

    expect((await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, v1)).state).toBe("superseded");
    expect(await act(clients.alfa, oldPage)).toMatchObject({ status: "refused" });
    expect((await decide(clients.alfa, ids.alfa, v1, "rejected")).data?.[0]?.outcome).toBe("superseded");
    const offline = await admin.rpc("admin_record_quote_decision", { p_quote_id: v1, p_decision: "accepted", p_source: "email", p_rejection_reason: null, p_note: null });
    expect(offline.data?.[0]?.outcome).toBe("superseded");
    expect(await decisionsOf(v1)).toHaveLength(0);

    expect(await act(clients.alfa, await form(ids.alfa, v2, "accepted"))).toMatchObject({ status: "decided" });
  }, 120_000);

  it("an accepted quote's concept successor can never be issued", async () => {
    const v1 = await sent(ids.alfa);
    const revision = await createQuoteRevision(v1);
    if (!revision.ok) throw new Error(revision.error);
    expect((await decide(clients.alfa, ids.alfa, v1, "accepted")).data?.[0]?.outcome).toBe("decided");

    await service.from("quotes").update({ issue_date: issueDate }).eq("id", revision.value);
    const send = await sendQuoteToCustomer(revision.value);
    expect(send.ok).toBe(false);
    const successor = await quoteRow(revision.value);
    expect(successor.number_provisional).toBe(true);
    expect(successor.sent_at).toBeNull();
  }, 60_000);

  it("never on a page older than the document on record", async () => {
    const id = await sent(ids.alfa);
    const stale = await decide(clients.alfa, ids.alfa, id, "accepted", { sha: "d".repeat(64) });
    expect(stale.data?.[0]?.outcome).toBe("stale");
    const data = await form(ids.alfa, id, "accepted");
    data.set("documentSha256", "d".repeat(64));
    expect(await act(clients.alfa, data)).toMatchObject({ status: "refused" });
    expect(await decisionsOf(id)).toHaveLength(0);
  }, 60_000);
});

describe.runIf(local)("a decision that reached YM Creations outside the portal", () => {
  it("is recorded by an admin on the same record and snapshot, with its source and note, without mails", async () => {
    const accepted = await sent(ids.alfa);
    expect(await recordQuoteDecision(accepted, { decision: "accepted", source: "signed", note: "Getekende PDF ontvangen." })).toEqual({ ok: true, value: "decided" });
    const quote = await quoteRow(accepted);
    const [decision] = await decisionsOf(accepted);
    expect(decision).toMatchObject({
      decision: "accepted",
      source: "signed",
      note: "Getekende PDF ontvangen.",
      membership_id: null,
      actor_user_id: ids.adminUser,
      quote_document_sha256: quote.document_sha256,
      terms_edition: quote.terms_edition,
    });
    expect(quote.status).toBe("accepted");
    expect(await notification(decision!.id)).toBeNull();
    expect(customerMails(decision!.id)).toHaveLength(0);
    expect(internalMails(decision!.id)).toHaveLength(0);
    expect(deliverEmail.mock.calls.filter(([email]) => String((email as { idempotencyKey?: string }).idempotencyKey ?? "").startsWith("quote-decision/"))).toHaveLength(0);

    const rejected = await sent(ids.alfa);
    expect(await recordQuoteDecision(rejected, { decision: "rejected", source: "phone", rejectionReason: "Gaat met een ander verder." })).toEqual({ ok: true, value: "decided" });
    const [rejection] = await decisionsOf(rejected);
    expect(rejection).toMatchObject({ source: "phone", rejection_reason: "Gaat met een ander verder.", note: null });

    /* What the customer sees: the decision, never the note or the admin. */
    const shown = await readPortalQuoteDecisionAs(clients.alfa, ids.alfa, accepted);
    expect(shown.decision).toEqual({ kind: "accepted", source: "signed", decidedAt: decision!.decided_at });

    const read = await getQuoteDecision(accepted);
    expect(read).toMatchObject({ decision: "accepted", source: "signed", note: "Getekende PDF ontvangen.", documentSha256: quote.document_sha256 });
  }, 60_000);

  it("is recorded once: a second one is refused, and a portal decision is never overwritten", async () => {
    const id = await sent(ids.alfa);
    await recordQuoteDecision(id, { decision: "accepted", source: "email" });
    expect(await recordQuoteDecision(id, { decision: "accepted", source: "email" })).toEqual({ ok: true, value: "already_decided" });
    expect((await recordQuoteDecision(id, { decision: "rejected", source: "email" })).ok).toBe(false);
    expect((await recordQuoteDecision(id, { decision: "accepted", source: "phone" })).ok).toBe(false);
    expect((await decide(clients.alfa, ids.alfa, id, "rejected")).data?.[0]?.outcome).toBe("conflict");

    const portal = await sent(ids.alfa);
    await decide(clients.alfa, ids.alfa, portal, "accepted");
    expect((await recordQuoteDecision(portal, { decision: "rejected", source: "phone" })).ok).toBe(false);
    expect((await recordQuoteDecision(portal, { decision: "accepted", source: "email" })).ok).toBe(false);
    const [decision] = await decisionsOf(portal);
    expect(decision!.source).toBe("portal");
  }, 60_000);

  it("cannot claim to come from the portal", async () => {
    const id = await sent(ids.alfa);
    expect((await recordQuoteDecision(id, { decision: "accepted", source: "portal" })).ok).toBe(false);
    const direct = await admin.rpc("admin_record_quote_decision", { p_quote_id: id, p_decision: "accepted", p_source: "portal", p_rejection_reason: null, p_note: null });
    expect(direct.error?.code).toBe("22023");
    expect(await decisionsOf(id)).toHaveLength(0);
  }, 60_000);

  it("has no way around it: the status selector and a direct update both refuse accepted and rejected", async () => {
    const id = await sent(ids.alfa);
    for (const status of ["accepted", "rejected"]) {
      expect((await setQuoteOutcome(id, status)).ok).toBe(false);
      expect((await admin.from("quotes").update({ status }).eq("id", id)).error, status).not.toBeNull();
      expect((await service.from("quotes").update({ status }).eq("id", id)).error, status).not.toBeNull();
    }
    expect((await quoteRow(id)).status).toBe("sent");
    expect(await decisionsOf(id)).toHaveLength(0);
  }, 60_000);
});

describe.runIf(local)("the mails of a decision", () => {
  it("failing never costs the decision; the retry delivers once and makes no second decision", async () => {
    const id = await sent(ids.alfa);
    deliverEmail.mockResolvedValue({ sent: false, reason: "Resend down", failure: "error" });
    expect(await act(clients.alfa, await form(ids.alfa, id, "accepted"))).toMatchObject({ status: "decided", already: false });

    const [decision] = await decisionsOf(id);
    expect((await quoteRow(id)).status).toBe("accepted");
    const failed = await notification(decision!.id);
    expect(failed).toMatchObject({ customer_notified_at: null, internal_notified_at: null, claimed_at: null, attempts: 1 });

    deliverEmail.mockReset();
    deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });
    /* The daily pass, a quarter of an hour on. */
    const later = new Date(Date.now() + 20 * 60_000);
    const summary = await notifyPendingQuoteDecisions(service, later);
    expect(summary.sent).toBeGreaterThanOrEqual(1);
    expect(customerMails(decision!.id)).toHaveLength(1);
    expect(internalMails(decision!.id)).toHaveLength(1);

    /* Nothing left: a second pass and the admin's button send nothing. */
    const again = await notifyPendingQuoteDecisions(service, later);
    expect(again.considered).toBe(0);
    expect(await retryQuoteDecisionMail(id)).toEqual({ ok: true, value: "skipped" });
    expect(customerMails(decision!.id)).toHaveLength(1);
    expect(await decisionsOf(id)).toHaveLength(1);
    const done = await notification(decision!.id);
    expect(done!.customer_notified_at).not.toBeNull();
    /* A sent mail stays marked sent. */
    expect((await service.from("quote_decision_notifications").update({ customer_notified_at: null }).eq("decision_id", decision!.id)).error).not.toBeNull();
  }, 60_000);

  it("the admin's retry sends what failed, through the same lease", async () => {
    const id = await sent(ids.alfa);
    deliverEmail.mockResolvedValue({ sent: false, reason: "Resend down", failure: "error" });
    await act(clients.alfa, await form(ids.alfa, id, "rejected"));
    const [decision] = await decisionsOf(id);

    deliverEmail.mockReset();
    deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });
    expect(await retryQuoteDecisionMail(id)).toEqual({ ok: true, value: "sent" });
    expect(customerMails(decision!.id)).toHaveLength(1);
    expect((await getQuoteDecision(id))!.notification).toMatchObject({ attempts: 2 });
  }, 60_000);
});

describe.runIf(local)("a request the quote was made for", () => {
  it("shows the quote's new status through the quote's own read, and stays as it was", async () => {
    const id = await sent(ids.alfa);
    const created = await clients.alfa.rpc("portal_create_request", {
      p_customer_id: ids.alfa,
      p_submission_id: crypto.randomUUID(),
      p_category: "website_change",
      p_subject: "Nieuwe website",
      p_description: "Graag een offerte.",
    });
    if (created.error) throw new Error(created.error.message);
    const requestId = created.data![0]!.request_id;
    const linked = await admin.from("customer_requests").update({ quote_id: id, status: "in_review" }).eq("id", requestId);
    expect(linked.error).toBeNull();

    await act(clients.alfa, await form(ids.alfa, id, "accepted"));

    visitor = clients.alfa;
    const request = await readPortalRequest(ids.alfa, requestId);
    expect(request.quote).toEqual({ id, number: (await quoteRow(id)).number_value });
    expect(request.status).toBe("in_review");
    const quote = await readPortalQuote(ids.alfa, id);
    expect(portalQuoteState(quote, today)).toBe("accepted");
  }, 60_000);
});

async function readPortalQuoteDecisionAs(client: Db, customerId: string, quoteId: string) {
  visitor = client;
  return readPortalQuoteDecision(customerId, quoteId);
}

async function readPortalQuotesAs(client: Db, customerId: string) {
  visitor = client;
  return readPortalQuotes(customerId);
}
