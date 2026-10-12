import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/admin/documents/validation";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The regression that must never come back: "factuur betaald, machtiging
 * nooit geactiveerd".
 *
 * On 5 October 2026 a reminder replaced a customer's `first` invoice link
 * with a one-off link; the customer paid the reminder, the invoice was
 * settled and no mandate ever came of it. Here the same history is replayed
 * end to end on a real Postgres -- the real cron route, the real reminder
 * runner and mails, the real webhook route and store, the real collection
 * start -- with only Mollie and the mail provider replaced:
 *
 *   a monthly service, no mandate, the invoice still carrying an old one-off
 *   link and past due -> the reminder job runs -> its one button is the
 *   invoice amount as Mollie's first payment -> the customer pays it ->
 *   Mollie calls the webhook (twice) -> the invoice is paid once and the
 *   mandate is on record -> YM starts the monthly collection -> Mollie
 *   collects the next period -> that period is billed and paid once, and the
 *   first invoice is never charged again.
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
process.env.MOLLIE_API_KEY = "test_first_payment_regression_stub";
process.env.NEXT_PUBLIC_SITE_URL = "https://ymcreations.test";
process.env.PAYMENT_RETURN_SECRET = "first-payment-regression-secret-0123456789";
process.env.CRON_SECRET = "first-payment-regression-cron-secret";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const deliverEmail = vi.fn();
vi.mock("@/lib/admin/communications/provider", () => ({ deliverEmail: (...args: unknown[]) => deliverEmail(...args) }));

// ------------------------------------------------------------- Mollie stub

const runId = Date.now().toString(36);
type StubPayment = {
  id: string;
  status: "paid" | "failed";
  amount: { currency: "EUR"; value: string };
  description: string;
  method: string;
  paidAt?: string;
  sequenceType: string;
  customerId?: string;
  mandateId?: string;
  subscriptionId?: string;
  details?: { dueDate: string };
};
type StubLink = { id: string; amountCents: number; sequenceType: string; href: string; archived: boolean; paidAt: string | null; customerId?: string; payments: StubPayment[] };
const mollie = {
  links: new Map<string, StubLink>(),
  byKey: new Map<string, string>(),
  customers: new Map<string, string>(),
  mandates: new Map<string, { id: string; status: "valid" | "pending" | "invalid"; method: string }[]>(),
  subscriptions: [] as { id: string; customerId: string; startDate: string; amountCents: number; mandateId: string; metadata: Record<string, unknown> }[],
  loose: new Map<string, StubPayment>(),
  counter: 0,
};
const linkView = (link: StubLink) => ({
  id: link.id,
  archived: link.archived,
  paidAt: link.paidAt,
  expiresAt: null,
  amount: { currency: "EUR", value: (link.amountCents / 100).toFixed(2) },
  _links: { paymentLink: { href: link.href } },
});
const next = () => `${runId}${(mollie.counter += 1)}`;
vi.mock("@/lib/mollie/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mollie/client")>();
  return {
    ...original,
    createPaymentLink: async (input: { amountCents: number; sequenceType: string; idempotencyKey: string; customerId?: string }) => {
      const known = mollie.byKey.get(input.idempotencyKey);
      if (known) return linkView(mollie.links.get(known)!);
      const id = `pl_fp${next()}`;
      const link: StubLink = { id, amountCents: input.amountCents, sequenceType: input.sequenceType, href: `https://mollie.test/pay/${id}`, archived: false, paidAt: null, payments: [], ...(input.customerId ? { customerId: input.customerId } : {}) };
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
    listPaymentLinkPayments: async (id: string) => mollie.links.get(id)?.payments ?? [],
    getPayment: async (id: string) => {
      for (const link of mollie.links.values()) {
        const found = link.payments.find((payment) => payment.id === id);
        if (found) return found;
      }
      const loose = mollie.loose.get(id);
      if (loose) return loose;
      throw new original.MollieError(404, "Not found");
    },
    createCustomer: async (input: { idempotencyKey: string }) => {
      const known = mollie.customers.get(input.idempotencyKey);
      if (known) return { id: known };
      const id = `cst_fp${next()}`;
      mollie.customers.set(input.idempotencyKey, id);
      return { id };
    },
    listMandates: async (customerId: string) => mollie.mandates.get(customerId) ?? [],
    listSubscriptions: async (customerId: string) =>
      mollie.subscriptions.filter((item) => item.customerId === customerId).map((item) => ({ id: item.id, status: "active", startDate: item.startDate, metadata: item.metadata })),
    createSubscription: async (input: { customerId: string; amountCents: number; startDate: string; mandateId: string; metadata: Record<string, unknown> }) => {
      const created = { id: `sub_fp${next()}`, customerId: input.customerId, startDate: input.startDate, amountCents: input.amountCents, mandateId: input.mandateId, metadata: input.metadata };
      mollie.subscriptions.push(created);
      return { id: created.id, status: "active", startDate: created.startDate, metadata: created.metadata };
    },
  };
});

