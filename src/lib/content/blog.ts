import { getLocalizedPath } from "@/lib/content/routes";
import { serviceDefinitions, serviceKeys } from "@/lib/content/services";
import { type Locale } from "@/lib/content/site-content";

export type BlogCategory =
  | "kosten"
  | "seo"
  | "webapplicaties"
  | "performance";

export type ArticleBlock =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: 2 | 3; content: string }
  | { type: "list"; items: string[] };

export type ArticleLocaleContent = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  category: BlogCategory;
  readingTime: string;
  publishedAt?: string;
  author?: string;
  body: string;
  ctaText: string;
  ctaPrimaryLink: string;
  ctaSecondaryText?: string;
  ctaSecondaryLink?: string;
  relatedServices: string[];
  isPublished: boolean;
};

export type PublishedArticle = ArticleLocaleContent & {
  id: string;
  intro: string;
  bodyBlocks: ArticleBlock[];
  path: string;
};

export type ArticleDefinition = {
  id: string;
  locale: Partial<Record<Locale, ArticleLocaleContent>>;
};

function parseArticleBody(body: string): ArticleBlock[] {
  const lines = body.split("\n");
  const blocks: ArticleBlock[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      blocks.push({
        type: "paragraph",
        content: paragraphBuffer.join("\n"),
      });
      paragraphBuffer = [];
    }
  };

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push({
        type: "list",
        items: [...listBuffer],
      });
      listBuffer = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: 3,
        content: line.slice(4),
      });
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: 2,
        content: line.slice(3),
      });
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listBuffer.push(line.slice(2));
      continue;
    }

    flushList();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function getArticleIntroFromBody(body: string) {
  const firstBlock = parseArticleBody(body).find(
    (block) => block.type === "paragraph",
  );

  return firstBlock?.type === "paragraph" ? firstBlock.content : "";
}

const categoryLabels: Record<Locale, Record<BlogCategory, string>> = {
  en: {
    kosten: "Costs",
    seo: "SEO",
    webapplicaties: "Web applications",
    performance: "Performance",
  },
  nl: {
    kosten: "Kosten",
    seo: "SEO",
    webapplicaties: "Webapplicaties",
    performance: "Performance",
  },
};

