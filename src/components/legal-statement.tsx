import ArticleRichText from "@/components/article-rich-text";
import JsonLd from "@/components/json-ld";
import PageHeader from "@/components/page-header";
import SiteShell from "@/components/site-shell";
import { legalStatementLabels, type LegalStatement } from "@/lib/content/legal-statements";
import { siteContent, type Locale } from "@/lib/content/site-content";
import { webPageSchema } from "@/lib/schema";
import { getCanonicalUrl } from "@/lib/seo";

type LegalStatementPageProps = {
  locale: Locale;
  pathname: string;
  statement: LegalStatement;
};

/**
 * A privacy or cookie statement as a page: the shared header, the date the
 * text last changed, and the text itself in the site's reading column. The
 * two pages that use this differ only in which statement they hand over.
 */
export default function LegalStatementPage({ locale, pathname, statement }: LegalStatementPageProps) {
  const labels = legalStatementLabels[locale];

  return (
    <>
      <JsonLd
        data={webPageSchema({
          locale,
          name: statement.title,
          description: statement.description,
          url: getCanonicalUrl(pathname),
        })}
      />
      <SiteShell locale={locale} content={siteContent[locale]} currentPath={pathname}>
        <PageHeader label={labels.kicker} title={statement.title} intro={statement.intro}>
          <p className="text-[0.95rem] text-muted">
            {labels.updated}{" "}
            <time dateTime={statement.updatedIso} className="text-ink">
              {statement.updatedLabel}
            </time>
          </p>
        </PageHeader>

        <section className="container-x pt-6 lg:pt-10">
          <div className="grid lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-8">
              <ArticleRichText blocks={statement.blocks} />
            </div>
          </div>
        </section>
      </SiteShell>
    </>
  );
}
