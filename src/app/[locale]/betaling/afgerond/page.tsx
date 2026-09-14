import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale, type Locale } from "@/lib/content/site-content";
import { readPaymentReturnState } from "@/lib/payments/return-lookup";
import type { PaymentReturnState } from "@/lib/payments/return-state";

/**
 * Where a customer lands after paying.
 *
 * One page for every kind of payment that ends here -- an ordinary invoice,
 * and an invoice whose payment also starts a monthly collection -- so the
 * wording stays general: no provider, no webhook, no explanation of how the
 * administration catches up.
 *
 * What it does not do is assume the payment worked. The provider returns
 * everyone to this URL, including the customer who cancelled, so the outcome
 * is read from our own records instead of from the fact that someone arrived.
 *
 * Which invoice that is comes from `state`, an opaque signed token. It is not
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

type Message = { title: string; text: string };

/*
  Four messages per language, and the differences between them are the point:
  only `paid` says the payment arrived, only `failed` asks the customer to do
  something, and the other two are honest about not knowing yet without
  turning that into a worry.
*/
const messages: Record<Locale, Record<PaymentReturnState, Message>> = {
  nl: {
    paid: {
      title: "Bedankt voor je betaling",
      text: "Je betaling is succesvol ontvangen. Je hoeft verder niets te doen.",
    },
    processing: {
      title: "Betaling wordt verwerkt",
      text: "Je betaling wordt nog verwerkt. Je hoeft niets te doen; de status wordt automatisch bijgewerkt.",
    },
    failed: {
      title: "Betaling niet afgerond",
      text: "De betaling is niet afgerond. Je kunt de betaallink uit de factuurmail opnieuw gebruiken.",
    },
    unknown: {
      title: "Bedankt",
      text: "Je hoeft verder niets te doen. Heb je een vraag over je betaling? Neem gerust contact met ons op.",
    },
  },
  en: {
    paid: {
      title: "Thank you for your payment",
      text: "Your payment has been received successfully. No further action is required.",
    },
    processing: {
      title: "Payment is being processed",
      text: "Your payment is still being processed. There is nothing you need to do; the status is updated automatically.",
    },
    failed: {
      title: "Payment not completed",
      text: "The payment was not completed. You can use the payment link from the invoice email again.",
    },
    unknown: {
      title: "Thank you",
      text: "There is nothing further you need to do. Any questions about your payment? Please get in touch.",
    },
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

  const outcome = await readPaymentReturnState(state);
  const message = messages[locale][outcome];

  return (
    <main className="container-x flex min-h-[70vh] max-w-[42rem] flex-col justify-center py-20">
      <h1 className="display-md text-ink">{message.title}</h1>
      <p className="lede mt-5 text-body">{message.text}</p>
      <p className="mt-8">
        <Link href={`/${locale}`} className="link-static text-ink">
          {locale === "nl" ? "Terug naar de website" : "Back to the website"}
        </Link>
      </p>
    </main>
  );
}
