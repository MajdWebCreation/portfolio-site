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

export type MollieCustomer = { id: string };
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
