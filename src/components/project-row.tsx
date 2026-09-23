import Image from "next/image";
import CtaLink from "@/components/cta-link";
import type { Project } from "@/lib/content/projects";
import type { Locale } from "@/lib/content/site-content";

type ProjectRowProps = {
  project: Project;
  locale: Locale;
  visitLabel: string;
  builtLabel: string;
  /** Show the full list of what was built instead of a compact inline list. */
  detailed?: boolean;
  /**
   * The case for this project in this locale, when one is written. It sits
   * next to the link to the live site rather than replacing it: the case is
   * the story, the domain is the proof.
   */
  casePath?: string | null;
  caseLabel?: string;
};

/**
 * One project as an editorial row: screenshot left, text right, hairline
 * between rows.
 */
export default function ProjectRow({
  project,
  locale,
  visitLabel,
  builtLabel,
  detailed = false,
  casePath,
  caseLabel,
}: ProjectRowProps) {
  return (
    <article className="group grid gap-5 border-t border-line py-8 lg:grid-cols-12 lg:gap-8 lg:py-10">
      <div className="space-y-4 lg:col-span-5">
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${project.name}, ${visitLabel}`}
          data-track-link-context="project_live"
          className="block overflow-hidden rounded-sm border border-line bg-surface"
        >
          <Image
            src={project.image.src}
            alt={project.image.alt[locale]}
            width={project.image.width}
            height={project.image.height}
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="h-auto w-full transition-transform duration-700 ease-out group-hover:scale-[1.015]"
          />
        </a>
        {detailed && project.detailImage ? (
          <figure className="overflow-hidden rounded-sm border border-line bg-surface">
            <Image
              src={project.detailImage.src}
              alt={project.detailImage.alt[locale]}
              width={project.detailImage.width}
              height={project.detailImage.height}
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="h-auto w-full"
            />
          </figure>
        ) : null}
      </div>

      <div className="flex flex-col lg:col-span-7 lg:pl-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h3 className="display-sm">{project.name}</h3>
          <p className="label-mono">{project.sector[locale]}</p>
        </div>
        <p className="mt-3 max-w-2xl text-[1rem] leading-relaxed text-muted">
          {project.summary[locale]}
        </p>

        {detailed ? (
          <div className="mt-5">
            <p className="label-mono">{builtLabel}</p>
            <ul className="mt-2 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {project.built[locale].map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-[0.95rem] leading-snug text-body"
                >
                  <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="label-mono mt-4 normal-case tracking-normal">
            {project.built[locale].join(" · ")}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          {casePath && caseLabel ? (
            <CtaLink
              href={casePath}
              variant="text"
              data-track-event="cta_click"
              data-track-cta-id="project_row_case"
              data-track-cta-target="case"
              data-track-placement="project_row"
            >
              {caseLabel}
            </CtaLink>
          ) : null}
          <CtaLink
            href={project.url}
            variant="text"
            external
            data-track-link-context="project_live"
          >
            {project.domain}
          </CtaLink>
        </div>
      </div>
    </article>
  );
}
