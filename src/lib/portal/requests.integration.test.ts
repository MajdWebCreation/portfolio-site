import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Customer requests against a real Postgres, a real Auth server and a real
 * Storage: who may make, read and attach to a request; that one submit
 * intention makes one request; that a file reaches only its own request and
 * customer; that a failing file or a failing mail never costs the request;
 * and the admin's status and links.
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

const { createRequestAction, registerAttachmentAction } = await import("@/lib/portal/requests/actions");
const { readPortalRequest, readPortalRequests } = await import("@/lib/portal/requests/read");
const { readRequestAttachment } = await import("@/lib/portal/privileged");
const { setRequestStatus, linkRequest, retryRequestAnnouncement } = await import("@/lib/admin/requests/actions");
const { announceRequestOn } = await import("@/lib/requests/announce");
const { runRetention } = await import("@/lib/retention/retention-runner");
const { createRetentionStore } = await import("@/lib/retention/retention-store");
const { getRequest } = await import("@/lib/admin/requests/repository");
const { sendQuoteToCustomer } = await import("@/lib/admin/documents/send");
const { contentDisposition } = await import("@/lib/requests/model");
const { announcePendingRequests } = await import("@/lib/requests/announce-sweep");
const { PortalDenied } = await import("@/lib/portal/rpc");
const { GET: attachmentRoute } = await import("@/app/portaal/(shell)/verzoeken/bijlagen/[attachmentId]/route");

type Db = SupabaseClient<Database>;
const bucket = "request-attachments";
const password = "portal-requests-password";
const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

