import Link from "next/link";
import type { LocalizedService } from "@/lib/content/services";

type ServiceCardProps = {
  service: LocalizedService;
};

export default function ServiceCard({ service }: ServiceCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 transition hover:border-cyan-300/30 hover:bg-white/[0.05]">
      <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-80`} />
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/80">
          {service.icon}
        </p>
        <h2 className="mt-4 text-2xl font-semibold text-white">{service.navLabel}</h2>
        <p className="mt-4 text-sm leading-7 text-white/65">{service.intro}</p>
        <Link
          href={service.path}
          data-track-event="service_cta_click"
          data-track-category="services"
          data-track-label={service.navLabel}
          data-track-location="service-card"
          className="mt-6 inline-flex items-center rounded-full border border-white/15 bg-black/40 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/40 hover:bg-black/55"
        >
          {service.navLabel}
        </Link>
      </div>
    </article>
  );
}