export const articles: ArticleDefinition[] = [
  {
    id: "custom-website-cost-2026",
    locale: {
      nl: {
        slug: "wat-kost-een-maatwerk-website-in-2026",
        title: "Wat kost een maatwerk website in 2026?",
        metaTitle: "Wat kost een maatwerk website in 2026? | YM Creations",
        metaDescription:
          "Wat bepaalt de prijs van een maatwerk website in 2026? Een heldere uitleg over scope, design, development, content, integraties en wat echt invloed heeft op de investering.",
        category: "kosten",
        readingTime: "8 min",
        publishedAt: "2026-01-28",
        body: `Een van de meest gestelde vragen in dit vak is ook meteen een van de lastigste om eerlijk te beantwoorden: wat kost een maatwerk website?

Het eerlijke antwoord is dat de prijs niet begint bij design, code of een willekeurig aantal pagina’s. De prijs begint bij de vraag wat de website voor je bedrijf moet doen. Moet hij vooral professioneel vertrouwen opbouwen? Moet hij leads genereren? Moet hij een complex aanbod helder maken? Of moet hij onderdeel worden van een groter digitaal systeem?

Juist daarom lopen offertes voor websites vaak zo ver uiteen. Twee bedrijven kunnen allebei “een nieuwe website” willen, terwijl het ene project in de praktijk vooral een strakke bedrijfswebsite is en het andere eigenlijk een combinatie van positionering, contentstructuur, maatwerk ontwerp, technische uitwerking en performance-optimalisatie.

## Een website kost zelden “meer” door één element

Veel bedrijven zoeken één directe oorzaak voor prijsverschillen. Ze denken bijvoorbeeld dat design het duur maakt, of juist development, of het aantal pagina’s. In de praktijk is het bijna altijd de combinatie van keuzes die de investering bepaalt.

Een maatwerk website wordt duurder zodra meerdere lagen tegelijk belangrijk worden. Denk aan een traject waarin de positionering scherper moet worden, de structuur opnieuw moet worden opgebouwd, het design echt onderscheidend moet voelen en de frontend verfijnd genoeg moet zijn om premium over te komen. Daar komt vaak nog bij dat content opnieuw moet worden geordend of herschreven en dat de site voorbereid moet zijn op SEO, groei of meertaligheid.

Een website die er alleen “netjes” uit moet zien, is iets anders dan een website die een bedrijf online sterker moet positioneren.

## Wat in de praktijk de prijs het meest beïnvloedt

### 1. Scope en complexiteit

Een compacte website met een duidelijke propositie is iets anders dan een site met meerdere diensten, verschillende doelgroeppagina’s, een blogstructuur, meertaligheid of uitgebreide conversieblokken.

Hoe meer beslissingen er in de informatiearchitectuur zitten, hoe groter de impact op de totale investering. Dat geldt ook als de site visueel minimalistisch blijft.

### 2. Hoeveel denkwerk vooraf nodig is

Sommige projecten hebben vooral uitvoering nodig. Andere projecten beginnen met onduidelijke positionering, een versnipperd aanbod of een website die in de basis niet goed vertelt wat het bedrijf doet.

Dan betaal je niet alleen voor “bouwen”, maar ook voor richting. En vaak is juist die laag het verschil tussen een website die er goed uitziet en een website die ook echt werkt.

### 3. Maatwerk design versus generieke structuur

Een template kan prima zijn voor snelheid, maar heeft grenzen. Zodra een merk premium moet aanvoelen, een complex aanbod helder moet worden uitgelegd of de website een sterkere eerste indruk moet maken, kom je sneller uit bij maatwerk.

Dat maatwerk zit niet alleen in visuals, maar vooral in ritme, hiërarchie, spacing, interactie en hoe de pagina het verhaal opbouwt.

### 4. Content en copy

Veel mensen onderschatten hoeveel impact content heeft op een websiteproject. Als de teksten, secties en volgorde nog niet duidelijk zijn, ontstaat daar vaak extra werk.

Een sterke site is meestal geen verzameling losse alinea’s, maar een bewuste volgorde van boodschap, bewijs, uitleg en actie. Dat vraagt inhoudelijke keuzes.

### 5. Integraties en technische eisen

Formulieren, koppelingen, meertaligheid, CMS-keuzes, tracking, consent, performance-eisen of toekomstige uitbreidbaarheid maken een project technisch zwaarder.

Niet altijd zichtbaar aan de voorkant, maar wel bepalend voor de kwaliteit van de uiteindelijke build.

## Het verschil tussen goedkoop en strategisch

Een goedkope website is niet per definitie slecht. Maar goedkoop wordt een risico zodra de site eigenlijk een belangrijke commerciële rol moet spelen.

Als een website je bedrijf geloofwaardiger moet maken, je aanbod helderder moet positioneren en betere aanvragen moet opleveren, dan is de vraag niet alleen: “Wat kost de site?”

De betere vraag is: “Wat kost het als de site daar níet goed genoeg in slaagt?”

Een site die visueel prima oogt maar inhoudelijk vaag is, technisch rommelig aanvoelt of bezoekers niet goed richting geeft, lijkt misschien voordelig in de startfase. Maar juist daar ontstaan vaak redesigns, vertraging en gemiste kansen.

## Wanneer een maatwerk website logisch is

Een maatwerk website is meestal logisch wanneer je bedrijf professioneler is geworden dan je huidige site uitstraalt, wanneer je aanbod te breed of te complex is voor een standaardstructuur, of wanneer je simpelweg niet wilt ogen als een templatebedrijf in een concurrerende markt. Het geldt ook als je een verfijnde merkuitstraling wilt combineren met duidelijke commerciële logica, of als je een fundament nodig hebt dat later kan doorgroeien naar extra pagina’s, SEO-structuur of maatwerk functionaliteit.

In die situaties gaat een website niet meer alleen over “online aanwezig zijn”, maar over positie innemen.

## Wanneer je beter nog niet meteen groot moet bouwen

Niet elk bedrijf heeft direct een uitgebreid traject nodig. Soms is een compacte, scherpe eerste versie slimmer dan een te grote site die alles tegelijk probeert te doen.

Dat geldt vooral als het aanbod nog in beweging is, de positionering nog niet helemaal vaststaat, je eerst wilt testen welke boodschap het beste werkt of je later wilt uitbreiden vanuit een sterke basis.

Een goede studio zal je niet automatisch het grootste pakket verkopen, maar eerder helpen bepalen wat nú de juiste scope is.

## Hoe je een offerte beter beoordeelt

Als je offertes vergelijkt, kijk dan niet alleen naar totaalbedrag of aantal pagina’s. Belangrijker is of duidelijk is wat er wel en niet binnen scope valt, of er aandacht is voor structuur en positionering en of er bewust wordt nagedacht over contentflow en hiërarchie. Je merkt het ook aan de manier waarop het ontwerptraject wordt benaderd: voelt het generiek, of zit er echt richting in? En minstens zo belangrijk is of performance, technische kwaliteit en toekomstige groei onderdeel zijn van de aanpak.

Een goede offerte voelt meestal niet als een los prijsdocument, maar als een heldere vertaling van het project.

## Praktische conclusie

De prijs van een maatwerk website in 2026 wordt niet bepaald door één vaste formule. Hij wordt bepaald door ambitie, complexiteit, inhoud, ontwerpkwaliteit en technische diepgang.

Juist daarom is het slim om niet te beginnen met: “Wat kost een website?”
Begin liever met: “Wat moet deze website voor mijn bedrijf oplossen?”

Dan wordt een prijsindicatie veel zinvoller. En belangrijker: dan kun je ook beter bepalen welke aanpak op dit moment echt past.

Wil je eerst scherper krijgen of je project richting een [bedrijfswebsite](/nl/diensten/bedrijfswebsite), een [landingspagina](/nl/diensten/landingspagina), een [redesign](/nl/diensten/redesign-optimalisatie) of een traject met [performance-optimalisatie](/nl/diensten/performance) gaat? Dan is dat meestal de beste eerste stap vóór je bedragen gaat vergelijken.`,
        ctaText:
          "Wil je helder krijgen wat jouw website echt nodig heeft en waar de investering naartoe gaat? Dan is een korte intake vaak waardevoller dan een snelle prijsindicatie zonder context.",
        ctaPrimaryLink: "/nl/contact",
        ctaSecondaryText: "Bekijk de dienst Bedrijfswebsite",
        ctaSecondaryLink: "/nl/diensten/bedrijfswebsite",
        relatedServices: [
          "/nl/diensten/bedrijfswebsite",
          "/nl/diensten/landingspagina",
          "/nl/diensten/redesign-optimalisatie",
          "/nl/diensten/performance",
        ],
        isPublished: true,
      },
    },
  },
  {
    id: "launch-ready-website-checklist",
    locale: {
      nl: {
        slug: "checklist-launch-ready-website-seo-performance",
        title: "Checklist: launch-ready website (SEO + performance)",
        metaTitle: "Checklist: launch-ready website (SEO + performance) | YM Creations",
        metaDescription:
          "Een praktische checklist om een website launch-ready te maken: SEO, canonicals, sitemap, formulieren, performance, responsiveness en technische controles vóór livegang.",
        category: "seo",
        readingTime: "9 min",
        publishedAt: "2026-02-11",
        body: `Een website kan er visueel af uitzien en technisch toch nog niet klaar zijn om live te gaan.

Dat gebeurt vaker dan veel teams denken. De homepage staat, de content is ingevuld, het formulier werkt op het eerste gezicht en iedereen wil door. Maar juist in de laatste fase ontstaan fouten die later impact hebben op vindbaarheid, vertrouwen of gebruikservaring.

Denk aan een vergeten canonical, een niet bijgewerkte title tag, een sitemap die niet klopt, een contactformulier dat alleen op desktop goed werkt of een site die op mobiel trager en stroever aanvoelt dan tijdens development.

Daarom is een launch-checklist geen formaliteit. Het is het verschil tussen “online staan” en “goed live gaan”.

## 1. Controleer of elke belangrijke pagina een duidelijke taak heeft

Vóór je naar technische details kijkt, moet de basis kloppen. Niet elke pagina hoeft alles te doen, maar elke pagina moet wel een duidelijke rol hebben.

Vraag je per pagina af wat deze precies moet uitleggen, op welke intentie hij aansluit, wat de logische volgende stap voor de bezoeker is en of de CTA duidelijk genoeg is. Een website met technisch nette SEO maar onduidelijke pagina-intentie voelt nog steeds rommelig.

## 2. Check titles, meta descriptions en headings

Dit klinkt voor de hand liggend, maar hier blijven vaak placeholderteksten of dubbele patronen hangen.

Controleer daarom of elke indexeerbare pagina een unieke title heeft, of elke pagina een eigen meta description heeft en of er precies één duidelijke H1 staat. Title, H1 en paginadoel moeten logisch op elkaar aansluiten.

Voor meertalige sites is dit extra belangrijk. Een Nederlandse pagina moet ook echt Nederlands geoptimaliseerd zijn, niet half vertaald of deels hergebruikt.

## 3. Controleer canonicals en indexeerbaarheid

Een van de meest voorkomende fouten bij livegang is dat pagina’s technisch bestaan, maar zoekmachines gemengde signalen krijgen.

Check daarom of de canonical naar de juiste URL van dezelfde taalvariant wijst, of pagina’s die wél moeten ranken niet per ongeluk op noindex staan en of concept-, test- of oude varianten niet indexeerbaar zijn. Controleer ook of intern alleen echte canonieke URL’s worden gelinkt.

Zeker bij een redesign of nieuwe structuur wil je deze laag goed hebben voordat je live gaat.

## 4. Bij meertaligheid: controleer hreflang en counterpart-paden

Bij een NL/EN-structuur moet elke pagina niet alleen zichzelf, maar ook zijn counterpart logisch kunnen aanwijzen.

Controleer of de NL-pagina een correcte EN-counterpart heeft, of de EN-pagina netjes terugverwijst en of gebruikers via de language switcher ook echt op de juiste counterpart uitkomen. Canonicals mogen daarbij nooit per ongeluk naar de andere taal wijzen.

Meertaligheid faalt vaak niet door grote fouten, maar door kleine inconsistenties.

## 5. Sitemap en robots.txt controleren

Voor livegang moet je niet alleen kijken of \`sitemap.xml\` bestaat, maar ook of de inhoud klopt.

Check of de sitemap alleen canonieke, indexeerbare URL’s bevat, of draft- of placeholderpagina’s ontbreken en of er geen belangrijke pagina uitvalt. Kijk ook of \`robots.txt\` netjes naar de sitemap verwijst en of er niets wordt geblokkeerd dat gewoon gecrawld moet kunnen worden.

Een sitemap lost geen kwaliteitstekort op, maar helpt wel bij discovery en structuur.

## 6. Test alle formulieren en contactflows

Een website kan inhoudelijk sterk zijn, maar als de contactflow hapert verlies je precies op het moment dat iemand actie wil nemen.

Test daarom niet alleen of het formulier zichtbaar werkt, maar ook of aanvragen echt aankomen, of foutmeldingen verschijnen waar nodig en of de successtatus duidelijk is. Controleer meteen of e-mailadressen en telefoonnummers overal consistent zijn.

Controleer ook of je bedrijfsgegevens overal hetzelfde zijn. Dat geldt voor zichtbare contactblokken, footer, mailsjablonen en structured data.

## 7. Responsiveness is meer dan “het past op mobiel”

Veel teams testen mobiel alleen visueel: staat alles onder elkaar en breekt niets?

Maar echte responsiveness gaat verder. Op kleinere schermen moet de hiërarchie duidelijk blijven, CTA’s moeten zichtbaar blijven, spacing en leesritme moeten verzorgd aanvoelen en navigatie en formulieren moeten prettig blijven werken.

Een site kan technisch responsive zijn en toch onrustig of stroef voelen.

## 8. Performance check op echte gebruiksmomenten

Performance gaat niet alleen over een score, maar over gevoel in gebruik.

Check daarom op echte pagina’s of de eerste weergave snel genoeg voelt, of knoppen en formulieren direct reageren, of animaties beheerst blijven en of zware JavaScript de interactie niet blokkeert. Grote visuals moeten verstandig laden, zeker op mobiel.

Juist premium websites met motion en visuele lagen hebben hier extra discipline nodig. De ervaring mag verfijnd voelen, maar nooit log of vertraagd.

## 9. Structured data alleen waar het klopt

Structured data is waardevol, maar alleen als de inhoud ook zichtbaar en waarheidsgetrouw is.

Controleer daarom of Organization-, WebSite-, WebPage- en Service-schema klopt met de zichtbare informatie. Voeg geen fake reviews of ratings toe en gebruik geen LocalBusiness-markup zonder zichtbaar en correct adres. Service-markup moet bovendien aansluiten op echte servicepagina’s.

Meer markup is niet automatisch beter. Correcte markup is beter.

## 10. Analytics en Search Console klaarzetten

Voor sommige teams is livegang het eindpunt. In de praktijk is het juist het moment waarop meten begint.

Zorg daarom dat analytics op de juiste omgeving staat, Search Console klaar is en de sitemap kan worden ingediend. Als contactacties belangrijk zijn, hoort event tracking daarbij. En zonder een plan om fouten en prestaties na livegang te monitoren blijft “het werkt volgens mij” te lang een gok.

## 11. Redirects en oude URL’s bij redesigns

Bij een redesign of herstructurering is dit vaak een cruciale stap.

Controleer of oude belangrijke URL’s een logische redirect hebben, of interne links al naar de nieuwe canonieke structuur wijzen en of oude varianten geen onnodig 404-spoor achterlaten. Hetzelfde geldt voor backlinks of oude geïndexeerde pagina’s: die mogen niet zomaar doodlopen.

Dit is vooral belangrijk wanneer een site verschuift van een compacte structuur naar echte service- en contentpagina’s.

## 12. De laatste praktische pre-live check

Vlak voor livegang is het vaak het nuttigst om nog één compacte ronde te doen: titles en descriptions controleren, canonicals en hreflang nalopen, sitemap en \`robots.txt\` verifiëren, formulieren en mobiel gedrag testen, performance globaal checken, contactgegevens vergelijken, analytics en Search Console klaarzetten en tot slot bevestigen dat er geen conceptcontent of test-URL’s zichtbaar zijn.

## Praktische conclusie

Een launch-ready website is niet de site die “ongeveer klaar” voelt, maar de site waarbij de laatste technische en inhoudelijke details bewust zijn gecontroleerd.

Dat is extra belangrijk bij premium websites, redesigns en meertalige setups. Juist daar zit veel waarde in structuur, duidelijkheid en vertrouwen — en precies daar kunnen kleine livegangfouten onnodig veel impact hebben.

Wil je een site live zetten of een bestaande site kritisch nalopen op SEO, structuur en performance? Dan sluit een traject rond [redesign & optimalisatie](/nl/diensten/redesign-optimalisatie), [performance](/nl/diensten/performance) of een nieuwe [bedrijfswebsite](/nl/diensten/bedrijfswebsite) daar logisch op aan.`,
        ctaText:
          "Wil je een nieuwe website of redesign live zetten zonder onnodige SEO- of performancefouten? Laat de laatste technische check dan niet aan toeval over.",
        ctaPrimaryLink: "/nl/contact",
        ctaSecondaryText: "Bekijk Redesign & optimalisatie",
        ctaSecondaryLink: "/nl/diensten/redesign-optimalisatie",
        relatedServices: [
          "/nl/diensten/redesign-optimalisatie",
          "/nl/diensten/performance",
          "/nl/diensten/bedrijfswebsite",
        ],
        isPublished: true,
      },
    },
  },
  {
    id: "webapplicatie-stappenplan",
    locale: {
      nl: {
        slug: "webapplicatie-laten-maken-stappenplan",
        title: "Webapplicatie laten maken: stappenplan van idee naar live",
        metaTitle:
          "Webapplicatie laten maken: stappenplan van idee naar live | YM Creations",
        metaDescription:
          "Een helder stappenplan voor bedrijven die een webapplicatie willen laten maken: van idee, scope en MVP tot design, development, testen en livegang.",
        category: "webapplicaties",
        readingTime: "9 min",
        publishedAt: "2026-02-25",
        body: `Veel bedrijven weten vrij goed dát ze een webapplicatie nodig hebben, maar nog niet precies wat de eerste versie moet worden.

Dat is logisch. Een idee voor een klantportaal, intern dashboard, boekingsflow of maatwerk tool begint meestal niet als een volledig productdocument. Het begint met frustratie in een proces, een terugkerende handmatige taak of een kans die met standaardsoftware niet goed opgelost wordt.

Juist daarom loopt een goed webapplicatietraject zelden van “idee” direct naar “development”. De kwaliteit van de eerste fases bepaalt vaak hoeveel snelheid, helderheid en kosten je later wint of verliest.

## Stap 1: begin bij het probleem, niet bij de featurelijst

De meeste webapplicaties ontsporen vroeg omdat er te snel over features wordt gesproken.

“Er moet een dashboard in.”
“Gebruikers moeten kunnen inloggen.”
“Er moet een overzicht komen met statussen.”

Dat zijn geen slechte ideeën, maar het zijn nog geen goede startpunten. Een betere eerste vraag is: welk probleem moet deze applicatie concreet oplossen?

Misschien kost een handmatig proces te veel tijd, hebben klanten te weinig inzicht in voortgang of data, werken teams in te veel losse tools of ontbreekt er een centrale interface voor een specifieke workflow. Als dat helder wordt, kun je veel beter bepalen wat noodzakelijk is voor versie één.

## Stap 2: definieer de kernworkflow

Een goede webapplicatie voelt meestal eenvoudig aan de voorkant, juist omdat de kernworkflow scherp is gekozen.

Vraag daarom wie de applicatie gebruikt, wat die gebruikers in de praktijk moeten doen, wat de belangrijkste handeling of route is, welke informatie essentieel is en wat nog níet in de eerste versie hoeft.

Hier maak je vaak het verschil tussen een bruikbaar product en een overvolle eerste build.

Een applicatie hoeft niet meteen alles te kunnen. Hij moet eerst het belangrijkste proces goed ondersteunen.

## Stap 3: bepaal wat MVP echt betekent

MVP wordt vaak verkeerd begrepen als “een kale versie”. In werkelijkheid moet een MVP vooral de kleinste versie zijn die logisch, bruikbaar en testbaar is.

Een goede MVP lost één duidelijk probleem op, heeft een beperkte maar complete kernflow, is helder genoeg om echte feedback op te krijgen en laat ruimte voor uitbreiding zonder opnieuw te moeten beginnen.

Een slechte MVP is meestal een losse verzameling halve ideeën die nog niet als product aanvoelt.

## Stap 4: vertaal workflow naar schermen en structuur

Zodra de kern helder is, kun je nadenken over interface en schermstructuur.

Dat betekent niet meteen visueel detailleren. Eerst wil je begrijpen welke schermen nodig zijn, wat de volgorde van gebruik is, welke rollen er bestaan, welke informatie altijd zichtbaar moet zijn en waar frictie of verwarring ontstaat.

Bij maatwerk tools en portalen is dit een cruciale stap. Een mooie interface helpt weinig als de onderliggende logica niet klopt.

## Stap 5: ontwerp voor gebruik, niet alleen voor uitstraling

Bij een webapplicatie draait design minder om “marketinggevoel” en meer om helderheid, ritme en vertrouwen in gebruik.

Goede applicatie-UX draait om overzicht, voorspelbaarheid, duidelijke statusinformatie, logische interacties, rustige hiërarchie en snelheid in handelingen.

Dat betekent niet dat uitstraling onbelangrijk is. Zeker bij klantgerichte portalen of commerciële platforms telt uitstraling mee. Maar bruikbaarheid moet de richting blijven bepalen.

## Stap 6: maak technische keuzes die passen bij de eerste fase

Niet elk idee vraagt direct om een zwaar platform. Soms is een compacte eerste build veel slimmer.

De juiste technische aanpak hangt onder andere af van hoeveel logica erin zit, hoeveel verschillende rollen er zijn, of data realtime of gevoelig is, welke integraties nodig zijn en hoe snel het product later moet kunnen groeien.

Hier is het belangrijk om niet te bouwen alsof versie één direct de eindversie is, maar ook niet zó kort te denken dat je later vastloopt.

## Stap 7: development is meer dan “alles coderen”

In sterke trajecten is development geen losse uitvoeringsfase, maar een gecontroleerde vertaling van scope, UX en technische logica.

Dat betekent heldere prioriteiten, gefaseerde bouw, tussentijdse checks en aandacht voor responsiveness en performance in echte interactie. Daar hoort ook nette afwerking bij van states, foutmeldingen en formulieren.

Juist bij webapplicaties merk je kwaliteit vaak niet aan grote visuele elementen, maar aan de kleine momenten waarop iets soepel, logisch en betrouwbaar aanvoelt.

## Stap 8: testen vóór livegang is geen bijzaak

Bij een bedrijfswebsite kun je soms met een relatief eenvoudige pre-live controle wegkomen. Bij een webapplicatie is testen fundamenteel.

Denk aan de vraag of de belangrijkste flow zonder blokkades werkt, of rollen en rechten logisch zijn, of foutmeldingen begrijpelijk blijven en of mobiel gebruik acceptabel voelt waar dat relevant is. Ook interacties moeten direct genoeg reageren en schermen moeten overzichtelijk blijven zodra er echte data in staan.

Zeker als een applicatie processen ondersteunt, wil je verrassingen na livegang beperken.

## Stap 9: live is het begin van de volgende fase

Een webapplicatie is zelden “af” na launch. De eerste livefase laat juist zien waar gebruikers vastlopen, welke features minder belangrijk zijn dan gedacht, welke onderdelen extra diepgang nodig hebben en waar performance of UX nog verfijnd kan worden.

Daarom werkt een gefaseerde benadering vaak beter dan een alles-of-niets traject.

## Veelgemaakte fout: te groot beginnen

Een van de duurste fouten is te vroeg te veel willen bouwen.

Dat gebeurt vaak als bedrijven alle toekomstige ideeën nu al willen meenemen, elke interne wens als MVP-feature gaan zien, design en logica tegelijk te breed maken en te weinig prioriteren.

Een sterk webapplicatietraject voelt niet als “zoveel mogelijk bouwen”, maar als “de juiste eerste versie scherp krijgen”.

## Wanneer een maatwerk webapplicatie logisch is

Een maatwerk applicatie is meestal logisch als standaardsoftware je proces zichtbaar afremt, je workflow te specifiek is voor generieke tools, klantinzage, dashboards of portals een echte meerwaarde geven of je iets wilt bouwen dat onderdeel is van je commerciële of operationele model.

Dan verschuift het gesprek van “welke tool kunnen we gebruiken?” naar “welke digitale structuur hebben we eigenlijk nodig?”

## Praktische conclusie

Een webapplicatie laten maken begint niet bij code. Het begint bij scherpte.

Scherpte over het probleem. Scherpte over de kernworkflow. Scherpte over wat de eerste versie moet doen — en wat nog niet.

Als die basis klopt, worden design, development, testing en livegang veel sterker. En minstens zo belangrijk: dan bouw je niet alleen iets technisch werkends, maar iets dat in de praktijk echt bruikbaar is.

Wil je een idee vertalen naar een eerste scope voor een [webapplicatie](/nl/diensten/webapplicatie-laten-maken)? Of wil je eerst bepalen welke onderdelen in een eerste versie thuishoren en waar [performance](/nl/diensten/performance) of latere uitbreiding een rol spelen? Dan is een goede intake meestal de slimste eerste stap.`,
        ctaText:
          "Heb je een idee voor een portaal, dashboard of maatwerk tool en wil je eerst scherp krijgen wat haalbaar is als eerste versie? Dan begint een goed traject met scope, niet met losse features.",
        ctaPrimaryLink: "/nl/contact",
        ctaSecondaryText: "Bekijk Webapplicatie laten maken",
        ctaSecondaryLink: "/nl/diensten/webapplicatie-laten-maken",
        relatedServices: [
          "/nl/diensten/webapplicatie-laten-maken",
          "/nl/diensten/performance",
          "/nl/contact",
        ],
        isPublished: true,
      },
    },
  },
  {
    id: "inp-responsief-uitgelegd",
    locale: {
      nl: {
        slug: "inp-uitgelegd-hoe-maak-je-een-site-echt-responsief",
        title: "INP uitgelegd: hoe maak je een site écht responsief?",
        metaTitle:
          "INP uitgelegd: hoe maak je een site écht responsief? | YM Creations",
        metaDescription:
          "Wat is INP en waarom zegt het iets over hoe responsief een website echt voelt? Een praktische uitleg over interactie, frontend-frictie en wat sites stroef maakt.",
        category: "performance",
        readingTime: "8 min",
        publishedAt: "2026-03-10",
        body: `Veel websites zijn technisch responsive in de klassieke zin van het woord: ze schalen naar mobiel, breken niet op kleinere schermen en tonen overal dezelfde content.

Toch voelt zo’n site in gebruik soms nog steeds traag of stroef.

Je tikt op een knop en er gebeurt net te laat iets. Je opent een menu en het reageert niet direct. Een formulier voelt zwaarder dan het eruitziet. Een animatie is mooi, maar vertraagt precies het moment waarop iemand iets wil doen.

Daar komt INP in beeld.

## Wat is INP eigenlijk?

INP staat voor Interaction to Next Paint. Simpel gezegd kijkt het naar hoe snel een pagina zichtbaar reageert nadat iemand ermee interacteert.

Dus niet alleen wanneer de pagina voor het eerst laadt, maar juist wat er gebeurt nádat iemand begint te klikken, tikken, typen of openen.

Dat maakt INP interessant, omdat het dichter op de echte ervaring zit. Een site kan prima laden en toch slecht aanvoelen zodra iemand hem gebruikt.

## Waarom INP belangrijk is voor premium websites

Bij premium websites ligt de lat hoger. Bezoekers verwachten niet alleen een sterke uitstraling, maar ook rust, controle en snelheid in gebruik.

Zodra een site visueel verfijnd is maar interacties stroef voelen, ontstaat er een vreemd spanningsveld: de site oogt premium, maar gedraagt zich niet premium.

Juist daarom is INP geen puur technisch getal. Het is een signaal voor hoe direct een website op de gebruiker reageert.

## Een site voelt traag door meer dan alleen “snelheid”

Veel teams praten over performance alsof het alleen om laadtijd gaat. In werkelijkheid zijn er meerdere soorten traagheid: traagheid vóór de pagina zichtbaar is, traagheid tijdens scroll en animatie, traagheid op het moment van interactie en traagheid doordat de interface te veel tegelijk probeert te doen.

INP raakt vooral dat derde punt: hoe snel reageert de site als iemand echt iets doet?

## Wat websites vaak stroef maakt

### 1. Te veel JavaScript op het verkeerde moment

Een pagina kan er visueel rustig uitzien en onder de motorkap toch veel te zwaar zijn. Zodra scripts veel werk tegelijk moeten doen, merk je dat vaak precies op interactiemomenten.

Denk aan uitgebreide UI-logica, zware componenten, onnodige listeners, scripts die tegelijk op de main thread draaien of interacties die te veel afhankelijkheden triggeren.

De gebruiker ziet de code niet, maar voelt wel de vertraging.

### 2. Animatie zonder rem

Animatie kan een website juist sterker maken. Maar animatie wordt een probleem zodra alles beweegt, alles georkestreerd voelt of interacties moeten wachten op visuele effecten.

Goede motion ondersteunt oriëntatie.
Slechte motion vertraagt actie.

Dat geldt extra voor knoppen, menusystemen, overlays en grote sectietransities.

### 3. Componenten die te veel willen

Soms wordt een relatief simpele interface onnodig complex opgebouwd. Een accordeon, filter, formulier of kaartgrid krijgt dan zoveel logica mee dat de ervaring zwaarder wordt dan nodig is.

Niet elk element hoeft “slim” te zijn. Soms is eenvoud de snelste route naar een betere gebruikerservaring.

### 4. Formulieren en menu’s zonder direct gevoel

Een site voelt vaak het snelst of traagst aan op twee plekken: navigatie en formulieren.

Dat zijn de momenten waarop mensen bewust actie willen nemen. Elke hapering wordt daar sterker gevoeld dan in een statische contentsectie.

## Responsief is dus ook gedragsmatig

Veel mensen gebruiken “responsive” nog steeds vooral voor layout. Maar echte responsiviteit gaat ook over gedrag.

Een echt responsieve site reageert direct op input, voelt voorspelbaar, dwingt geen onnodige wachttijd af, gebruikt motion beheerst, houdt interacties helder en blijft ook op mobiel licht genoeg in gebruik.

Dus ja: schermgrootte hoort erbij. Maar gedrag hoort er net zo goed bij.

## Hoe verbeter je INP in de praktijk?

### Maak interacties kleiner en duidelijker

Niet elke klik hoeft een mini-app te activeren. Kijk kritisch naar wat een interactie echt moet doen.

Vraag jezelf af of het simpeler kan, of iets direct op de hoofdthread moet gebeuren, of er te veel tegelijk wordt geladen en of er visuele vertraging zit tussen input en reactie.

### Gebruik motion als ondersteuning, niet als obstakel

Een knop mag verfijnd aanvoelen.
Een menu mag mooi openen.
Een overgang mag richting geven.

Maar de interactie zelf moet centraal blijven. Zodra de site “wacht” op zijn eigen effect, voelt dat zelden goed.

### Verminder onrust in componentarchitectuur

Performanceproblemen ontstaan vaak niet uit één groot lek, maar uit veel kleine keuzes: te veel wrappers, te veel her-renders, te veel gekoppelde states en te veel scripts die tegelijk belangrijk worden gevonden.

Een scherpere componentstructuur maakt een site vaak niet alleen sneller, maar ook onderhoudbaarder.

### Test op echte gebruiksmomenten

Kijk niet alleen of de pagina laadt, maar vooral hoe het menu voelt, hoe een formulier reageert, hoe snel een overlay opent, hoe soepel content filtert of wisselt en of mobiel gebruik nog steeds direct genoeg aanvoelt.

Daar merk je of de site technisch netjes is of ook echt prettig in gebruik.

## INP en design horen bij elkaar

INP klinkt technisch, maar de oorzaak zit vaak op het snijvlak van design en development.

Een drukke interface, onduidelijke interacties of te veel bewegende onderdelen maken development zwaarder. En een te technische build zonder gevoel voor UX maakt een interface sneller onrustig.

Daarom levert performance meestal de beste resultaten op wanneer ontwerpkeuzes en technische keuzes samen bekeken worden.

## Wanneer je dit serieus moet nemen

INP verdient extra aandacht als je site veel interactie heeft, je merk premium of high-end wil aanvoelen, motion onderdeel is van de beleving, formulieren of menusystemen een belangrijke rol spelen of je redesign wel mooier is geworden maar nog niet directer in gebruik.

In die situaties is “het laadt snel genoeg” vaak niet de juiste eindconclusie.

## Praktische conclusie

Een site is pas echt responsief als hij niet alleen goed schaalt, maar ook goed reageert.

Dat is precies waarom INP nuttig is. Het dwingt je om niet alleen naar de eerste indruk te kijken, maar ook naar het moment waarop een gebruiker iets verwacht van de interface.

En daar wordt kwaliteit vaak het duidelijkst voelbaar.

Wil je dat een site niet alleen mooier oogt, maar ook sneller, directer en verfijnder aanvoelt in gebruik? Dan ligt de logische volgende stap meestal bij [performance optimalisatie](/nl/diensten/performance), soms gecombineerd met [redesign & optimalisatie](/nl/diensten/redesign-optimalisatie) of een sterkere basis voor een [bedrijfswebsite](/nl/diensten/bedrijfswebsite).`,
        ctaText:
          "Wil je dat je website niet alleen strak oogt, maar ook direct en soepel aanvoelt zodra iemand ermee werkt? Dan is performance niet iets voor achteraf.",
        ctaPrimaryLink: "/nl/contact",
        ctaSecondaryText: "Bekijk Performance optimalisatie",
        ctaSecondaryLink: "/nl/diensten/performance",
        relatedServices: [
          "/nl/diensten/performance",
          "/nl/diensten/redesign-optimalisatie",
          "/nl/diensten/bedrijfswebsite",
        ],
        isPublished: true,
      },
    },
  },
];