/** The customer at Mollie's checkout of a link: one payment, in the state given. */
function payAtMollie(link: StubLink, status: "paid" | "failed", extra: Partial<StubPayment> = {}): StubPayment {
  const paidAt = new Date().toISOString();
  if (status === "paid") link.paidAt = paidAt;
  const payment: StubPayment = {
    id: `tr_fp${next()}`,
    status,
    amount: { currency: "EUR", value: (link.amountCents / 100).toFixed(2) },
    description: "Betaling",
    method: "ideal",
    ...(status === "paid" ? { paidAt } : {}),
    sequenceType: link.sequenceType,
    ...extra,
  };
  link.payments.push(payment);
  return payment;
}

// -------------------------------------------------- database and routes

let service: SupabaseClient<Database>;
let admin: SupabaseClient<Database>;
/*
  The local stack keeps every open invoice earlier runs left behind; the
  reminder job would chase all of them. Its invoice query is narrowed to this
  file's customers -- nothing else about the job changes.
*/
const scope: string[] = [];
vi.mock("@/lib/payments/admin-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/admin-client")>()),
  paymentsAdminClient: () =>
    new Proxy(service, {
      get(target, prop, receiver) {
        if (prop !== "from") return Reflect.get(target, prop, receiver);
        return (table: string) => {
          const builder = target.from(table as never);
          if (table !== "invoices") return builder;
          return new Proxy(builder, {
            get(inner, key, innerReceiver) {
              if (key !== "select") return Reflect.get(inner, key, innerReceiver);
              return (...args: unknown[]) => {
                const selected = (inner.select as (...a: unknown[]) => { in: (column: string, values: unknown[]) => unknown })(...args);
                return new Proxy(selected, {
                  get(query, method, queryReceiver) {
                    if (method !== "in") return Reflect.get(query, method, queryReceiver);
                    return (column: string, values: unknown[]) => {
                      const narrowed = query.in(column, values) as { in: (column: string, values: unknown[]) => unknown };
                      return column === "status" ? narrowed.in("customer_id", scope) : narrowed;
                    };
                  },
                });
              };
            },
          });
        };
      },
    }),
}));
vi.mock("@/lib/admin/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/db")>()),
  adminDb: async () => admin,
}));
vi.mock("@/lib/admin/access", () => ({ requireAdmin: async () => ({ userId: "00000000-0000-4000-8000-000000000000", email: null, displayName: null }) }));

const { GET: reminderCron } = await import("@/app/api/cron/payment-reminders/route");
const { POST: mollieWebhook } = await import("@/app/api/mollie/webhook/route");
const { finalizeInvoice } = await import("@/lib/admin/invoices/finalize");
const { sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");
const { startCollection } = await import("@/lib/payments/collection-start");

const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
const ids = { customer: "", service: "", invoice: "", other: "", otherService: "", otherInvoice: "", adminUser: "" };
const customerEmail = `first-payment-${stamp}@example.test`;
const otherEmail = `first-payment-failed-${stamp}@example.test`;
let otherReminder: { text: string } | undefined;

async function webhook(id: string): Promise<number> {
  const response = await mollieWebhook(new Request("http://localhost/api/mollie/webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.2" }, body: `id=${id}` }));
  return response.status;
}

