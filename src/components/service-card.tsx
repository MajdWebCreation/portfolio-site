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
      className={`group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] transition duration-500 hover:border-cyan-300/28 ${
        featured ? "min-h-[360px] p-7 md:p-8" : "min-h-[300px] p-6"
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-55`} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.04),rgba(4,7,12,0.58)_52%,rgba(4,7,12,0.9))]" />
      <div className="absolute -right-12 top-5 h-28 w-28 rounded-full bg-cyan-300/6 blur-2xl transition duration-500 group-hover:scale-110" />

      <div className="relative flex h-full flex-col justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/82">
            {service.icon}
          </p>

          <h2
            className={`mt-6 max-w-sm font-semibold leading-tight text-white ${
              featured ? "text-[2rem]" : "text-2xl"
            }`}
          >
            {service.navLabel}
          </h2>

          <p className="mt-4 max-w-md text-sm leading-7 text-white/58">
            {service.intro}
          </p>
        </div>

        <Link
          href={service.path}
          data-track-event="service_cta_click"
          data-track-category="services"
          data-track-label={service.navLabel}
          data-track-location="service-card"
          className="mt-8 inline-flex items-center gap-2 self-start text-sm font-medium text-white/72 transition hover:text-white"
        >
          {service.navLabel}
          <span className="text-cyan-200 transition group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </article>
  );
}