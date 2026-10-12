import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The portal's two payment actions against a real Postgres and a real Auth
 * server, with Mollie replaced by a stub that keeps state the way Mollie
 * does: payment links by id, the idempotency key returning what the first
 * request made, links that can be paid, expire or be archived, mandates per
 * Mollie customer.
 *
 * The documents are made by the admin's own flows. Then members pay
 * through lib/portal/privileged.ts -- the same entry the server actions use
 * -- and every refusal, reuse, race and failure window is checked against
 * what lands in the database and at "Mollie". A customer whose monthly
 * service waits for its mandate pays the invoice and gives the mandate in
 * one payment; there is no separate activation in the portal.
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
process.env.MOLLIE_API_KEY = "test_portal_payments_stub";
process.env.NEXT_PUBLIC_SITE_URL = "https://ymcreations.test";
process.env.PAYMENT_RETURN_SECRET = "portal-payments-test-secret-0123456789abcdef";

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

// ------------------------------------------------------------- Mollie stub

/* Provider ids are unique in the database, and the local stack outlives a run. */
const runId = Date.now().toString(36);

type StubLink = {
  id: string;
  amountCents: number;
  sequenceType: string;
  href: string;
  archived: boolean;
  paidAt: string | null;
  expiresAt: string | null;
  customerId?: string;
};
const mollie = {
  links: new Map<string, StubLink>(),
  byKey: new Map<string, string>(),
  customers: new Map<string, string>(),
  mandates: new Map<string, { id: string; status: "valid" | "pending" | "invalid"; method: string }[]>(),
  creates: [] as { amountCents: number; sequenceType: string; idempotencyKey: string; description: string }[],
  /* Every `first` link made, with the Mollie customer it attaches the mandate to. */
  firstLinks: new Map<string, string>(),
  failCreates: 0,
  counter: 0,
};
function linkView(link: StubLink) {
  return {
    id: link.id,
    archived: link.archived,
    paidAt: link.paidAt,
    expiresAt: link.expiresAt,
    amount: { currency: "EUR", value: (link.amountCents / 100).toFixed(2) },
    _links: { paymentLink: { href: link.href } },
  };
}
vi.mock("@/lib/mollie/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mollie/client")>();
  return {
    ...original,
    createPaymentLink: async (input: { amountCents: number; sequenceType: string; idempotencyKey: string; description: string; customerId?: string }) => {
      if (mollie.failCreates > 0) {
        mollie.failCreates -= 1;
        throw new original.MollieError(503, "Simulated outage");
      }
      mollie.creates.push({ amountCents: input.amountCents, sequenceType: input.sequenceType, idempotencyKey: input.idempotencyKey, description: input.description });
      const known = mollie.byKey.get(input.idempotencyKey);
      if (known) return linkView(mollie.links.get(known)!);
      mollie.counter += 1;
      const id = `pl_stub${runId}_${mollie.counter}`;
      const link: StubLink = { id, amountCents: input.amountCents, sequenceType: input.sequenceType, href: `https://mollie.test/pay/${id}`, archived: false, paidAt: null, expiresAt: null, ...(input.customerId ? { customerId: input.customerId } : {}) };
      if (input.sequenceType === "first") mollie.firstLinks.set(id, input.customerId ?? "");
      mollie.links.set(id, link);
      mollie.byKey.set(input.idempotencyKey, id);
      return linkView(link);
    },
    getPaymentLink: async (id: string) => {
      const link = mollie.links.get(id);
      if (!link) throw new original.MollieError(404, "Not found");
      return linkView(link);
    },
    archivePaymentLink: async (id: string) => {
      const link = mollie.links.get(id);
      if (!link) throw new original.MollieError(404, "Not found");
      link.archived = true;
      return linkView(link);
    },
    listPaymentLinkPayments: async () => [],
    createCustomer: async (input: { idempotencyKey: string }) => {
      const known = mollie.customers.get(input.idempotencyKey);
      if (known) return { id: known };
      mollie.counter += 1;
      const id = `cst_stub${runId}_${mollie.counter}`;
      mollie.customers.set(input.idempotencyKey, id);
      return { id };
    },
    listMandates: async (customerId: string) => mollie.mandates.get(customerId) ?? [],
  };
});

