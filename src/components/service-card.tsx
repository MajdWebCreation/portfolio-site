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
      className={`group relative overflow-hidden rounded-[2rem] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.085),rgba(255,255,255,0.035))] transition duration-500 hover:border-cyan-300/32 ${
        featured ? "min-h-[360px] p-7 md:p-8" : "min-h-[300px] p-6"
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-55`} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,18,26,0.03),rgba(12,18,26,0.36)_52%,rgba(10,16,24,0.64))]" />
      <div className="absolute -right-12 top-5 h-28 w-28 rounded-full bg-cyan-300/11 blur-2xl transition duration-500 group-hover:scale-110" />

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

          <p className="mt-4 max-w-md text-sm leading-7 text-white/72">
            {service.intro}
          </p>
        </div>

        <Link
          href={service.path}
          data-track-event="service_cta_click"
          data-track-category="services"
          data-track-label={service.navLabel}
          data-track-location="service-card"
          className="mt-8 inline-flex items-center gap-2 self-start text-sm font-medium text-white/82 transition hover:text-white"
        >
          {service.navLabel}
          <span className="text-cyan-200 transition group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </article>
  );
}
