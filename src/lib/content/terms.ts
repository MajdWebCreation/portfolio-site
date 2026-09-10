/**
 * Algemene Voorwaarden B2B van YM Creations, versie 1.0 (10 september 2026).
 *
 * Generated verbatim from the PDF in public/legal; the PDF is the legal source.
 * Do not edit the wording here: replace the PDF and regenerate instead.
 */

export type TermsClause = { number: string; text: string };

export type TermsArticle = {
  number: number;
  title: string;
  clauses: TermsClause[];
};

export type TermsTable = {
  caption?: string;
  columns: string[];
  rows: string[][];
  note?: string;
};

export type TermsNote = { heading: string; text: string };

export const termsDocument = {
  version: "1.0",
  dateIso: "2026-09-10",
  dateLabel: "10 september 2026",
  versionLine: "Versie 1.0 - 10 september 2026",
  title: "Algemene Voorwaarden",
  audience: "B2B",
  subtitle: "Websiteontwikkeling, webshops, webapplicaties, portals, 3D-configurators, integraties, hosting en technisch beheer.",
  pdf: {
  "path": "/legal/YM_Creations_Algemene_Voorwaarden_B2B_v1.0.pdf",
  "fileName": "YM_Creations_Algemene_Voorwaarden_B2B_v1.0.pdf",
  "sizeLabel": "200 kB"
},
  colophon: "YM Creations - KvK 96175354 - contact@ymcreations.com - +31 6 53400220 - ymcreations.com",
  contentsHeading: "Inhoud",
  importantNote: {
  "heading": "Belangrijk",
  "text": "De offerte blijft de primaire bron voor projectspecifieke afspraken. Als een onderdeel niet in de offerte of opdrachtbevestiging staat, mag het niet alleen op basis van algemene marketingteksten als inbegrepen worden verondersteld."
} as TermsNote,
  articles: [
  {
    "number": 1,
    "title": "Definities",
    "clauses": [
      {
        "number": "1.1",
        "text": "YM Creations: de opdrachtnemer die onder de handelsnaam YM Creations diensten levert en staat ingeschreven bij de Kamer van Koophandel onder nummer 96175354."
      },
      {
        "number": "1.2",
        "text": "Klant: de natuurlijke persoon handelend in de uitoefening van beroep of bedrijf, rechtspersoon of andere zakelijke entiteit die met YM Creations een overeenkomst sluit."
      },
      {
        "number": "1.3",
        "text": "Overeenkomst: de combinatie van de geaccepteerde offerte of opdrachtbevestiging, deze voorwaarden, eventuele beheer-/hostingbijlage, een eventuele verwerkersovereenkomst en uitdrukkelijk overeengekomen aanvullingen."
      },
      {
        "number": "1.4",
        "text": "Project: de eenmalige ontwikkeling, bouw, herbouw, integratie of implementatie van een website, webshop, webapplicatie, portal, configurator of andere digitale oplossing."
      },
      {
        "number": "1.5",
        "text": "Bug: een reproduceerbare afwijking van een concreet overeengekomen functionele of technische eis binnen de overeengekomen en ondersteunde gebruiksomgeving."
      },
      {
        "number": "1.6",
        "text": "Wijziging of feature: een nieuwe of gewijzigde wens die niet noodzakelijk is om een overeengekomen eis correct uit te voeren, zoals een nieuwe pagina, nieuwe workflow, ander ontwerp, extra formulier, andere productlogica, nieuwe API of uitgebreide adminfunctie."
      },
      {
        "number": "1.7",
        "text": "Technisch beheer: de beperkte, uitdrukkelijk omschreven operationele dienstverlening voor het door YM beheerde deel van de technische omgeving; technisch beheer is geen onbeperkte support-, content- of developmentbundel."
      },
      {
        "number": "1.8",
        "text": "Derde dienst: een externe dienst of leverancier, zoals hosting/cloud, database, e-mail, betaalprovider, API, analytics, DNS, domeinregistratie, CDN, storage of softwarelicentie."
      },
      {
        "number": "1.9",
        "text": "Werkdag: maandag tot en met vrijdag, met uitzondering van in Nederland algemeen erkende feestdagen."
      }
    ]
  },
  {
    "number": 2,
    "title": "Toepasselijkheid en doelgroep",
    "clauses": [
      {
        "number": "2.1",
        "text": "Deze voorwaarden zijn van toepassing op alle zakelijke aanbiedingen, opdrachten en overeenkomsten van YM Creations, tenzij schriftelijk anders is overeengekomen."
      },
      {
        "number": "2.2",
        "text": "Deze voorwaarden gelden uitsluitend voor zakelijke opdrachtgevers die handelen in de uitoefening van beroep of bedrijf. YM Creations aanvaardt geen consumentenopdrachten onder deze voorwaarden."
      },
      {
        "number": "2.3",
        "text": "Afwijkingen gelden alleen voor zover zij uitdrukkelijk schriftelijk of elektronisch zijn overeengekomen."
      },
      {
        "number": "2.4",
        "text": "Voorwaarden van de klant worden uitdrukkelijk van de hand gewezen, tenzij YM Creations deze schriftelijk heeft aanvaard."
      }
    ]
  },
  {
    "number": 3,
    "title": "Offertes en totstandkoming",
    "clauses": [
      {
        "number": "3.1",
        "text": "Een offerte is vrijblijvend tot acceptatie en geldt gedurende de daarin genoemde geldigheidsduur. Indien geen termijn is genoemd, geldt een geldigheidsduur van 30 kalenderdagen."
      },
      {
        "number": "3.2",
        "text": "De overeenkomst komt tot stand zodra de klant de offerte of opdrachtbevestiging schriftelijk of elektronisch aanvaardt, of zodra YM Creations op uitdrukkelijk verzoek van de klant met uitvoering begint."
      },
      {
        "number": "3.3",
        "text": "YM Creations vermeldt waar mogelijk een offerte-ID, versiedatum en scopeversie. Alleen de geaccepteerde versie is bindend."
      },
      {
        "number": "3.4",
        "text": "De klant ontvangt deze voorwaarden vóór of uiterlijk bij het sluiten van de overeenkomst als PDF of op een andere manier waarmee zij kunnen worden opgeslagen. YM Creations bewaart welke versie van de voorwaarden bij de overeenkomst hoorde."
      },
      {
        "number": "3.5",
        "text": "Gepubliceerde vanafprijzen zijn uitsluitend instapprijzen voor een basisconfiguratie. De exacte projectprijs en omvang volgen uit de offerte."
      }
    ]
  },
  {
    "number": 4,
    "title": "Documentrangorde",
    "clauses": [
      {
        "number": "4.1",
        "text": "Bij tegenstrijdigheid geldt, tenzij uitdrukkelijk anders bepaald: (a) een later door beide partijen geaccepteerde specifieke wijziging of aanvullende overeenkomst; (b) de geaccepteerde offerte/opdrachtbevestiging; (c) een verwerkersovereenkomst uitsluitend voor privacy- en verwerkingsonderwerpen; (d) de Technisch Beheer & Hosting-bijlage; (e) deze Algemene Voorwaarden."
      },
      {
        "number": "4.2",
        "text": "Projectspecificaties, concrete functies, pagina-aantallen, talen, integraties, revisies, planning, prijzen, beheerklasse en bijzondere IP-afspraken horen primair in de offerte."
      }
    ]
  },
  {
    "number": 5,
    "title": "Scope en klantverplichtingen",
    "clauses": [
      {
        "number": "5.1",
        "text": "YM Creations voert de werkzaamheden uit binnen de in de offerte omschreven scope en met de zorg die van een professionele opdrachtnemer mag worden verwacht."
      },
      {
        "number": "5.2",
        "text": "De klant levert tijdig alle redelijkerwijs benodigde content, bestanden, logo's, gegevens, feedback, accounts, toegangen, API-sleutels, productinformatie en beslissingen aan en garandeert dat hij deze mag gebruiken."
      },
      {
        "number": "5.3",
        "text": "De klant wijst bij voorkeur één bevoegd aanspreekpunt aan dat feedback bundelt en beslissingen namens de klant mag bevestigen."
      },
      {
        "number": "5.4",
        "text": "Werk dat niet in de overeengekomen scope staat, is niet automatisch inbegrepen doordat het nuttig, logisch of wenselijk is voor het eindproduct."
      },
      {
        "number": "5.5",
        "text": "De klant controleert vóór livegang de juistheid van door hem aangeleverde teksten, prijzen, productinformatie, juridische teksten, contactgegevens en overige bedrijfsinhoud."
      }
    ]
  },
  {
    "number": 6,
    "title": "Planning en vertraging",
    "clauses": [
      {
        "number": "6.1",
        "text": "Planning en opleverdata zijn indicatief, tenzij in de offerte uitdrukkelijk een fatale of gegarandeerde termijn is genoemd."
      },
      {
        "number": "6.2",
        "text": "Planning is afhankelijk van tijdige medewerking van de klant en derden. Vertraging in klantinput, goedkeuringen, accounts, content of externe leveranciers kan leiden tot redelijke herplanning."
      },
      {
        "number": "6.3",
        "text": "Wanneer noodzakelijke klantinput langer dan 10 werkdagen uitblijft, mag YM Creations het project tijdelijk pauzeren en opnieuw inplannen op basis van beschikbare capaciteit."
      },
      {
        "number": "6.4",
        "text": "Wanneer een project 30 kalenderdagen of langer door uitblijvende klantmedewerking stilligt, mag YM Creations vóór hervatting een nieuwe realistische planning afgeven. Eventueel substantieel re-onboarding- of herstelwerk wordt alleen na voorafgaande prijsafspraak als meerwerk uitgevoerd."
      }
    ]
  },
  {
    "number": 7,
    "title": "Revisies, wijzigingen en meerwerk",
    "clauses": [
      {
        "number": "7.1",
        "text": "Het aantal inbegrepen revisierondes staat in de offerte. Indien voor een normale website niets is vermeld, zijn twee geconsolideerde revisierondes voor ontwerp/content inbegrepen vóór de formele acceptatiefase."
      },
      {
        "number": "7.2",
        "text": "Eén revisieronde betekent één gebundelde feedbackset van de klant. Verspreide of opeenvolgende feedback kan door YM Creations worden samengevoegd tot één ronde."
      },
      {
        "number": "7.3",
        "text": "Voor complexe maatwerksystemen, portals, SaaS en configurators wordt feedback bij voorkeur per milestone of acceptatiemoment afgehandeld in plaats van via één algemeen revisiemodel."
      },
      {
        "number": "7.4",
        "text": "Een verzoek buiten scope wordt aangemerkt als wijziging/meerwerk. YM Creations meldt vooraf de prijs, raming of berekeningswijze en de mogelijke invloed op planning; uitvoering start na akkoord."
      },
      {
        "number": "7.5",
        "text": "Nieuwe wensen worden niet als bug behandeld alleen omdat de klant ze na oplevering nuttig of wenselijk vindt."
      },
      {
        "number": "7.6",
        "text": "Bij een direct en aantoonbaar security-, data- of beschikbaarheidsrisico mag YM Creations redelijke noodmaatregelen nemen om schade te beperken. Voor niet-inbegrepen werkzaamheden wordt de klant zo snel mogelijk geïnformeerd en, waar redelijk, vooraf om akkoord gevraagd."
      }
    ]
  },
  {
    "number": 8,
    "title": "Prijzen en externe kosten",
    "clauses": [
      {
        "number": "8.1",
        "text": "Alle bedragen zijn exclusief btw en andere wettelijk verschuldigde heffingen, tenzij uitdrukkelijk anders vermeld."
      },
      {
        "number": "8.2",
        "text": "De geaccepteerde offerte bepaalt of sprake is van een vaste prijs, raming, nacalculatie of een combinatie daarvan."
      },
      {
        "number": "8.3",
        "text": "Kosten van derde diensten zijn alleen inbegrepen voor zover de offerte of beheerbijlage dat uitdrukkelijk vermeldt. Domeinen, cloud/databasecompute, storage, e-mailvolume, betaalproviderkosten, API-verbruik, licenties, transactiekosten en andere externe kosten kunnen rechtstreeks door de klant worden betaald of afzonderlijk worden doorbelast."
      },
      {
        "number": "8.4",
        "text": "Indien YM Creations externe kosten doorbelast, gebeurt dit op basis van identificeerbare leverancierskosten en een eventuele vooraf overeengekomen opslag of administratievergoeding."
      },
      {
        "number": "8.5",
        "text": "Onbeperkte infrastructuur-, storage-, dataverkeer-, e-mail- of API-kosten zijn nooit stilzwijgend inbegrepen in een laag vast maandbedrag."
      }
    ]
  },
  {
    "number": 9,
    "title": "Betaling",
    "clauses": [
      {
        "number": "9.1",
        "text": "Voor projecten met een overeengekomen projectprijs tot en met EUR 2.000 exclusief btw is standaard geen aanbetaling vereist, tenzij de offerte anders bepaalt."
      },
      {
        "number": "9.2",
        "text": "Voor projecten met een overeengekomen projectprijs boven EUR 2.000 exclusief btw bedraagt de standaard aanbetaling 50% van de projectprijs. YM Creations start de werkzaamheden nadat deze aanbetaling is ontvangen, tenzij schriftelijk anders is overeengekomen."
      },
      {
        "number": "9.3",
        "text": "Het resterende projectbedrag wordt bij livegang gefactureerd. Voor grotere of langdurige maatwerkprojecten kan de offerte een afwijkend milestone-betaalschema bepalen."
      },
      {
        "number": "9.4",
        "text": "Wanneer livegang uitsluitend door handelen, nalaten of uitstel aan klantzijde niet kan plaatsvinden terwijl het project conform de overeenkomst gereed en geaccepteerd is, mag YM Creations de eindfactuur uitreiken alsof het overeengekomen oplevermoment is bereikt."
      },
      {
        "number": "9.5",
        "text": "De standaard betalingstermijn voor facturen bedraagt 14 kalenderdagen na factuurdatum."
      },
      {
        "number": "9.6",
        "text": "Doorlopende hosting- en beheerdiensten worden, tenzij de offerte anders bepaalt, maandelijks vooraf gefactureerd met dezelfde betalingstermijn."
      },
      {
        "number": "9.7",
        "text": "Bij te late betaling is de klant na het intreden van verzuim de wettelijke handelsrente en redelijke buitengerechtelijke incassokosten verschuldigd volgens het toepasselijke recht."
      }
    ]
  },
  {
    "number": 10,
    "title": "Oplevering, acceptatie en livegang",
    "clauses": [
      {
        "number": "10.1",
        "text": "YM Creations kan een project eerst als test-, staging- of previewversie gereedmelden voordat het publiek live wordt gezet."
      },
      {
        "number": "10.2",
        "text": "Voor normale websites bedraagt de acceptatietermijn 5 werkdagen vanaf de gereedmelding. Voor complexe systemen, portals, SaaS en configurators bedraagt deze termijn 10 werkdagen, tenzij de offerte anders bepaalt."
      },
      {
        "number": "10.3",
        "text": "De klant test binnen de acceptatietermijn redelijkerwijs de afgesproken functionaliteit en meldt concrete, reproduceerbare en materiële afwijkingen zo veel mogelijk gebundeld."
      },
      {
        "number": "10.4",
        "text": "Een kleine niet-blokkerende afwijking die redelijk kan worden hersteld, verhindert acceptatie niet. YM Creations herstelt een gegronde scope-afwijking binnen een redelijke termijn."
      },
      {
        "number": "10.5",
        "text": "Nieuwe functionaliteit, een andere visuele richting of andere wensen tijdens acceptatie zijn geen afkeuringsgrond indien het geleverde overeenstemt met de overeengekomen scope; zulke wensen kunnen meerwerk zijn."
      },
      {
        "number": "10.6",
        "text": "Als de klant binnen de acceptatietermijn niet reageert, stuurt YM Creations een herinnering en geeft waar redelijk nog 2 werkdagen om materiële punten te melden. Bij uitblijven daarvan mag het project voor zichtbare en redelijk testbare onderdelen als geaccepteerd worden beschouwd, zonder dat verborgen gebreken of rechten die niet rechtsgeldig kunnen worden uitgesloten verdwijnen."
      },
      {
        "number": "10.7",
        "text": "Na acceptatie en zodra technische voorwaarden zoals domein/DNS, accounts en noodzakelijke gegevens beschikbaar zijn, plant YM Creations de livegang."
      }
    ]
  },
  {
    "number": 11,
    "title": "Nazorg, bugs en kleine correcties",
    "clauses": [
      {
        "number": "11.1",
        "text": "Vanaf de daadwerkelijke livegang geldt voor normale websites een intensieve nazorgperiode van 14 kalenderdagen."
      },
      {
        "number": "11.2",
        "text": "Binnen deze periode kan de klant de website in productie volledig testen en bugs en redelijke kleine correcties binnen de oorspronkelijke scope melden. YM Creations blijft hiervoor via de normale communicatiekanalen bereikbaar en behandelt meldingen binnen redelijke termijn, zonder 24/7- of vaste oplostijdgarantie."
      },
      {
        "number": "11.3",
        "text": "Gratis nazorg omvat geen nieuw ontwerp, nieuwe pagina, nieuwe workflow, extra formulier, nieuwe integratie, nieuwe API, andere productlogica, nieuwe adminfunctie of andere wezenlijke scopewijziging."
      },
      {
        "number": "11.4",
        "text": "De nazorgperiode is geen vervaltermijn voor iedere mogelijke tekortkoming. Een later ontdekte reproduceerbare fout in oorspronkelijk overeengekomen functionaliteit wordt naar aard, oorzaak en toepasselijke afspraken beoordeeld en wordt niet automatisch als betaalde wijziging aangemerkt."
      }
    ]
  },
  {
    "number": 12,
    "title": "Wijzigingen na de nazorgperiode",
    "clauses": [
      {
        "number": "12.1",
        "text": "Na afloop van de 14-daagse nazorgperiode kost een kleine wijziging standaard EUR 10 exclusief btw per zelfstandige wijziging, tenzij de offerte of een beheerafspraak een ander tarief bepaalt."
      },
      {
        "number": "12.2",
        "text": "Een kleine wijziging is een eenvoudige aanpassing aan bestaande content of een bestaand onderdeel zonder nieuw ontwerp, nieuwe functionaliteit of structurele codewijziging, bijvoorbeeld het aanpassen van één titel, telefoonnummer, e-mailadres of link, of het vervangen van één correct aangeleverd logo of beeldbestand."
      },
      {
        "number": "12.3",
        "text": "Meerdere zelfstandige wijzigingen in één verzoek kunnen afzonderlijk worden geteld. YM Creations mag kleine wijzigingen periodiek bundelen op één factuur."
      },
      {
        "number": "12.4",
        "text": "Wanneer een verzoek niet als kleine wijziging kan worden uitgevoerd, meldt YM Creations vóór uitvoering de aanvullende prijs, raming of offerte."
      },
      {
        "number": "12.5",
        "text": "Een echte bug in overeengekomen functionaliteit wordt niet uitsluitend vanwege het verstrijken van de nazorgperiode als betaalde kleine wijziging behandeld."
      }
    ]
  },
  {
    "number": 13,
    "title": "Hosting en technisch beheer",
    "clauses": [
      {
        "number": "13.1",
        "text": "Hosting en technisch beheer vormen een doorlopende technische dienst voor zover de website of applicatie via door YM Creations geleverde of beheerde infrastructuur actief blijft."
      },
      {
        "number": "13.2",
        "text": "Het overeengekomen maandbedrag is geen onbeperkt support- of developmentabonnement. Inbegrepen zijn uitsluitend de in de offerte en Bijlage A genoemde operationele activiteiten."
      },
      {
        "number": "13.3",
        "text": "Contentwijzigingen, nieuwe pagina's, nieuwe functionaliteiten, redesign, nieuwe integraties, marketing, doorlopende SEO, grote migraties, consultancy en onbeperkte externe usage zijn niet inbegrepen, tenzij uitdrukkelijk anders overeengekomen."
      },
      {
        "number": "13.4",
        "text": "Zolang de website/applicatie via de YM-omgeving actief blijft en YM de overeengekomen technische dienst levert, blijft de periodieke vergoeding verschuldigd."
      },
      {
        "number": "13.5",
        "text": "De periodieke vergoeding stopt zodra de dienstverlening van YM Creations na correcte beëindiging daadwerkelijk is geëindigd en de website/applicatie is verwijderd of naar een andere omgeving is overgedragen."
      }
    ]
  },
  {
    "number": 14,
    "title": "Beheerklasse, prijswijziging en externe usage",
    "clauses": [
      {
        "number": "14.1",
        "text": "YM Creations bepaalt welk minimaal technisch beheerniveau bij de architectuur en bedrijfskritiek van het systeem past. De klant kan niet verlangen dat een complex systeem onder een technisch ongeschikte lage beheerklasse wordt beheerd."
      },
      {
        "number": "14.2",
        "text": "Bij een structurele toename van complexiteit, bijvoorbeeld door databasegebruik, accounts, betalingen, reserveringsflows, extra API's, sterk verkeer, storage of zwaardere security/SLA-eisen, mag YM Creations een passende hogere beheerklasse voorstellen."
      },
      {
        "number": "14.3",
        "text": "Eigen periodieke beheerprijzen mogen voor bestaande B2B-overeenkomsten maximaal eenmaal per kalenderjaar objectief worden aangepast, bijvoorbeeld op basis van relevante kostenontwikkeling/CPI, mits YM Creations de klant ten minste 30 dagen vooraf informeert."
      },
      {
        "number": "14.4",
        "text": "Identificeerbare prijswijzigingen van derde diensten en usage-afhankelijke kosten kunnen worden doorbelast conform de werkelijke leverancierstarieven en de afgesproken opslag. YM Creations informeert de klant hierover zo snel als redelijkerwijs mogelijk."
      },
      {
        "number": "14.5",
        "text": "Bij een wezenlijke structurele prijs- of scopewijziging die de klant niet wil aanvaarden, overleggen partijen over beperking van de technische scope, migratie of beëindiging. De klant kan de YM-infrastructuur niet kosteloos blijven gebruiken nadat de betreffende dienstverlening rechtsgeldig is geëindigd."
      }
    ]
  },
  {
    "number": 15,
    "title": "Beschikbaarheid, onderhoud, security en incidenten",
    "clauses": [
      {
        "number": "15.1",
        "text": "YM Creations spant zich in om de beheerde omgeving professioneel en redelijk veilig beschikbaar te houden binnen de overeengekomen technische scope."
      },
      {
        "number": "15.2",
        "text": "Tenzij een afzonderlijke SLA is overeengekomen, gelden geen gegarandeerd uptimepercentage, 24/7-bereikbaarheid, vaste responstijd, vaste oplostijd, RTO of RPO."
      },
      {
        "number": "15.3",
        "text": "YM Creations mag gepland en noodzakelijk onderhoud uitvoeren. Waar redelijk en relevant wordt de klant vooraf geïnformeerd."
      },
      {
        "number": "15.4",
        "text": "YM Creations treft passende maatregelen binnen de overeengekomen verantwoordelijkheid, waaronder waar relevant TLS/SSL-configuratie, veilige omgang met secrets, noodzakelijke patches en redelijke toegangsbeveiliging. Geen enkel systeem kan als volledig foutloos of onhackbaar worden gegarandeerd."
      },
      {
        "number": "15.5",
        "text": "De klant blijft verantwoordelijk voor veilig gebruik van eigen accounts, sterke wachtwoorden/MFA waar aangeboden, het tijdig intrekken van ex-medewerkertoegang en het niet delen van credentials met onbevoegden."
      },
      {
        "number": "15.6",
        "text": "Een storing van een derde dienst is niet automatisch overmacht en ontslaat YM Creations niet van verantwoordelijkheid voor eigen toerekenbare fouten in selectie, configuratie, renewal, monitoring of incidentafhandeling binnen de overeengekomen scope."
      }
    ]
  },
  {
    "number": 16,
    "title": "Backups en herstel",
    "clauses": [
      {
        "number": "16.1",
        "text": "Voor een eenvoudige website zonder database of andere dynamische klantdata geldt broncodeversiebeheer en, voor zover technisch beschikbaar, deployment-/versieherstel als primaire herstelbasis. Er is dan niet automatisch een afzonderlijke dagelijkse databackup."
      },
      {
        "number": "16.2",
        "text": "Voor een normale dynamische website waarvoor YM de database of dynamische content beheert, is het standaardbeleid één automatische backup per 24 uur met een retentie van 7 dagen, voor zover de gekozen provider/architectuur dit ondersteunt."
      },
      {
        "number": "16.3",
        "text": "Voor een reserveringssysteem of complex platform is het standaardbeleid één automatische backup per 24 uur met een retentie van 14 dagen, voor zover de gekozen provider/architectuur dit ondersteunt."
      },
      {
        "number": "16.4",
        "text": "Voor bedrijfskritieke systemen, langere retentie, hogere backupfrequentie, point-in-time recovery of specifieke RPO/RTO-eisen is een afzonderlijke technische afspraak en eventueel een SLA/hoger beheerbudget vereist."
      },
      {
        "number": "16.5",
        "text": "Een restore is een inspanningsverplichting op basis van de beschikbare en overeengekomen backups. Herstel dat nodig is door een toerekenbare YM-fout binnen de beheerafspraak wordt redelijkerwijs uitgevoerd; herstel door klantfouten, malware via klanttoegang, externe oorzaken of omvangrijke reconstructie kan als meerwerk worden berekend."
      },
      {
        "number": "16.6",
        "text": "De klant bewaart zelf een kopie van onvervangbare originele bronmaterialen zoals foto's, video's, teksten, huisstijlbestanden en andere content die buiten de beheerde productieomgeving hoort te bestaan."
      }
    ]
  },
  {
    "number": 17,
    "title": "Domeinen, accounts en externe diensten",
    "clauses": [
      {
        "number": "17.1",
        "text": "Strategische accounts worden waar praktisch mogelijk op naam van de klant geplaatst, waaronder domeinregistratie, betaalprovideraccounts, belangrijke Google-properties en dedicated cloudaccounts. YM Creations kan beheerrechten ontvangen voor uitvoering."
      },
      {
        "number": "17.2",
        "text": "Wanneer een domein namens de klant via YM Creations wordt beheerd, blijft uitgangspunt dat de klant rechthebbende/registrant is en bij beëindiging een redelijke transfermogelijkheid krijgt."
      },
      {
        "number": "17.3",
        "text": "Derde diensten vallen mede onder hun eigen voorwaarden, technische beperkingen, quota, prijswijzigingen en beschikbaarheid. YM Creations kan geen rechten, uptime of functies garanderen die de externe leverancier zelf niet garandeert."
      },
      {
        "number": "17.4",
        "text": "Wijzigingen, beëindiging of incompatibiliteit van een externe API of dienst kunnen aanpassing of migratie vereisen. Voor zover dit niet door een toerekenbare fout van YM Creations is veroorzaakt en niet in de beheerafspraak is inbegrepen, kan dit meerwerk zijn."
      },
      {
        "number": "17.5",
        "text": "Domeinen, klantdata en andere strategische klantassets worden niet als generiek betalingsgijzelmiddel ingericht. Reguliere wettelijke en contractuele opschortings- en incassorechten blijven bestaan."
      }
    ]
  },
  {
    "number": 18,
    "title": "Intellectuele eigendom en klantmateriaal",
    "clauses": [
      {
        "number": "18.1",
        "text": "De klant behoudt de rechten op door hem aangeleverde content, foto's, logo's, huisstijl, productdata, vertrouwelijke bedrijfsregels en overige klantmaterialen. De klant verleent YM Creations voor de duur van de opdracht de rechten die noodzakelijk zijn om deze materialen voor de opdracht te verwerken."
      },
      {
        "number": "18.2",
        "text": "De klant staat ervoor in dat hij gerechtigd is de aangeleverde materialen te gebruiken en dat gebruik door YM Creations volgens de opdracht geen rechten van derden schendt."
      },
      {
        "number": "18.3",
        "text": "YM Creations behoudt alle intellectuele-eigendomsrechten op reeds bestaande en generieke materialen, waaronder ontwikkelmethoden, tools, templates, deployment tooling, libraries, frameworks, generieke componenten, herbruikbare algoritmen, knowhow en generieke designsystemen."
      },
      {
        "number": "18.4",
        "text": "Onderdelen die tijdens een project worden ontwikkeld maar generiek bruikbaar zijn en geen vertrouwelijke klantspecifieke logica, data of creatieve identiteit bevatten, blijven als Generic Components eigendom van YM Creations."
      },
      {
        "number": "18.5",
        "text": "De Configurator Core, waaronder generieke render-/geometrie-engine, rule engine, generieke productoptielogica, UI-primitives, integratieframeworks en adminbasis, blijft eigendom van YM Creations, tenzij een schriftelijke specifieke overdracht anders bepaalt."
      },
      {
        "number": "18.6",
        "text": "YM Creations mag generieke technologie hergebruiken voor andere opdrachtgevers, maar niet de persoonsgegevens, vertrouwelijke informatie, trade secrets, klantcontent, logo's of uniek klantspecifieke beschermde elementen van de klant."
      },
      {
        "number": "18.7",
        "text": "Open-source- en derde-partijcomponenten blijven onder de rechten en licentievoorwaarden van hun rechthebbenden vallen."
      }
    ]
  },
  {
    "number": 19,
    "title": "Broncode en gebruiksrechten",
    "clauses": [
      {
        "number": "19.1",
        "text": "Betaling voor ontwikkeling leidt niet automatisch tot overdracht van auteursrecht. Overdracht of een exclusieve licentie vindt alleen plaats als dit schriftelijk en voldoende specifiek is overeengekomen."
      },
      {
        "number": "19.2",
        "text": "Na volledige betaling krijgt de klant voor de geïntegreerde projectoplossing een blijvend, niet-exclusief gebruiksrecht dat voldoende is om het systeem voor de eigen bedrijfsactiviteiten te gebruiken en door een ingeschakelde technische partij te laten onderhouden of wijzigen, met behoud van de rechten van YM Creations op de generieke/core-onderdelen."
      },
      {
        "number": "19.3",
        "text": "De klant mag YM-materialen, Generic Components of Configurator Core niet als zelfstandig product verkopen, aan derden licentiëren, commercieel herverpakken of voor niet-klantgebonden producten hergebruiken zonder aparte toestemming."
      },
      {
        "number": "19.4",
        "text": "Bij een normale website kan bij beëindiging, na volledige betaling, een actuele snapshot/export van de klantspecifieke broncode deel uitmaken van het standaard exitpakket. Git-history, interne YM-tools, gedeelde secrets, andere klantomgevingen en credentials worden niet standaard meegeleverd."
      },
      {
        "number": "19.5",
        "text": "Bij complexe platforms, SaaS en configurators bepaalt de offerte welke broncode of klantspecifieke laag overdraagbaar is. Proprietary YM-core blijft uitgesloten, tenzij uitdrukkelijk schriftelijk anders overeengekomen."
      },
      {
        "number": "19.6",
        "text": "Fysieke levering van broncode betekent op zichzelf geen overdracht van auteursrecht. Derde- en open-sourcecode blijft onder de toepasselijke licenties vallen."
      }
    ]
  },
  {
    "number": 20,
    "title": "Privacy en verwerkersrol",
    "clauses": [
      {
        "number": "20.1",
        "text": "Privacyrollen worden bepaald door de feitelijke verwerking. YM Creations is verwerkingsverantwoordelijke voor eigen bedrijfsprocessen zoals offertes, facturatie, CRM en de eigen website voor zover zij zelf doel en middelen bepaalt."
      },
      {
        "number": "20.2",
        "text": "Wanneer YM Creations persoonsgegevens uitsluitend namens de klant verwerkt, bijvoorbeeld via hosting, databasebeheer of debugging van een klantomgeving, sluiten partijen voor zover vereist een afzonderlijke verwerkersovereenkomst conform artikel 28 AVG."
      },
      {
        "number": "20.3",
        "text": "Deze Algemene Voorwaarden vervangen geen verwerkersovereenkomst. Een DPA regelt onder meer instructies, beveiliging, subprocessors, datalekmelding, internationale doorgifte, audit/informatie en retour/verwijdering van persoonsgegevens."
      },
      {
        "number": "20.4",
        "text": "YM Creations mag passende subverwerkers inzetten voor zover de DPA dit toestaat en de toepasselijke privacyverplichtingen worden doorgelegd."
      },
      {
        "number": "20.5",
        "text": "Wanneer YM Creations als verwerker een mogelijk datalek constateert, informeert zij de klant zonder onredelijke vertraging conform de toepasselijke DPA en wetgeving."
      }
    ]
  },
  {
    "number": 21,
    "title": "Cookies, juridische content, toegankelijkheid en SEO",
    "clauses": [
      {
        "number": "21.1",
        "text": "De klant is als exploitant in beginsel verantwoordelijk voor de juridische juistheid van eigen productclaims, prijzen, algemene voorwaarden, privacyteksten, retour-/herroepingsbeleid, cookiekeuzes en overige bedrijfsinhoud, tenzij YM Creations uitdrukkelijk een specifieke complianceopdracht heeft aanvaard."
      },
      {
        "number": "21.2",
        "text": "YM Creations implementeert cookies, analytics en marketingtechnologie conform de uitdrukkelijke technische opdracht. De klant beslist welke tracking- of marketingdiensten hij juridisch wil inzetten, tenzij partijen een bredere complianceopdracht zijn overeengekomen."
      },
      {
        "number": "21.3",
        "text": "Voor webshops en consumentenreserveringsdiensten kunnen aanvullende consumenten- en toegankelijkheidsregels gelden. Volledige wettelijke compliance, een specifieke toegankelijkheidsstandaard of juridische webshopcheck is alleen onderdeel van de prestatie als dit concreet in de offerte is genoemd."
      },
      {
        "number": "21.4",
        "text": "YM Creations blijft verantwoordelijk voor de professionele uitvoering van technische compliancefunctionaliteit die zij wél uitdrukkelijk op zich heeft genomen."
      },
      {
        "number": "21.5",
        "text": "Technische SEO kan onderdeel van de scope zijn, maar YM Creations garandeert geen Google-ranking, bezoekersaantal, leads, conversie, reserveringen, omzet of ander commercieel resultaat."
      },
      {
        "number": "21.6",
        "text": "Veranderingen in zoekmachines, browsers, externe platformen of wetgeving kunnen later aanpassingen vereisen die buiten de oorspronkelijke scope vallen."
      }
    ]
  },
  {
    "number": 22,
    "title": "Geheimhouding en onderaannemers",
    "clauses": [
      {
        "number": "22.1",
        "text": "Partijen behandelen niet-openbare informatie die redelijkerwijs als vertrouwelijk moet worden beschouwd vertrouwelijk, waaronder technische informatie, credentials, infrastructuurinformatie, bedrijfsstrategie, klantlijsten, persoonsgegevens en vertrouwelijke code."
      },
      {
        "number": "22.2",
        "text": "De geheimhoudingsplicht geldt niet voor informatie die aantoonbaar rechtmatig openbaar was, onafhankelijk is ontwikkeld, rechtmatig van een derde is verkregen of op grond van wet of bindend bevel moet worden verstrekt."
      },
      {
        "number": "22.3",
        "text": "Credentials, persoonsgegevens en werkelijke bedrijfsgeheimen blijven beschermd zolang hun aard dat redelijkerwijs vereist."
      },
      {
        "number": "22.4",
        "text": "YM Creations mag freelancers en externe specialisten inzetten. YM Creations zorgt dat relevante vertrouwelijkheids-, privacy- en intellectuele-eigendomsverplichtingen waar nodig contractueel worden doorgelegd."
      },
      {
        "number": "22.5",
        "text": "Het inzetten van een onderaannemer ontslaat YM Creations niet van verantwoordelijkheid voor eigen contractuele verplichtingen voor zover de wet of overeenkomst die verantwoordelijkheid bij YM Creations legt."
      }
    ]
  },
  {
    "number": 23,
    "title": "Portfolio en referenties",
    "clauses": [
      {
        "number": "23.1",
        "text": "Na publieke livegang mag YM Creations de handelsnaam van de klant en niet-vertrouwelijke, reeds publiek zichtbare screenshots van het geleverde werk als zakelijke referentie tonen, tenzij de offerte, een NDA of een schriftelijk bezwaar van de klant dit uitsluit."
      },
      {
        "number": "23.2",
        "text": "Voor een uitgebreide case study, testimonial, niet-openbare resultaten, omzet-/conversiecijfers of andere niet-publieke informatie vraagt YM Creations afzonderlijke toestemming."
      },
      {
        "number": "23.3",
        "text": "Portfoliovermelding verandert niets aan het eigendom van klantcontent, logo's en huisstijl."
      }
    ]
  },
  {
    "number": 24,
    "title": "Wanbetaling en opschorting",
    "clauses": [
      {
        "number": "24.1",
        "text": "Bij overschrijding van de betalingstermijn mag YM Creations de klant schriftelijk herinneren en een redelijke hersteltermijn geven."
      },
      {
        "number": "24.2",
        "text": "Indien betaling daarna uitblijft, mag YM Creations verdere projectwerkzaamheden, nieuwe wijzigingen, support of andere samenhangende prestaties proportioneel opschorten voor zover de wet dit toestaat."
      },
      {
        "number": "24.3",
        "text": "Een productieomgeving wordt niet lichtvaardig of zonder redelijke waarschuwing uitgeschakeld. Indien doorlopende hosting/infrastructuurkosten of securityrisico's blijven doorlopen en de klant ondanks ingebrekestelling niet betaalt, kan YM Creations na redelijke kennisgeving de betreffende dienstverlening beperken of beëindigen voor zover proportioneel en rechtens toegestaan."
      },
      {
        "number": "24.4",
        "text": "Opschorting laat de betalingsverplichtingen voor reeds geleverde diensten en doorlopende externe kosten onverlet."
      }
    ]
  },
  {
    "number": 25,
    "title": "Beëindiging, opzegging en exit",
    "clauses": [
      {
        "number": "25.1",
        "text": "Doorlopende hosting- en beheerdiensten kunnen door de klant met één maand opzegtermijn worden beëindigd. De vergoeding blijft verschuldigd zolang de website/applicatie gedurende de opzegtermijn via de YM-omgeving actief blijft en YM de dienst levert."
      },
      {
        "number": "25.2",
        "text": "Bij beëindiging kiest de klant voor het offline halen/verwijderen van de website/applicatie of, indien technisch en contractueel mogelijk, overdracht naar een andere omgeving."
      },
      {
        "number": "25.3",
        "text": "YM Creations levert een standaard exitpakket waar redelijkerwijs van toepassing. Dit kan omvatten: domein-transferinformatie, relevante DNS-informatie, een database-export in gangbaar formaat, media-export, klantspecifieke configuratie zonder YM/shared secrets, overeengekomen broncode en bestaande overeengekomen documentatie."
      },
      {
        "number": "25.4",
        "text": "YM Creations streeft ernaar het overeengekomen standaard exitpakket uiterlijk binnen 10 werkdagen na het afgesproken einde van de dienstverlening beschikbaar te stellen, mits alle noodzakelijke klantinstructies beschikbaar zijn en opeisbare facturen zijn voldaan voor zover dit juridisch als voorwaarde mag worden gesteld."
      },
      {
        "number": "25.5",
        "text": "Custom migratie, installatie bij een nieuwe provider, replatforming, databaseconversie, herconfiguratie, DNS-omzetting, uitgebreide begeleiding van een opvolgende leverancier en eind-tot-eind migratietesten zijn geen standaard exitwerk en kunnen als meerwerk worden gefactureerd."
      },
      {
        "number": "25.6",
        "text": "Na het einde van de dienstverlening bewaart YM Creations gedurende 30 kalenderdagen een laatste beschikbare kopie/export van de website en relevante projectdata voor herstel of overdracht, voor zover technisch beschikbaar en toegestaan. Daarna mag YM Creations deze gegevens verwijderen, behoudens wettelijke bewaarplichten, DPA-verplichtingen en normale backupcycli."
      },
      {
        "number": "25.7",
        "text": "De klant is verantwoordelijk om binnen de 30-daagse retrievalperiode gewenste export of overdracht aan te vragen en ontvangen bestanden veilig op te slaan."
      },
      {
        "number": "25.8",
        "text": "Beide partijen kunnen de overeenkomst ontbinden of beëindigen op grond van de wet bij een voldoende ernstige tekortkoming. Waar herstel nog mogelijk is, wordt in beginsel eerst een redelijke cure-periode geboden. Onmiddellijke maatregelen kunnen gerechtvaardigd zijn bij evidente illegale exploitatie, acuut securitygevaar of vergelijkbare ernstige omstandigheden."
      }
    ]
  },
  {
    "number": 26,
    "title": "Aansprakelijkheid",
    "clauses": [
      {
        "number": "26.1",
        "text": "YM Creations is alleen aansprakelijk voor directe schade die het rechtstreekse gevolg is van een toerekenbare tekortkoming van YM Creations, voor zover die aansprakelijkheid rechtsgeldig kan worden beperkt."
      },
      {
        "number": "26.2",
        "text": "Voor een eenmalig project is de totale aansprakelijkheid van YM Creations in beginsel beperkt tot maximaal het bedrag van de voor het betreffende project overeengekomen en door de klant verschuldigde projectvergoeding exclusief btw."
      },
      {
        "number": "26.3",
        "text": "Voor een doorlopende hosting- of beheerdienst is de totale aansprakelijkheid in beginsel beperkt tot maximaal een bedrag gelijk aan twaalf maanden van de op het moment van het schadeveroorzakende incident geldende periodieke vergoeding voor de betreffende dienst exclusief btw."
      },
      {
        "number": "26.4",
        "text": "YM Creations is, voor zover rechtens toegestaan, niet aansprakelijk voor indirecte schade, waaronder winstderving, omzetverlies, gemiste besparingen, reputatieschade, verlies van kansen en bedrijfsstagnatieschade."
      },
      {
        "number": "26.5",
        "text": "Dataverlies wordt beoordeeld in samenhang met de concreet overeengekomen backup- en herstelverplichtingen. Wanneer YM Creations een betaalde backupdienst heeft aanvaard, wordt die verplichting niet betekenisloos gemaakt door een algemene uitsluiting van ieder herstel."
      },
      {
        "number": "26.6",
        "text": "YM Creations is niet aansprakelijk voor schade die hoofdzakelijk is veroorzaakt door onjuiste of onrechtmatige klantcontent, onveilige klantcredentials, ongeautoriseerde klantwijzigingen, niet-opgevolgde redelijke securityadviezen of externe wijzigingen buiten de overeengekomen verantwoordelijkheid van YM Creations."
      },
      {
        "number": "26.7",
        "text": "Beperkingen gelden niet voor aansprakelijkheid die volgens dwingend recht niet kan worden uitgesloten of beperkt en niet in gevallen waarin een beroep op de beperking naar maatstaven van redelijkheid en billijkheid onaanvaardbaar is."
      },
      {
        "number": "26.8",
        "text": "De klant meldt een mogelijke schadeoorzaak zo spoedig mogelijk en werkt redelijk mee aan onderzoek naar de oorzaak en aan redelijke maatregelen ter beperking van de schade."
      }
    ]
  },
  {
    "number": 27,
    "title": "Vrijwaring",
    "clauses": [
      {
        "number": "27.1",
        "text": "De klant vrijwaart YM Creations, voor zover rechtens toegestaan, tegen aanspraken van derden die rechtstreeks voortvloeien uit door de klant aangeleverde onrechtmatige content, ongeautoriseerd gebruik van foto's/logo's, misleidende productclaims, illegale producten/diensten of instructies van de klant die in strijd zijn met toepasselijke wetgeving."
      },
      {
        "number": "27.2",
        "text": "De vrijwaring geldt niet voor zover de aanspraak is veroorzaakt door een toerekenbare programmeer-, configuratie-, security- of andere uitvoeringsfout van YM Creations."
      }
    ]
  },
  {
    "number": 28,
    "title": "Overmacht",
    "clauses": [
      {
        "number": "28.1",
        "text": "Geen partij is gehouden tot nakoming voor zover een tekortkoming niet aan haar kan worden toegerekend en zij buiten haar redelijke controle ligt en redelijkerwijs niet kon worden voorkomen of verholpen."
      },
      {
        "number": "28.2",
        "text": "Mogelijke omstandigheden zijn onder meer grootschalige internet-/datacenteruitval, oorlog, overheidsmaatregelen, grote stroomstoringen, arbeidsconflicten, ernstige cyberaanvallen ondanks passende maatregelen of uitval van een essentiële derde API waarvoor redelijkerwijs geen direct alternatief beschikbaar is."
      },
      {
        "number": "28.3",
        "text": "Een vergeten renewal, verkeerd geconfigureerde resource, niet-betaalde providerrekening of het niet uitvoeren van een urgente beschikbare patch door de daarvoor verantwoordelijke partij geldt niet automatisch als overmacht."
      },
      {
        "number": "28.4",
        "text": "De getroffen partij informeert de andere partij zo snel als redelijkerwijs mogelijk, beperkt de gevolgen waar mogelijk en hervat de prestatie zodra dit redelijkerwijs kan."
      },
      {
        "number": "28.5",
        "text": "Duurt een wezenlijke overmachtsituatie langer dan 30 kalenderdagen, dan mogen partijen in overleg het getroffen deel van de overeenkomst beëindigen voor de toekomst, voor zover voortzetting redelijkerwijs niet kan worden verlangd."
      }
    ]
  },
  {
    "number": 29,
    "title": "Wijziging van de voorwaarden",
    "clauses": [
      {
        "number": "29.1",
        "text": "Een nieuwe versie van deze voorwaarden wijzigt bestaande overeenkomsten niet automatisch alleen doordat deze online wordt gepubliceerd."
      },
      {
        "number": "29.2",
        "text": "Voor nieuwe opdrachten geldt de versie die bij de betreffende offerte correct ter beschikking is gesteld en geaccepteerd."
      },
      {
        "number": "29.3",
        "text": "Voor doorlopende B2B-diensten kan YM Creations voorwaarden voor de toekomst wijzigen wanneer daarvoor een redelijke grond bestaat, mits de klant tijdig wordt geïnformeerd over de nieuwe versie, reden en ingangsdatum."
      },
      {
        "number": "29.4",
        "text": "Bij een materieel nadelige wijziging overleggen partijen over redelijke aanpassing of beëindiging/migratie. Dwingend recht en de beperkende werking van redelijkheid en billijkheid blijven van toepassing."
      }
    ]
  },
  {
    "number": 30,
    "title": "Toepasselijk recht en geschillen",
    "clauses": [
      {
        "number": "30.1",
        "text": "Op de overeenkomst is Nederlands recht van toepassing."
      },
      {
        "number": "30.2",
        "text": "Partijen proberen een geschil eerst in goed overleg op te lossen en geven elkaar een redelijke mogelijkheid om een tekortkoming te herstellen wanneer herstel mogelijk is."
      },
      {
        "number": "30.3",
        "text": "Voor zakelijke geschillen is de bevoegde Nederlandse rechter bevoegd volgens de gewone wettelijke bevoegdheidsregels, tenzij partijen schriftelijk een specifieke bevoegde rechtbank of geschilprocedure overeenkomen."
      },
      {
        "number": "30.4",
        "text": "Indien ondanks de B2B-doelgroep dwingende consumenten- of internationale regels van toepassing blijken, worden die niet door deze bepaling terzijde geschoven."
      }
    ]
  }
] as TermsArticle[],
  appendixA: {
    label: "Bijlage A",
    title: "Technisch Beheer & Hosting - standaardkader",
    relation: {
  "heading": "Relatie met de offerte",
  "text": "Deze bijlage geeft het standaardkader. De offerte bepaalt voor iedere klant de concrete beheerklasse, providerstack, allowances, afwijkingen en maandprijs. Bij tegenstrijdigheid gaat de geaccepteerde projectspecifieke offerte voor."
} as TermsNote,
    classes: {
  "caption": "A1. Indicatieve beheerklassen",
  "columns": [
    "Klasse",
    "Typische inzet",
    "Huidig instapniveau*"
  ],
  "rows": [
    [
      "Basis",
      "Eenvoudige statische/lichte website",
      "vanaf EUR 10 p/m"
    ],
    [
      "Website / commerce",
      "Grotere website of eenvoudige webshop",
      "vanaf EUR 25 p/m"
    ],
    [
      "Reservering / integratie",
      "Reserveringsflow of extra operationele afhankelijkheden",
      "vanaf EUR 35 p/m"
    ],
    [
      "Maatwerk operations",
      "Portal, SaaS, configurator of complex platform",
      "vanaf EUR 49 p/m"
    ]
  ],
  "note": "* Alleen ter referentie voor het huidige YM-model. De offerteprijs is bindend; EUR 49 is geen plafond voor complexe infrastructuur."
} as TermsTable,
    included: {
  "caption": "A2. Standaard inbegrepen / niet inbegrepen",
  "columns": [
    "Onderdeel",
    "Standaardpositie"
  ],
  "rows": [
    [
      "Hosting / basisomgeving",
      "Alleen de overeengekomen basisomgeving en allowance."
    ],
    [
      "TLS/SSL",
      "Standaardconfiguratie voor het door YM beheerde domein/omgeving."
    ],
    [
      "Deployment",
      "Normale bestaande releaseflow voor het overeengekomen systeem."
    ],
    [
      "Updates / patches",
      "Redelijk noodzakelijk onderhoud binnen de door YM beheerde stack; geen major rewrite."
    ],
    [
      "Monitoring",
      "Alleen basic checks als dit in de offerte is opgenomen; geen 24/7 APM/SOC."
    ],
    [
      "Incidentmelding",
      "Redelijke intake binnen normale bedrijfsvoering; geen gegarandeerde 24/7 response."
    ],
    [
      "Contentwijzigingen",
      "Niet inbegrepen; na nazorg kleine wijziging standaard EUR 10 excl. btw per zelfstandige wijziging."
    ],
    [
      "Nieuwe pagina/feature/integratie",
      "Niet inbegrepen; change request / aparte offerte."
    ],
    [
      "SEO",
      "Alleen afgesproken technische baseline; geen rankings/traffic/omzetgarantie."
    ],
    [
      "API/e-mail/storage/dataverkeer",
      "Alleen binnen expliciete allowance; excess kan extern/extra worden belast."
    ],
    [
      "SLA",
      "Niet inbegrepen; alleen afzonderlijk voor passende premium/bedrijfskritieke projecten."
    ]
  ]
} as TermsTable,
    backups: {
  "caption": "A3. Backupbeleid",
  "columns": [
    "Systeemtype",
    "Frequentie",
    "Retentie",
    "Opmerking"
  ],
  "rows": [
    [
      "Geen database/dynamische data",
      "Versiebeheer + beschikbare deployment recovery",
      "n.v.t.",
      "Geen aparte dagelijkse databackup standaard."
    ],
    [
      "Normale dynamische website",
      "1x per 24 uur",
      "7 dagen",
      "Voor beheerde database/content, providerondersteuning vereist."
    ],
    [
      "Reservering / complex platform",
      "1x per 24 uur",
      "14 dagen",
      "Voor beheerde data, providerondersteuning vereist."
    ],
    [
      "Kritiek / hogere eisen",
      "Volgens offerte/SLA",
      "Volgens offerte/SLA",
      "Extra kosten en specifieke RPO/RTO alleen indien overeengekomen."
    ]
  ]
} as TermsTable,
    exit: {
      heading: "A4. Opzegging en exit",
      clauses: [
  {
    "number": "A4.1",
    "text": "Hosting/beheer loopt door zolang de site via YM actief is en de dienst wordt geleverd."
  },
  {
    "number": "A4.2",
    "text": "De klant kan de doorlopende dienst met één maand opzegtermijn beëindigen en kiest dan voor verwijderen/offline halen of overdracht naar een andere omgeving."
  },
  {
    "number": "A4.3",
    "text": "Na daadwerkelijke beëindiging stopt het maandbedrag."
  },
  {
    "number": "A4.4",
    "text": "Standaard export/exit wordt redelijk gefaciliteerd; custom migratie is betaald meerwerk."
  },
  {
    "number": "A4.5",
    "text": "Laatste beschikbare kopie/export wordt na einde dienstverlening 30 kalenderdagen bewaard, voor zover technisch en juridisch toegestaan."
  }
] as TermsClause[],
    },
  },
  endLine: "Einde document - YM Creations Algemene Voorwaarden B2B - versie 1.0 - 10 september 2026",
};

export type TermsDocument = typeof termsDocument;

/**
 * The page is fully navigable (footer link) but served with noindex and left
 * out of the sitemap: the terms are not meant as an organic landing page and
 * have not had an external legal review yet. Flip to true to index them.
 */
export const termsIndexable = false;
