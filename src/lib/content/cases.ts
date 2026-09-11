import { getLocalizedPath } from "@/lib/content/routes";
import { type Locale } from "@/lib/content/site-content";

/**
 * Case descriptions of projects that are live.
 *
 * A case is not a second kind of project: it is the long form of a row in
 * `content/projects.ts`, tied to it by `projectId`. The row stays the short
 * version on the overview and on a service page; the case is the page that
 * explains one project in full.
 *
 * A case exists per locale and only where it is actually written. There is no
 * placeholder in a language that has none: `getCaseStudyBySlug` and
 * `getPublishedCaseStudyPaths` return nothing for that locale, so the route
 * has no path to prerender and the URL is a real 404.
 */

export type CaseStudyMetric = {
  label: string;
  value: string;
  context?: string;
};

export type CaseStudyMedia = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** One line under the image, where the image needs placing in the story. */
  caption?: string;
};

/** One heading with its paragraphs; see `components/prose-sections`. */
export type CaseStudySection = {
  heading: string;
  paragraphs: string[];
};

export type CaseStudyLocaleContent = {
  slug: string;
  title: string;
  /** One line for a card or a link; not shown on the case itself. */
  summary: string;
  description: string;
  /** The lede under the title. */
  intro: string;
  /** The case itself, as running text. */
  sections: CaseStudySection[];
  screenshots: CaseStudyMedia[];
  relatedServices: string[];
  /** The closing block; its own words, not a copy of the service page's. */
  cta: { title: string; text: string; serviceLabel: string };
  /**
   * Kept for a case that has them, and deliberately empty here: a metric or a
   * measured outcome belongs on a page only when it has been measured.
   */
  metrics?: CaseStudyMetric[];
  isPublished: boolean;
};

export type CaseStudyDefinition = {
  id: string;
  /** The row in `content/projects.ts` this case belongs to. */
  projectId: string;
  locale: Partial<Record<Locale, CaseStudyLocaleContent>>;
};

