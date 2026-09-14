import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import SiteShell from "@/components/site-shell";
import TermsDocument from "@/components/terms-document";
import { legalRoutes } from "@/lib/content/routes";
import { siteContent } from "@/lib/content/site-content";
import { termsDocument, termsIndexable } from "@/lib/content/terms";
import { webPageSchema } from "@/lib/schema";
import { buildMetadata, getCanonicalUrl } from "@/lib/seo";

/*
  The terms exist in Dutch only, so this page has no English counterpart.
  It is reachable from the footer but served with noindex (see terms.ts).
*/

const meta = {
  title: termsDocument.documentTitle,
  description: `${termsDocument.title} (${termsDocument.audience}) van YM Creations voor ${termsDocument.subtitle
    .charAt(0)
    .toLowerCase()}${termsDocument.subtitle.slice(1, -1)}. ${termsDocument.versionLine}, inclusief PDF.`,
  label: "Voor zakelijke opdrachtgevers (B2B)",
  /*
    The edition is the year. The publication date sits beside it because an
    offer has to remain provably tied to one set of terms, but it is not a
    second version name and a correction does not produce a new edition.
  */
  editionLabel: "Editie",
  dateLabel: "Gepubliceerd",
  fileLabel: "Document",
  openPdf: "Open de PDF",
  downloadPdf: "Download",
};

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
    pathname: legalRoutes.terms,
    title: meta.title,
    description: meta.description,
    noindex: !termsIndexable,
  });
}

export async function generateStaticParams() {
  return [{ locale: "nl" }];
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (locale !== "nl") {
    notFound();
  }

  const content = siteContent.nl;
  const doc = termsDocument;

  return (
    <>
      <JsonLd
        data={webPageSchema({
          locale: "nl",
          name: meta.title,
          description: meta.description,
          url: getCanonicalUrl(legalRoutes.terms),
        })}
      />
      <SiteShell locale="nl" content={content} currentPath={legalRoutes.terms}>
        <PageHeader label={meta.label} title={doc.documentTitle} intro={doc.subtitle}>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2.5 border-t border-line pt-5 text-[0.95rem]">
            <dt className="text-muted">{meta.editionLabel}</dt>
            <dd className="text-ink">{doc.edition}</dd>
            <dt className="text-muted">{meta.dateLabel}</dt>
            <dd className="text-ink">
              <time dateTime={doc.dateIso}>{doc.dateLabel}</time>
            </dd>
            <dt className="text-muted">{meta.fileLabel}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <a
                href={doc.pdf.path}
                target="_blank"
                rel="noopener noreferrer"
                className="link-static font-medium text-ink"
              >
                {meta.openPdf}
                <span aria-hidden="true"> ↗</span>
              </a>
              <a href={doc.pdf.path} download={doc.pdf.fileName} className="link-static text-ink">
                {meta.downloadPdf}
              </a>
              <span className="text-[0.85rem] text-muted">{doc.pdf.sizeLabel}</span>
            </dd>
          </dl>
        </PageHeader>

        <TermsDocument />
      </SiteShell>
    </>
  );
}
