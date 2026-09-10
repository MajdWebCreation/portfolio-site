import type { Locale } from "@/lib/content/site-content";

type ProcessPhase = {
  number: string;
  title: string;
  text: string;
  result: string;
};

type ScaleRow = {
  label: string;
  /** Relative weight per phase; only the proportions matter. */
  weights: [number, number, number, number];
};

type ProcessPageContent = {
  metaTitle: string;
  metaDescription: string;
  label: string;
  title: string;
  intro: string;
  phasesLabel: string;
  phases: ProcessPhase[];
  resultLabel: string;
  scale: {
    title: string;
    text: string;
    phaseLabels: [string, string, string, string];
    rows: ScaleRow[];
    note: string;
  };
  needs: {
    title: string;
    text: string;
    items: string[];
    closing: string;
  };
  cta: {
    label: string;
    title: string;
    text: string;
    primary: string;
    secondary: string;
  };
};

/**
 * How working with YM runs. The homepage states the three promises in one
 * line; this page explains the phases, how the size differs per project and
 * what helps at the start.
 */
export const processPageContent: Record<Locale, ProcessPageContent> = {
  nl: {
    metaTitle: "Werkwijze",
    metaDescription:
      "Zo werkt samenwerken met YM Creations: intake en scope, ontwerp op een testlink, bouw in delen, livegang en ondersteuning daarna. Dezelfde hoofdlijn voor elk project, met een omvang die per project verschilt.",
    label: "Werkwijze",
    title: "Zo wordt een idee een werkend product.",
    intro:
      "Vooraf afspraken over scope, planning en budget. Onderweg zie je elke versie en weet je wat de volgende stap is, ook na livegang.",
    phasesLabel: "Zo verloopt een project",
    phases: [
      {
        number: "01",
        title: "Intake en scope",
        text: "We bespreken wat het product moet doen, voor wie, en wat een eerste versie minimaal nodig heeft. Wat later kan, schuiven we bewust naar later.",
        result: "Een voorstel met scope, planning en budget waar je op akkoord geeft.",
      },
      {
        number: "02",
        title: "Structuur en ontwerp",
        text: "Opbouw, teksten en ontwerp werken we uit op een eigen testlink, zodat je vanaf de eerste versie op je eigen telefoon en laptop meekijkt. Feedback verwerken we in rondes tot de opzet klopt.",
        result: "Een klikbare opzet die je met collega's kunt delen.",
      },
      {
        number: "03",
        title: "Bouw",
        text: "De functies uit de scope worden gebouwd en getest op dezelfde testlink. Bij groter maatwerk gebeurt dat in delen, zodat je onderweg kunt bijsturen zonder dat de afspraken schuiven.",
        result: "Een testversie die stap voor stap compleet wordt.",
      },
      {
        number: "04",
        title: "Livegang en daarna",
        text: "We zetten het product live op je eigen domein en dragen het over, inclusief uitleg van het beheer. Daarna blijven we beschikbaar voor vragen, aanpassingen en uitbreidingen.",
        result: "Een live product, en een adres voor alles wat daarna komt.",
      },
    ],
    resultLabel: "Resultaat",
    scale: {
      title: "Dezelfde hoofdlijn, een andere omvang",
      text: "Elk project doorloopt deze vier fasen, maar niet even lang. Een bedrijfswebsite vraagt één gesprek en een paar feedbackrondes. Een platform of 3D-configurator vraagt meer uitzoekwerk vooraf en een bouw in meerdere delen.",
      phaseLabels: ["Intake", "Ontwerp", "Bouw", "Live"],
      rows: [
        { label: "Bedrijfswebsite", weights: [1, 2, 3, 1] },
        { label: "Platform of configurator", weights: [3, 3, 7, 2] },
      ],
      note: "Verhoudingen zijn indicatief; de planning voor jouw project staat in het voorstel.",
    },
    needs: {
      title: "Wat helpt bij de start",
      text: "Je hoeft niets voor te bereiden. Het gaat wel sneller als dit er al is:",
      items: [
        "Huisstijl of bestaand materiaal, als dat er is",
        "Inhoud: wat je aanbiedt en hoe je dat nu vertelt",
        "Toegang tot systemen waar we mee koppelen",
        "Eén aanspreekpunt dat knopen doorhakt",
      ],
      closing: "Ontbreekt iets, dan bepalen we dat tijdens de intake.",
    },
    cta: {
      label: "Volgende stap",
      title: "De eerste stap is een gesprek.",
      text: "Vertel kort wat je wilt bouwen en waar het nu vastloopt. Dan plannen we een intake, of sturen we eerst een paar vragen terug.",
      primary: "Plan een intake",
      secondary: "Bekijk tarieven",
    },
  },
  en: {
    metaTitle: "How we work",
    metaDescription:
      "How working with YM Creations runs: intake and scope, design on a test link, build in parts, launch and support afterwards. The same outline for every project, at a size that differs per project.",
    label: "How we work",
    title: "How an idea becomes a working product.",
    intro:
      "Agreements on scope, planning and budget up front. Along the way you see every version and know what the next step is, after launch too.",
    phasesLabel: "How a project runs",
    phases: [
      {
        number: "01",
        title: "Intake and scope",
        text: "We discuss what the product has to do, for whom, and what a first version needs at minimum. What can wait, we deliberately move to later.",
        result: "A proposal with scope, planning and budget that you approve.",
      },
      {
        number: "02",
        title: "Structure and design",
        text: "Structure, copy and design are worked out on a test link of its own, so you follow along on your own phone and laptop from the first version. Feedback goes in rounds until the setup is right.",
        result: "A clickable setup you can share with colleagues.",
      },
      {
        number: "03",
        title: "Build",
        text: "The features from the scope are built and tested on the same test link. For larger custom work that happens in parts, so you can steer along the way without the agreements shifting.",
        result: "A test version that becomes complete step by step.",
      },
      {
        number: "04",
        title: "Launch and after",
        text: "We take the product live on your own domain and hand it over, including a walkthrough of the admin. After that we stay available for questions, changes and extensions.",
        result: "A live product, and one address for everything that comes next.",
      },
    ],
    resultLabel: "Result",
    scale: {
      title: "The same outline, a different size",
      text: "Every project goes through these four phases, but not for equally long. A business website takes one conversation and a few feedback rounds. A platform or 3D configurator takes more research up front and a build in several parts.",
      phaseLabels: ["Intake", "Design", "Build", "Live"],
      rows: [
        { label: "Business website", weights: [1, 2, 3, 1] },
        { label: "Platform or configurator", weights: [3, 3, 7, 2] },
      ],
      note: "Proportions are indicative; the planning for your project is in the proposal.",
    },
    needs: {
      title: "What helps at the start",
      text: "You do not need to prepare anything. It does go faster when this already exists:",
      items: [
        "Brand identity or existing material, if there is any",
        "Content: what you offer and how you tell it now",
        "Access to the systems we integrate with",
        "One point of contact who makes the calls",
      ],
      closing: "If something is missing, we settle that during the intake.",
    },
    cta: {
      label: "Next step",
      title: "The first step is a conversation.",
      text: "Tell us briefly what you want to build and where it gets stuck now. Then we plan an intake, or send a few questions back first.",
      primary: "Plan an intake",
      secondary: "View pricing",
    },
  },
};