async function runReminders(): Promise<void> {
  const response = await reminderCron(new Request("http://localhost/api/cron/payment-reminders", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  expect(response.status).toBe(200);
}

/** The mails that went to one address, in order. */
function mailsTo(address: string) {
  return deliverEmail.mock.calls.map((call) => call[0] as { to: string | { email: string }; subject: string; text: string; html: string }).filter((mail) => JSON.stringify(mail.to).includes(address));
}

async function customer(label: string, email: string): Promise<string> {
  const { data, error } = await service
    .from("customers")
    .insert({ company_name: `${label} ${stamp}`, contact_name: `Contact ${label}`, email, street: "Straat 1", postal_code: "1011 AA", city: "Amsterdam", country: "Nederland" })
    .select("id")
    .single();
  if (error) throw new Error(`customer: ${error.message}`);
  return data!.id;
}

async function draftService(customerId: string): Promise<string> {
  const { data, error } = await admin.rpc("create_recurring_service", {
    p_customer_id: customerId, p_name: "Websitebeheer", p_description: "", p_amount_cents: 2500, p_vat_rate: 21,
    p_starts_on: addDays(today, 20), p_status: "draft", p_effective_from: addDays(today, 20),
    p_terms_edition: "2026", p_terms_published_on: "2026-09-14", p_note: "",
  });
  if (error) throw new Error(`service: ${error.message}`);
  return data as string;
}

/** A website invoice of 750,20 incl. btw, issued 16 days ago and due 2 days ago, mailed by the admin's own send. */
async function overdueInvoice(customerId: string): Promise<string> {
  const seed = Math.random().toString(36).slice(-6).toUpperCase();
  const { data, error } = await service
    .from("invoices")
    .insert({
      number_value: `FAC-CONCEPT-${seed}`, number_provisional: true, status: "draft", customer_id: customerId,
      customer_company_name: "Klant", customer_contact_name: "Contact", customer_email: customerEmail,
      customer_street: "Straat 1", customer_postal_code: "1011 AA", customer_city: "Amsterdam", customer_country: "Nederland",
      issue_date: addDays(today, -16), due_date: addDays(today, -2), payment_reference: "", notes: "",
    })
    .select("id")
    .single();
  if (error) throw new Error(`invoice: ${error.message}`);
  const lines = await service.rpc("save_invoice_lines", { p_invoice_id: data!.id, p_lines: [{ description: "Website", quantityHundredths: 100, unitPriceCents: 62000, vatRate: 21 }] as never });
  if (lines.error) throw new Error(`lines: ${lines.error.message}`);
  const issued = await finalizeInvoice(data!.id);
  if (!issued.ok) throw new Error(`finalize: ${issued.error}`);
  const sent = await sendInvoiceToCustomer(data!.id);
  if (!sent.ok) throw new Error(`send: ${sent.error}`);
  return data!.id;
}

/**
 * The state the 5 October bug left behind: the invoice's recorded link is an
 * ordinary one-off link, still payable at Mollie.
 */
async function plantOldOneOffLink(invoiceId: string): Promise<StubLink> {
  const id = `pl_fpold${next()}`;
  const link: StubLink = { id, amountCents: 75020, sequenceType: "oneoff", href: `https://mollie.test/pay/${id}`, archived: false, paidAt: null, payments: [] };
  mollie.links.set(id, link);
  const { error } = await service
    .from("invoice_payment_links")
    .update({ provider_payment_link_id: id, checkout_url: link.href, sequence_type: "oneoff", amount_cents: 75020 })
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(`old link: ${error.message}`);
  return link;
}

const linkOf = async (invoiceId: string) => (await service.from("invoice_payment_links").select("provider_payment_link_id, sequence_type, amount_cents").eq("invoice_id", invoiceId).single()).data!;
const paymentsOf = async (invoiceId: string) => (await service.from("payments").select("amount_cents, status, provider_payment_id").eq("invoice_id", invoiceId).order("created_at")).data!;

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  const adminEmail = `first-payment-admin-${stamp}@example.test`;
  const password = "first-payment-regression-password";
  const adminUser = await service.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  if (adminUser.error) throw new Error(adminUser.error.message);
  ids.adminUser = adminUser.data.user!.id;
  await service.from("admin_profiles").insert({ user_id: ids.adminUser, display_name: "First payment regression" });
  admin = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await admin.auth.signInWithPassword({ email: adminEmail, password });
  if (signedIn.error) throw new Error(signedIn.error.message);
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });

  ids.customer = await customer("Eerste betaling", customerEmail);
  ids.service = await draftService(ids.customer);
  ids.invoice = await overdueInvoice(ids.customer);

  scope.push(ids.customer);
  ids.other = await customer("Mislukte eerste betaling", otherEmail);
  scope.push(ids.other);
  ids.otherService = await draftService(ids.other);
  ids.otherInvoice = await overdueInvoice(ids.other);
}, 180_000);

