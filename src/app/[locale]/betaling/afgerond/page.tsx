import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/content/site-content";

/**
 * Where Mollie sends the customer back to. It deliberately claims nothing
 * about the outcome: the payment is confirmed by the webhook, not by the
 * browser arriving here, and a returning visitor may well have cancelled.
 */
export const metadata: Metadata = {
  title: "Betaling afgerond",
  robots: { index: false, follow: false },
};

export default async function PaymentReturnPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const isNl = locale === "nl";

  return (
    <main className="container-x flex min-h-[70vh] max-w-[42rem] flex-col justify-center py-20">
      <h1 className="display-md text-ink">{isNl ? "Bedankt" : "Thank you"}</h1>
      <p className="lede mt-5 text-body">
        {isNl
          ? "Je betaling is bij ons aangeboden. Zodra onze betaalprovider de betaling bevestigt, werken we de factuur automatisch bij. Je hoeft verder niets te doen."
          : "Your payment has been submitted. As soon as our payment provider confirms it, the invoice is updated automatically. Nothing further is needed from you."}
      </p>
      <p className="mt-8">
        <Link href={`/${locale}`} className="link-static text-ink">
          {isNl ? "Terug naar de website" : "Back to the website"}
        </Link>
      </p>
    </main>
  );
}