// -------------------------------------------------- sessions and boundary

let admin: SupabaseClient<Database>;
let visitor: SupabaseClient<Database>;
let service: SupabaseClient<Database>;
/* Failure injection on the system client: the next N payment-link writes fail after Mollie answered. */
let failLinkWrites = 0;

vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => admin,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "00000000-0000-4000-8000-000000000000", email: null, displayName: null }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => visitor }));
vi.mock("@/lib/payments/admin-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/admin-client")>()),
  paymentsAdminClient: () =>
    new Proxy(service, {
      get(target, prop, receiver) {
        if (prop !== "from") return Reflect.get(target, prop, receiver);
        return (table: string) => {
          const builder = target.from(table as never);
          if (table !== "invoice_payment_links" || failLinkWrites === 0) return builder;
          return new Proxy(builder, {
            get(inner, key, innerReceiver) {
              if (key !== "upsert") return Reflect.get(inner, key, innerReceiver);
              failLinkWrites -= 1;
              return async () => ({ data: null, error: { message: "simulated database outage", code: "XX000" } });
            },
          });
        };
      },
    }),
}));

const { sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");
const { finalizeInvoice } = await import("@/lib/admin/invoices/finalize");
const { recordManualPayment } = await import("@/lib/payments/payment-actions");
const { createManualCreditNote } = await import("@/lib/admin/credit-notes/actions");
const { startInvoicePayment, previewInvoicePayment } = await import("@/lib/portal/privileged");
const { readPortalPaymentContext } = await import("@/lib/portal/payments/read");
const { payInvoiceAction } = await import("@/lib/portal/payment-actions");
const { createMandateActivation } = await import("@/lib/payments/actions");
const { PortalDenied } = await import("@/lib/portal/rpc");

type Db = SupabaseClient<Database>;
const password = "portal-payments-password";
const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

const ids = { alfa: "", beta: "", gamma: "", delta: "", alfaUser: "", betaUser: "", gammaUser: "", deltaUser: "", alfaMembership: "" };
const inv = { open: "", partlyPaid: "", partlyCredited: "", paid: "", fullyCredited: "", raceFresh: "", failWindow: "", directDebit: "", beta: "", deltaOpen: "", deltaBank: "", gamma: "" };
const services = { alfaCollecting: "", betaCollecting: "", deltaDraft: "" };
const clients = {} as Record<"alfa" | "beta" | "gamma" | "delta", Db>;
const deltaCent = { linkId: `pl_cent_${runId}`, activationId: "" };

async function signedIn(email: string): Promise<Db> {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function createUser(label: string): Promise<{ id: string; email: string }> {
  const email = `portal-pay-${label}-${stamp}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`user ${label}: ${error.message}`);
  return { id: data.user!.id, email };
}

async function createCustomer(name: string): Promise<string> {
  const { data, error } = await service
    .from("customers")
    .insert({ company_name: `${name} ${stamp}`, contact_name: `Contact ${name}`, email: `portal-pay-${name.toLowerCase()}-${stamp}@example.test`, street: "Straat 1", postal_code: "1011 AA", city: "Amsterdam", country: "Nederland" })
    .select("id")
    .single();
  if (error) throw new Error(`customer ${name}: ${error.message}`);
  return data!.id;
}

async function member(userId: string, customerId: string, email: string): Promise<string> {
  const { data, error } = await service.from("customer_users").insert({ user_id: userId, customer_id: customerId, invited_email: email }).select("id").single();
  if (error) throw new Error(`membership: ${error.message}`);
  return data!.id;
}

async function sentInvoice(customerId: string, unitPriceCents = 100000, extra: Record<string, unknown> = {}): Promise<string> {
  const seed = Math.random().toString(36).slice(-6).toUpperCase();
  const { data, error } = await service
    .from("invoices")
    .insert({
      number_value: `FAC-CONCEPT-${seed}`,
      number_provisional: true,
      status: "draft",
      customer_id: customerId,
      customer_company_name: "Klant",
      customer_contact_name: "Contact",
      customer_email: `portal-pay-doc-${seed}@example.test`,
      customer_street: "Straat 1",
      customer_postal_code: "1011 AA",
      customer_city: "Amsterdam",
      customer_country: "Nederland",
      issue_date: today,
      due_date: today,
      payment_reference: "",
      notes: "",
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(`invoice concept: ${error.message}`);
  const lines = await service.rpc("save_invoice_lines", {
    p_invoice_id: data!.id,
    p_lines: [{ description: "Website", quantityHundredths: 100, unitPriceCents, vatRate: 21 }] as never,
  });
  if (lines.error) throw new Error(`lines: ${lines.error.message}`);
  const issued = await finalizeInvoice(data!.id);
  if (!issued.ok) throw new Error(`finalize: ${issued.error}`);
  const sent = await sendInvoiceToCustomer(data!.id);
  if (!sent.ok) throw new Error(`send: ${sent.error}`);
  return data!.id;
}

async function recurringService(customerId: string, status: string): Promise<string> {
  const { data, error } = await admin.rpc("create_recurring_service", {
    p_customer_id: customerId,
    p_name: `Dienst ${status}`,
    p_description: "",
    p_amount_cents: 2500,
    p_vat_rate: 21,
    p_starts_on: "2026-11-01",
    p_status: status,
    p_effective_from: "2026-11-01",
    p_terms_edition: "2026",
    p_terms_published_on: "2026-09-14",
    p_note: "",
  });
  if (error) throw new Error(`service: ${error.message}`);
  return data as string;
}

async function links(invoiceId: string) {
  const { data, error } = await service.from("invoice_payment_links").select("provider_payment_link_id, amount_cents, sequence_type").eq("invoice_id", invoiceId);
  if (error) throw new Error(`links: ${error.message}`);
  return data ?? [];
}

async function events(customerId: string, action: string) {
  const { data } = await service.from("portal_events").select("*").eq("customer_id", customerId).eq("action", action);
  return data ?? [];
}

async function as<T>(client: Db, run: () => Promise<T>): Promise<T> {
  visitor = client;
  return run();
}

async function denied(run: Promise<unknown>): Promise<boolean> {
  try {
    await run;
    return false;
  } catch (error) {
    if (error instanceof PortalDenied) return true;
    throw error;
  }
}

const actor = (customer: "alfa" | "beta" | "gamma" | "delta", user: "alfaUser" | "betaUser" | "gammaUser" | "deltaUser") => ({ customerId: ids[customer], userId: ids[user] });

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  const adminUser = await createUser("admin");
  const profile = await service.from("admin_profiles").insert({ user_id: adminUser.id, display_name: "Portal payment validation" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);
  admin = await signedIn(adminUser.email);
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });

  ids.alfa = await createCustomer("Alfa");
  ids.beta = await createCustomer("Beta");
  ids.gamma = await createCustomer("Gamma");

  /* Sending makes each invoice's link at the stub, as the mail would. */
  inv.open = await sentInvoice(ids.alfa);
  inv.partlyPaid = await sentInvoice(ids.alfa);
  const part = await recordManualPayment(inv.partlyPaid, { amountCents: 21000, paidOn: today, note: "" });
  if (!part.ok) throw new Error(part.error);
  inv.partlyCredited = await sentInvoice(ids.alfa);
  const credit = await createManualCreditNote(inv.partlyCredited, { reason: "Korting", issueDate: today, lines: [{ description: "Korting", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 }] });
  if (!credit.ok) throw new Error(credit.error);
  inv.paid = await sentInvoice(ids.alfa);
  const whole = await recordManualPayment(inv.paid, { amountCents: 121000, paidOn: today, note: "" });
  if (!whole.ok) throw new Error(whole.error);
  inv.fullyCredited = await sentInvoice(ids.alfa);
  const full = await createManualCreditNote(inv.fullyCredited, { reason: "Vervallen", issueDate: today, lines: [{ description: "Volledig", quantityHundredths: 100, unitPriceCents: 100000, vatRate: 21 }] });
  if (!full.ok) throw new Error(full.error);
  inv.raceFresh = await sentInvoice(ids.alfa, 70000);
  inv.failWindow = await sentInvoice(ids.alfa, 80000);
  /* These two start without a link, as if none was ever made. */
  await service.from("invoice_payment_links").delete().in("invoice_id", [inv.raceFresh, inv.failWindow]);

  /* Alfa's only service collects: nothing of Alfa's waits for a mandate, so Alfa pays one-off. */
  services.alfaCollecting = await recurringService(ids.alfa, "active");
  await service.from("recurring_services").update({ mollie_subscription_id: `sub_portal_pay_${stamp}` }).eq("id", services.alfaCollecting);
  inv.directDebit = await sentInvoice(ids.alfa, 2500, { recurring_service_id: services.alfaCollecting, billing_period_start: "2026-11-01", billing_period_end: "2026-11-30" });

  inv.beta = await sentInvoice(ids.beta);
  services.betaCollecting = await recurringService(ids.beta, "active");
  await service.from("recurring_services").update({ mollie_subscription_id: `sub_portal_pay_b_${stamp}` }).eq("id", services.betaCollecting);

  /* Gamma already has a mandate Mollie calls valid: its invoices are paid one-off, never `first` again. */
  await recurringService(ids.gamma, "awaiting_mandate");
  const provider = await service.from("customer_payment_providers").insert({ customer_id: ids.gamma, provider: "mollie", provider_customer_id: `cst_gamma_${stamp}`, provider_mandate_id: `mdt_gamma_${stamp}` });
  if (provider.error) throw new Error(`provider: ${provider.error.message}`);
  mollie.mandates.set(`cst_gamma_${stamp}`, [{ id: `mdt_gamma_${stamp}`, status: "valid", method: "directdebit" }]);
  inv.gamma = await sentInvoice(ids.gamma);

  /*
    Delta: a new monthly service (draft until its collection is started) and
    no mandate -- the YM case. An older EUR 0.01 link from before is still
    open at Mollie. Then two invoices are sent; one is paid by bank transfer.
  */
  ids.delta = await createCustomer("Delta");
  services.deltaDraft = await recurringService(ids.delta, "draft");
  const deltaProvider = await service.from("customer_payment_providers").insert({ customer_id: ids.delta, provider: "mollie", provider_customer_id: `cst_delta_${stamp}` });
  if (deltaProvider.error) throw new Error(`delta provider: ${deltaProvider.error.message}`);
  mollie.links.set(deltaCent.linkId, { id: deltaCent.linkId, amountCents: 1, sequenceType: "first", href: `https://mollie.test/pay/${deltaCent.linkId}`, archived: false, paidAt: null, expiresAt: null, customerId: `cst_delta_${stamp}` });
  const cent = await service
    .from("mandate_activations")
    .insert({ customer_id: ids.delta, provider: "mollie", provider_customer_id: `cst_delta_${stamp}`, provider_payment_link_id: deltaCent.linkId, checkout_url: `https://mollie.test/pay/${deltaCent.linkId}`, amount_cents: 1 })
    .select("id")
    .single();
  if (cent.error) throw new Error(`activation: ${cent.error.message}`);
  deltaCent.activationId = cent.data!.id;
  inv.deltaOpen = await sentInvoice(ids.delta, 62000);
  inv.deltaBank = await sentInvoice(ids.delta, 50000);

  const alfaUser = await createUser("alfa");
  const betaUser = await createUser("beta");
  const gammaUser = await createUser("gamma");
  const deltaUser = await createUser("delta");
  ids.alfaUser = alfaUser.id;
  ids.betaUser = betaUser.id;
  ids.gammaUser = gammaUser.id;
  ids.deltaUser = deltaUser.id;
  ids.alfaMembership = await member(alfaUser.id, ids.alfa, alfaUser.email);
  await member(betaUser.id, ids.beta, betaUser.email);
  await member(gammaUser.id, ids.gamma, gammaUser.email);
  await member(deltaUser.id, ids.delta, deltaUser.email);
  clients.alfa = await signedIn(alfaUser.email);
  clients.beta = await signedIn(betaUser.email);
  clients.gamma = await signedIn(gammaUser.email);
  clients.delta = await signedIn(deltaUser.email);
}, 300_000);

afterAll(async () => {
  if (!local || !service) return;
  for (const id of [ids.alfaUser, ids.betaUser, ids.gammaUser, ids.deltaUser]) if (id) await service.auth.admin.deleteUser(id);
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local, and Mollie is the stub", () => {
    expect(url).toMatch(loopback);
    expect(url).not.toContain("supabase.co");
    expect(process.env.MOLLIE_API_KEY).toBe("test_portal_payments_stub");
  });
});