afterAll(async () => {
  delete process.env.CRON_SECRET;
  if (local && ids.adminUser) await service.auth.admin.deleteUser(ids.adminUser);
});

describe.runIf(local).sequential("the 5 October regression: reminder paid, mandate never activated", () => {
  let reminderLink: StubLink;
  let firstDebitOn = "";

  it("the reminder replaces the old one-off link with ONE link for the invoice amount that is also the mandate", async () => {
    const old = await plantOldOneOffLink(ids.invoice);
    deliverEmail.mockClear();

    await runReminders();

    const [reminder] = mailsTo(customerEmail);
    expect(reminder).toBeDefined();
    /* The same run reminded the other customer; their case is the next block's. */
    otherReminder = mailsTo(otherEmail)[0];
    const hrefs = reminder!.text.match(/https:\/\/mollie\.test\/pay\/\S+/g) ?? [];
    expect(hrefs).toHaveLength(1);
    expect(reminder!.text).toContain(`Factuur betalen en incasso activeren: ${hrefs[0]}`);
    expect(reminder!.text).not.toMatch(/0,01|activatielink/i);

    reminderLink = [...mollie.links.values()].find((link) => link.href === hrefs[0])!;
    expect(reminderLink).toMatchObject({ amountCents: 75020, sequenceType: "first" });
    expect(reminderLink.customerId).toMatch(/^cst_fp/);
    /* The old link cannot be paid any more: only one payable link for this debt. */
    expect(old.archived).toBe(true);
    expect(await linkOf(ids.invoice)).toMatchObject({ provider_payment_link_id: reminderLink.id, sequence_type: "first", amount_cents: 75020 });
    expect((await service.from("mandate_activations").select("id").eq("customer_id", ids.customer)).data).toEqual([]);
  });

  it("the customer pays the reminder: the invoice is paid once and the mandate is on record", async () => {
    mollie.mandates.set(reminderLink.customerId!, [{ id: `mdt_fp${runId}`, status: "valid", method: "directdebit" }]);
    payAtMollie(reminderLink, "paid", { customerId: reminderLink.customerId!, mandateId: `mdt_fp${runId}` });

    expect(await webhook(reminderLink.id)).toBe(200);
    expect(await webhook(reminderLink.id)).toBe(200);

    expect((await paymentsOf(ids.invoice)).map(({ amount_cents, status }) => ({ amount_cents, status }))).toEqual([{ amount_cents: 75020, status: "paid" }]);
    expect((await service.from("invoices").select("status").eq("id", ids.invoice).single()).data!.status).toBe("paid");
    expect((await service.from("customer_payment_providers").select("provider_customer_id, provider_mandate_id").eq("customer_id", ids.customer).single()).data).toEqual({
      provider_customer_id: reminderLink.customerId,
      provider_mandate_id: `mdt_fp${runId}`,
    });
    /* The webhook never starts a collection by itself. */
    expect(mollie.subscriptions).toHaveLength(0);
  });

  it("a later reminder run leaves the paid invoice alone", async () => {
    deliverEmail.mockClear();
    await runReminders();
    expect(mailsTo(customerEmail)).toEqual([]);
  });

  it("YM starts the monthly collection on that mandate, from a period nobody paid yet", async () => {
    const started = await startCollection(admin, { id: ids.service }, today);
    expect(started.ok).toBe(true);
    firstDebitOn = started.ok ? started.firstDebitOn : "";
    expect(firstDebitOn >= addDays(today, 15)).toBe(true);
    expect(mollie.subscriptions).toEqual([expect.objectContaining({ customerId: reminderLink.customerId, mandateId: `mdt_fp${runId}`, amountCents: 3025, startDate: firstDebitOn })]);
  });

  it("the next period is collected automatically, billed and paid once, and the first invoice is never charged again", async () => {
    const subscription = mollie.subscriptions[0]!;
    const charge: StubPayment = {
      id: `tr_fprec${next()}`,
      status: "paid",
      amount: { currency: "EUR", value: "30.25" },
      description: "Websitebeheer",
      method: "directdebit",
      paidAt: new Date().toISOString(),
      sequenceType: "recurring",
      customerId: subscription.customerId,
      mandateId: subscription.mandateId,
      subscriptionId: subscription.id,
      details: { dueDate: firstDebitOn },
    };
    mollie.loose.set(charge.id, charge);

    expect(await webhook(charge.id)).toBe(200);
    expect(await webhook(charge.id)).toBe(200);

    const terms = (await service.from("invoices").select("id, status, billing_period_start").eq("recurring_service_id", ids.service)).data!;
    expect(terms).toEqual([expect.objectContaining({ status: "paid", billing_period_start: firstDebitOn })]);
    expect((await paymentsOf(terms[0]!.id)).map(({ amount_cents, status }) => ({ amount_cents, status }))).toEqual([{ amount_cents: 3025, status: "paid" }]);
    /* The first payment paid the website invoice and nothing else, once. */
    expect(await paymentsOf(ids.invoice)).toHaveLength(1);
  });
});

