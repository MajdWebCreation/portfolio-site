import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/content/site-content";

export const metadata: Metadata = {
  title: "Automatische incasso",
  robots: { index: false, follow: false },
};

/**
 * Both the landing spot after a mandate is given and the place an unusable
 * activation link ends up. The message names what happened without saying
 * anything about which link was tried.
 */
const messages: Record<string, string> = {
  onbekend: "Deze activatielink kennen we niet. Vraag ons gerust om een nieuwe.",
  verlopen: "Deze activatielink is verlopen. Vraag ons om een nieuwe, dan sturen we die meteen.",
  gebruikt: "Deze activatielink is al gebruikt. Loopt de incasso nog niet? Laat het ons weten.",
  "niet-beschikbaar": "Het instellen van automatische incasso lukte even niet. Probeer het later opnieuw of laat het ons weten.",
};

export default async function DirectDebitReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ locale }, { status }] = await Promise.all([params, searchParams]);
  if (!isValidLocale(locale)) notFound();

  const problem = status ? messages[status] : undefined;

  return (
    <main className="container-x flex min-h-[70vh] max-w-[42rem] flex-col justify-center py-20" data-clarity-mask="true">
      <h1 className="display-md text-ink">{problem ? "Dat lukte niet" : "Bedankt"}</h1>
      <p className="lede mt-5 text-body">
        {problem ??
          "Je machtiging is aangeboden. Zodra onze betaalprovider die bevestigt, staat de automatische incasso klaar en zie je dat terug op je eerste factuur."}
      </p>
      <p className="mt-8">
        <Link href={`/${locale}/contact`} className="link-static text-ink">
          Contact opnemen
        </Link>
      </p>
    </main>
  );
}