export const blogOverviewContent = {
  en: {
    metaTitle: "Insights",
    metaDescription:
      "Insights from YM Creations on websites, web applications, ecommerce, performance, redesign, and multilingual technical SEO.",
    eyebrow: "Insights",
    title:
      "A growing knowledge base around premium websites, web applications, performance, and multilingual structure.",
    intro:
      "The insights section is where YM Creations publishes practical thinking around digital structure, frontend quality, performance, ecommerce, redesign decisions, and multilingual SEO foundations.",
    pillarsTitle: "Topics this section is built around",
    pillars: [
      {
        title: "Websites",
        description:
          "Positioning, page structure, messaging hierarchy, and how premium websites support commercial intent.",
      },
      {
        title: "Web applications",
        description:
          "Workflow-driven interfaces, custom tools, portals, and how structure affects usability.",
      },
      {
        title: "Ecommerce",
        description:
          "Storefront clarity, product presentation, conversion flow, and technical polish for online shops.",
      },
      {
        title: "Performance",
        description:
          "Frontend execution, responsiveness, interaction quality, and the technical side of a sharper user experience.",
      },
      {
        title: "Redesign",
        description:
          "How to approach site improvements when the current experience no longer matches the business.",
      },
      {
        title: "Technical SEO",
        description:
          "Multilingual routing, information architecture, internal linking, and scalable metadata foundations.",
      },
    ],
    supportTitle: "Built to connect insight with execution",
    supportText:
      "This section supports the service work, not empty publishing volume. New insights and future case content will grow around real project patterns, technical decisions, and practical implementation lessons.",
    emptyState:
      "English article detail pages will only go live when finalized English editorial copy is available.",
  },
  nl: {
    metaTitle: "Inzichten",
    metaDescription:
      "Inzichten van YM Creations over websites, webapplicaties, ecommerce, performance, redesign en meertalige technische SEO.",
    eyebrow: "Inzichten",
    title:
      "Een groeiende kennisbasis rond premium websites, webapplicaties, performance en meertalige structuur.",
    intro:
      "De inzichten-sectie is waar YM Creations praktische kennis deelt over digitale structuur, frontend kwaliteit, performance, ecommerce, redesign-keuzes en meertalige SEO-fundamenten.",
    pillarsTitle: "Onderwerpen waar deze sectie om draait",
    pillars: [
      {
        title: "Websites",
        description:
          "Positionering, paginastructuur, boodschapshiërarchie en hoe premium websites commerciële intentie ondersteunen.",
      },
      {
        title: "Webapplicaties",
        description:
          "Workflow-gedreven interfaces, maatwerk tools, portalen en hoe structuur gebruiksgemak beïnvloedt.",
      },
      {
        title: "Ecommerce",
        description:
          "Storefront-structuur, productpresentatie, conversieflow en technische afwerking voor webshops.",
      },
      {
        title: "Performance",
        description:
          "Frontend uitvoering, responsiveness, interactiekwaliteit en de technische kant van een scherpere gebruikerservaring.",
      },
      {
        title: "Redesign",
        description:
          "Hoe je een site verbetert wanneer de huidige ervaring niet meer past bij het niveau van het bedrijf.",
      },
      {
        title: "Technische SEO",
        description:
          "Meertalige routing, informatiearchitectuur, interne links en schaalbare metadata-fundamenten.",
      },
    ],
    supportTitle: "Gebouwd om inzicht met uitvoering te verbinden",
    supportText:
      "Deze sectie ondersteunt het servicewerk, niet lege publicatievolumes. Nieuwe inzichten en toekomstige case content groeien vanuit echte projectpatronen, technische keuzes en praktische implementatielessen.",
    emptyState: "",
  },
} as const;

