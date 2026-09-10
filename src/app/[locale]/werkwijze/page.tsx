import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProcessPageContent } from "@/app/[locale]/how-we-work/page";
import { processPageContent } from "@/lib/content/process";
import { getLocalizedPath, getRouteAlternates } from "@/lib/content/routes";
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
    pathname: getLocalizedPath("nl", "process"),
    title: processPageContent.nl.metaTitle,
    description: processPageContent.nl.metaDescription,
    alternates: getRouteAlternates("process"),
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }];
}

export default async function DutchProcessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "nl") {
    notFound();
  }

  return <ProcessPageContent locale="nl" />;
}
