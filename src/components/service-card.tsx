import Link from "next/link";
import type { LocalizedService } from "@/lib/content/services";

type ServiceCardProps = {
  service: LocalizedService;
  featured?: boolean;
};

export default function ServiceCard({
  service,
  featured = false,
}: ServiceCardProps) {
  return (
    <article
      className={`ym-surface-strong group relative overflow-hidden rounded-[2rem] transition duration-500 hover:border-[color:var(--line-strong)] ${
        featured ? "min-h-[360px] p-7 md:p-8" : "min-h-[300px] p-6"
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-20`} />
      <div className="ym-glow-overlay absolute inset-0" />
      <div className="absolute -right-12 top-5 h-28 w-28 rounded-full bg-cyan-300/8 blur-2xl transition duration-500 group-hover:scale-110" />

      <div className="relative flex h-full flex-col justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent-text)]">
            {service.icon}
          </p>

          <h2
            className={`mt-6 max-w-sm font-semibold leading-tight text-[var(--foreground)] ${
              featured ? "text-[2rem]" : "text-2xl"
            }`}
          >
            {service.navLabel}
          </h2>

          <p className="mt-4 max-w-md text-sm leading-7 text-[color:var(--muted-foreground)]">
            {service.intro}
          </p>
        </div>

        <Link
          href={service.path}
          data-track-event="service_cta_click"
          data-track-category="services"
          data-track-label={service.navLabel}
          data-track-location="service-card"
          className="mt-8 inline-flex items-center gap-2 self-start text-sm font-medium text-[color:var(--muted-foreground)] transition hover:text-[var(--foreground)]"
        >
          {service.navLabel}
          <span className="text-[var(--accent-text)] transition group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </article>
  );
}
