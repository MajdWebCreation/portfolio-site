import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalStatementPage from "@/components/legal-statement";
import { cookieStatement } from "@/lib/content/cookies";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
import { isValidLocale } from "@/lib/content/site-content";
import { buildMetadata } from "@/lib/seo";

/* The cookie statement; the consent card links here. See lib/content/cookies.ts. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    return {};
  }

  const statement = cookieStatement.content[locale];

  return buildMetadata({
    locale,
    pathname: getLocalizedPath(locale, "cookies"),
    title: statement.title,
    description: statement.description,
    alternates: getRouteAlternates("cookies"),
    noindex: !cookieStatement.indexable,
  });
}

export default async function CookiesPage({
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
      pathname={getLocalizedPath(locale, "cookies")}
      statement={cookieStatement.content[locale]}
    />
  );
}
