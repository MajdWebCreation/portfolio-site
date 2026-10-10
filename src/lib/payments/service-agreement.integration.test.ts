import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The agreement chain against a real Postgres: what only the database can
 * answer. Whether the check constraints refuse a deviation without a
 * source, whether the trigger numbers the chain and refuses a backwards
 * date or a foreign predecessor, whether two genuinely simultaneous
 * inserts from the same head end in exactly one revision, whether a
 * recorded revision can be changed at all, and whether removing the source
 * offer leaves the revision and the cancellation readable.
 *
 * Runs only against a local stack (`npx supabase start`) and is skipped
 * otherwise, like finalization.integration.test.ts:
 *
 *   SUPABASE_LOCAL_URL=http://127.0.0.1:54321 \
 *   SUPABASE_LOCAL_SERVICE_KEY=… SUPABASE_LOCAL_ANON_KEY=… npx vitest run …
 *
 * It cannot reach production: the URL has to be a loopback address.
 */
const url = process.env.SUPABASE_LOCAL_URL ?? "";
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? "";
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY ?? "";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const local = loopback.test(url) && Boolean(serviceKey) && Boolean(anonKey);

/** Elevated, for setting the stage and for looking behind the policies. */
let service: SupabaseClient<Database>;
/** The admin session the application runs as. */
let admin: SupabaseClient<Database>;
let customerId: string;
let otherCustomerId: string;
let serviceId: string;
let otherServiceId: string;
let quoteId: string;
let adminUserId: string;

type AgreementInsert = Database["public"]["Tables"]["recurring_service_agreements"]["Insert"];

const standard = (overrides: Partial<AgreementInsert> = {}): AgreementInsert => ({
  recurring_service_id: serviceId,
  customer_id: customerId,
  effective_from: "2026-10-01",
  source_kind: "standard_terms",
  source_label: "Algemene Voorwaarden B2B 2026",
  terms_edition: "2026",
  terms_published_on: "2026-09-29",
  ...overrides,
});

async function insert(row: AgreementInsert, client: SupabaseClient<Database> = admin) {
  return client.from("recurring_service_agreements").insert(row).select("id, sequence, supersedes_id, effective_from, source_label, source_quote_id").single();
}

async function chain(id = serviceId) {
  const { data, error } = await service.from("recurring_service_agreements").select("id, sequence, supersedes_id, effective_from, notice_months, source_label, source_quote_id").eq("recurring_service_id", id).order("sequence");
  if (error) throw new Error(error.message);
  return data!;
}

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  const email = `agreements+${Date.now()}@example.test`;
  const password = "validation-only-password";
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`admin user: ${created.error.message}`);
  adminUserId = created.data.user!.id;
  const profile = await service.from("admin_profiles").insert({ user_id: adminUserId, display_name: "Agreements" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);
  admin = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const signedIn = await admin.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);

  const customer = (name: string) =>
    service
      .from("customers")
      .insert({ company_name: name, contact_name: "A. Alfa", email: `${name.toLowerCase().replace(/\W/g, "")}@example.test`, street: "Straat 1", postal_code: "1011 AA", city: "Amsterdam", country: "Nederland" })
      .select("id")
      .single();
  const alfa = await customer("Alfa BV");
  const beta = await customer("Beta BV");
  if (alfa.error || beta.error) throw new Error(`customer: ${alfa.error?.message ?? beta.error?.message}`);
  customerId = alfa.data!.id;
  otherCustomerId = beta.data!.id;

  const services = await service
    .from("recurring_services")
    .insert([
      { customer_id: customerId, name: "Websitebeheer & hosting", amount_cents: 1000, vat_rate: 21, starts_on: "2026-10-04", status: "draft" },
      { customer_id: customerId, name: "SEO", amount_cents: 5000, vat_rate: 21, starts_on: "2026-10-04", status: "draft" },
    ])
    .select("id, name");
  if (services.error) throw new Error(`services: ${services.error.message}`);
  serviceId = services.data!.find((row) => row.name === "SEO" ? false : true)!.id;
  otherServiceId = services.data!.find((row) => row.name === "SEO")!.id;

  const quote = await service
    .from("quotes")
    .insert({
      number_value: "YM-O-2026-999001",
      number_provisional: false,
      status: "accepted",
      customer_id: customerId,
      customer_company_name: "Alfa BV",
      customer_contact_name: "A. Alfa",
      customer_email: "alfa@example.test",
      customer_street: "Straat 1",
      customer_postal_code: "1011 AA",
      customer_city: "Amsterdam",
      customer_country: "Nederland",
      issue_date: "2026-09-10",
      valid_until: "2026-10-10",
      subject: "Websitebeheer",
    })
    .select("id")
    .single();
  if (quote.error) throw new Error(`quote: ${quote.error.message}`);
  quoteId = quote.data!.id;
}, 120_000);