export function getBlogOverviewPath(locale: Locale) {
  return getLocalizedPath(locale, "blog");
}

export function getArticlePath(locale: Locale, slug: string) {
  return `${getLocalizedPath(locale, "blog")}/${slug}`;
}

export function getPublishedArticles(locale: Locale): PublishedArticle[] {
  return articles
    .map((article) => {
      const localized = article.locale[locale];

      if (!localized || !localized.isPublished) {
        return null;
      }

      return {
        ...localized,
        id: article.id,
        intro: getArticleIntroFromBody(localized.body),
        bodyBlocks: parseArticleBody(localized.body),
        path: getArticlePath(locale, localized.slug),
      };
    })
    .filter((article): article is PublishedArticle => article !== null);
}

export function getArticleBySlug(locale: Locale, slug: string) {
  return (
    getPublishedArticles(locale).find((article) => article.slug === slug) ?? null
  );
}

export function getPublishedArticlePaths(locale: Locale) {
  return getPublishedArticles(locale).map((article) => article.path);
}

export function getArticleMetadataInput(
  locale: Locale,
  article: PublishedArticle,
) {
  return {
    title: article.metaTitle,
    description: article.metaDescription,
    pathname: getArticlePath(locale, article.slug),
  };
}

export function getBlogCategoryLabel(locale: Locale, category: BlogCategory) {
  return categoryLabels[locale][category];
}

export function getArticleDateLabel(locale: Locale, date: string) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function getRelatedLinkLabel(locale: Locale, href: string) {
  if (href === getLocalizedPath(locale, "contact")) {
    return locale === "nl" ? "Contact" : "Contact";
  }

  const staticLabels = {
    en: {
      services: "Services",
      projects: "Projects",
      contact: "Contact",
      blog: "Insights",
    },
    nl: {
      services: "Diensten",
      projects: "Projecten",
      contact: "Contact",
      blog: "Inzichten",
    },
  } as const;

  for (const route of ["services", "projects", "contact", "blog"] as const) {
    if (href === getLocalizedPath(locale, route)) {
      return staticLabels[locale][route];
    }
  }

  const service = serviceKeys
    .map((key) => serviceDefinitions[key].locale[locale])
    .find(
      (localizedService) =>
        `${getLocalizedPath(locale, "services")}/${localizedService.slug}` === href,
    );

  return service?.navLabel ?? href;
}