const ids = { alfa: "", beta: "", alfaUser: "", betaUser: "", multiUser: "", alfaMembership: "", betaProject: "", alfaProject: "", betaQuote: "", alfaDraftQuote: "" };
const req = { alfa: "", beta: "", full: "", closed: "" };
const clients = {} as Record<"alfa" | "beta" | "multi" | "anon", Db>;

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, ...new Array(200).fill(7)]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(200).fill(1)]);
const pdf = () => new TextEncoder().encode("%PDF-1.4\n%test\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

async function signedIn(email: string): Promise<Db> {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function createUser(label: string): Promise<{ id: string; email: string }> {
  const email = `portal-req-${label}-${stamp}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`user ${label}: ${error.message}`);
  return { id: data.user!.id, email };
}

async function createCustomer(name: string): Promise<string> {
  const { data, error } = await service
    .from("customers")
    .insert({ company_name: `${name} ${stamp}`, contact_name: `Contact ${name}`, email: `contact-req-${name.toLowerCase()}-${stamp}@example.test`, street: "S 1", postal_code: "1011 AA", city: "A", country: "Nederland" })
    .select("id")
    .single();
  if (error) throw new Error(`customer ${name}: ${error.message}`);
  return data!.id;
}

async function rpcCreate(client: Db, customerId: string, submissionId = crypto.randomUUID(), fields: Partial<{ category: string; subject: string; description: string }> = {}) {
  return client.rpc("portal_create_request", {
    p_customer_id: customerId,
    p_submission_id: submissionId,
    p_category: fields.category ?? "website_change",
    p_subject: fields.subject ?? "Homepagina aanpassen",
    p_description: fields.description ?? "Graag de openingstijden bijwerken.",
  });
}

async function newRequest(client: Db, customerId: string): Promise<string> {
  const { data, error } = await rpcCreate(client, customerId);
  if (error) throw new Error(`request: ${error.message}`);
  return data![0]!.request_id;
}

function form(customerId: string, submissionId: string, fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("customerId", customerId);
  data.set("submissionId", submissionId);
  data.set("category", "content");
  data.set("subject", "Nieuwe pagina over onze diensten");
  data.set("description", "We willen een pagina toevoegen.\nMet foto's.");
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** A reserved upload slot: the only kind of path the bucket accepts from a member. */
async function slot(client: Db, customerId: string, requestId: string): Promise<string> {
  const { data, error } = await client.rpc("portal_reserve_request_upload", { p_customer_id: customerId, p_request_id: requestId });
  if (error) throw new Error(`slot: ${error.message}`);
  return data![0]!.storage_path;
}

function pathFor(customerId: string, requestId: string): string {
  return `${customerId}/${requestId}/${crypto.randomUUID()}`;
}

async function upload(client: Db, path: string, bytes: Uint8Array, contentType: string) {
  return client.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
}

/** Stored by the browser, registered by the server action -- the portal's own two steps. */
async function attach(client: Db, customerId: string, requestId: string, bytes: Uint8Array, mime: string, fileName: string) {
  const path = await slot(client, customerId, requestId);
  const stored = await upload(client, path, bytes, mime);
  if (stored.error) return { stored: false as const, error: stored.error.message, path };
  visitor = client;
  const registered = await registerAttachmentAction({ customerId, requestId, storagePath: path, fileName, mimeType: mime });
  return { stored: true as const, registered, path };
}

async function announcement(requestId: string) {
  const { data } = await service.from("customer_requests").select("announced_at, announce_claimed_at, announce_attempts").eq("id", requestId).single();
  return data!;
}

async function internalNotified(requestId: string) {
  const { data } = await service.from("customer_requests").select("internal_notified_at").eq("id", requestId).single();
  return data!.internal_notified_at;
}

/** As the database superuser: move an object's upload time, to stand for an upload made earlier. */
function backdateObject(path: string, interval: string): void {
  execFileSync("docker", ["exec", "supabase_db_portfolio-site", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
    `update storage.objects set created_at = now() - interval '${interval}' where bucket_id = '${bucket}' and name = '${path}'`], { stdio: "pipe" });
}

async function objectExists(path: string): Promise<boolean> {
  const { data } = await service.storage.from(bucket).download(path);
  return Boolean(data);
}

async function count(table: "customer_requests" | "customer_request_attachments", column: string, value: string): Promise<number> {
  const { count: found } = await service.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  return found ?? 0;
}

beforeAll(async () => {
  if (!local) return;
  service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  deliverEmail.mockResolvedValue({ sent: true, sentAt: new Date().toISOString(), messageId: "local" });

  const adminUser = await createUser("admin");
  const profile = await service.from("admin_profiles").insert({ user_id: adminUser.id, display_name: "Request validation" });
  if (profile.error) throw new Error(`admin profile: ${profile.error.message}`);
  admin = await signedIn(adminUser.email);

  ids.alfa = await createCustomer("Alfa");
  ids.beta = await createCustomer("Beta");

  const alfaUser = await createUser("alfa");
  const betaUser = await createUser("beta");
  const multiUser = await createUser("multi");
  ids.alfaUser = alfaUser.id;
  ids.betaUser = betaUser.id;
  ids.multiUser = multiUser.id;
  const m = await service.from("customer_users").insert({ user_id: alfaUser.id, customer_id: ids.alfa, invited_email: alfaUser.email }).select("id").single();
  ids.alfaMembership = m.data!.id;
  await service.from("customer_users").insert([
    { user_id: betaUser.id, customer_id: ids.beta, invited_email: betaUser.email },
    { user_id: multiUser.id, customer_id: ids.alfa, invited_email: multiUser.email },
    { user_id: multiUser.id, customer_id: ids.beta, invited_email: multiUser.email },
  ]);
  clients.alfa = await signedIn(alfaUser.email);
  clients.beta = await signedIn(betaUser.email);
  clients.multi = await signedIn(multiUser.email);
  clients.anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });

  const projects = await service.from("projects").insert([
    { customer_id: ids.alfa, name: "Alfa website", status: "active", notes: "INTERNAL project note" },
    { customer_id: ids.beta, name: "Beta website", status: "active", notes: "" },
  ]).select("id, customer_id");
  if (projects.error) throw new Error(`projects: ${projects.error.message}`);
  ids.alfaProject = projects.data!.find((row) => row.customer_id === ids.alfa)!.id;
  ids.betaProject = projects.data!.find((row) => row.customer_id === ids.beta)!.id;

  const quote = (customerId: string) => ({
    number_value: `OFF-CONCEPT-${Math.random().toString(36).slice(-6)}`, number_provisional: true, status: "draft", customer_id: customerId,
    customer_company_name: "K", customer_contact_name: "C", customer_email: `q-${stamp}@example.test`,
    customer_street: "S 1", customer_postal_code: "1011 AA", customer_city: "A", customer_country: "Nederland",
    issue_date: today, valid_until: "2099-12-31", subject: "Offerte voor verzoek",
  });
  const quotes = await service.from("quotes").insert([quote(ids.alfa), quote(ids.beta)]).select("id, customer_id");
  if (quotes.error) throw new Error(`quotes: ${quotes.error.message}`);
  ids.alfaDraftQuote = quotes.data!.find((row) => row.customer_id === ids.alfa)!.id;
  ids.betaQuote = quotes.data!.find((row) => row.customer_id === ids.beta)!.id;
  for (const id of [ids.alfaDraftQuote, ids.betaQuote]) {
    await service.rpc("save_quote_lines", { p_quote_id: id, p_lines: [{ description: "Werk", quantityHundredths: 100, unitPriceCents: 50000, vatRate: 21 }] as never });
  }

  req.beta = await newRequest(clients.beta, ids.beta);
}, 300_000);

afterAll(async () => {
  if (!local || !service) return;
  for (const id of [ids.alfaUser, ids.betaUser, ids.multiUser]) if (id) await service.auth.admin.deleteUser(id);
}, 120_000);

describe.runIf(local)("the stack under test", () => {
  it("is local", () => {
    expect(url).toMatch(loopback);
    expect(url).not.toContain("supabase.co");
  });
});

describe.runIf(local)("submitting a request", () => {
  it("makes the request, confirms it to the customer and tells YM Creations", async () => {
    jar.clear();
    visitor = clients.alfa;
    deliverEmail.mockClear();
    const submission = crypto.randomUUID();
    const result = await createRequestAction({ status: "idle" }, form(ids.alfa, submission));
    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    req.alfa = result.requestId;

    const stored = await readPortalRequest(ids.alfa, req.alfa);
    expect(stored).toMatchObject({ category: "content", subject: "Nieuwe pagina over onze diensten", status: "submitted", acceptsAttachments: true, attachments: [] });
    const recipients = deliverEmail.mock.calls.map((call) => (call[0] as { to: string }).to).sort();
    expect(recipients).toEqual([`contact-req-alfa-${stamp}@example.test`, "intern@ymcreations.test"].sort());
    const { data: log } = await service.from("customer_communications").select("category").eq("customer_id", ids.alfa);
    expect(log).toEqual([{ category: "request_received" }]);
    const { data: events } = await service.from("customer_request_status_events").select("from_status, to_status, changed_by").eq("request_id", req.alfa);
    expect(events).toEqual([{ from_status: null, to_status: "submitted", changed_by: ids.alfaUser }]);
  });

  it("makes one request for a double click, and for a retry after the answer was lost -- and mails once", async () => {
    visitor = clients.alfa;
    deliverEmail.mockClear();
    const submission = crypto.randomUUID();
    const before = await count("customer_requests", "customer_id", ids.alfa);
    const [a, b] = await Promise.all([
      createRequestAction({ status: "idle" }, form(ids.alfa, submission)),
      createRequestAction({ status: "idle" }, form(ids.alfa, submission)),
    ]);
    const retry = await createRequestAction({ status: "idle" }, form(ids.alfa, submission));
    expect(a.status === "created" && b.status === "created" && retry.status === "created").toBe(true);
    if (a.status !== "created" || b.status !== "created" || retry.status !== "created") return;
    expect(new Set([a.requestId, b.requestId, retry.requestId]).size).toBe(1);
    expect(await count("customer_requests", "customer_id", ids.alfa)).toBe(before + 1);
    expect(deliverEmail).toHaveBeenCalledTimes(2);
  });

  it("refuses an empty subject, an empty description and an unknown category, in the action and in the database", async () => {
    visitor = clients.alfa;
    for (const [field, value] of [["subject", "   "], ["description", ""], ["category", "hack"]] as const) {
      const result = await createRequestAction({ status: "idle" }, form(ids.alfa, crypto.randomUUID(), { [field]: value }));
      expect(result.status, field).toBe("invalid");
      const direct = await rpcCreate(clients.alfa, ids.alfa, crypto.randomUUID(), { [field]: value });
      expect(direct.error?.code, field).toBe("22023");
      expect(direct.error?.message, field).toBe(`invalid:${field}`);
    }
  });

  it("cannot be given a status, a project or anything else than its fields", async () => {
    const extra = await clients.alfa.rpc("portal_create_request", {
      p_customer_id: ids.alfa, p_submission_id: crypto.randomUUID(), p_category: "issue", p_subject: "x", p_description: "y", p_status: "completed",
    } as never);
    expect(extra.error).not.toBeNull();
    visitor = clients.alfa;
    const result = await createRequestAction({ status: "idle" }, form(ids.alfa, crypto.randomUUID(), { status: "completed", project_id: ids.alfaProject, quote_id: ids.alfaDraftQuote }));
    if (result.status !== "created") throw new Error(result.status);
    const { data } = await service.from("customer_requests").select("status, project_id, quote_id").eq("id", result.requestId).single();
    expect(data).toEqual({ status: "submitted", project_id: null, quote_id: null });
    /* And no table write at all. */
    const direct = await clients.alfa.from("customer_requests").insert({ customer_id: ids.alfa, submission_id: crypto.randomUUID(), category: "issue", subject: "x", description: "y" } as never).select("id");
    expect(direct.data ?? []).toEqual([]);
  });

  it("never opens another customer's request: the same denial as an unknown id", async () => {
    expect(await (async () => {
      visitor = clients.alfa;
      try {
        await readPortalRequest(ids.alfa, req.beta);
        return false;
      } catch (error) {
        return error instanceof PortalDenied;
      }
    })()).toBe(true);
    for (const id of [req.beta, crypto.randomUUID()]) {
      const result = await clients.alfa.rpc("portal_request", { p_customer_id: ids.alfa, p_request_id: id });
      expect(result.error?.code).toBe("42501");
    }
    const named = await clients.alfa.rpc("portal_request", { p_customer_id: ids.beta, p_request_id: req.beta });
    expect(named.error?.code).toBe("42501");
    const list = await clients.alfa.rpc("portal_requests", { p_customer_id: ids.alfa });
    expect(list.data!.some((row) => row.id === req.beta)).toBe(false);
  });

  it("refuses a member whose access ended a moment before the submit", async () => {
    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("id", ids.alfaMembership);
    const before = await count("customer_requests", "customer_id", ids.alfa);
    const direct = await rpcCreate(clients.alfa, ids.alfa);
    expect(direct.error?.code).toBe("42501");
    jar.clear();
    visitor = clients.alfa;
    await expect(createRequestAction({ status: "idle" }, form(ids.alfa, crypto.randomUUID()))).rejects.toThrow("redirect:/portaal/geen-toegang");
    expect(await count("customer_requests", "customer_id", ids.alfa)).toBe(before);
    await service.from("customer_users").update({ revoked_at: null }).eq("id", ids.alfaMembership);
  });

  it("refuses a form left open across a switch of company", async () => {
    jar.set("ym_portal_customer", ids.beta);
    visitor = clients.multi;
    const result = await createRequestAction({ status: "idle" }, form(ids.alfa, crypto.randomUUID()));
    expect(result.status).toBe("stale_customer");
    jar.clear();
  });

  it("keeps the request when the mails fail; the next retry sends the confirmation, once, without a second request", async () => {
    visitor = clients.alfa;
    deliverEmail.mockClear();
    deliverEmail.mockResolvedValueOnce({ sent: false, reason: "Resend down", failure: "error" }).mockResolvedValueOnce({ sent: false, reason: "Resend down", failure: "error" });
    const submission = crypto.randomUUID();
    const first = await createRequestAction({ status: "idle" }, form(ids.alfa, submission));
    if (first.status !== "created") throw new Error(first.status);
    expect((await readPortalRequest(ids.alfa, first.requestId)).status).toBe("submitted");
    expect(await announcement(first.requestId)).toEqual({ announced_at: null, announce_claimed_at: null, announce_attempts: 1 });

    const again = await createRequestAction({ status: "idle" }, form(ids.alfa, submission));
    expect(again).toEqual(first);
    /* Both failed the first time, so both go now: the confirmation and the internal notice, each once, each with its key. */
    expect(deliverEmail).toHaveBeenCalledTimes(4);
    const retried = deliverEmail.mock.calls.slice(2).map((call) => call[0] as { to: string; idempotencyKey?: string });
    expect(retried.map((mail) => mail.to).sort()).toEqual([`contact-req-alfa-${stamp}@example.test`, "intern@ymcreations.test"].sort());
    expect(retried.map((mail) => mail.idempotencyKey).sort()).toEqual([`request-internal/${first.requestId}`, `request-received/${first.requestId}`]);
    const done = await announcement(first.requestId);
    expect(done.announced_at).not.toBeNull();
    expect(done.announce_attempts).toBe(2);

    await createRequestAction({ status: "idle" }, form(ids.alfa, submission));
    expect(deliverEmail).toHaveBeenCalledTimes(4);
    expect(await count("customer_requests", "submission_id", submission)).toBe(1);
  });
});

describe.runIf(local)("attachments", () => {
  it("adds a valid image, then several files", async () => {
    const one = await attach(clients.alfa, ids.alfa, req.alfa, jpeg(), "image/jpeg", "foto.jpg");
    expect(one.stored && one.registered.ok).toBe(true);
    const more = await Promise.all([
      attach(clients.alfa, ids.alfa, req.alfa, png(), "image/png", "screenshot.png"),
      attach(clients.alfa, ids.alfa, req.alfa, pdf(), "application/pdf", "brief.pdf"),
    ]);
    expect(more.every((item) => item.stored && item.registered.ok)).toBe(true);
    const request = await readPortalRequest(ids.alfa, req.alfa);
    expect(request.attachments.map((item) => item.fileName).sort()).toEqual(["brief.pdf", "foto.jpg", "screenshot.png"]);
    for (const item of request.attachments) expect(Object.keys(item).sort()).toEqual(["bytes", "createdAt", "fileName", "id", "mimeType"]);
  });

  it("refuses a file too large, a forbidden type, SVG, HTML and executables at the bucket", async () => {
    const big = await upload(clients.alfa, await slot(clients.alfa, ids.alfa, req.alfa), new Uint8Array(15 * 1024 * 1024 + 1), "application/pdf");
    expect(big.error).not.toBeNull();
    for (const [type, bytes] of [
      ["image/svg+xml", new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")],
      ["text/html", new TextEncoder().encode("<html><script>alert(1)</script></html>")],
      ["application/x-msdownload", new Uint8Array([0x4d, 0x5a, 0x90, 0x00])],
      ["application/zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
      ["application/javascript", new TextEncoder().encode("alert(1)")],
    ] as const) {
      const result = await upload(clients.alfa, await slot(clients.alfa, ids.alfa, req.alfa), bytes, type);
      expect(result.error, type).not.toBeNull();
    }
  });

  it("refuses a file whose bytes are not its type, and throws the object away", async () => {
    const fake = await attach(clients.alfa, ids.alfa, req.alfa, new TextEncoder().encode("<html>not an image</html>"), "image/jpeg", "foto.jpg");
    expect(fake.stored).toBe(true);
    if (!fake.stored) return;
    expect(fake.registered).toEqual({ ok: false, error: expect.stringContaining("inhoud") });
    expect(await objectExists(fake.path)).toBe(false);
  });

  it("never stores under another customer or another customer's request, nor through a crafted path", async () => {
    for (const path of [
      pathFor(ids.beta, req.beta),
      pathFor(ids.alfa, req.beta),
      `${ids.alfa}/${req.alfa}/../${req.beta}/${crypto.randomUUID()}`,
      `${ids.alfa}/${req.alfa}/foto.jpg`,
      `${ids.alfa}/${req.alfa}/${crypto.randomUUID()}/extra`,
    ]) {
      const result = await upload(clients.alfa, path, jpeg(), "image/jpeg");
      expect(result.error, path).not.toBeNull();
    }
    /* Nor registers an object of one request under another. */
    const path = await slot(clients.alfa, ids.alfa, req.alfa);
    await upload(clients.alfa, path, jpeg(), "image/jpeg");
    const other = await newRequest(clients.alfa, ids.alfa);
    const wrong = await service.rpc("service_register_request_attachment", { p_user_id: ids.alfaUser, p_customer_id: ids.alfa, p_request_id: other, p_storage_path: path, p_file_name: "x.jpg", p_mime_type: "image/jpeg" });
    expect(wrong.error?.message).toBe("invalid:path");
    const foreign = await service.rpc("service_register_request_attachment", { p_user_id: ids.betaUser, p_customer_id: ids.beta, p_request_id: req.beta, p_storage_path: path, p_file_name: "x.jpg", p_mime_type: "image/jpeg" });
    expect(foreign.error?.message).toBe("invalid:path");
    await clients.alfa.storage.from(bucket).remove([path]);
  });

  it("survives a registration that fails after the upload, and a retry registers it", async () => {
    /* Earlier runs on this local stack leave orphans behind; clear them, so this one is within the function's 500. */
    for (let round = 0; round < 20; round += 1) {
      const { data: left } = await service.rpc("request_attachment_orphans", { p_before: new Date(Date.now() + 60_000).toISOString() });
      if (!left?.length) break;
      await service.storage.from(bucket).remove(left.map((row) => row.name));
    }
    const path = await slot(clients.alfa, ids.alfa, req.alfa);
    expect((await upload(clients.alfa, path, png(), "image/png")).error).toBeNull();
    const failed = await service.rpc("service_register_request_attachment", { p_user_id: ids.alfaUser, p_customer_id: ids.alfa, p_request_id: req.alfa, p_storage_path: path, p_file_name: "plaatje.png", p_mime_type: "image/jpeg" });
    expect(failed.error?.message).toBe("invalid:type");
    expect(await objectExists(path)).toBe(true);
    /* An orphan for the daily pass, until it is registered. */
    const orphans = await service.rpc("request_attachment_orphans", { p_before: new Date(Date.now() + 60_000).toISOString() });
    expect(orphans.data!.map((row) => row.name)).toContain(path);

    visitor = clients.alfa;
    const retried = await registerAttachmentAction({ customerId: ids.alfa, requestId: req.alfa, storagePath: path, fileName: "plaatje.png", mimeType: "image/png" });
    expect(retried.ok).toBe(true);
    const again = await service.rpc("service_register_request_attachment", { p_user_id: ids.alfaUser, p_customer_id: ids.alfa, p_request_id: req.alfa, p_storage_path: path, p_file_name: "plaatje.png", p_mime_type: "image/png" });
    expect(again.data?.[0]?.registered).toBe(false);
    const after = await service.rpc("request_attachment_orphans", { p_before: new Date(Date.now() + 60_000).toISOString() });
    expect(after.data!.map((row) => row.name)).not.toContain(path);
    /* The system client cannot be told to list them by a member. */
    const asMember = await clients.alfa.rpc("request_attachment_orphans", { p_before: new Date().toISOString() });
    expect(asMember.error).not.toBeNull();
  });

  it("keeps a name with unicode, spaces and slashes for display only, and serves it safely", async () => {
    const result = await attach(clients.alfa, ids.alfa, req.alfa, pdf(), "application/pdf", "offer/te ..\\ 🚀 überprüfung.pdf");
    expect(result.stored && result.registered.ok).toBe(true);
    const request = await readPortalRequest(ids.alfa, req.alfa);
    const stored = request.attachments.find((item) => item.fileName.includes("überprüfung"))!;
    expect(stored.fileName).toBe("offer_te .._ 🚀 überprüfung.pdf");
    const { data: row } = await service.from("customer_request_attachments").select("storage_path").eq("id", stored.id).single();
    expect(row!.storage_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
    const header = contentDisposition(stored.fileName, false);
    expect(header).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''\S+$/);
    expect(header).not.toMatch(/[\r\n]/);
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1]!)).toBe(stored.fileName);
  });

  it("stops at ten files, also when the last two arrive at once", async () => {
    const target = await newRequest(clients.alfa, ids.alfa);
    req.full = target;
    for (let index = 0; index < 8; index += 1) {
      const item = await attach(clients.alfa, ids.alfa, target, jpeg(), "image/jpeg", `foto-${index}.jpg`);
      expect(item.stored && item.registered.ok).toBe(true);
    }
    const ninth = await slot(clients.alfa, ids.alfa, target);
    const tenth = await slot(clients.alfa, ids.alfa, target);
    await Promise.all([upload(clients.alfa, ninth, jpeg(), "image/jpeg"), upload(clients.alfa, tenth, jpeg(), "image/jpeg")]);
    const extra = await slot(clients.alfa, ids.alfa, target);
    expect((await upload(clients.alfa, extra, jpeg(), "image/jpeg")).error).toBeNull();
    const results = await Promise.all(
      [ninth, tenth, extra].map((path) =>
        service.rpc("service_register_request_attachment", { p_user_id: ids.alfaUser, p_customer_id: ids.alfa, p_request_id: target, p_storage_path: path, p_file_name: "f.jpg", p_mime_type: "image/jpeg" }),
      ),
    );
    expect(results.filter((result) => !result.error).length).toBe(2);
    expect(results.filter((result) => result.error?.message === "invalid:limit").length).toBe(1);
    expect(await count("customer_request_attachments", "request_id", target)).toBe(10);
    /* The eleventh cannot even get a slot now, and a path without one is refused. */
    const eleventh = await clients.alfa.rpc("portal_reserve_request_upload", { p_customer_id: ids.alfa, p_request_id: target });
    expect(eleventh.error?.message).toBe("invalid:limit");
    expect((await upload(clients.alfa, pathFor(ids.alfa, target), jpeg(), "image/jpeg")).error).not.toBeNull();
    const detail = await readPortalRequest(ids.alfa, target);
    expect(detail.acceptsAttachments).toBe(false);
  });

  it("lets the owner download, and nobody else -- not another customer, not anon, not a revoked member", async () => {
    const request = await readPortalRequest(ids.alfa, req.alfa);
    const attachment = request.attachments.find((item) => item.fileName === "foto.jpg")!;
    visitor = clients.alfa;
    const file = await readRequestAttachment({ customerId: ids.alfa }, attachment.id);
    expect(new Uint8Array(file.bytes).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));

    const { data: row } = await service.from("customer_request_attachments").select("storage_path").eq("id", attachment.id).single();
    for (const [label, client] of [["beta", clients.beta], ["anon", clients.anon]] as const) {
      const { data } = await client.storage.from(bucket).download(row!.storage_path);
      expect(data, label).toBeNull();
    }
    const viaRpc = await clients.beta.rpc("portal_request_attachment", { p_customer_id: ids.beta, p_attachment_id: attachment.id });
    expect(viaRpc.error?.code).toBe("42501");
    const list = await clients.beta.storage.from(bucket).list(ids.alfa, { limit: 100 });
    expect(list.data ?? []).toEqual([]);

    /* Through the route: the PDF for the owner, the same 404 for everyone else. */
    visitor = clients.alfa;
    const ok = await attachmentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ attachmentId: attachment.id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain('attachment; filename="foto.jpg"');
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    visitor = clients.beta;
    expect((await attachmentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ attachmentId: attachment.id }) })).status).toBe(404);

    await service.from("customer_users").update({ revoked_at: new Date().toISOString() }).eq("id", ids.alfaMembership);
    const revoked = await clients.alfa.storage.from(bucket).download(row!.storage_path);
    expect(revoked.data).toBeNull();
    const upload11 = await upload(clients.alfa, pathFor(ids.alfa, req.alfa), jpeg(), "image/jpeg");
    expect(upload11.error).not.toBeNull();
    await service.from("customer_users").update({ revoked_at: null }).eq("id", ids.alfaMembership);
  });
});

describe.runIf(local)("what the reviewer tried", () => {
  it("never stores a name whose extension is not the checked type's", async () => {
    const path = await slot(clients.beta, ids.beta, req.beta);
    expect((await upload(clients.beta, path, png(), "image/png")).error).toBeNull();
    const direct = await service.rpc("service_register_request_attachment", {
      p_user_id: ids.betaUser, p_customer_id: ids.beta, p_request_id: req.beta, p_storage_path: path, p_file_name: "Offerte akkoord.html", p_mime_type: "image/png",
    });
    expect(direct.error).toBeNull();
    const { data } = await service.from("customer_request_attachments").select("file_name").eq("id", direct.data![0]!.attachment_id).single();
    expect(data!.file_name).toBe("Offerte akkoord.png");
    for (const [given, expected] of [["setup.exe", "setup.png"], [".htaccess", "bijlage.png"], ["zonder punt", "zonder punt.png"]] as const) {
      const next = await slot(clients.beta, ids.beta, req.beta);
      await upload(clients.beta, next, png(), "image/png");
      const result = await service.rpc("service_register_request_attachment", { p_user_id: ids.betaUser, p_customer_id: ids.beta, p_request_id: req.beta, p_storage_path: next, p_file_name: given, p_mime_type: "image/png" });
      const { data: row } = await service.from("customer_request_attachments").select("file_name").eq("id", result.data![0]!.attachment_id).single();
      expect(row!.file_name, given).toBe(expected);
    }
  });

  it("stops unregistered uploads from piling up under one request", async () => {
    const target = await newRequest(clients.beta, ids.beta);
    const results = [];
    for (let index = 0; index < 21; index += 1) results.push(await clients.beta.rpc("portal_reserve_request_upload", { p_customer_id: ids.beta, p_request_id: target }));
    expect(results.filter((result) => !result.error).length).toBe(20);
    expect(results.at(-1)!.error?.message).toBe("invalid:uploads");
    /* And a path nobody reserved is refused by the bucket. */
    expect((await upload(clients.beta, pathFor(ids.beta, target), jpeg(), "image/jpeg")).error).not.toBeNull();
  });

  it("brakes request creation in the database itself, whatever path the call takes", async () => {
    const { count: existing } = await service.from("customer_requests").select("id", { count: "exact", head: true }).eq("customer_id", ids.beta).gt("created_at", new Date(Date.now() - 3600_000).toISOString());
    for (let index = existing ?? 0; index < 20; index += 1) expect((await rpcCreate(clients.beta, ids.beta)).error).toBeNull();
    const over = await rpcCreate(clients.beta, ids.beta);
    expect(over.error?.message).toBe("invalid:rate");
    /* Through the form too, in the customer's words. */
    visitor = clients.beta;
    const viaForm = await createRequestAction({ status: "idle" }, form(ids.beta, crypto.randomUUID()));
    expect(viaForm.status).toBe("error");
    /* Another customer is not held back by it. */
    const alfaCount = await service.from("customer_requests").select("id", { count: "exact", head: true }).eq("customer_id", ids.alfa).gt("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((alfaCount.count ?? 0) < 20) expect((await rpcCreate(clients.alfa, ids.alfa)).error).toBeNull();
    /* A retry of a submission that already exists is not a new request, and still answers. */
    const known = await service.from("customer_requests").select("submission_id").eq("id", req.beta).single();
    const retry = await rpcCreate(clients.beta, ids.beta, known.data!.submission_id);
    expect(retry.data?.[0]).toEqual({ request_id: req.beta, created: false });
  });

  it("holds a member to the form's own brake as well, without blocking a retry of the same submit", async () => {
    const gamma = await createCustomer("Gamma");
    const user = await createUser("gamma");
    await service.from("customer_users").insert({ user_id: user.id, customer_id: gamma, invited_email: user.email });
    const client = await signedIn(user.email);
    jar.clear();
    visitor = client;
    const outcomes = [];
    for (let index = 0; index < 11; index += 1) outcomes.push(await createRequestAction({ status: "idle" }, form(gamma, crypto.randomUUID())));
    expect(outcomes.slice(0, 10).every((outcome) => outcome.status === "created")).toBe(true);
    expect(outcomes[10]).toEqual({ status: "error", message: expect.stringContaining("Wacht een minuut") });
    expect(await count("customer_requests", "customer_id", gamma)).toBe(10);
    await service.auth.admin.deleteUser(user.id);
  });

  it("announces a request exactly once, also when the first attempt died before the mail", async () => {
    const submission = crypto.randomUUID();
    /* The first attempt: the request is made, the process dies before mailing. */
    expect((await rpcCreate(clients.alfa, ids.alfa, submission)).error).toBeNull();
    deliverEmail.mockClear();
    visitor = clients.alfa;
    const retry = await createRequestAction({ status: "idle" }, form(ids.alfa, submission));
    expect(retry.status).toBe("created");
    expect(deliverEmail).toHaveBeenCalledTimes(2);
    await createRequestAction({ status: "idle" }, form(ids.alfa, submission));
    expect(deliverEmail).toHaveBeenCalledTimes(2);
  });
});

describe.runIf(local)("the announcement lease", () => {
  it("lets one of two simultaneous retries send, the other nothing", async () => {
    const id = await newRequest(clients.alfa, ids.alfa);
    deliverEmail.mockClear();
    const [a, b] = await Promise.all([announceRequestOn(service, ids.alfa, id), announceRequestOn(service, ids.alfa, id)]);
    expect([a.state, b.state].sort()).toEqual(["sent", "skipped"]);
    /* One confirmation, one internal notice. */
    expect(deliverEmail).toHaveBeenCalledTimes(2);
    expect((await announcement(id)).announce_attempts).toBe(1);
  });

  it("does not send while another sender holds the lease, and takes over a lease left behind", async () => {
    const id = await newRequest(clients.alfa, ids.alfa);
    /* A sender claimed, then died before mailing. */
    await service.from("customer_requests").update({ announce_claimed_at: new Date().toISOString() }).eq("id", id);
    deliverEmail.mockClear();
    expect((await announceRequestOn(service, ids.alfa, id)).state).toBe("skipped");
    expect(deliverEmail).not.toHaveBeenCalled();

    await service.from("customer_requests").update({ announce_claimed_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("id", id);
    expect((await announceRequestOn(service, ids.alfa, id)).state).toBe("sent");
    expect(await announcement(id)).toMatchObject({ announce_claimed_at: null, announce_attempts: 1 });
    expect((await announcement(id)).announced_at).not.toBeNull();
    expect((await announceRequestOn(service, ids.alfa, id)).state).toBe("skipped");
  });

  it("gives the lease back when the mail fails, so the admin can send it later -- once", async () => {
    const id = await newRequest(clients.alfa, ids.alfa);
    deliverEmail.mockClear();
    deliverEmail.mockResolvedValueOnce({ sent: false, reason: "Resend down", failure: "error" });
    expect((await announceRequestOn(service, ids.alfa, id)).state).toBe("failed");
    expect(await announcement(id)).toEqual({ announced_at: null, announce_claimed_at: null, announce_attempts: 1 });

    expect(await retryRequestAnnouncement(id)).toEqual({ ok: true, value: "sent" });
    expect(await retryRequestAnnouncement(id)).toEqual({ ok: true, value: "skipped" });
    const detail = await getRequest(id);
    expect(detail?.announcedAt).toBeDefined();
    expect(detail?.announceAttempts).toBe(2);
    /* The request itself was never touched by any of it. */
    expect(detail?.status).toBe("submitted");
  });

  it("is not something a member can set", async () => {
    const id = await newRequest(clients.alfa, ids.alfa);
    const forged = await clients.alfa.from("customer_requests").update({ announced_at: new Date().toISOString() }).eq("id", id).select("id");
    expect(forged.data ?? []).toEqual([]);
    expect((await announcement(id)).announced_at).toBeNull();
  });
});

describe.runIf(local)("after the final review", () => {
  it("lets no member read, sign or delete an object -- not even their own", async () => {
    const path = pathFor(ids.alfa, req.alfa);
    const target = await newRequest(clients.alfa, ids.alfa);
    const own = await slot(clients.alfa, ids.alfa, target);
    expect((await upload(clients.alfa, own, jpeg(), "image/jpeg")).error).toBeNull();
    void path;
    const signed = await clients.alfa.storage.from(bucket).createSignedUrl(own, 3600);
    expect(signed.data).toBeNull();
    const read = await clients.alfa.storage.from(bucket).download(own);
    expect(read.data).toBeNull();
    await clients.alfa.storage.from(bucket).remove([own]);
    expect(await objectExists(own)).toBe(true);
    const listed = await clients.alfa.storage.from(bucket).list(`${ids.alfa}/${target}`);
    expect(listed.data ?? []).toEqual([]);
  });

  it("registers only through the server, for a member of that customer", async () => {
    const target = await newRequest(clients.alfa, ids.alfa);
    const path = await slot(clients.alfa, ids.alfa, target);
    await upload(clients.alfa, path, new TextEncoder().encode("<html><script>alert(1)</script></html>"), "image/png");
    const direct = await clients.alfa.rpc("portal_register_request_attachment", { p_customer_id: ids.alfa, p_request_id: target, p_storage_path: path, p_file_name: "x.png", p_mime_type: "image/png" });
    expect(direct.error).not.toBeNull();
    const asMember = await clients.alfa.rpc("service_register_request_attachment", { p_user_id: ids.alfaUser, p_customer_id: ids.alfa, p_request_id: target, p_storage_path: path, p_file_name: "x.png", p_mime_type: "image/png" });
    expect(asMember.error).not.toBeNull();
    const wrongMember = await service.rpc("service_register_request_attachment", { p_user_id: ids.betaUser, p_customer_id: ids.alfa, p_request_id: target, p_storage_path: path, p_file_name: "x.png", p_mime_type: "image/png" });
    expect(wrongMember.error?.code).toBe("42501");
    /* Through the server, the bytes are read and the file refused. */
    visitor = clients.alfa;
    const viaServer = await registerAttachmentAction({ customerId: ids.alfa, requestId: target, storagePath: path, fileName: "x.png", mimeType: "image/png" });
    expect(viaServer).toEqual({ ok: false, error: expect.stringContaining("inhoud") });
    expect(await count("customer_request_attachments", "request_id", target)).toBe(0);
    expect(await objectExists(path)).toBe(false);
  });

  it("holds the object caps when uploads arrive all at once", async () => {
    const target = await newRequest(clients.alfa, ids.alfa);
    const slots = await Promise.all(Array.from({ length: 30 }, () => clients.alfa.rpc("portal_reserve_request_upload", { p_customer_id: ids.alfa, p_request_id: target })));
    const granted = slots.filter((result) => !result.error).map((result) => result.data![0]!.storage_path);
    expect(granted.length).toBe(20);
    expect(slots.filter((result) => result.error?.message === "invalid:uploads").length).toBe(10);
    const uploads = await Promise.all([...granted, pathFor(ids.alfa, target), pathFor(ids.alfa, target)].map((path) => upload(clients.alfa, path, jpeg(), "image/jpeg")));
    expect(uploads.filter((result) => !result.error).length).toBe(20);
    /* One slot, one object: a second upload to a used slot is refused. */
    expect((await upload(clients.alfa, granted[0]!, jpeg(), "image/jpeg")).error).not.toBeNull();
  });

  it("holds the creation brake when requests arrive all at once", async () => {
    const delta = await createCustomer("Delta");
    const user = await createUser("delta");
    await service.from("customer_users").insert({ user_id: user.id, customer_id: delta, invited_email: user.email });
    const client = await signedIn(user.email);
    const results = await Promise.all(Array.from({ length: 30 }, () => rpcCreate(client, delta)));
    expect(results.filter((result) => !result.error).length).toBe(20);
    expect(results.filter((result) => result.error?.message === "invalid:rate").length).toBe(10);
    expect(await count("customer_requests", "customer_id", delta)).toBe(20);
    await service.auth.admin.deleteUser(user.id);
  });

  it("retries a failed internal notice on its own, without a second confirmation", async () => {
    const id = await newRequest(clients.alfa, ids.alfa);
    deliverEmail.mockClear();
    /* The confirmation goes, the internal notice fails. */
    deliverEmail.mockResolvedValueOnce({ sent: true, sentAt: new Date().toISOString(), messageId: "ok" }).mockResolvedValueOnce({ sent: false, reason: "down", failure: "error" });
    expect((await announceRequestOn(service, ids.alfa, id)).state).toBe("sent");
    expect((await announcement(id)).announced_at).not.toBeNull();
    expect(await internalNotified(id)).toBeNull();

    deliverEmail.mockClear();
    expect((await announceRequestOn(service, ids.alfa, id)).state).toBe("sent");
    expect(deliverEmail).toHaveBeenCalledTimes(1);
    expect((deliverEmail.mock.calls[0]![0] as { to: string }).to).toBe("intern@ymcreations.test");
    expect(await internalNotified(id)).not.toBeNull();
    expect((await announceRequestOn(service, ids.alfa, id)).state).toBe("skipped");
  });

  it("strips direction-control characters from a name", async () => {
    const target = await newRequest(clients.alfa, ids.alfa);
    const result = await attach(clients.alfa, ids.alfa, target, jpeg(), "image/jpeg", "foto\u202Egpj.exe");
    expect(result.stored && result.registered.ok).toBe(true);
    const [stored] = (await readPortalRequest(ids.alfa, target)).attachments;
    expect(stored!.fileName).toBe("fotogpj.jpg");
  });
});

describe.runIf(local)("file names", () => {
  it("never end in an extension other than the checked type's", async () => {
    const target = await newRequest(clients.alfa, ids.alfa);
    const cases: [Uint8Array, string, string, string][] = [
      [jpeg(), "image/jpeg", "test.html", "test.jpg"],
      [jpeg(), "image/jpeg", "foto.jpg.html", "foto.jpg.jpg"],
      [jpeg(), "image/jpeg", "rapport.pdf.exe", "rapport.pdf.jpg"],
      [png(), "image/png", "map/sub\\bestand.png", "map_sub_bestand.png"],
      [pdf(), "application/pdf", "  Offerte één — 2026 .PDF ", "Offerte één — 2026.pdf"],
    ];
    for (const [bytes, mime, given] of cases) {
      const result = await attach(clients.alfa, ids.alfa, target, bytes, mime, given);
      expect(result.stored && result.registered.ok, given).toBe(true);
    }
    const names = (await readPortalRequest(ids.alfa, target)).attachments.map((item) => item.fileName);
    expect(names).toEqual(cases.map(([, , , expected]) => expected));

    /* A type the bytes do not carry is refused, whatever the name says. */
    const mismatch = await attach(clients.alfa, ids.alfa, target, pdf(), "image/jpeg", "scan.jpg");
    expect(mismatch.stored && mismatch.registered.ok).toBe(false);

    /* And the download carries the safe name and extension. */
    const html = (await readPortalRequest(ids.alfa, target)).attachments.find((item) => item.fileName === "test.jpg")!;
    visitor = clients.alfa;
    const response = await attachmentRoute(new Request("http://localhost/x"), { params: Promise.resolve({ attachmentId: html.id }) });
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="test.jpg"; filename*=UTF-8''test.jpg`);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });
});