afterAll(async () => {
  if (!local || !service) return;
  /*
    Local only. Revisions cannot be deleted by anyone, except as the cascade
    of their service being removed -- which is how the stage is cleared:
    the services go, and their revisions with them.
  */
  await service
    .from("recurring_services")
    .update({ status: "draft", cancellation_requested_at: null, ends_on: null, cancellation_notice_months: null, cancellation_minimum_term_months: null, cancellation_minimum_term_ends_on: null, cancellation_contractual_ends_on: null, cancellation_agreement_revision_id: null, cancellation_source: null, cancellation_proration_rule: null, cancellation_deviation_source_kind: null, cancellation_deviation_source_label: null, cancellation_deviation_agreed_on: null, cancellation_deviation_reason: null })
    .in("customer_id", [customerId, otherCustomerId]);
  await service.from("recurring_services").delete().in("customer_id", [customerId, otherCustomerId]);
  await service.from("quotes").delete().eq("customer_id", customerId);
  await service.from("customers").delete().in("id", [customerId, otherCustomerId]);
  if (adminUserId) {
    await service.from("admin_profiles").delete().eq("user_id", adminUserId);
    await service.auth.admin.deleteUser(adminUserId);
  }
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local, and is not the production project", () => {
    expect(url).toMatch(loopback);
    expect(url).not.toContain("supabase.co");
    expect(url).not.toContain("wbrqbuctwzpobnvcsomt");
  });
});

describe.runIf(local)("what the schema refuses on its own", () => {
  it("refuses a deviation whose source is the general terms", async () => {
    const { error } = await insert(standard({ notice_months: 2 }));
    expect(error?.message).toContain("recurring_service_agreements_deviation_has_source");
    const special = await insert(standard({ special_terms: "Iets bijzonders" }));
    expect(special.error?.message).toContain("recurring_service_agreements_deviation_has_source");
    expect(await chain()).toHaveLength(0);
  });

  it("refuses an offer or amendment without an acceptance date, and one accepted after it takes effect", async () => {
    const missing = await insert(standard({ source_kind: "later_written_amendment", source_label: "E-mail", notice_months: 2 }));
    expect(missing.error?.message).toContain("recurring_service_agreements_source_accepted");
    const late = await insert(standard({ source_kind: "later_written_amendment", source_label: "E-mail", notice_months: 2, accepted_on: "2026-10-02" }));
    expect(late.error?.message).toContain("recurring_service_agreements_accepted_before_effective");
  });

  it("refuses an offer of another customer as source", async () => {
    const other = await service
      .from("quotes")
      .insert({
        number_value: "YM-O-2026-999002",
        number_provisional: false,
        status: "accepted",
        customer_id: otherCustomerId,
        customer_company_name: "Beta BV",
        customer_contact_name: "B. Beta",
        customer_email: "beta@example.test",
        customer_street: "Straat 2",
        customer_postal_code: "1011 AB",
        customer_city: "Amsterdam",
        customer_country: "Nederland",
        issue_date: "2026-09-10",
        valid_until: "2026-10-10",
        subject: "Iets anders",
      })
      .select("id")
      .single();
    if (other.error) throw new Error(other.error.message);
    const { error } = await insert(standard({ source_kind: "accepted_offer", source_label: "Offerte YM-O-2026-999002", source_quote_id: other.data!.id, accepted_on: "2026-09-12", notice_months: 2 }));
    expect(error?.code).toBe("23503");
    await service.from("quotes").delete().eq("id", other.data!.id);
  });

  it("takes a revision without a set of general terms, but never half a set", async () => {
    const half = await insert(standard({ recurring_service_id: otherServiceId, terms_published_on: null }));
    expect(half.error?.message).toContain("recurring_service_agreements_terms_set_complete");
    const none = await insert(standard({ recurring_service_id: otherServiceId, terms_edition: null, terms_published_on: null, source_label: "Algemene voorwaarden, versie niet historisch vastgesteld" }));
    expect(none.error).toBeNull();
    const { data } = await service.from("recurring_service_agreements").select("terms_edition, terms_published_on, source_label").eq("id", none.data!.id).single();
    expect(data).toEqual({ terms_edition: null, terms_published_on: null, source_label: "Algemene voorwaarden, versie niet historisch vastgesteld" });
  });

  it("refuses a notice outside one to twenty-four months, and an unknown proration rule", async () => {
    const zero = await insert(standard({ source_kind: "later_written_amendment", source_label: "E-mail", accepted_on: "2026-09-01", notice_months: 0 }));
    expect(zero.error?.message).toContain("notice_months");
    const rule = await insert(standard({ source_kind: "later_written_amendment", source_label: "E-mail", accepted_on: "2026-09-01", proration_rule: "thirty_days" }));
    expect(rule.error?.message).toContain("proration_rule");
  });
});

