import Link from "next/link";
import type { CaseStudyDefinition } from "@/lib/content/cases";
import type { Locale } from "@/lib/content/site-content";

type CaseCardProps = {
  caseStudy: CaseStudyDefinition;
  locale: Locale;
  href: string;
};

export default function CaseCard({ caseStudy, locale, href }: CaseCardProps) {
  const localizedCaseStudy = caseStudy.locale[locale];

  if (!localizedCaseStudy) {
    return null;
  }

  return (
    <article className="rounded-[1.75rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/94 p-6">
      <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
        CASE
      </p>
      <h2 className="mt-4 text-2xl font-semibold text-[var(--foreground)]">
        {localizedCaseStudy.title}
      </h2>
      <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
        {localizedCaseStudy.summary}
      </p>
      <Link
        href={href}
        className="mt-6 inline-flex rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-5 py-2.5 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92"
      >
        {locale === "nl" ? "Bekijk case" : "View case"}
      </Link>
    </article>
  );
}