describe.runIf(local)("the age of an upload", () => {
  it("registers fresh and at 22h59, refuses past 23 hours, and the daily pass removes what is old and unregistered only", async () => {
    const target = await newRequest(clients.alfa, ids.alfa);
    const register = (path: string) =>
      service.rpc("service_register_request_attachment", { p_user_id: ids.alfaUser, p_customer_id: ids.alfa, p_request_id: target, p_storage_path: path, p_file_name: "f.jpg", p_mime_type: "image/jpeg" });

    const fresh = await slot(clients.alfa, ids.alfa, target);
    await upload(clients.alfa, fresh, jpeg(), "image/jpeg");
    expect((await register(fresh)).error).toBeNull();

    const almost = await slot(clients.alfa, ids.alfa, target);
    await upload(clients.alfa, almost, jpeg(), "image/jpeg");
    backdateObject(almost, "22 hours 59 minutes");
    expect((await register(almost)).error).toBeNull();

    const late = await slot(clients.alfa, ids.alfa, target);
    await upload(clients.alfa, late, jpeg(), "image/jpeg");
    backdateObject(late, "23 hours 1 minute");
    expect((await register(late)).error?.message).toBe("invalid:missing");

    const old = await slot(clients.alfa, ids.alfa, target);
    await upload(clients.alfa, old, jpeg(), "image/jpeg");
    backdateObject(old, "25 hours");
    const recent = await slot(clients.alfa, ids.alfa, target);
    await upload(clients.alfa, recent, jpeg(), "image/jpeg");
    /* A registered object that is old is never an orphan. */
    backdateObject(fresh, "30 hours");

    const real = createRetentionStore(service);
    const onlyUploads = {
      ...real,
      convertedSources: async () => ({ inquiryIds: new Set<string>(), leadIds: new Set<string>() }),
      inquiryCandidates: async () => [],
      leadCandidates: async () => [],
      communicationCandidates: async () => [],
      countAnalyticsFacts: async () => 0,
      deleteAnalyticsFacts: async () => 0,
    };
    await runRetention(onlyUploads, { apply: true });
    expect(await objectExists(old)).toBe(false);
    expect(await objectExists(late)).toBe(true);
    expect(await objectExists(recent)).toBe(true);
    expect(await objectExists(fresh)).toBe(true);
    expect(await objectExists(almost)).toBe(true);
  });
});