describe.runIf(local)("the chain", () => {
  let first: string;
  let second: string;

  it("numbers the first revision 1 and allows only one first revision per service", async () => {
    const created = await insert(standard());
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ sequence: 1, supersedes_id: null });
    first = created.data!.id;
    const again = await insert(standard({ effective_from: "2026-11-01" }));
    expect(again.error?.message).toMatch(/moet de huidige opvolgen/);
  });

  it("numbers a successor from its predecessor and refuses a date before the predecessor's", async () => {
    const back = await insert(standard({ supersedes_id: first, effective_from: "2026-09-30", source_kind: "accepted_offer", source_quote_id: quoteId, source_label: "Offerte YM-O-2026-999001", accepted_on: "2026-09-12", notice_months: 2 }));
    expect(back.error?.message).toMatch(/ligt vóór die van de vorige versie/);
    const next = await insert(standard({ supersedes_id: first, effective_from: "2026-10-04", source_kind: "accepted_offer", source_quote_id: quoteId, source_label: "Offerte YM-O-2026-999001", accepted_on: "2026-09-12", notice_months: 2 }));
    expect(next.error).toBeNull();
    expect(next.data).toMatchObject({ sequence: 2, supersedes_id: first });
    second = next.data!.id;
  });

  it("refuses a revision chained onto another service's head", async () => {
    const { error } = await insert(standard({ recurring_service_id: otherServiceId, supersedes_id: second, effective_from: "2026-12-01" }));
    expect(error?.message).toMatch(/andere dienst/);
    expect(await chain(otherServiceId)).toHaveLength(1);
  });

  it("refuses to delete a revision, for the admin and for any other role, while its service exists", async () => {
    const asAdmin = await admin.from("recurring_service_agreements").delete().eq("id", first).select("id");
    expect(asAdmin.error?.message ?? "").toMatch(/permission denied|wordt niet verwijderd/);
    const asService = await service.from("recurring_service_agreements").delete().eq("id", first).select("id");
    expect(asService.error?.message).toMatch(/wordt niet verwijderd/);
    expect((await chain()).map((row) => row.sequence)).toEqual([1, 2]);
  });

  it("lets exactly one of two simultaneous successors of the same head land", async () => {
    const attempt = (months: number) =>
      insert(standard({ supersedes_id: second, effective_from: "2027-02-01", source_kind: "later_written_amendment", source_label: `E-mail ${months}`, accepted_on: "2027-01-10", notice_months: months }));
    const results = await Promise.all([attempt(3), attempt(4), attempt(5)]);
    const landed = results.filter((result) => !result.error);
    expect(landed).toHaveLength(1);
    expect(landed[0]!.data).toMatchObject({ sequence: 3, supersedes_id: second });
    for (const refused of results.filter((result) => result.error)) expect(refused.error!.code).toBe("23505");
    const rows = await chain();
    expect(rows.map((row) => row.sequence)).toEqual([1, 2, 3]);
    expect(rows.filter((row) => row.supersedes_id === second)).toHaveLength(1);
  });

  it("never changes a recorded revision, for the admin or for any other role", async () => {
    const asAdmin = await admin.from("recurring_service_agreements").update({ notice_months: 9 }).eq("id", second).select("id");
    // No update grant for the admin role at all; and the trigger for every role that has one.
    expect(asAdmin.error?.message).toMatch(/permission denied|niet gewijzigd/);
    const asService = await service.from("recurring_service_agreements").update({ notice_months: 9 }).eq("id", second).select("id");
    expect(asService.error?.message).toMatch(/wordt niet gewijzigd/);
    const asAdminDelete = await admin.from("recurring_service_agreements").delete().eq("id", second).select("id");
    expect(asAdminDelete.data ?? []).toHaveLength(0);
    expect((await chain()).find((row) => row.id === second)?.notice_months).toBe(2);
  });

  it("keeps a cancellation's snapshot and its revision when the source offer is removed", async () => {
    const snapshot = await service
      .from("recurring_services")
      .update({
        status: "active",
        cancellation_requested_at: "2026-11-10T09:00:00+01:00",
        ends_on: "2027-01-09",
        cancellation_notice_months: 2,
        cancellation_minimum_term_months: null,
        cancellation_contractual_ends_on: "2027-01-09",
        cancellation_agreement_revision_id: second,
        cancellation_source: "Offerte YM-O-2026-999001",
        cancellation_proration_rule: "pro_rata_days",
      })
      .eq("id", serviceId)
      .select("id");
    expect(snapshot.error).toBeNull();

    const gone = await service.from("quotes").delete().eq("id", quoteId).select("id");
    expect(gone.error).toBeNull();
    const row = (await chain()).find((candidate) => candidate.id === second)!;
    expect(row.source_quote_id).toBeNull();
    expect(row.source_label).toBe("Offerte YM-O-2026-999001");
    const { data } = await service.from("recurring_services").select("ends_on, cancellation_source, cancellation_agreement_revision_id").eq("id", serviceId).single();
    expect(data).toEqual({ ends_on: "2027-01-09", cancellation_source: "Offerte YM-O-2026-999001", cancellation_agreement_revision_id: second });
  });

  it("creates a service and its first revision together, or neither", async () => {
    const make = (edition: string) =>
      admin.rpc("create_recurring_service", {
        p_customer_id: customerId,
        p_name: `Atomair ${edition}`,
        p_description: "",
        p_amount_cents: 1000,
        p_vat_rate: 21,
        p_starts_on: "2026-11-04",
        p_status: "draft",
        p_effective_from: "2026-11-04",
        p_terms_edition: edition,
        p_terms_published_on: "2026-09-29",
        p_note: "test",
      });
    const refused = await make("twintig");
    expect(refused.error?.message).toContain("terms_edition");
    const { data: ghosts } = await service.from("recurring_services").select("id").eq("name", "Atomair twintig");
    expect(ghosts).toEqual([]);

    const made = await make("2026");
    expect(made.error).toBeNull();
    const rows = await chain(made.data!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sequence: 1, supersedes_id: null, effective_from: "2026-11-04", source_label: "Algemene Voorwaarden B2B 2026" });
    const { data: created } = await service.from("recurring_services").select("name, billing_interval, status").eq("id", made.data!).single();
    expect(created).toEqual({ name: "Atomair 2026", billing_interval: "monthly", status: "draft" });
  });

  it("refuses an end other than the contractual one without the written agreement, and keeps that agreement with the end", async () => {
    const snapshot = (extra: Record<string, unknown>) =>
      service
        .from("recurring_services")
        .update({
          status: "active",
          cancellation_requested_at: "2026-11-10T09:00:00+01:00",
          cancellation_notice_months: 1,
          cancellation_minimum_term_months: 12,
          cancellation_minimum_term_ends_on: "2027-10-03",
          cancellation_contractual_ends_on: "2027-10-03",
          cancellation_agreement_revision_id: second,
          cancellation_source: "Offerte YM-O-2026-999001",
          cancellation_proration_rule: "pro_rata_days",
          ...extra,
        })
        .eq("id", otherServiceId)
        .select("id");
    const bare = await snapshot({ ends_on: "2026-12-09" });
    expect(bare.error?.message).toContain("recurring_services_deviation_has_source");
    const later = await snapshot({ ends_on: "2027-11-03" });
    expect(later.error?.message).toContain("recurring_services_deviation_has_source");
    const half = await snapshot({ ends_on: "2026-12-09", cancellation_deviation_source_kind: "later_written_amendment", cancellation_deviation_source_label: "E-mail" });
    expect(half.error?.message).toContain("recurring_services_cancellation_deviation_complete");
    const whole = await snapshot({
      ends_on: "2026-12-09",
      cancellation_deviation_source_kind: "later_written_amendment",
      cancellation_deviation_source_label: "E-mail van de klant, 8 november 2026",
      cancellation_deviation_agreed_on: "2026-11-08",
      cancellation_deviation_reason: "Klant verhuist",
    });
    expect(whole.error).toBeNull();
    // On the contractual day itself a deviation makes no sense and is refused.
    const pointless = await snapshot({ ends_on: "2027-10-03", cancellation_deviation_source_kind: "later_written_amendment", cancellation_deviation_source_label: "E-mail", cancellation_deviation_agreed_on: "2026-11-08", cancellation_deviation_reason: "x" });
    expect(pointless.error?.message).toContain("recurring_services_deviation_is_deviation");
    await service
      .from("recurring_services")
      .update({ status: "draft", cancellation_requested_at: null, ends_on: null, cancellation_notice_months: null, cancellation_minimum_term_months: null, cancellation_minimum_term_ends_on: null, cancellation_contractual_ends_on: null, cancellation_agreement_revision_id: null, cancellation_source: null, cancellation_proration_rule: null, cancellation_deviation_source_kind: null, cancellation_deviation_source_label: null, cancellation_deviation_agreed_on: null, cancellation_deviation_reason: null })
      .eq("id", otherServiceId);
  });

  it("lets no role delete a service with history, and the admin role delete no service at all", async () => {
    const asAdmin = await admin.from("recurring_services").delete().eq("id", otherServiceId).select("id");
    expect(asAdmin.error?.message ?? "").toMatch(/permission denied/);
    const { data: still } = await service.from("recurring_services").select("id").eq("id", otherServiceId);
    expect(still).toHaveLength(1);

    const used = await service
      .from("recurring_services")
      .insert({ customer_id: customerId, name: "Gebruikt", amount_cents: 1000, vat_rate: 21, starts_on: "2026-10-04", status: "active", mollie_subscription_id: `sub_test_${Date.now()}` })
      .select("id")
      .single();
    if (used.error) throw new Error(used.error.message);
    const refused = await service.from("recurring_services").delete().eq("id", used.data!.id).select("id");
    expect(refused.error?.message).toMatch(/heeft financiële of contractuele historie/);
    const released = await service.from("recurring_services").update({ status: "draft", mollie_subscription_id: null }).eq("id", used.data!.id);
    expect(released.error).toBeNull();
    const gone = await service.from("recurring_services").delete().eq("id", used.data!.id).select("id");
    expect(gone.error).toBeNull();
  });

  it("refuses a cancellation snapshot that is incomplete, and a revision reference without a cancellation", async () => {
    const partial = await service.from("recurring_services").update({ cancellation_notice_months: null }).eq("id", serviceId).select("id");
    expect(partial.error?.message).toContain("recurring_services_cancellation_snapshot_complete");
    const dangling = await service.from("recurring_services").update({ cancellation_agreement_revision_id: second }).eq("id", otherServiceId).select("id");
    expect(dangling.error?.message).toContain("recurring_services_cancellation_snapshot_complete");
  });
});
