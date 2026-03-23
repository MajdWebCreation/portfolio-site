import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingPageContent } from "@/app/[locale]/pricing/page";
import { getRouteAlternates } from "@/lib/content/routes";
import { getPricingPageContent } from "@/lib/content/pricing";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (locale !== "nl") {
    return {};
  }

  const content = getPricingPageContent("nl");

  return buildMetadata({
    locale: "nl",
    pathname: "/nl/tarieven",
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: getRouteAlternates("pricing"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }];
}

export default async function DutchPricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "nl") {
    notFound();
  }

  return <PricingPageContent locale="nl" />;
}