describe.runIf(local)("the admin", () => {
  beforeEach(() => {
    visitor = clients.alfa;
  });
  it("changes the status: an event is recorded and the customer is told; a failed mail leaves the status changed", async () => {
    deliverEmail.mockClear();
    const changed = await setRequestStatus(req.alfa, "in_review");
    expect(changed).toEqual({ ok: true, value: { changed: true, mail: { sent: true } } });
    deliverEmail.mockResolvedValueOnce({ sent: false, reason: "Resend down", failure: "error" });
    const second = await setRequestStatus(req.alfa, "awaiting_customer");
    expect(second.ok && second.value.mail?.sent).toBe(false);
    expect((await readPortalRequest(ids.alfa, req.alfa)).status).toBe("awaiting_customer");
    const { data: events } = await service.from("customer_request_status_events").select("from_status, to_status").eq("request_id", req.alfa).order("changed_at");
    expect(events!.map((event) => `${event.from_status}>${event.to_status}`)).toEqual(["null>submitted", "submitted>in_review", "in_review>awaiting_customer"]);
    expect(await setRequestStatus(req.alfa, "awaiting_customer")).toEqual({ ok: true, value: { changed: false } });
    const detail = await getRequest(req.alfa);
    expect(detail?.events).toHaveLength(3);
    expect(detail?.attachments.length).toBeGreaterThan(2);
  });

  it("is the only one who can: a member cannot move a status, edit a request or write its trail", async () => {
    const update = await clients.alfa.from("customer_requests").update({ status: "completed" }).eq("id", req.alfa).select("id");
    expect(update.data ?? []).toEqual([]);
    const event = await clients.alfa.from("customer_request_status_events").insert({ request_id: req.alfa, customer_id: ids.alfa, to_status: "completed" }).select("id");
    expect(event.error).not.toBeNull();
    expect((await readPortalRequest(ids.alfa, req.alfa)).status).toBe("awaiting_customer");
    /* Not even the admin can rewrite what the customer wrote. */
    const rewrite = await admin.from("customer_requests").update({ description: "rewritten" } as never).eq("id", req.alfa).select("id");
    expect(rewrite.error).not.toBeNull();
  });

  it("links the same customer's project and quote, and the database refuses another customer's", async () => {
    expect(await linkRequest(req.alfa, { projectId: ids.betaProject, quoteId: null })).toEqual({ ok: false, error: expect.stringContaining("hoort niet bij de klant") });
    expect(await linkRequest(req.alfa, { projectId: null, quoteId: ids.betaQuote })).toEqual({ ok: false, error: expect.stringContaining("hoort niet bij de klant") });
    const direct = await admin.from("customer_requests").update({ quote_id: ids.betaQuote }).eq("id", req.alfa).select("id");
    expect(direct.error?.code).toBe("23503");
    expect(await linkRequest(req.alfa, { projectId: ids.alfaProject, quoteId: ids.alfaDraftQuote })).toEqual({ ok: true });
  });

  it("does not let a concept quote reach the customer through the request; once sent, it does", async () => {
    let request = await readPortalRequest(ids.alfa, req.alfa);
    expect(request.quote).toBeUndefined();
    const listed = await clients.alfa.rpc("portal_requests", { p_customer_id: ids.alfa });
    expect(JSON.stringify(listed.data)).not.toContain(ids.alfaDraftQuote);
    expect(JSON.stringify(listed.data)).not.toContain("INTERNAL");

    const sent = await sendQuoteToCustomer(ids.alfaDraftQuote);
    expect(sent.ok).toBe(true);
    request = await readPortalRequest(ids.alfa, req.alfa);
    expect(request.quote?.id).toBe(ids.alfaDraftQuote);
    /* The project stays internal. */
    expect(JSON.stringify(request)).not.toMatch(/project|Alfa website/i);
  });

  it("keeps completed and declined requests readable, and closed to new files", async () => {
    expect((await setRequestStatus(req.alfa, "completed")).ok).toBe(true);
    const done = await readPortalRequest(ids.alfa, req.alfa);
    expect(done).toMatchObject({ status: "completed", acceptsAttachments: false });
    expect(done.attachments.length).toBeGreaterThan(0);
    expect((await upload(clients.alfa, pathFor(ids.alfa, req.alfa), jpeg(), "image/jpeg")).error).not.toBeNull();

    expect((await setRequestStatus(req.beta, "declined")).ok).toBe(true);
    visitor = clients.beta;
    expect((await readPortalRequests(ids.beta)).find((item) => item.id === req.beta)?.status).toBe("declined");
  });
});

