import Link from "next/link";
import type { LocalizedService } from "@/lib/content/services";

type ServiceCardProps = {
  service: LocalizedService;
};

export default function ServiceCard({ service }: ServiceCardProps) {
  return (
    <article className="group ym-hairline relative min-h-[320px] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6 transition duration-500 hover:-translate-y-1 hover:border-cyan-300/30">
      <div className={`absolute inset-0 bg-gradient-to-br ${service.accent} opacity-70`} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,12,0.04),rgba(4,7,12,0.66)_55%,rgba(4,7,12,0.94))]" />
      <div className="absolute -right-16 top-6 h-36 w-36 rounded-full border border-cyan-200/10 bg-cyan-300/5 blur-2xl transition duration-500 group-hover:scale-110" />
      <div className="relative flex h-full flex-col justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/82">
          {service.icon}
        </p>
        <div>
          <h2 className="mt-8 max-w-xs text-2xl font-semibold leading-tight text-white">
            {service.navLabel}
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-7 text-white/65">
            {service.intro}
          </p>
        </div>
        <Link
          href={service.path}
          data-track-event="service_cta_click"
          data-track-category="services"
          data-track-label={service.navLabel}
          data-track-location="service-card"
          className="mt-10 inline-flex items-center gap-3 self-start rounded-full border border-white/15 bg-black/35 px-5 py-2.5 text-sm font-medium text-white transition duration-300 hover:border-cyan-400/40 hover:bg-black/55"
        >
          {service.navLabel}
          <span className="text-cyan-200 transition group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </article>
  );
}
