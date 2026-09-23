import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { beginDirectDebit } from "@/app/[locale]/incasso/[token]/actions";
import { isValidLocale } from "@/lib/content/site-content";
import { formatCents } from "@/lib/money";
import { readActivation } from "@/lib/payments/recurring";

/**
 * The activation page.
 *
 * Opening it creates nothing: no provider customer, no payment, no mandate,
 * no subscription, and the token is not consumed. All this GET does is read
 * the activation and render what it says. The money side starts only when the
 * customer submits the form below, which is a POST.
 */
export const metadata: Metadata = {
  title: "Automatische incasso activeren",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ActivationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isValidLocale(locale)) notFound();

  const activation = await readActivation(token);
  if (!activation.ok) {
    redirect(`/${locale}/betaling/incasso-afgerond?status=${
      { unknown: "onbekend", expired: "verlopen", used: "gebruikt", unavailable: "niet-beschikbaar" }[activation.reason]
    }`);
  }

  const amount = formatCents(activation.amountCents);

  return (
    <main className="container-x flex min-h-[70vh] max-w-[42rem] flex-col justify-center py-20" data-clarity-mask="true">
      <h1 className="display-md text-ink">Automatische incasso activeren</h1>
      <p className="lede mt-5 text-body">
        {activation.contactName ? `Beste ${activation.contactName}, ` : ""}
        je staat op het punt automatische incasso in te stellen voor {activation.serviceName}.
      </p>
      <dl className="mt-8 border-t border-line text-[0.95rem]">
        <div className="flex items-baseline justify-between gap-6 border-b border-line py-3">
          <dt className="text-muted">Dienst</dt>
          <dd className="text-ink">{activation.serviceName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-6 border-b border-line py-3">
          <dt className="text-muted">Bedrag per maand</dt>
          <dd className="tabular text-ink">{amount}</dd>
        </div>
      </dl>
      <p className="mt-6 text-[0.92rem] leading-relaxed text-muted">
        Je betaalt nu de eerste maand van {amount} en machtigt ons in dezelfde stap voor de maanden daarna. De eerste
        automatische afschrijving is pas als die eerste maand voorbij is, dus je betaalt niet dubbel. Stoppen kan
        altijd; een mail is genoeg.
      </p>

      {/* A form, so the financial flow starts with a POST from the customer. */}
      <form action={beginDirectDebit} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 text-[0.95rem] font-medium text-paper transition-colors duration-200 hover:bg-accent"
        >
          Automatische incasso activeren
        </button>
      </form>
    </main>
  );
}
