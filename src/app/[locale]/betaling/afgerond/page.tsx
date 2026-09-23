import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaymentReturnStatus, { type ReturnCopy } from "@/components/payments/payment-return-status";
import { isValidLocale, type Locale } from "@/lib/content/site-content";
import { readPaymentReturnState } from "@/lib/payments/return-lookup";
import type { ReturnView } from "@/lib/payments/return-polling";

/**
 * Where a customer lands after paying.
 *
 * One page for every kind of payment that ends here -- an ordinary invoice,
 * and an invoice whose payment also starts a monthly collection -- so the
 * wording stays general: no provider, no webhook, no explanation of how the
 * administration catches up.
 *
 * It never assumes the payment worked. The provider returns everyone to this
 * URL, including the customer who cancelled, and its redirect regularly
 * arrives before its own webhook. So the first check runs here, on the
 * server, and an invoice that is not settled yet gets the wordmark and a
 * loader while the page asks again by itself -- rather than a customer being
 * asked to refresh, or being thanked for something unconfirmed.
 *
 * Which invoice this is comes from `state`, an opaque signed token. It is not
 * an identifier a visitor can compose or edit into another one, so this page
 * cannot be used to find out whether some invoice exists; see
 * `readPaymentReturnState` and `return-token.ts`.
 */
export const metadata: Metadata = {
  title: "Betaling afgerond",
  robots: { index: false, follow: false },
};

/* The state is read per visit; a thank-you may never be served from a cache. */
export const dynamic = "force-dynamic";

type Copy = {
  messages: Record<Exclude<ReturnView, "loading">, ReturnCopy>;
  waiting: string;
  home: string;
};

/*
  Three messages per language, and the differences between them are the point:
  only `thanks` says the payment arrived, only `failed` asks the customer to do
  anything, and `neutral` is honest about knowing nothing without turning that
  into a worry. While the answer is still open there is no message at all --
  the loader says everything that can honestly be said.
*/
const copy: Record<Locale, Copy> = {
  nl: {
    messages: {
      thanks: { title: "Bedankt voor je betaling", text: "Je betaling is ontvangen." },
      failed: {
        title: "Betaling niet afgerond",
        text: "De betaling is niet afgerond. Je kunt de betaallink uit de factuurmail opnieuw gebruiken.",
      },
      neutral: {
        title: "Bedankt",
        text: "Je hoeft verder niets te doen. Heb je een vraag over je betaling? Neem gerust contact met ons op.",
      },
    },
    waiting: "Een moment geduld.",
    home: "Terug naar de website",
  },
  en: {
    messages: {
      thanks: { title: "Thank you for your payment", text: "Your payment has been received." },
      failed: {
        title: "Payment not completed",
        text: "The payment was not completed. You can use the payment link from the invoice email again.",
      },
      neutral: {
        title: "Thank you",
        text: "There is nothing further you need to do. Any questions about your payment? Please get in touch.",
      },
    },
    waiting: "One moment please.",
    home: "Back to the website",
  },
};

export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const [{ locale }, { state }] = await Promise.all([params, searchParams]);
  if (!isValidLocale(locale)) notFound();

  // The first answer, before anything reaches the browser: an invoice that is
  // already settled shows its message without a loader flashing past.
  const initial = await readPaymentReturnState(state);
  const words = copy[locale];

  return (
    <main className="container-x" data-clarity-mask="true">
      <PaymentReturnStatus
        initial={initial}
        {...(state ? { token: state } : {})}
        copy={words.messages}
        waitingLabel={words.waiting}
        homeHref={`/${locale}`}
        homeLabel={words.home}
      />
    </main>
  );
}
