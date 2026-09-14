import { getMollieConfig, type MollieConfig } from "@/lib/mollie/config";

/**
 * The one place that talks to Mollie.
 *
 * Every request to the provider goes through here: no component, page or
 * unrelated server action builds its own. That is what keeps the provider
 * replaceable and the API key in a single module -- and it is why this file
 * has no React, no Supabase and no knowledge of invoices.
 *
 * Plain `fetch` against the REST API rather than a client library: the five
 * calls below are all this needs, and a dependency for that would earn
 * nothing.
 */
const API = "https://api.mollie.com/v2";

export class MollieError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`Mollie ${status}: ${detail}`);
    this.name = "MollieError";
    this.status = status;
    this.detail = detail;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  /** Makes a retried POST return the first result instead of creating a second resource. */
  idempotencyKey?: string;
  config?: MollieConfig;
};

async function request<T>({ method, path, body, idempotencyKey, config }: RequestOptions): Promise<T> {
  const resolved = config ?? getMollieConfig();

  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${resolved.apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : {};

  if (!response.ok) {
    // The key must never reach a log line, so only Mollie's own message goes on.
    const detail =
      typeof parsed === "object" && parsed !== null && "detail" in parsed && typeof parsed.detail === "string"
        ? parsed.detail
        : response.statusText;
    throw new MollieError(response.status, detail);
  }

  return parsed as T;
}

/** Cents to the decimal string Mollie expects: 1050 -> "10.50". */
export function mollieAmount(cents: number): { currency: "EUR"; value: string } {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(cents));
  return { currency: "EUR", value: `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}` };
}

/** Mollie's decimal string back to cents: "10.50" -> 1050. */
export function centsFromMollie(value: string): number {
  const [whole, fraction = "00"] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : 0;
}

export type MolliePaymentStatus =
  | "open"
  | "pending"
  | "authorized"
  | "paid"
  | "canceled"
  | "expired"
  | "failed";

export type MolliePayment = {
  id: string;
  status: MolliePaymentStatus;
  amount: { currency: string; value: string };
  description: string;
  method: string | null;
  paidAt?: string;
  customerId?: string;
  mandateId?: string;
  subscriptionId?: string;
  sequenceType?: "oneoff" | "first" | "recurring";
  metadata?: Record<string, unknown> | null;
  _links?: { checkout?: { href: string } };
};

/**
 * A payment link: a URL that stays valid until it is paid, which is what an
 * invoice mail needs. The checkout URL of a Payments-API payment is
 * short-lived, so a customer opening the mail a week later would find a dead
 * button.
 *
 * `sequenceType: "first"` establishes a mandate once the link is paid, and
 * `customerId` is what that mandate is attached to. The link itself carries no
 * metadata -- the API has no such field -- so which invoice a link belongs to
 * is recorded in our own database, never inferred from the link object.
 */
export type MolliePaymentLink = {
  id: string;
  description: string;
  amount?: { currency: string; value: string } | null;
  sequenceType?: "oneoff" | "first";
  customerId?: string | null;
  archived?: boolean;
  paidAt?: string | null;
  expiresAt?: string | null;
  _links?: { paymentLink?: { href: string } };
};

export type MollieCustomer = { id: string };

/**
 * A mandate is the customer's standing authorisation to collect. "valid" is
 * the only status that may be used; "pending" is still being verified and
 * "invalid" has been revoked or failed.
 */
export type MollieMandate = { id: string; status: "valid" | "pending" | "invalid"; method: string };
export type MollieSubscription = { id: string; status: string };

export type CreatePaymentInput = {
  amountCents: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  metadata: Record<string, string>;
  sequenceType?: "oneoff" | "first";
  customerId?: string;
  idempotencyKey: string;
  config?: MollieConfig;
};