describe.runIf(local)("the definitions in the database", () => {
  it("lets anon execute none of the request functions and read none of the tables", async () => {
    for (const fn of ["portal_create_request", "portal_requests", "portal_request", "portal_register_request_attachment", "portal_request_attachment", "request_attachment_orphans"] as const) {
      const result = await clients.anon.rpc(fn as never, {} as never);
      expect(result.error, fn).not.toBeNull();
    }
    for (const table of ["customer_requests", "customer_request_attachments", "customer_request_status_events"] as const) {
      const { data } = await clients.anon.from(table).select("id").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
    const { data: bucketRow } = await service.storage.getBucket(bucket);
    expect(bucketRow).toMatchObject({ public: false, file_size_limit: 15728640 });
    expect([...(bucketRow!.allowed_mime_types ?? [])].sort()).toEqual(["application/pdf", "image/heic", "image/heif", "image/jpeg", "image/png", "image/webp"]);
  });
});

describe.runIf(local)("after the second review", () => {
  /* A customer of its own: the earlier tests used up Alfa's twenty requests for this hour. */
  const eps = { id: "", user: "", email: "" };
  let epsilon: Db;
  beforeAll(async () => {
    eps.id = await createCustomer("Epsilon");
    const user = await createUser("epsilon");
    eps.user = user.id;
    eps.email = user.email;
    await service.from("customer_users").insert({ user_id: user.id, customer_id: eps.id, invited_email: user.email });
    epsilon = await signedIn(user.email);
  });
  afterAll(async () => {
    if (eps.user) await service.auth.admin.deleteUser(eps.user);
  });

  it("takes one object per slot: a slot whose upload was refused cannot be filled again", async () => {
    const target = await newRequest(epsilon, eps.id);
    const path = await slot(epsilon, eps.id, target);
    expect((await upload(epsilon, path, new TextEncoder().encode("geen jpeg"), "image/jpeg")).error).toBeNull();
    visitor = epsilon;
    const refused = await registerAttachmentAction({ customerId: eps.id, requestId: target, storagePath: path, fileName: "x.jpg", mimeType: "image/jpeg" });
    expect(refused.ok).toBe(false);
    expect(await objectExists(path)).toBe(false);
    /* The path is free in the bucket again, but the slot is spent. */
    expect((await upload(epsilon, path, jpeg(), "image/jpeg")).error).not.toBeNull();
    /* A registered slot is spent as well; registering it again only returns the first. */
    const good = await attach(epsilon, eps.id, target, jpeg(), "image/jpeg", "goed.jpg");
    expect(good.stored && good.registered.ok).toBe(true);
    const { data: spent } = await service.from("customer_request_upload_slots").select("consumed_at").eq("storage_path", good.path).single();
    expect(spent!.consumed_at).not.toBeNull();
  });

  it("removes a refused upload only when no registration holds it, and registers nothing at a given-up slot", async () => {
    const target = await newRequest(epsilon, eps.id);
    const kept = await attach(epsilon, eps.id, target, png(), "image/png", "a.png");
    expect(kept.stored && kept.registered.ok).toBe(true);
    /* Giving up a registered path consumes nothing new and says: keep it. */
    const release = await service.rpc("service_release_request_upload", { p_customer_id: eps.id, p_storage_path: kept.path });
    expect(release.data).toBe(false);
    expect(await objectExists(kept.path)).toBe(true);

    /* Given up first: a registration of the same path that comes after is refused. */
    const path = await slot(epsilon, eps.id, target);
    expect((await upload(epsilon, path, png(), "image/png")).error).toBeNull();
    expect((await service.rpc("service_release_request_upload", { p_customer_id: eps.id, p_storage_path: path })).data).toBe(true);
    const late = await service.rpc("service_register_request_attachment", { p_user_id: eps.user, p_customer_id: eps.id, p_request_id: target, p_storage_path: path, p_file_name: "b.png", p_mime_type: "image/png" });
    expect(late.error?.message).toBe("invalid:path");
    /* Another customer cannot give up this customer's slot. */
    const other = await slot(epsilon, eps.id, target);
    await service.rpc("service_release_request_upload", { p_customer_id: ids.beta, p_storage_path: other });
    const { data: untouched } = await service.from("customer_request_upload_slots").select("consumed_at").eq("storage_path", other).single();
    expect(untouched!.consumed_at).toBeNull();
    /* And no member can call it. */
    expect((await epsilon.rpc("service_release_request_upload", { p_customer_id: eps.id, p_storage_path: other })).error).not.toBeNull();
  });

  it("never removes a registered file, whatever a later call on its path claims", async () => {
    const target = await newRequest(epsilon, eps.id);
    const kept = await attach(epsilon, eps.id, target, png(), "image/png", "a.png");
    expect(kept.stored && kept.registered.ok).toBe(true);
    visitor = epsilon;
    const crafted = await registerAttachmentAction({ customerId: eps.id, requestId: target, storagePath: kept.path, fileName: "a.jpg", mimeType: "image/jpeg" });
    expect(crafted.ok).toBe(false);
    expect(await objectExists(kept.path)).toBe(true);
    expect(await count("customer_request_attachments", "request_id", target)).toBe(1);
  });

  it("announces, once a day, what the submit could not -- and nothing twice", async () => {
    /* Every earlier request of this local stack counts as announced, so the pass sees only these. */
    const stamp = new Date().toISOString();
    await service.from("customer_requests").update({ announced_at: stamp, internal_notified_at: stamp }).or("announced_at.is.null,internal_notified_at.is.null");

    const missed = await newRequest(epsilon, eps.id);
    const halfway = await newRequest(epsilon, eps.id);
    const fresh = await newRequest(epsilon, eps.id);
    const stale = await newRequest(epsilon, eps.id);
    const closed = await newRequest(epsilon, eps.id);
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    await service.from("customer_requests").update({ created_at: minutesAgo(20) }).eq("id", missed);
    await service.from("customer_requests").update({ created_at: minutesAgo(60), announced_at: stamp }).eq("id", halfway);
    await service.from("customer_requests").update({ created_at: minutesAgo(8 * 24 * 60) }).eq("id", stale);
    await service.from("customer_requests").update({ created_at: minutesAgo(30), status: "completed" }).eq("id", closed);

    deliverEmail.mockClear();
    const first = await announcePendingRequests(service);
    expect(first).toEqual({ considered: 2, sent: 2, failed: 0, skipped: 0 });
    /* The missed one: confirmation and notice; the halfway one: only its notice. */
    expect(deliverEmail).toHaveBeenCalledTimes(3);
    expect((await announcement(missed)).announced_at).not.toBeNull();
    expect(await internalNotified(halfway)).not.toBeNull();
    /* Too fresh (the submit's own attempt) and too old are left alone. */
    expect((await announcement(fresh)).announce_attempts).toBe(0);
    expect((await announcement(stale)).announce_attempts).toBe(0);
    /* And so is a request already closed. */
    expect((await announcement(closed)).announce_attempts).toBe(0);

    deliverEmail.mockClear();
    expect(await announcePendingRequests(service)).toEqual({ considered: 0, sent: 0, failed: 0, skipped: 0 });
    expect(deliverEmail).not.toHaveBeenCalled();
  });

  it("shows the admin which of the two mails is missing", async () => {
    const id = await newRequest(epsilon, eps.id);
    deliverEmail.mockResolvedValueOnce({ sent: true, sentAt: new Date().toISOString(), messageId: "ok" }).mockResolvedValueOnce({ sent: false, reason: "down", failure: "error" });
    await announceRequestOn(service, eps.id, id);
    const detail = await getRequest(id);
    expect(detail?.announcedAt).toBeDefined();
    expect(detail?.internalNotifiedAt).toBeUndefined();
    expect(await retryRequestAnnouncement(id)).toEqual({ ok: true, value: "sent" });
    expect((await getRequest(id))?.internalNotifiedAt).toBeDefined();
  });
});

