import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A customer editing their own details, against a real Postgres, a real Auth
 * server and a real Storage.
 *
 * The documents are made by the admin's own flows first -- a quote sent, an
 * invoice made definitive and sent, a credit note issued -- and then members
 * edit through portal_update_customer_profile and the server action. What
 * is checked: only the named fields can change, only for the member's own
 * customer, never over a newer version; the audit row is written with the
 * change and carries no personal values; financial mail follows the billing
 * address; the sign-in address and every existing document stay as they were.
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

const { sendQuoteToCustomer, sendInvoiceToCustomer } = await import("@/lib/admin/documents/send");
const { finalizeInvoice } = await import("@/lib/admin/invoices/finalize");
const { createManualCreditNote } = await import("@/lib/admin/credit-notes/actions");
const { createQuoteRevision } = await import("@/lib/admin/quotes/lifecycle");
const { updateCustomer, updateCustomerNotes } = await import("@/lib/admin/customers/actions");
const { customerChangedReason } = await import("@/lib/admin/customers/types");
const { getCustomer } = await import("@/lib/admin/customers/repository");
const { resolveCustomerRecipient } = await import("@/lib/admin/communications/recipient");
const { saveProfileAction } = await import("@/lib/portal/profile/actions");
const { readPortalProfile } = await import("@/lib/portal/profile/read");
const { profileFieldOrder } = await import("@/lib/portal/profile/model");
const { invoiceDocumentBucket } = await import("@/lib/admin/invoices/artifact");

type Db = SupabaseClient<Database>;
type Profile = Awaited<ReturnType<typeof readPortalProfile>>;
const password = "portal-profile-password";
const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

const ids = { alfa: "", beta: "", alfaUser: "", alfaEmail: "", multiUser: "", alfaMembership: "", adminUser: "" };
const docs = { invoice: "", creditNote: "", quote: "", revision: "" };
const clients = {} as Record<"alfa" | "multi", Db>;