export async function createPayment(input: CreatePaymentInput): Promise<MolliePayment> {
  return request<MolliePayment>({
    method: "POST",
    path: "/payments",
    idempotencyKey: input.idempotencyKey,
    config: input.config,
    body: {
      amount: mollieAmount(input.amountCents),
      description: input.description,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      metadata: input.metadata,
      ...(input.sequenceType ? { sequenceType: input.sequenceType } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
    },
  });
}

/**
 * The authoritative state of a payment. A webhook body is only a nudge; what
 * counts is what Mollie says when asked.
 */
export async function getPayment(id: string, config?: MollieConfig): Promise<MolliePayment> {
  return request<MolliePayment>({ method: "GET", path: `/payments/${encodeURIComponent(id)}`, config });
}

export type CreatePaymentLinkInput = {
  amountCents: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  sequenceType?: "oneoff" | "first";
  customerId?: string;
  idempotencyKey: string;
  config?: MollieConfig;
};

export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<MolliePaymentLink> {
  return request<MolliePaymentLink>({
    method: "POST",
    path: "/payment-links",
    idempotencyKey: input.idempotencyKey,
    config: input.config,
    body: {
      amount: mollieAmount(input.amountCents),
      description: input.description,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      // One customer, one payment: a link that could be paid twice would
      // settle an invoice twice.
      reusable: false,
      ...(input.sequenceType ? { sequenceType: input.sequenceType } : {}),
      // Only meaningful with "first"; the API says so and so does this.
      ...(input.sequenceType === "first" && input.customerId ? { customerId: input.customerId } : {}),
    },
  });
}

export async function getPaymentLink(id: string, config?: MollieConfig): Promise<MolliePaymentLink> {
  return request<MolliePaymentLink>({ method: "GET", path: `/payment-links/${encodeURIComponent(id)}`, config });
}

/**
 * The payments a link actually produced.
 *
 * This is the documented way to get at what a paid link really did -- the
 * payment, its status, and for a `first` link the mandate it established.
 * Nothing about the money or the mandate is read off the link object itself.
 */
export async function listPaymentLinkPayments(id: string, config?: MollieConfig): Promise<MolliePayment[]> {
  const response = await request<{ _embedded?: { payments?: MolliePayment[] } }>({
    method: "GET",
    path: `/payment-links/${encodeURIComponent(id)}/payments?limit=250`,
    config,
  });
  return response._embedded?.payments ?? [];
}

/** A link that can still be handed to a customer as a way to pay. */
export function payableLink(link: MolliePaymentLink): string | undefined {
  if (link.archived || link.paidAt) return undefined;
  if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) return undefined;
  return link._links?.paymentLink?.href;
}

export async function createCustomer(
  input: { name: string; email: string; idempotencyKey: string; config?: MollieConfig },
): Promise<MollieCustomer> {
  return request<MollieCustomer>({
    method: "POST",
    path: "/customers",
    idempotencyKey: input.idempotencyKey,
    config: input.config,
    body: { name: input.name, email: input.email },
  });
}

/**
 * The mandates Mollie holds for a customer. Asked for rather than assumed:
 * our own record of a mandate can be stale -- a customer can revoke one at
 * their bank -- and switching on a subscription against a dead mandate would
 * fail every month in silence.
 */
