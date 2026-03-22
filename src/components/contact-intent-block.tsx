import type { Locale } from "@/lib/content/site-content";

type ContactIntentBlockProps = {
  locale: Locale;
};

const copy = {
  en: {
    title: "What helps make the first conversation more useful",
    blocks: [
      {
        title: "Plan a call",
        text: "If a short call is the easiest starting point, mention that in your message and include a few time options.",
      },
      {
        title: "Project scope",
        text: "Describe whether you need a website, webshop, redesign, performance pass, landing page, or web application.",
      },
      {
        title: "Helpful context",
        text: "Share the current situation, what needs to improve, and any links or references that clarify the direction.",
      },
    ],
  },
  nl: {
    title: "Wat helpt om het eerste gesprek direct nuttiger te maken",
    blocks: [
      {
        title: "Plan een gesprek",
        text: "Als een kort gesprek de beste start is, zet dat in je bericht en geef meteen een paar momenten door.",
      },
      {
        title: "Projectscope",
        text: "Omschrijf of je een website, webshop, redesign, performance pass, landingspagina of webapplicatie nodig hebt.",
      },
      {
        title: "Handige context",
        text: "Deel de huidige situatie, wat er moet verbeteren en eventuele links of referenties die de richting duidelijker maken.",
      },
    ],
  },
} as const;

export default function ContactIntentBlock({
  locale,
}: ContactIntentBlockProps) {
  const content = copy[locale];

  return (
    <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 md:p-8">
      <h2 className="max-w-3xl text-3xl font-semibold text-white">
        {content.title}
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {content.blocks.map((block) => (
          <div
            key={block.title}
            className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5"
          >
            <h3 className="text-lg font-medium text-white">{block.title}</h3>
            <p className="mt-3 text-sm leading-7 text-white/65">{block.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