async function signedIn(email: string): Promise<Db> {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function createUser(label: string): Promise<{ id: string; email: string }> {
  const email = `portal-profile-${label}-${stamp}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`user ${label}: ${error.message}`);
  return { id: data.user!.id, email };
}

async function createCustomer(name: string): Promise<string> {
  const { data, error } = await service
    .from("customers")
    .insert({
      company_name: `${name} ${stamp}`,
      contact_name: `Contact ${name}`,
      email: `contact-${name.toLowerCase()}-${stamp}@example.test`,
      phone: "020 123 4567",
      street: "Straat 1",
      postal_code: "1011 AA",
      city: "Amsterdam",
      country: "Nederland",
      kvk_number: "12345678",
      notes: "INTERNAL note",
    })
    .select("id")
    .single();
  if (error) throw new Error(`customer ${name}: ${error.message}`);
  return data!.id;
}

async function customerRow(id: string) {
  const { data, error } = await service.from("customers").select("*").eq("id", id).single();
  if (error) throw new Error(`customer row: ${error.message}`);
  return data!;
}

async function audits(customerId: string) {
  const { data } = await service.from("customer_profile_changes").select("*").eq("customer_id", customerId).order("occurred_at");
  return data ?? [];
}

type Args = Database["public"]["Functions"]["portal_update_customer_profile"]["Args"];

function argsOf(customerId: string, profile: Profile, changes: Partial<Profile["fields"]> = {}): Args {
  const f = { ...profile.fields, ...changes };
  return {
    p_customer_id: customerId,
    p_expected_updated_at: profile.version,
    p_company_name: f.companyName,
    p_contact_name: f.contactName,
    p_email: f.email,
    p_billing_email: f.billingEmail,
    p_phone: f.phone,
    p_street: f.street,
    p_postal_code: f.postalCode,
    p_city: f.city,
    p_country: f.country,
    p_kvk_number: f.kvkNumber,
    p_vat_number: f.vatNumber,
  };
}

async function profileOf(client: Db, customerId: string): Promise<Profile> {
  visitor = client;
  return readPortalProfile(customerId);
}

function formOf(customerId: string, profile: Profile, changes: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("customerId", customerId);
  form.set("version", profile.version);
  for (const field of profileFieldOrder) form.set(field, profile.fields[field]);
  for (const [key, value] of Object.entries(changes)) form.set(key, value);
  return form;
}

async function save(client: Db, form: FormData) {
  visitor = client;
  return saveProfileAction({ status: "idle" }, form);
}

const snapshotColumns =
  "customer_company_name, customer_contact_name, customer_email, customer_street, customer_postal_code, customer_city, customer_country, customer_kvk_number, customer_vat_number, document_path, document_sha256, document_bytes, number_value, status";

async function frozen() {
  const [invoice, creditNote, quote] = await Promise.all([
    service.from("invoices").select(`${snapshotColumns}, updated_at`).eq("id", docs.invoice).single(),
    service.from("credit_notes").select(`${snapshotColumns}, updated_at`).eq("id", docs.creditNote).single(),
    service.from("quotes").select(`${snapshotColumns}, updated_at`).eq("id", docs.quote).single(),
  ]);
  const bytes = async (path: string) => {
    const { data } = await service.storage.from(invoiceDocumentBucket).download(path);
    return createHash("sha256").update(Buffer.from(await data!.arrayBuffer())).digest("hex");
  };
  return {
    invoice: invoice.data,
    creditNote: creditNote.data,
    quote: quote.data,
    files: await Promise.all([invoice.data!.document_path!, creditNote.data!.document_path!, quote.data!.document_path!].map(bytes)),
  };
}

let before: Awaited<ReturnType<typeof frozen>>;

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });

  const adminUser = await createUser("admin");
  ids.adminUser = adminUser.id;
  const profile = await service.from("admin_profiles").insert({ user_id: adminUser.id, display_name: "Profile validation" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);
  admin = await signedIn(adminUser.email);

  ids.alfa = await createCustomer("Alfa");
  ids.beta = await createCustomer("Beta");

  /* The documents, the admin's way. */
  const quote = await service
    .from("quotes")
    .insert({
      number_value: `OFF-CONCEPT-${stamp}`, number_provisional: true, status: "draft", customer_id: ids.alfa,
      customer_company_name: `Alfa ${stamp}`, customer_contact_name: "Contact Alfa", customer_email: `contact-alfa-${stamp}@example.test`,
      customer_street: "Straat 1", customer_postal_code: "1011 AA", customer_city: "Amsterdam", customer_country: "Nederland",
      issue_date: today, valid_until: "2099-12-31", subject: "Website",
    })
    .select("id")
    .single();
  if (quote.error) throw new Error(`quote: ${quote.error.message}`);
  docs.quote = quote.data!.id;
  await service.rpc("save_quote_lines", { p_quote_id: docs.quote, p_lines: [{ description: "Bouw", quantityHundredths: 100, unitPriceCents: 100000, vatRate: 21 }] as never });
  const sentQuote = await sendQuoteToCustomer(docs.quote);
  if (!sentQuote.ok) throw new Error(`send quote: ${sentQuote.error}`);

  const invoice = await service
    .from("invoices")
    .insert({
      number_value: `FAC-CONCEPT-${stamp}`, number_provisional: true, status: "draft", customer_id: ids.alfa,
      customer_company_name: `Alfa ${stamp}`, customer_contact_name: "Contact Alfa", customer_email: `contact-alfa-${stamp}@example.test`,
      customer_street: "Straat 1", customer_postal_code: "1011 AA", customer_city: "Amsterdam", customer_country: "Nederland",
      issue_date: today, due_date: today, payment_reference: "", notes: "",
    })
    .select("id")
    .single();
  if (invoice.error) throw new Error(`invoice: ${invoice.error.message}`);
  docs.invoice = invoice.data!.id;
  await service.rpc("save_invoice_lines", { p_invoice_id: docs.invoice, p_lines: [{ description: "Website", quantityHundredths: 100, unitPriceCents: 100000, vatRate: 21 }] as never });
  const issued = await finalizeInvoice(docs.invoice);
  if (!issued.ok) throw new Error(`finalize: ${issued.error}`);
  const sent = await sendInvoiceToCustomer(docs.invoice);
  if (!sent.ok) throw new Error(`send invoice: ${sent.error}`);
  const note = await createManualCreditNote(docs.invoice, { reason: "Korting", issueDate: today, lines: [{ description: "Korting", quantityHundredths: 100, unitPriceCents: 10000, vatRate: 21 }] });
  if (!note.ok) throw new Error(`credit note: ${note.error}`);
  docs.creditNote = note.value.id;

  const alfaUser = await createUser("alfa");
  const multiUser = await createUser("multi");
  ids.alfaUser = alfaUser.id;
  ids.alfaEmail = alfaUser.email;
  ids.multiUser = multiUser.id;
  const m = await service.from("customer_users").insert({ user_id: alfaUser.id, customer_id: ids.alfa, invited_email: alfaUser.email }).select("id").single();
  ids.alfaMembership = m.data!.id;
  await service.from("customer_users").insert([
    { user_id: multiUser.id, customer_id: ids.alfa, invited_email: multiUser.email },
    { user_id: multiUser.id, customer_id: ids.beta, invited_email: multiUser.email },
  ]);
  clients.alfa = await signedIn(alfaUser.email);
  clients.multi = await signedIn(multiUser.email);

  before = await frozen();
}, 300_000);

afterAll(async () => {
  if (!local || !service) return;
  for (const id of [ids.alfaUser, ids.multiUser]) if (id) await service.auth.admin.deleteUser(id);
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local", () => {
    expect(url).toMatch(loopback);
    expect(url).not.toContain("supabase.co");
  });
});

describe.runIf(local)("editing through the portal", () => {
  it("saves a normal change, shows what is stored, and records it as the customer's", async () => {
    jar.clear();
    const profile = await profileOf(clients.alfa, ids.alfa);
    const result = await save(clients.alfa, formOf(ids.alfa, profile, { companyName: `  Alfa Nieuw ${stamp} `, phone: "06  1234   5678" }));
    expect(result.status).toBe("saved");
    if (result.status !== "saved") return;
    expect(result.fields.companyName).toBe(`Alfa Nieuw ${stamp}`);
    expect(result.fields.phone).toBe("06 1234 5678");
    expect(result.version).not.toBe(profile.version);
    /* A refresh reads the same values. */
    expect((await profileOf(clients.alfa, ids.alfa)).fields).toEqual(result.fields);

    const [change] = await audits(ids.alfa);
    expect(change).toMatchObject({ actor_kind: "customer", actor_user_id: ids.alfaUser, changed_fields: ["company_name", "phone"] });
    expect(change!.business_changes).toEqual({ company_name: { from: `Alfa ${stamp}`, to: `Alfa Nieuw ${stamp}` } });
  });

  it("changes one field and records only that one, without its value", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    const result = await save(clients.alfa, formOf(ids.alfa, profile, { contactName: "Petra de Vries" }));
    expect(result.status).toBe("saved");
    const change = (await audits(ids.alfa)).at(-1)!;
    expect(change.changed_fields).toEqual(["contact_name"]);
    expect(change.business_changes).toEqual({});
    expect(JSON.stringify(change)).not.toContain("Petra");
  });

  it("changes every field at once, and logs personal details as changed only", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    const all = {
      companyName: `Alfa Holding ${stamp}`,
      kvkNumber: "87654321",
      vatNumber: "NL001234567B01",
      street: "Keizersgracht 100",
      postalCode: "1015 AA",
      city: "Utrecht",
      country: "België",
      contactName: "Jan Jansen",
      email: `nieuw-contact-${stamp}@example.test`,
      phone: "+31 6 9876 5432",
      billingEmail: `facturen-${stamp}@example.test`,
    };
    const result = await save(clients.alfa, formOf(ids.alfa, profile, all));
    expect(result.status).toBe("saved");
    const change = (await audits(ids.alfa)).at(-1)!;
    expect([...change.changed_fields].sort()).toEqual(
      ["billing_email", "city", "company_name", "contact_name", "country", "email", "kvk_number", "phone", "postal_code", "street", "vat_number"].sort(),
    );
    expect(Object.keys(change.business_changes as object).sort()).toEqual(["company_name", "kvk_number", "vat_number"]);
    const text = JSON.stringify(change);
    for (const personal of ["Keizersgracht", "1015 AA", "Utrecht", "Jan Jansen", "nieuw-contact", "facturen-", "9876"]) expect(text, personal).not.toContain(personal);
  });

  it("writes nothing and records nothing when nothing changed", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    const count = (await audits(ids.alfa)).length;
    const result = await save(clients.alfa, formOf(ids.alfa, profile));
    expect(result.status).toBe("unchanged");
    expect((await audits(ids.alfa)).length).toBe(count);
    expect((await profileOf(clients.alfa, ids.alfa)).version).toBe(profile.version);
  });

  it("refuses invalid input in the action and in the database alike", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    const row = await customerRow(ids.alfa);
    for (const [field, value, column] of [
      ["email", "geen-adres", "email"],
      ["billingEmail", "facturen@", "billing_email"],
      ["companyName", "   ", "company_name"],
      ["contactName", "", "contact_name"],
      ["phone", "06 <script>", "text"],
      ["street", "x".repeat(201), "street"],
    ] as const) {
      const result = await save(clients.alfa, formOf(ids.alfa, profile, { [field]: value }));
      expect(result.status, field).toBe("invalid");
      if (result.status === "invalid") expect(result.errors[field], field).toBeTruthy();

      const direct = await clients.alfa.rpc("portal_update_customer_profile", argsOf(ids.alfa, profile, { [field]: value }));
      expect(direct.error?.code, field).toBe("22023");
      expect(direct.error?.message, field).toBe(`invalid:${column}`);
    }
    expect((await customerRow(ids.alfa)).updated_at).toBe(row.updated_at);
  });

  it("cannot be made to change anything but the named fields", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    const row = await customerRow(ids.alfa);

    /* Through the form: extra fields are ignored. */
    const form = formOf(ids.alfa, profile, { notes: "overwritten", status: "inactive", source_inquiry_id: crypto.randomUUID() });
    form.set("p_notes", "x");
    expect((await save(clients.alfa, form)).status).toBe("unchanged");

    /* Through the API: there is no function with such a parameter. */
    for (const extra of [{ p_notes: "overwritten" }, { p_status: "inactive" }, { p_source_inquiry_id: crypto.randomUUID() }, { p_updated_at: new Date().toISOString() }]) {
      const result = await clients.alfa.rpc("portal_update_customer_profile", { ...argsOf(ids.alfa, profile, { companyName: "Gehackt" }), ...extra } as never);
      expect(result.error, JSON.stringify(extra)).not.toBeNull();
    }
    /* And no table write either. */
    const direct = await clients.alfa.from("customers").update({ notes: "overwritten" }).eq("id", ids.alfa).select("id");
    expect(direct.data ?? []).toEqual([]);

    const after = await customerRow(ids.alfa);
    expect(after.notes).toBe("INTERNAL note");
    expect(after.status).toBe(row.status);
    expect(after.company_name).toBe(row.company_name);
    expect(after.updated_at).toBe(row.updated_at);
  });

  it("refuses another customer, through the API and through a stale page", async () => {
    const betaBefore = await customerRow(ids.beta);
    const alfaProfile = await profileOf(clients.alfa, ids.alfa);
    const foreign = await clients.alfa.rpc("portal_update_customer_profile", { ...argsOf(ids.alfa, alfaProfile, { companyName: "Overgenomen" }), p_customer_id: ids.beta });
    expect(foreign.error?.code).toBe("42501");
    expect(await customerRow(ids.beta)).toEqual(betaBefore);

    const stale = await save(clients.alfa, formOf(ids.beta, alfaProfile, { companyName: "Overgenomen" }));
    expect(stale.status).toBe("stale_customer");
    expect(await customerRow(ids.beta)).toEqual(betaBefore);
  });

  it("refuses a member whose access ended a moment before the save", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("id", ids.alfaMembership);
    const direct = await clients.alfa.rpc("portal_update_customer_profile", argsOf(ids.alfa, profile, { city: "Rotterdam" }));
    expect(direct.error?.code).toBe("42501");
    await expect(save(clients.alfa, formOf(ids.alfa, profile, { city: "Rotterdam" }))).rejects.toThrow("redirect:/portaal/geen-toegang");
    expect((await customerRow(ids.alfa)).city).not.toBe("Rotterdam");
    await service.from("customer_users").update({ revoked_at: null }).eq("id", ids.alfaMembership);
  });
});

describe.runIf(local)("two tabs, two people, one record", () => {
  it("lets the first save win and refuses the second, which read the same version", async () => {
    const tabOne = await profileOf(clients.alfa, ids.alfa);
    const tabTwo = await profileOf(clients.multi, ids.alfa);
    expect(tabTwo.version).toBe(tabOne.version);

    const first = await save(clients.alfa, formOf(ids.alfa, tabOne, { phone: "010 111 2222" }));
    expect(first.status).toBe("saved");
    jar.set("ym_portal_customer", ids.alfa);
    const second = await save(clients.multi, formOf(ids.alfa, tabTwo, { phone: "010 999 9999" }));
    expect(second.status).toBe("conflict");
    expect((await customerRow(ids.alfa)).phone).toBe("010 111 2222");
  });

  it("settles two saves at the same instant on exactly one", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    const [a, b] = await Promise.all([
      clients.alfa.rpc("portal_update_customer_profile", argsOf(ids.alfa, profile, { city: "Leiden" })),
      clients.multi.rpc("portal_update_customer_profile", argsOf(ids.alfa, profile, { city: "Delft" })),
    ]);
    const outcomes = [a.data?.[0]?.outcome, b.data?.[0]?.outcome].sort();
    expect(outcomes).toEqual(["conflict", "updated"]);
    const winner = a.data?.[0]?.outcome === "updated" ? "Leiden" : "Delft";
    expect((await customerRow(ids.alfa)).city).toBe(winner);
  });

  it("refuses a save over an admin's later change", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    const customer = (await getCustomer(ids.alfa))!;
    const admined = await updateCustomer(ids.alfa, {
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      ...(customer.billingEmail ? { billingEmail: customer.billingEmail } : {}),
      ...(customer.phone ? { phone: customer.phone } : {}),
      street: "Adminstraat 9",
      postalCode: customer.address.postalCode,
      city: customer.address.city,
      country: customer.address.country,
      ...(customer.kvkNumber ? { kvkNumber: customer.kvkNumber } : {}),
      ...(customer.vatNumber ? { vatNumber: customer.vatNumber } : {}),
      notes: customer.notes,
      status: customer.status,
    }, customer.updatedAt);
    expect(admined.ok).toBe(true);

    /* The admin's own stale form is refused the same way: the customer's version moved on. */
    const stale = await updateCustomer(ids.alfa, { ...{ companyName: customer.companyName, contactName: customer.contactName, email: customer.email, street: "Oud", postalCode: customer.address.postalCode, city: customer.address.city, country: customer.address.country, notes: customer.notes, status: customer.status } }, customer.updatedAt);
    expect(stale).toEqual({ ok: false, error: customerChangedReason });
    expect((await save(clients.alfa, formOf(ids.alfa, profile, { street: "Klantstraat 1" }))).status).toBe("conflict");
    expect((await customerRow(ids.alfa)).street).toBe("Adminstraat 9");

    /* The admin's change is in the same record, as the admin's. */
    const change = (await audits(ids.alfa)).at(-1)!;
    expect(change).toMatchObject({ actor_kind: "admin", actor_user_id: ids.adminUser, changed_fields: ["street"] });
  });

  it("keeps a customer's edit when the admin saves a note from a page opened before it", async () => {
    const opened = (await getCustomer(ids.alfa))!;
    const profile = await profileOf(clients.alfa, ids.alfa);
    expect((await save(clients.alfa, formOf(ids.alfa, profile, { billingEmail: `boekhouding-${stamp}@example.test` }))).status).toBe("saved");
    const count = (await audits(ids.alfa)).length;

    expect((await updateCustomerNotes(opened.id, "Belafspraak dinsdag")).ok).toBe(true);
    const row = await customerRow(ids.alfa);
    expect(row.billing_email).toBe(`boekhouding-${stamp}@example.test`);
    expect(row.notes).toBe("Belafspraak dinsdag");
    expect((await audits(ids.alfa)).length).toBe(count);
  });

  it("treats a stored layout the form would fold as unchanged", async () => {
    await admin.from("customers").update({ phone: "  06   1234  5678 " }).eq("id", ids.alfa);
    const profile = await profileOf(clients.alfa, ids.alfa);
    const count = (await audits(ids.alfa)).length;
    const result = await save(clients.alfa, formOf(ids.alfa, profile));
    expect(result.status).toBe("unchanged");
    expect((await customerRow(ids.alfa)).phone).toBe("  06   1234  5678 ");
    /* Only the admin's direct write above was recorded. */
    expect((await audits(ids.alfa)).length).toBe(count);
  });

  it("changes only the customer the multi-customer member is acting for", async () => {
    const betaBefore = await customerRow(ids.beta);
    jar.set("ym_portal_customer", ids.alfa);
    const profile = await profileOf(clients.multi, ids.alfa);
    expect((await save(clients.multi, formOf(ids.alfa, profile, { postalCode: "2511 AA" }))).status).toBe("saved");
    expect(await customerRow(ids.beta)).toEqual(betaBefore);

    jar.set("ym_portal_customer", ids.beta);
    const beta = await profileOf(clients.multi, ids.beta);
    expect(beta.fields.companyName).toBe(betaBefore.company_name);
    expect(beta.fields.postalCode).toBe("1011 AA");
  });
});

describe.runIf(local)("the billing address", () => {
  it("receives financial mail when set, and the contact address everything else", async () => {
    const row = await customerRow(ids.alfa);
    expect(row.billing_email).toBe(`boekhouding-${stamp}@example.test`);
    const financial = await resolveCustomerRecipient(service, ids.alfa, "financial");
    const general = await resolveCustomerRecipient(service, ids.alfa, "general");
    expect(financial.ok && financial.recipient.email).toBe(row.billing_email);
    expect(general.ok && general.recipient.email).toBe(row.email);
  });

  it("is used by a real invoice send, and a quote still goes to the contact", async () => {
    deliverEmail.mockClear();
    const resent = await sendInvoiceToCustomer(docs.invoice);
    expect(resent.ok).toBe(true);
    expect((deliverEmail.mock.calls.at(-1)![0] as { to: string }).to).toBe(`boekhouding-${stamp}@example.test`);

    /* A quote is not financial mail: the next version goes to the contact address. */
    const revision = await createQuoteRevision(docs.quote);
    if (!revision.ok) throw new Error(revision.error);
    docs.revision = revision.value;
    deliverEmail.mockClear();
    const quoteSent = await sendQuoteToCustomer(docs.revision);
    expect(quoteSent.ok).toBe(true);
    expect((deliverEmail.mock.calls.at(-1)![0] as { to: string }).to).toBe((await customerRow(ids.alfa)).email);
  });

  it("falls back to the contact address once cleared", async () => {
    const profile = await profileOf(clients.alfa, ids.alfa);
    expect((await save(clients.alfa, formOf(ids.alfa, profile, { billingEmail: "   " }))).status).toBe("saved");
    const row = await customerRow(ids.alfa);
    expect(row.billing_email).toBeNull();
    const financial = await resolveCustomerRecipient(service, ids.alfa, "financial");
    expect(financial.ok && financial.recipient.email).toBe(row.email);
  });
});

describe.runIf(local)("what an edit never touches", () => {
  it("leaves the sign-in address and the membership as they were", async () => {
    const { data } = await service.auth.admin.getUserById(ids.alfaUser);
    expect(data.user?.email).toBe(ids.alfaEmail);
    const { data: membership } = await service.from("customer_users").select("invited_email, user_id, revoked_at").eq("id", ids.alfaMembership).single();
    expect(membership).toEqual({ invited_email: ids.alfaEmail, user_id: ids.alfaUser, revoked_at: null });
    /* And the member still signs in with it. */
    await expect(signedIn(ids.alfaEmail)).resolves.toBeTruthy();
  });

  it("leaves every existing document, its snapshot and its file exactly as they were", async () => {
    expect((await customerRow(ids.alfa)).company_name).not.toBe(`Alfa ${stamp}`);
    const after = await frozen();
    const strip = <T extends Record<string, unknown> | null>(row: T) => {
      if (!row) return row;
      const { updated_at: _ignored, ...rest } = row as Record<string, unknown>;
      void _ignored;
      return rest;
    };
    expect(strip(after.quote)).toEqual(strip(before.quote));
    expect(strip(after.creditNote)).toEqual(strip(before.creditNote));
    /* The invoice was mailed again above (sent_at moved), but nothing it says changed. */
    expect(strip(after.invoice)).toEqual(strip(before.invoice));
    expect(after.files).toEqual(before.files);
    expect(after.quote!.customer_company_name).toBe(`Alfa ${stamp}`);
  });

  it("lets a new document take the details as they are now", async () => {
    const { data } = await service.from("quotes").select("customer_company_name, customer_street, customer_email").eq("id", docs.revision).single();
    const now = await customerRow(ids.alfa);
    expect(data).toEqual({ customer_company_name: now.company_name, customer_street: now.street, customer_email: now.email });
  });
});

describe.runIf(local)("the audit record", () => {
  it("is readable by the admin only and writable by nobody", async () => {
    const asMember = await clients.alfa.from("customer_profile_changes").select("id").eq("customer_id", ids.alfa);
    expect(asMember.data ?? []).toEqual([]);
    const asAdmin = await admin.from("customer_profile_changes").select("id").eq("customer_id", ids.alfa);
    expect((asAdmin.data ?? []).length).toBeGreaterThan(3);
    const insert = await admin.from("customer_profile_changes").insert({ customer_id: ids.alfa, actor_kind: "admin", changed_fields: ["email"] });
    expect(insert.error).not.toBeNull();
    const remove = await admin.from("customer_profile_changes").delete().eq("customer_id", ids.alfa).select("id");
    expect(remove.data ?? []).toEqual([]);
  });

  it("cannot be rewritten even by the system client", async () => {
    const insert = await service.from("customer_profile_changes").insert({ customer_id: ids.alfa, actor_kind: "system", changed_fields: ["email"] });
    expect(insert.error).not.toBeNull();
    const update = await service.from("customer_profile_changes").update({ actor_kind: "system" }).eq("customer_id", ids.alfa).select("id");
    expect(update.error).not.toBeNull();
    const remove = await service.from("customer_profile_changes").delete().eq("customer_id", ids.alfa).select("id");
    expect(remove.error).not.toBeNull();
  });

  it("is closed to anon, like the functions", async () => {
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const read = await anon.rpc("portal_customer_profile", { p_customer_id: ids.alfa });
    expect(read.error).not.toBeNull();
    const profile = await profileOf(clients.alfa, ids.alfa);
    const write = await anon.rpc("portal_update_customer_profile", argsOf(ids.alfa, profile, { city: "Anon" }));
    expect(write.error).not.toBeNull();
  });
});