export async function listMandates(customerId: string, config?: MollieConfig): Promise<MollieMandate[]> {
  const response = await request<{ _embedded?: { mandates?: MollieMandate[] } }>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/mandates?limit=250`,
    config,
  });
  return response._embedded?.mandates ?? [];
}

/** The first mandate that may actually be collected against. */
export function usableMandate(mandates: readonly MollieMandate[]): MollieMandate | undefined {
  return mandates.find((mandate) => mandate.status === "valid");
}

export async function createSubscription(
  input: {
    customerId: string;
    amountCents: number;
    interval: string;
    description: string;
    webhookUrl: string;
    mandateId: string;
    startDate?: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
    config?: MollieConfig;
  },
): Promise<MollieSubscription> {
  return request<MollieSubscription>({
    method: "POST",
    path: `/customers/${encodeURIComponent(input.customerId)}/subscriptions`,
    idempotencyKey: input.idempotencyKey,
    config: input.config,
    body: {
      amount: mollieAmount(input.amountCents),
      interval: input.interval,
      description: input.description,
      webhookUrl: input.webhookUrl,
      mandateId: input.mandateId,
      metadata: input.metadata,
      ...(input.startDate ? { startDate: input.startDate } : {}),
    },
  });
}

// ----------------------------------------------------- read-only surface

/**
 * Reads, and only reads.
 *
 * `request` can send a POST or a DELETE, because creating payments is its
 * job. Some callers must provably never do that -- the live connection check
 * runs against a key that moves real money, and "it only calls GET endpoints"
 * has to be a property of the code rather than a promise in a comment. They
 * import from here instead, and the method is not theirs to choose.
 */
async function getResource<T>(path: string, config?: MollieConfig): Promise<T> {
  return request<T>({ method: "GET", path, config });
}

/**
 * The profile an API key belongs to. Field names and values are Mollie's own:
 * `mode` distinguishes the test account from the live one, `status` is the
 * verification state, and `review` is present while a change is being looked
 * at. See docs.mollie.com/reference/get-current-profile.
 */
export type MollieProfileStatus = "unverified" | "verified" | "blocked";

export type MollieProfile = {
  id: string;
  mode: "live" | "test";
  name: string;
  website?: string;
  status: MollieProfileStatus;
  review?: { status: "pending" | "rejected" } | null;
};

/** GET /v2/profiles/me — the profile the configured key authenticates as. */
export async function getCurrentProfile(config?: MollieConfig): Promise<MollieProfile> {
  return getResource<MollieProfile>("/profiles/me", config);
}

/**
 * A payment method as Mollie reports it. `status` is only returned by the
 * "all methods" endpoint; the enabled-methods list leaves it out, because
 * everything it returns is by definition usable.
 * See docs.mollie.com/reference/list-all-methods.
 */
export type MollieMethodStatus =
  | "activated"
  | "pending-boarding"
  | "pending-review"
  | "pending-external"
  | "rejected";

export type MollieMethod = {
  id: string;
  description: string;
  status?: MollieMethodStatus;
};

/** The sequence a method has to support, in Mollie's own vocabulary. */
export type MollieSequenceType = "oneoff" | "first" | "recurring";

/**
 * GET /v2/methods/all — every method Mollie offers, each with the activation
 * status for this profile. Deliberately this one rather than `/v2/methods`:
 * it is the only one that can tell "not activated" apart from "waiting for
 * review", which is the difference between a blocker and a delay. It is not
 * paginated.
 */
export async function listAllMethods(config?: MollieConfig): Promise<MollieMethod[]> {
  const response = await getResource<{ _embedded?: { methods?: MollieMethod[] } }>("/methods/all", config);
  return response._embedded?.methods ?? [];
}

/**
 * GET /v2/methods?sequenceType=… — the methods actually usable for one kind
 * of payment. Activation alone does not mean a method can carry a first
 * payment or a recurring collection, and those two are exactly what this
 * integration depends on.
 */
export async function listMethodsForSequence(
  sequenceType: MollieSequenceType,
  config?: MollieConfig,
): Promise<MollieMethod[]> {
  const response = await getResource<{ _embedded?: { methods?: MollieMethod[] } }>(
    `/methods?sequenceType=${encodeURIComponent(sequenceType)}`,
    config,
  );
  return response._embedded?.methods ?? [];
}

/** Mollie's payment states mapped onto ours; "authorized" is money promised, not moved. */
export function paymentStatusFromMollie(status: MolliePaymentStatus) {
  switch (status) {
    case "paid":
      return "paid" as const;
    case "failed":
      return "failed" as const;
    case "canceled":
      return "canceled" as const;
    case "expired":
      return "expired" as const;
    case "pending":
    case "authorized":
      return "pending" as const;
    case "open":
    default:
      return "open" as const;
  }
}
