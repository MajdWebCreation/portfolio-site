import { notFound } from "next/navigation";
import {
  generateMetadata,
  ServiceDetailContent,
} from "@/app/[locale]/services/[slug]/page";
import { serviceDefinitions, serviceKeys } from "@/lib/content/services";

export { generateMetadata };

export async function generateStaticParams() {
  return serviceKeys.map((key) => ({
    locale: "nl",
    slug: serviceDefinitions[key].locale.nl.slug,
  }));
}

export default async function DutchServiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const resolved = await params;

  if (resolved.locale !== "nl") {
    notFound();
  }

  return <ServiceDetailContent locale="nl" slug={resolved.slug} />;
}