export const caseStudies: CaseStudyDefinition[] = [
  {
    id: "flexora-bouw-configurator",
    projectId: "flexora-bouw",
    locale: {
      nl: {
        slug: "flexora-bouw",
        title: "3D-configurator voor Flexora Bouw",
        summary:
          "Een aanbouw samenstellen in de browser, met een prijsindicatie die meebeweegt en een offerteaanvraag vanuit de samenstelling.",
        description:
          "Hoe de 3D-configurator van Flexora Bouw werkt: welke keuzes een bezoeker maakt, hoe het beeld en de prijsindicatie meebewegen, en hoe de samenstelling als offerteaanvraag doorgaat.",
        intro:
          "Flexora Bouw bouwt aanbouwen, opbouwen, dakkapellen en interieurrenovaties. Voor de aanbouw staat op hun site een configurator waarin een bezoeker het hele ontwerp zelf samenstelt en meteen ziet wat het wordt en wat het ongeveer kost.",
        sections: [
          {
            heading: "De vraag achter de configurator",
            paragraphs: [
              "Een aanbouw is geen product met een prijskaartje. De maat verschilt per woning, de gevel moet aansluiten op wat er al staat, en of er een daklicht, een overstek of een groen dak bij komt, verandert zowel het beeld als het bedrag. Wie zoiets aanvraagt, weet vaak nog niet welke kant hij op wil, en wie het offreert kan pas rekenen als die keuzes gemaakt zijn.",
              "Op de site van Flexora staat de configurator daarom naast de gewone offerteaanvraag, niet in plaats daarvan. In de hero staan beide knoppen: “Configureer uw aanbouw” en “Offerte aanvragen”. Bezoekers die al weten wat ze willen, kunnen direct contact opnemen; bezoekers die het nog moeten uitvinden, kunnen het eerst zelf uitproberen.",
            ],
          },
          {
            heading: "Wat de bezoeker samenstelt",
            paragraphs: [
              "De configurator is opgedeeld in een buitenzijde en een binnenzijde, met bovenin een schakelaar tussen die twee. Aan de buitenzijde kiest de bezoeker de afmetingen en vervolgens de gevelbekleding, in drie groepen: steenstrips baksteen in vier tinten, kunststof rabat in vier kleuren en hout in vier uitvoeringen, horizontaal of verticaal. Daaronder staan de onderdelen die de aanbouw afmaken: rollaag, kozijn, daklicht, groen dak, daktrim, overstek, inbouwspots in het overstek, buitenlicht, buitenstopcontact, buitenkraan en regenpijp.",
              "Niet elke keuze staat los. Bij de inbouwspots staat, zolang er geen overstek gekozen is, dat er eerst een overstek geselecteerd moet worden. De configurator laat de optie zien maar houdt hem dicht tot de keuze waar hij van afhangt gemaakt is, zodat er geen samenstelling ontstaat die in de praktijk niet kan.",
              "De binnenzijde is een tweede stap in dezelfde configuratie, met stucwerk, schilderwerk, vloerverwarming, verlichting, spotjes en stopcontacten. De buitenzijde en de afmetingen blijven daarbij staan; op de pagina wordt dat er ook bij gezegd. De bezoeker begint dus niet opnieuw wanneer hij van buiten naar binnen schakelt.",
            ],
          },
          {
            heading: "Hoe het beeld wordt opgebouwd",
            paragraphs: [
              "Wat de bezoeker ziet, is een 3D-beeld van de aanbouw tegen een bestaande woning, met de kozijnen, het terras en de begroeiing erbij, zodat een keuze in verhouding te beoordelen is. In de pagina die de browser krijgt, is dat beeld opgebouwd uit vooraf gerenderde beeldlagen die over elkaar liggen: een basislaag van de aanbouw, en daarboven een laag per gekozen onderdeel, zoals de gevelbekleding, het kozijn en de daktrim.",
              "Die lagen zijn per combinatie gemaakt en niet generiek samengesteld. Een buitenlamp, een buitenkraan of een stopcontact bestaat als aparte laag per positie en per gevelafwerking, en een stopcontact ook nog enkel of dubbel. Dat is meer voorbereidend renderwerk, maar het levert een beeld op waarin een lamp op rode baksteen er ook echt uitziet als een lamp op rode baksteen.",
              "De alternatieven staan al in dezelfde pagina, met lazy loading, zodat een andere gevelbekleding of een ander kozijn direct zichtbaar is in plaats van na een nieuwe laadronde. Er wordt geen 3D-scène in de browser opgebouwd; de weergave is beeldwerk dat gewisseld wordt. Daardoor werkt de configurator ook op een telefoon zonder dat er een zware viewer geladen moet worden.",
            ],
          },
          {
            heading: "Van prijsindicatie naar offerteaanvraag",
            paragraphs: [
              "Linksonder in het beeld staat doorlopend een prijsindicatie inclusief btw, die met de samenstelling meebeweegt. Het is uitdrukkelijk een indicatie en geen offerte, en dat staat er ook zo bij. Naast het totaalbedrag staat een prijsopbouw, zodat het bedrag niet één getal zonder herkomst is. De bezoeker kan de configuratie ook resetten en opnieuw beginnen.",
              "Aan het eind gaat de samenstelling als offerteaanvraag door naar Flexora, vrijblijvend. Dat is het punt waar de configurator zijn werk doet: er komt geen losse vraag binnen maar een compleet ontwerp met afmetingen, materialen en opties, waar Flexora een echte offerte op kan baseren.",
            ],
          },
          {
            heading: "Wat er verder is opgeleverd",
            paragraphs: [
              "De configurator staat niet op zichzelf maar op een complete bedrijfswebsite. Daar staan de vier diensten van Flexora — aanbouw, opbouw en dakopbouw, dakkapel en interieurrenovatie — met een werkwijzepagina, een projectenoverzicht met eigen fotografie van uitgevoerd werk, en een kennisbank met artikelen. De configurator heeft een eigen ingang in de hoofdnavigatie en een vaste knop rechtsboven op elke pagina.",
              "Wil je zien of iets vergelijkbaars bij jouw product past, dan staat op de dienstpagina [3D-configurator laten maken](/nl/diensten/3d-configurator) wat zo'n traject inhoudt en waar de scope van afhangt.",
            ],
          },
        ],
        screenshots: [
          {
            src: "/images/projects/flexora-configurator.jpg",
            width: 2000,
            height: 1250,
            alt: "De configurator van Flexora Bouw: een 3D-beeld van een aanbouw van 4 bij 3 meter met rode baksteen, naast een keuzepaneel met gevelbekleding in steenstrips, kunststof rabat en hout, en linksonder een prijsindicatie inclusief btw van € 43.400,00",
            caption:
              "De buitenzijde, met de schakelaar naar de binnenzijde linksboven en de meebewegende prijsindicatie linksonder.",
          },
          {
            src: "/images/projects/flexora-home.jpg",
            width: 2000,
            height: 1250,
            alt: "Homepage van Flexora Bouw met de titel Maatwerk in aanbouw, opbouw en renovatie, een dienstenkeuze en de knoppen Configureer uw aanbouw en Offerte aanvragen",
            caption:
              "De homepage zet de configurator en de gewone offerteaanvraag naast elkaar als twee routes naar contact.",
          },
        ],
        relatedServices: ["/nl/diensten/3d-configurator"],
        cta: {
          title: "Laat zich jouw product ook in keuzes vangen?",
          text: "Niet elk product leent zich ervoor. Het gaat erom of de opties, de maten en de regels ertussen zo vast te leggen zijn dat een klant er zelf uit komt. Beschrijf wat je verkoopt en welke keuzes daarbij horen; dan is die vraag meestal in één gesprek te beantwoorden.",
          serviceLabel: "Bekijk 3D-configurator laten maken",
        },
        isPublished: true,
      },
    },
  },
];

type PublishedCaseStudy = CaseStudyLocaleContent & { id: string; projectId: string };

function published(locale: Locale): PublishedCaseStudy[] {
  return caseStudies.flatMap((caseStudy) => {
    const localized = caseStudy.locale[locale];

    if (!localized || !localized.isPublished) {
      return [];
    }

    return [{ id: caseStudy.id, projectId: caseStudy.projectId, ...localized }];
  });
}

export function getCaseStudyBySlug(locale: Locale, slug: string) {
  return published(locale).find((caseStudy) => caseStudy.slug === slug) ?? null;
}

export function getPublishedCaseStudyPaths(locale: Locale) {
  return published(locale).map((caseStudy) => caseStudy.slug);
}

/** Where a case lives, under the projects path of its own locale. */
export function getCaseStudyPath(locale: Locale, slug: string) {
  return `${getLocalizedPath(locale, "projects")}/${slug}`;
}

/**
 * The case for a project row, or null when that project has none in this
 * locale. That is what keeps a Dutch case from being linked as if it were an
 * English one.
 */
export function getCaseStudyPathForProject(locale: Locale, projectId: string) {
  const caseStudy = published(locale).find((item) => item.projectId === projectId);

  return caseStudy ? getCaseStudyPath(locale, caseStudy.slug) : null;
}
