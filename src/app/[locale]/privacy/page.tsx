import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalStatementPage from "@/components/legal-statement";
import { privacyStatement } from "@/lib/content/privacy";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { isValidLocale } from "@/lib/content/site-content";
import { buildMetadata } from "@/lib/seo";

/*
  The privacy statement, in both languages, so the language switch and the
  hreflang alternates work like any other page. Kept out of the index until
  the text is confirmed; see lib/content/privacy.ts.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  const statement = privacyStatement.content[locale];

  return buildMetadata({
    locale,
    pathname: getLocalizedPath(locale, "privacy"),
    title: statement.title,
    description: statement.description,
    alternates: getRouteAlternates("privacy"),
    noindex: !privacyStatement.indexable,
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  return (
    <LegalStatementPage
      locale={locale}
      pathname={getLocalizedPath(locale, "privacy")}
      statement={privacyStatement.content[locale]}
    />
  );
}
