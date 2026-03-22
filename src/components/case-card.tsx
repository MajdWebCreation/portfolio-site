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
    <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6">
      <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/80">
        CASE
      </p>
      <h2 className="mt-4 text-2xl font-semibold text-white">
        {localizedCaseStudy.title}
      </h2>
      <p className="mt-4 text-sm leading-7 text-white/65">
        {localizedCaseStudy.summary}
      </p>
      <Link
        href={href}
        className="mt-6 inline-flex rounded-full border border-white/15 bg-black/40 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/40 hover:bg-black/55"
      >
        {locale === "nl" ? "Bekijk case" : "View case"}
      </Link>
    </article>
  );
}
