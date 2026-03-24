import Link from "next/link";
import type { SiteContent } from "@/lib/content/site-content";

type PrototypeStoryContent = SiteContent["prototypeStory"];

type PrototypeStorySectionProps = {
  content: PrototypeStoryContent;
  overviewHref: string;
};

export default function PrototypeStorySection({
  content,
  overviewHref,
}: PrototypeStorySectionProps) {
  return (
    <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10 lg:py-24">
      <div className="absolute inset-0">
        <div className="ym-bg-sweep absolute inset-x-[-8%] top-[18%] h-[22rem] opacity-[0.18]" />
        <div className="ym-bg-curve absolute inset-x-[-6%] bottom-[-8%] h-[18rem] opacity-[0.16]" />
      </div>

      <div className="ym-hairline ym-panel-glow ym-surface-soft relative overflow-hidden rounded-[2.5rem] p-5 sm:p-6 md:p-8">
        <div className="ym-glow-overlay absolute inset-0" />
        <div className="ym-grid absolute inset-0 opacity-[0.03]" />
        <div className="absolute left-5 top-5 rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)]/88 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-text)] md:left-6 md:top-6">
          {content.boardLabel}
        </div>

        <div className="relative pt-16 md:pt-20">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {content.stages.map((stage, index) => (
              <article
                key={stage.label}
                className={`rounded-[1.8rem] border border-[color:var(--line)] p-5 ${
                  index === 3
                    ? "bg-[color:color-mix(in_srgb,var(--background-elevated)_78%,var(--cyan-soft))]"
                    : "bg-[color:color-mix(in_srgb,var(--background-elevated)_92%,transparent)]"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent-text)]">
                  {stage.label}
                </p>
                <h3 className="mt-4 text-2xl font-medium leading-tight text-[var(--foreground)]">
                  {stage.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">{stage.text}</p>

                {index === 2 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {content.interfaceChips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}

                {index === 3 ? (
                  <Link
                    href={overviewHref}
                    data-track-event="primary_cta_click"
                    data-track-category="homepage"
                    data-track-label={content.ctaLabel}
                    data-track-location="prototype-story"
                    className="mt-6 inline-flex rounded-full border border-[color:var(--line-strong)] bg-[var(--button-bg)] px-5 py-3 text-sm font-medium text-[var(--button-text)] transition hover:opacity-92"
                  >
                    {content.ctaLabel}
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
