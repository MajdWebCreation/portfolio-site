import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/content/site-content";

/**
 * Where a customer lands after paying.
 *
 * One page for every kind of payment that ends here -- an ordinary invoice,
 * and an invoice whose payment also starts a monthly collection -- so the
 * wording stays general on purpose: it thanks the customer and says they are
 * done. Nothing about who processes the payment, what is still being
 * confirmed, or what happens to the invoice afterwards; that is our work, not
 * theirs, and it happens whether or not this page is ever seen.
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
      <h1 className="display-md text-ink">{isNl ? "Bedankt voor je betaling" : "Thank you for your payment"}</h1>
      <p className="lede mt-5 text-body">
        {isNl
          ? "Je betaling is succesvol ontvangen. Je hoeft verder niets te doen."
          : "Your payment has been received successfully. No further action is required."}
      </p>
      <p className="mt-8">
        <Link href={`/${locale}`} className="link-static text-ink">
          {isNl ? "Terug naar de website" : "Back to the website"}
        </Link>
      </p>
    </main>
  );
}