describe.runIf(local)("paying an invoice", () => {
  it("refuses another customer's invoice, a manipulated id and a foreign customer before anything reaches Mollie", async () => {
    const before = mollie.creates.length;
    expect(await as(clients.alfa, () => denied(startInvoicePayment(actor("alfa", "alfaUser"), inv.beta)))).toBe(true);
    expect(await as(clients.beta, () => denied(startInvoicePayment(actor("beta", "betaUser"), inv.open)))).toBe(true);
    expect(await as(clients.alfa, () => denied(startInvoicePayment(actor("alfa", "alfaUser"), crypto.randomUUID())))).toBe(true);
    expect(await as(clients.alfa, () => denied(startInvoicePayment(actor("alfa", "alfaUser"), "../invoices?id=eq.x")))).toBe(true);
    /* A member of Alfa who names Beta as the customer gets nothing either. */
    expect(await as(clients.alfa, () => denied(startInvoicePayment({ userId: ids.alfaUser, customerId: ids.beta }, inv.beta)))).toBe(true);
    expect(mollie.creates.length).toBe(before);
    expect(await events(ids.beta, "invoice_payment_started")).toEqual([]);
  });

  it("offers nothing on a paid or a fully credited invoice", async () => {
    const before = mollie.creates.length;
    expect(await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.paid))).toEqual({ ok: false, reason: "nothing_due" });
    expect(await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.fullyCredited))).toEqual({ ok: false, reason: "nothing_due" });
    expect(mollie.creates.length).toBe(before);
  });

  it("never offers a pay link for an invoice the direct debit collects", async () => {
    const context = await as(clients.alfa, () => readPortalPaymentContext(ids.alfa));
    expect(context.directDebitInvoiceIds).toEqual([inv.directDebit]);
    const before = mollie.creates.length;
    expect(await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.directDebit))).toEqual({ ok: false, reason: "direct_debit" });
    expect(mollie.creates.length).toBe(before);
    expect(await links(inv.directDebit)).toEqual([]);
  });

  it("reuses the link the mail already carries when it still asks for the open amount", async () => {
    const [mailed] = await links(inv.open);
    expect(mailed).toMatchObject({ amount_cents: 121000, sequence_type: "oneoff" });
    const before = mollie.creates.length;
    const result = await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.open));
    expect(result).toEqual({ ok: true, url: `https://mollie.test/pay/${mailed!.provider_payment_link_id}` });
    expect(mollie.creates.length).toBe(before);
    expect(await events(ids.alfa, "invoice_payment_started")).toEqual([
      expect.objectContaining({ actor_user_id: ids.alfaUser, target_kind: "invoice", target_id: inv.open }),
    ]);
  });

  it("asks for exactly what is still open: part paid, and part credited", async () => {
    const [stale] = await links(inv.partlyPaid);
    expect(stale!.amount_cents).toBe(121000);
    const paid = await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.partlyPaid));
    expect(paid.ok).toBe(true);
    const [fresh] = await links(inv.partlyPaid);
    expect(fresh).toMatchObject({ amount_cents: 100000, sequence_type: "oneoff" });
    /* The link that asked too much was closed before its replacement existed. */
    expect(mollie.links.get(stale!.provider_payment_link_id)!.archived).toBe(true);

    const credited = await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.partlyCredited));
    expect(credited.ok).toBe(true);
    const [creditedLink] = await links(inv.partlyCredited);
    /* Credit notes are made after the send, so the mail's link asked the full amount; this one asks the rest. */
    expect(creditedLink).toMatchObject({ amount_cents: 108900 });
  });

  it("refuses a second payment while one is still running, and offers it again once that one ends", async () => {
    const { data: pending, error } = await service
      .from("payments")
      .insert({ invoice_id: inv.partlyCredited, customer_id: ids.alfa, amount_cents: 108900, currency: "EUR", status: "pending", source: "mollie", provider_payment_id: `tr_pending_${stamp}`, method: "banktransfer", description: "Lopende overboeking" })
      .select("id")
      .single();
    if (error) throw new Error(`pending payment: ${error.message}`);
    const before = mollie.creates.length;
    expect(await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.partlyCredited))).toEqual({ ok: false, reason: "payment_in_progress" });
    expect(mollie.creates.length).toBe(before);

    await service.from("payments").update({ status: "failed" }).eq("id", pending!.id);
    expect((await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.partlyCredited))).ok).toBe(true);
  });

  it("makes one link for two clicks at once", async () => {
    const before = mollie.links.size;
    const [first, second] = await as(clients.alfa, () =>
      Promise.all([startInvoicePayment(actor("alfa", "alfaUser"), inv.raceFresh), startInvoicePayment(actor("alfa", "alfaUser"), inv.raceFresh)]),
    );
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(await links(inv.raceFresh)).toHaveLength(1);
    /* Same invoice, same amount, same idempotency key: Mollie answers both with the link it made for the mail. */
    expect(mollie.links.size).toBeLessThanOrEqual(before + 1);
    expect(first.ok && first.url).toBe(`https://mollie.test/pay/${(await links(inv.raceFresh))[0]!.provider_payment_link_id}`);
  });

  it("survives Mollie answering and the database not: the retry lands on the same link", async () => {
    failLinkWrites = 1;
    const mark = mollie.creates.length;
    const failed = await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.failWindow));
    expect(failed).toEqual({ ok: false, reason: "failed" });
    expect(await links(inv.failWindow)).toEqual([]);
    const made = mollie.creates.slice(mark).filter((create) => create.idempotencyKey.includes(inv.failWindow));
    expect(made).toHaveLength(1);

    const retried = await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.failWindow));
    expect(retried.ok).toBe(true);
    const [stored] = await links(inv.failWindow);
    const linkIds = new Set(mollie.creates.slice(mark).filter((create) => create.idempotencyKey.includes(inv.failWindow)).map((create) => mollie.byKey.get(create.idempotencyKey)));
    expect([...linkIds]).toEqual([stored!.provider_payment_link_id]);
  });

  it("tells a Mollie outage as a retryable failure and writes nothing", async () => {
    await service.from("invoice_payment_links").update({ amount_cents: 1 }).eq("invoice_id", inv.raceFresh);
    mollie.failCreates = 1;
    const before = await links(inv.raceFresh);
    const result = await as(clients.alfa, () => startInvoicePayment(actor("alfa", "alfaUser"), inv.raceFresh));
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(await links(inv.raceFresh)).toEqual(before);
  });

  it("refuses a member whose access ended a moment before", async () => {
    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("id", ids.alfaMembership);
    const before = mollie.creates.length;
    expect(await as(clients.alfa, () => denied(startInvoicePayment(actor("alfa", "alfaUser"), inv.open)))).toBe(true);
    expect(mollie.creates.length).toBe(before);
    await service.from("customer_users").update({ revoked_at: null }).eq("id", ids.alfaMembership);
  });

  it("never records a payment: only Mollie's webhook does that", async () => {
    const { count: found } = await service.from("payments").select("id", { count: "exact", head: true }).eq("invoice_id", inv.open);
    expect(found).toBe(0);
  });
});

