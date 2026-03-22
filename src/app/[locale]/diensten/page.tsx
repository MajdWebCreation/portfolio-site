import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServicesPageContent } from "@/app/[locale]/services/page";
import { getRouteAlternates } from "@/lib/content/routes";
import { servicesOverviewContent } from "@/lib/content/services";
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

  return buildMetadata({
    locale: "nl",
    pathname: "/nl/diensten",
    title: servicesOverviewContent.nl.metaTitle,
    description: servicesOverviewContent.nl.metaDescription,
    alternates: getRouteAlternates("services"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }];
}

export default async function DutchServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "nl") {
    notFound();
  }

  return <ServicesPageContent locale="nl" />;
}