describe.runIf(local).sequential("a first payment that failed", () => {
  it("leaves the invoice open, records no mandate, and the next reminder offers the same single payment again", async () => {
    const href = otherReminder!.text.match(/https:\/\/mollie\.test\/pay\/\S+/)![0];
    const link = [...mollie.links.values()].find((candidate) => candidate.href === href)!;
    expect(link.sequenceType).toBe("first");

    payAtMollie(link, "failed");
    expect(await webhook(link.id)).toBe(200);
    expect((await service.from("invoices").select("status").eq("id", ids.otherInvoice).single()).data!.status).toBe("overdue");
    expect((await service.from("customer_payment_providers").select("provider_mandate_id").eq("customer_id", ids.other).single()).data!.provider_mandate_id).toBeNull();

    /* The next reminder's button: the same link, still the combined payment. */
    const { reminderPayLink } = await import("@/lib/payments/pay-link");
    const { invoiceFromRow } = await import("@/lib/admin/invoices/mapper");
    const { invoiceColumns } = await import("@/lib/admin/invoices/mapper");
    const { paymentsOfInvoice } = await import("@/lib/payments/repository");
    const row = (await service.from("invoices").select(invoiceColumns).eq("id", ids.otherInvoice).single()).data!;
    const again = await reminderPayLink(service, invoiceFromRow(row as never), await paymentsOfInvoice(service, ids.otherInvoice));
    expect(again).toEqual({ url: href, mode: "first" });
  });
});