describe.runIf(local)("the server actions", () => {
  it("take the customer from the session, send the browser to Mollie, and word a refusal for the customer", async () => {
    jar.clear();
    visitor = clients.alfa;
    const form = new FormData();
    form.set("invoiceId", inv.open);
    form.set("customerId", ids.beta); // ignored: who acts is the session's business
    await expect(payInvoiceAction({}, form)).rejects.toThrow(/redirect:https:\/\/mollie\.test\/pay\//);

    form.set("invoiceId", inv.beta);
    const foreign = await payInvoiceAction({}, form);
    expect(foreign.error).toBe("Deze factuur is niet (meer) te betalen vanuit het portaal.");

    form.set("invoiceId", inv.paid);
    expect((await payInvoiceAction({}, form)).error).toBe("Op deze factuur staat niets meer open.");

    visitor = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    await expect(payInvoiceAction({}, form)).rejects.toThrow("redirect:/portaal/inloggen");
  });
});

describe.runIf(local)("paying an invoice that is also the mandate", () => {
  const mailFor = (href: string) => deliverEmail.mock.calls.map((call) => call[0] as { html: string; text: string }).find((mail) => mail.text.includes(href));

  it("the invoice mail carries ONE first-payment link for the invoice amount, on the customer's own Mollie customer", async () => {
    const [link] = await links(inv.deltaOpen);
    expect(link).toMatchObject({ amount_cents: 75020, sequence_type: "first" });
    expect(mollie.firstLinks.get(link!.provider_payment_link_id)).toBe(`cst_delta_${stamp}`);
    expect(mollie.creates.filter((create) => create.idempotencyKey.includes(inv.deltaOpen))).toEqual([
      expect.objectContaining({ amountCents: 75020, sequenceType: "first", idempotencyKey: `invoice-link-${inv.deltaOpen}-first-75020` }),
    ]);

    const mail = mailFor(`https://mollie.test/pay/${link!.provider_payment_link_id}`)!;
    expect(mail.text).toContain("Factuur betalen en incasso activeren:");
    expect(mail.text).toContain("tegelijk toestemming voor de automatische incasso");
    expect(mail.text.match(/https:\/\/mollie\.test\/pay\//g)).toHaveLength(1);
    expect(mail.text).not.toMatch(/0,01|activatielink/i);
  });

  it("closed the older EUR 0.01 link before the invoice asked for the mandate", async () => {
    expect(mollie.links.get(deltaCent.linkId)!.archived).toBe(true);
    const { data } = await service.from("mandate_activations").select("archived_at").eq("id", deltaCent.activationId).single();
    expect(data!.archived_at).not.toBeNull();
  });

  it("the portal offers the same single payment, says what it does, and reuses the mailed link", async () => {
    const [mailed] = await links(inv.deltaOpen);
    expect(await as(clients.delta, () => previewInvoicePayment(actor("delta", "deltaUser"), inv.deltaOpen))).toBe("first");
    const before = mollie.creates.length;
    const result = await as(clients.delta, () => startInvoicePayment(actor("delta", "deltaUser"), inv.deltaOpen));
    expect(result).toEqual({ ok: true, url: `https://mollie.test/pay/${mailed!.provider_payment_link_id}` });
    expect(mollie.creates.length).toBe(before);
  });

  it("never pays an invoice paid by bank transfer again for the mandate, and closes its mailed link", async () => {
    const [mailed] = await links(inv.deltaBank);
    expect(mailed).toMatchObject({ sequence_type: "first" });
    const paid = await recordManualPayment(inv.deltaBank, { amountCents: 60500, paidOn: today, note: "" });
    expect(paid).toEqual({ ok: true, value: { status: "paid" } });
    expect(mollie.links.get(mailed!.provider_payment_link_id)!.archived).toBe(true);

    const before = mollie.creates.length;
    expect(await as(clients.delta, () => startInvoicePayment(actor("delta", "deltaUser"), inv.deltaBank))).toEqual({ ok: false, reason: "nothing_due" });
    expect(await as(clients.delta, () => previewInvoicePayment(actor("delta", "deltaUser"), inv.deltaBank))).toBeUndefined();
    expect(mollie.creates.length).toBe(before);
  });

  it("refuses the admin's loose EUR 0.01 link while an invoice can carry the mandate", async () => {
    const before = mollie.creates.length;
    const refused = await createMandateActivation(ids.delta);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toMatch(/staat nog open/);
    expect(mollie.creates.length).toBe(before);
  });

  it("asks a customer with a valid mandate for an ordinary payment, never a first one", async () => {
    const [mailed] = await links(inv.gamma);
    expect(mailed).toMatchObject({ sequence_type: "oneoff" });
    expect(await as(clients.gamma, () => previewInvoicePayment(actor("gamma", "gammaUser"), inv.gamma))).toBe("oneoff");
    expect((await as(clients.gamma, () => startInvoicePayment(actor("gamma", "gammaUser"), inv.gamma))).ok).toBe(true);
    expect(await links(inv.gamma)).toEqual([mailed]);
  });

  it("does not ask again while Mollie calls the mandate pending: the next link is one-off", async () => {
    mollie.mandates.set(`cst_delta_${stamp}`, [{ id: "mdt_delta_pending", status: "pending", method: "directdebit" }]);
    const [before] = await links(inv.deltaOpen);
    const result = await as(clients.delta, () => startInvoicePayment(actor("delta", "deltaUser"), inv.deltaOpen));
    expect(result.ok).toBe(true);
    const [after] = await links(inv.deltaOpen);
    expect(after).toMatchObject({ sequence_type: "oneoff", amount_cents: 75020 });
    expect(mollie.links.get(before!.provider_payment_link_id)!.archived).toBe(true);
    mollie.mandates.delete(`cst_delta_${stamp}`);
  });

  it("asks for the mandate again in the same single payment once it is missing after all", async () => {
    const [before] = await links(inv.deltaOpen);
    const result = await as(clients.delta, () => startInvoicePayment(actor("delta", "deltaUser"), inv.deltaOpen));
    expect(result.ok).toBe(true);
    const [after] = await links(inv.deltaOpen);
    expect(after).toMatchObject({ sequence_type: "first", amount_cents: 75020 });
    expect(after!.provider_payment_link_id).not.toBe(before!.provider_payment_link_id);
    /* At most one payable link for this invoice at "Mollie". */
    const payable = [...mollie.links.values()].filter((link) => !link.archived && link.amountCents === 75020 && (link.id === before!.provider_payment_link_id || link.id === after!.provider_payment_link_id));
    expect(payable.map((link) => link.id)).toEqual([after!.provider_payment_link_id]);
  });

  it("records no provider detail in the portal's events", async () => {
    const { data } = await service.from("portal_events").select("*").in("customer_id", [ids.alfa, ids.beta, ids.gamma, ids.delta]);
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/pl_stub|cst_|mdt_|mollie\.test|sub_/);
  });
});

describe.runIf(local)("the payment context", () => {
  it("gives dates and states, never a link or an id, and refuses other customers", async () => {
    const { data, error } = await clients.alfa.rpc("portal_payment_context", { p_customer_id: ids.alfa });
    expect(error).toBeNull();
    expect(Object.keys(data![0]!).sort()).toEqual(["activations", "direct_debit_invoice_ids", "mandate_on_record"]);
    for (const activation of data![0]!.activations as Record<string, unknown>[]) {
      expect(Object.keys(activation).sort()).toEqual(["archived_at", "created_at", "mandate_status", "paid_at"]);
    }
    expect(JSON.stringify(data)).not.toMatch(/pl_|cst_|mdt_|https?:/);

    const foreign = await clients.alfa.rpc("portal_payment_context", { p_customer_id: ids.beta });
    expect(foreign.error?.code).toBe("42501");
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const anonymous = await anon.rpc("portal_payment_context", { p_customer_id: ids.alfa });
    expect(anonymous.error).not.toBeNull();
    expect(anonymous.data).toBeNull();
  });
});
