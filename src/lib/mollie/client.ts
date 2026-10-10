import { getMollieConfig, type MollieConfig } from "@/lib/mollie/config";

/**
 * The one place that talks to Mollie.
 *
 * Every request to the provider goes through here: no component, page or
 * unrelated server action builds its own. That is what keeps the provider
 * replaceable and the API key in a single module -- and it is why this file
 * has no React, no Supabase and no knowledge of invoices.
 *
 * Plain `fetch` against the REST API rather than a client library: the dozen
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
  method: "GET" | "POST" | "PATCH" | "DELETE";
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
  createdAt?: string;
  paidAt?: string;
  canceledAt?: string;
  /**
   * "Whether the payment can be canceled. This parameter is omitted if the
   * payment reaches a final state." (get-payment reference). Only `true`
   * here is ever acted on.
   */
  isCancelable?: boolean;
  customerId?: string;
  mandateId?: string;
  subscriptionId?: string;
  sequenceType?: "oneoff" | "first" | "recurring";
  metadata?: Record<string, unknown> | null;
  /**
   * Method-specific details. For SEPA direct debit, `dueDate` is the
   * "Estimated date the payment is debited from the customer's bank
   * account" (extra-payment-parameters reference) -- the collection date a
   * subscription payment was created for.
   */
  details?: { dueDate?: string | null; [key: string]: unknown } | null;
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
/**
 * Mollie's five subscription states. Only `pending`, `active` and `suspended`
 * are a current subscription; `canceled` and `completed` are over, carry no
 * `nextPaymentDate`, and -- per the update reference -- cannot be updated.
 * See docs.mollie.com/reference/get-subscription.
 */
export type MollieSubscriptionStatus = "pending" | "active" | "canceled" | "suspended" | "completed";
export type MollieSubscription = {
  id: string;
  status: MollieSubscriptionStatus;
  amount?: { currency: string; value: string };
  startDate?: string;
  /** Read-only at Mollie; absent once the subscription is completed or canceled. */
  nextPaymentDate?: string;
  /** Absent while the subscription is not canceled. */
  canceledAt?: string;
  metadata?: Record<string, unknown> | null;
};

/** States in which Mollie will still create payments for a subscription. */
export function isCurrentSubscription(subscription: Pick<MollieSubscription, "status">): boolean {
  return subscription.status === "pending" || subscription.status === "active" || subscription.status === "suspended";
}

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
  /**
   * Required, and always sent. Mollie quietly defaults a link without one to
   * `oneoff`, so a caller that forgets it would lose a mandate without any
   * error -- which is exactly how a reminder once replaced a `first` link.
   */
  sequenceType: "oneoff" | "first";
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
      sequenceType: input.sequenceType,
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

/**
 * Closes a link so it can no longer be paid. `archived` is the documented way
 * to do that -- the API has no delete for payment links -- and it is what
 * stops a link we replaced from settling the same invoice a second time.
 * See docs.mollie.com/reference/update-payment-link.
 */
export async function archivePaymentLink(id: string, config?: MollieConfig): Promise<MolliePaymentLink> {
  return request<MolliePaymentLink>({
    method: "PATCH",
    path: `/payment-links/${encodeURIComponent(id)}`,
    body: { archived: true },
    config,
  });
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

/**
 * Where a customer stands, in Mollie's own three statuses plus "none":
 *
 *   valid     may be collected against.
 *   pending   exists but is still being verified -- typically the first
 *             payment is not final or its IBAN has not come through yet.
 *             Not usable; it may still become valid.
 *   invalid   every mandate there is has been revoked or failed.
 *   none      the customer has never authorised anything.
 *
 * Only "valid" makes a customer collectable. A paid first payment is not
 * proof of one: the mandate it produced can still be pending.
 */
export type MandateState = "valid" | "pending" | "invalid" | "none";

export function mandateState(
  mandates: readonly MollieMandate[],
): { state: MandateState; mandate?: MollieMandate } {
  const valid = usableMandate(mandates);
  if (valid) return { state: "valid", mandate: valid };
  const pending = mandates.find((mandate) => mandate.status === "pending");
  if (pending) return { state: "pending", mandate: pending };
  return { state: mandates.length > 0 ? "invalid" : "none" };
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

/**
 * A customer's subscriptions, as Mollie holds them. Read before creating one,
 * so a subscription that exists at Mollie but never made it into our database
 * is found and adopted instead of created a second time. A customer has a
 * handful at most; 250 is the API's own maximum page.
 */
export async function listSubscriptions(customerId: string, config?: MollieConfig): Promise<MollieSubscription[]> {
  const response = await request<{ _embedded?: { subscriptions?: MollieSubscription[] } }>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/subscriptions?limit=250`,
    config,
  });
  return response._embedded?.subscriptions ?? [];
}

/** GET /v2/customers/{cid}/subscriptions/{sid}: the subscription as Mollie holds it now. */
export async function getSubscription(
  customerId: string,
  subscriptionId: string,
  config?: MollieConfig,
): Promise<MollieSubscription> {
  return request<MollieSubscription>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    config,
  });
}

/**
 * Changes what a subscription collects from now on.
 *
 * PATCH with only `amount`: per docs.mollie.com/reference/update-subscription
 * that is "the amount for future payments of this subscription". A payment
 * Mollie has already created keeps its own amount, which is why the caller
 * only sends this once the previous collection is final and well before the
 * next one is created. Nothing else about the subscription is touched:
 * interval, start date, mandate and description stay as they are.
 */
export async function updateSubscriptionAmount(
  input: { customerId: string; subscriptionId: string; amountCents: number; config?: MollieConfig },
): Promise<MollieSubscription> {
  return request<MollieSubscription>({
    method: "PATCH",
    path: `/customers/${encodeURIComponent(input.customerId)}/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
    body: { amount: mollieAmount(input.amountCents) },
    config: input.config,
  });
}

/**
 * Ends a subscription at Mollie, now. There is no cancel-at date in the API
 * (docs.mollie.com/reference/cancel-subscription), so *when* this is called
 * is the caller's decision; and "Canceling a subscription has no effect on
 * the mandates of the customer", so the customer's other subscriptions keep
 * collecting against the same mandate.
 */
export async function cancelSubscription(
  customerId: string,
  subscriptionId: string,
  config?: MollieConfig,
): Promise<MollieSubscription> {
  return request<MollieSubscription>({
    method: "DELETE",
    path: `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    config,
  });
}

/**
 * The payments a subscription produced, newest first. Up to 250, the API's
 * own page maximum; a monthly subscription takes decades to fill that.
 *
 * This is what settles whether Mollie has already created the payment for
 * a coming collection: the one fact the lifecycle flows may not assume,
 * because the docs give no lead time. See list-subscription-payments.
 */
export async function listSubscriptionPayments(
  customerId: string,
  subscriptionId: string,
  config?: MollieConfig,
): Promise<MolliePayment[]> {
  const response = await request<{ _embedded?: { payments?: MolliePayment[] } }>({
    method: "GET",
    path: `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=250`,
    config,
  });
  return response._embedded?.payments ?? [];
}

/**
 * Cancels one payment. Only for a payment Mollie itself marks
 * `isCancelable: true`; the API answers 422 "if you are trying to cancel a
 * payment that can no longer be canceled" (cancel-payment reference), and
 * that error is left to the caller to turn into a visible problem.
 */
export async function cancelPayment(id: string, config?: MollieConfig): Promise<MolliePayment> {
  return request<MolliePayment>({ method: "DELETE", path: `/payments/${encodeURIComponent(id)}`, config });
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
