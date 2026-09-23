import { companyProfile } from "@/lib/admin/documents/company";
import type { LegalStatementSet } from "@/lib/content/legal-statements";
import { getLocalizedPath } from "@/lib/content/routes";
import { businessInfo } from "@/lib/content/site-content";

/*
  The privacy statement, in both languages.

  Everything stated here is backed by the code or by a decision the business
  owner took: which data the forms collect (api/contact/route.ts), where it
  goes (Supabase, Resend, Vercel, Mollie, Google and Microsoft Clarity behind
  their own consent categories), and how long
  it is kept (lib/retention/policy.ts; for synced search terms
  and Clarity totals lib/analytics-admin/retention.ts, and the filter that keeps address-,
  number- and token-like terms out is lib/analytics-admin/query-filter.ts). What the statement deliberately does
  not say, because nothing in this repository can vouch for it: where each
  provider stores data, what each provider keeps in its own logs, and the
  state of the processing agreements. The text was reviewed and confirmed by
  the business owner before `indexable` was set to true; a change to any of
  those facts is a reason to revisit both the text and that flag.

  Retention terms below must match lib/retention/policy.ts; the test for that
  module is the place that would notice a drift in the code, this comment is
  the place that would notice one in the text.
*/
const mail = `[${businessInfo.email}](mailto:${businessInfo.email})`;
const address = `${companyProfile.address.street}, ${companyProfile.address.postalCode} ${companyProfile.address.city}`;

export const privacyStatement: LegalStatementSet = {
  /* False while the attribution passage (23 September 2026) awaits the owner's confirmation; see cookies.ts for the rule. */
  indexable: false,
  content: {
    nl: {
      title: "Privacyverklaring",
      description:
        "Welke persoonsgegevens YM Creations verwerkt via ymcreations.com en in de dienstverlening, waarom, hoe lang, en welke rechten je hebt.",
      intro:
        "Deze verklaring beschrijft welke persoonsgegevens YM Creations verwerkt via ymcreations.com en in de dienstverlening, waarom dat gebeurt, hoe lang gegevens bewaard blijven en welke rechten je hebt.",
      updatedIso: "2026-09-23",
      updatedLabel: "23 september 2026",
      blocks: [
        { type: "heading", level: 2, content: "Wie verantwoordelijk is" },
        {
          type: "paragraph",
          content: `${businessInfo.legalName}, gevestigd aan ${address}, ingeschreven bij de KVK onder nummer ${businessInfo.kvk}, is verantwoordelijk voor de verwerking van je persoonsgegevens. Vragen over privacy stel je via ${mail} of ${businessInfo.phoneDisplay}.`,
        },

        { type: "heading", level: 2, content: "Welke gegevens we verwerken en waarom" },
        { type: "heading", level: 3, content: "Contactformulier en projectplanner" },
        {
          type: "paragraph",
          content:
            "Stuur je een bericht via het contactformulier of de projectplanner, dan verwerken we je naam, e-mailadres en bericht en, als je die invult, je bedrijfsnaam en telefoonnummer. Bij de projectplanner verwerken we ook je antwoorden over het project en je bevestiging dat je zakelijk handelt. We gebruiken deze gegevens om je aanvraag te beantwoorden en, als je dat wilt, een voorstel te doen. De grondslag daarvoor is dat deze stappen nodig zijn om op jouw verzoek tot een overeenkomst te komen.",
        },
        {
          type: "paragraph",
          content:
            "Je aanvraag wordt opgeslagen in onze database en je ontvangt een bevestiging per e-mail. Wordt het geen samenwerking, dan verwijderen we de aanvraag twaalf maanden na de laatste activiteit.",
        },
        {
          type: "paragraph",
          content:
            "Bij een aanvraag leggen we ook vast via welk kanaal het bezoek aan de website begon: een verwijzende website, een zoekmachine, een AI-assistent zoals ChatGPT, of een campagne, en op welke pagina van onze site het bezoek begon. We gebruiken dat om te begrijpen welke kanalen tot zakelijke aanvragen leiden. De grondslag is ons gerechtvaardigd belang bij het beoordelen van onze eigen zichtbaarheid. We slaan hiervoor niet de volledige verwijzende webpagina op, geen bezoekers-id, geen browserkenmerken en geen IP-adres; alleen de naam van de bron, het kanaal, een eventuele campagnenaam en het pad van de eerste pagina. Deze gegevens horen bij de aanvraag en worden tegelijk daarmee verwijderd.",
        },
        { type: "heading", level: 3, content: "Klanten, offertes en facturen" },
        {
          type: "paragraph",
          content:
            "Werk je met ons samen, dan verwerken we de gegevens die nodig zijn voor de overeenkomst en de administratie: je contactgegevens, bedrijfsgegevens zoals adres, KVK- en btw-nummer, en de offertes, facturen en betalingen die bij de samenwerking horen. De grondslag is de uitvoering van de overeenkomst en, voor de administratie, de wettelijke bewaarplicht. Facturen en andere persoonsgegevens en documenten die onderdeel zijn van onze fiscale administratie bewaren we ten minste gedurende de wettelijke bewaartermijn van zeven jaar. Daarna bewaren we deze alleen langer als daar nog een geldige juridische of administratieve reden voor bestaat.",
        },
        {
          type: "paragraph",
          content:
            "Berichten die we vanuit onze administratie versturen, zoals offertes, facturen en betaalinformatie, worden geregistreerd zodat we kunnen zien wat wanneer is verstuurd. De inhoud van berichten die niet tot de financiële administratie behoren verwijderen we na twaalf maanden.",
        },
        { type: "heading", level: 3, content: "Betalingen en automatische incasso" },
        {
          type: "paragraph",
          content:
            "Betalingen en machtigingen voor automatische incasso lopen via Mollie. Daarvoor delen we je naam, e-mailadres, het bedrag en een omschrijving met Mollie. Je bankgegevens, zoals je rekeningnummer, voer je in bij Mollie; die worden niet door YM Creations opgeslagen. Voor onze administratie bewaren we wel het betaalbedrag, de betaalstatus en de referenties die Mollie aan de betaling, de klant en de machtiging toekent, voor zover die in ons systeem aanwezig zijn. Voor de betaalgegevens die Mollie voor zijn betaaldienst verwerkt is Mollie zelfstandig verwerkingsverantwoordelijke; daarop is het privacybeleid van Mollie van toepassing.",
        },
        { type: "heading", level: 3, content: "Websitebezoek en beveiliging" },
        {
          type: "paragraph",
          content:
            "De website wordt gehost bij Vercel. Bij elk bezoek worden technische gegevens verwerkt, zoals je IP-adres, je browser en de opgevraagde pagina, om de website te leveren en te beveiligen. Wij gebruiken deze logbestanden alleen voor beveiliging en het oplossen van fouten. De grondslag is ons gerechtvaardigd belang bij een veilige en werkende website.",
        },
        { type: "heading", level: 3, content: "Statistieken" },
        {
          type: "paragraph",
          content: `Alleen als je daarvoor toestemming geeft, gebruiken we Google Analytics om te begrijpen hoe de website wordt gebruikt en om die te verbeteren. Daarbij worden gegevens over je bezoek gedeeld met Google. Zonder toestemming wordt Google Analytics niet geladen. Je kunt je keuze op elk moment wijzigen via Cookie-instellingen onderaan de pagina. Meer daarover staat in de [cookieverklaring](${getLocalizedPath("nl", "cookies")}).`,
        },
        { type: "heading", level: 3, content: "Gedragsopnames (Microsoft Clarity)" },
        {
          type: "paragraph",
          content:
            "Alleen als je daar apart toestemming voor geeft, onder gedragsopnames, laden we Microsoft Clarity. Clarity legt vast hoe je de website gebruikt: waar je klikt, hoe ver je scrolt en hoe je van pagina naar pagina gaat. Daarmee maakt Clarity gereconstrueerde sessieopnames en klik-, scroll- en aandachtsheatmaps, en signaleert het momenten waarop bezoekers mogelijk vastlopen, zoals herhaald of vergeefs klikken en snel teruggaan. We gebruiken dit om de website gebruiksvriendelijker te maken. Zonder die toestemming wordt Clarity niet geladen, ook niet als je toestemming voor statistieken gaf. De grondslag is je toestemming; je trekt die op elk moment in via Cookie-instellingen.",
        },
        {
          type: "paragraph",
          content:
            "Formulieren, zoals het contactformulier en de projectplanner, worden in de opnames afgeschermd, en op de betaal- en incassopagina's wordt Clarity niet geladen. We sturen Clarity geen namen, e-mailadressen of andere gegevens waarmee je te herkennen bent, en koppelen opnames niet aan een aanvraag of klant. Clarity herkent een browser bij een volgend bezoek wel aan een pseudonieme code in een cookie; zie de [cookieverklaring](" + getLocalizedPath("nl", "cookies") + ").",
        },
        {
          type: "paragraph",
          content:
            "Voor Clarity zijn Microsoft en YM Creations elk zelfstandig verwerkingsverantwoordelijke. Volgens de voorwaarden van Microsoft mag Microsoft de persoonsgegevens die het via Clarity verzamelt ook voor eigen doeleinden gebruiken, waaronder het leveren en verbeteren van zijn diensten en het opstellen van gebruikersprofielen, onder meer voor advertenties (Microsoft Advertising). Wij geven Clarity het signaal dat opslag voor advertentiedoeleinden niet is toegestaan; wat Microsoft met de gegevens doet, valt onder de [privacyverklaring van Microsoft](https://privacy.microsoft.com/nl-nl/privacystatement). Microsoft bewaart opnames dertig dagen en klik- en heatmapgegevens en gemarkeerde opnames negen maanden.",
        },
        {
          type: "paragraph",
          content:
            "Daarnaast halen we uit Clarity per pagina opgetelde cijfers op, zoals het aantal sessies, de gemiddelde scrolldiepte en het aantal herhaalde of vergeefse klikken. Die bewaren we zelf en gebruiken we alleen in onze eigen beheeromgeving; opnames of heatmaps kopiëren we niet.",
        },
        { type: "heading", level: 3, content: "Vindbaarheid in zoekmachines" },
        {
          type: "paragraph",
          content:
            "Om te zien hoe de website in zoekmachines gevonden wordt, halen we uit Google Search Console en Bing Webmaster Tools cijfers op die Google en Microsoft zelf over de zoekresultaten bijhouden: zoektermen, pagina's, klikken en vertoningen, opgeteld per dag of per periode. Die gegevens komen van de zoekmachines, niet uit je browser; hiervoor wordt niets op je apparaat geplaatst. Zoektermen die op een e-mailadres, telefoonnummer, webadres of code lijken, slaan we niet op. We koppelen een zoekterm nooit aan een aanvraag of aan een persoon. De grondslag is ons gerechtvaardigd belang bij inzicht in de vindbaarheid van de website.",
        },

        { type: "heading", level: 2, content: "Welke gegevens je moet geven" },
        {
          type: "paragraph",
          content:
            "Gegevens die in een formulier als verplicht zijn gemarkeerd, hebben we nodig om je aanvraag te behandelen. Zonder die gegevens kunnen we je aanvraag mogelijk niet behandelen of een overeenkomst niet uitvoeren. Optionele velden vul je vrijwillig in.",
        },

        { type: "heading", level: 2, content: "Geautomatiseerde besluitvorming" },
        {
          type: "paragraph",
          content:
            "YM Creations gebruikt persoonsgegevens niet voor geautomatiseerde besluitvorming of profilering met rechtsgevolgen of vergelijkbare aanmerkelijke gevolgen voor jou. De indicatie die de projectplanner geeft is een vrijblijvende schatting op basis van je eigen antwoorden; over elke aanvraag beslist een medewerker.",
        },

        { type: "heading", level: 2, content: "Met wie we gegevens delen" },
        {
          type: "paragraph",
          content:
            "We verkopen geen gegevens. We delen ze alleen met de partijen die nodig zijn om de website en onze dienstverlening te laten werken, en alleen voor het doel dat hieronder staat.",
        },
        {
          type: "list",
          items: [
            "**Supabase** voor de database en de opslag van aanvragen, klantgegevens en documenten.",
            "**Resend** voor het versturen van e-mail, zoals bevestigingen, offertes en facturen.",
            "**Vercel** voor de hosting van de website en de technische logbestanden.",
            "**Mollie** voor betalingen en automatische incasso; voor de betaalgegevens die Mollie voor zijn betaaldienst verwerkt is Mollie zelfstandig verwerkingsverantwoordelijke.",
            "**Google** voor statistieken via Google Analytics, uitsluitend met jouw toestemming.",
            "**Microsoft** voor gedragsopnames en heatmaps via Microsoft Clarity, uitsluitend met jouw toestemming voor gedragsopnames; Microsoft is daarvoor zelfstandig verwerkingsverantwoordelijke.",
          ],
        },

        { type: "heading", level: 2, content: "Doorgifte buiten de Europese Economische Ruimte" },
        {
          type: "paragraph",
          content:
            "Voor onze website en dienstverlening gebruiken we externe dienstverleners, waaronder Vercel, Supabase, Resend, als je toestemming geeft voor statistieken Google Analytics, en als je toestemming geeft voor gedragsopnames Microsoft Clarity. Afhankelijk van de gebruikte infrastructuur kunnen deze partijen persoonsgegevens buiten de Europese Economische Ruimte verwerken.",
        },
        {
          type: "paragraph",
          content:
            "Als persoonsgegevens buiten de EER worden verwerkt, gelden daarvoor de waarborgen die op grond van de toepasselijke privacywetgeving vereist zijn. Afhankelijk van de situatie kan dat bijvoorbeeld een adequaatheidsbesluit van de Europese Commissie zijn of door de Europese Commissie goedgekeurde Standard Contractual Clauses.",
        },
        {
          type: "paragraph",
          content:
            "Voor betalingen gebruiken we Mollie. Mollie is voor de betaalgegevens die het voor zijn betaaldienst verwerkt zelfstandig verwerkingsverantwoordelijke en beschrijft internationale doorgiften in zijn eigen privacybeleid.",
        },

        { type: "heading", level: 2, content: "Hoe we je gegevens beveiligen" },
        {
          type: "paragraph",
          content:
            "De verbinding met de website is versleuteld. Toegang tot klantgegevens is beperkt tot YM Creations en beveiligd met een persoonlijke login. Bankgegevens die je bij Mollie invoert bewaren we niet.",
        },

        { type: "heading", level: 2, content: "Hoe lang we gegevens bewaren" },
        {
          type: "list",
          items: [
            "Aanvragen via het contactformulier of de projectplanner die niet tot een samenwerking leiden: twaalf maanden na de laatste activiteit.",
            "Contactgegevens van mogelijke klanten waarmee geen samenwerking ontstaat: twaalf maanden na het laatste contact of de laatst geplande opvolging.",
            "Facturen en andere persoonsgegevens en documenten die onderdeel zijn van onze fiscale administratie: ten minste de wettelijke bewaartermijn van zeven jaar, en daarna alleen langer als daar nog een geldige juridische of administratieve reden voor bestaat.",
            "De inhoud van andere klantberichten: twaalf maanden; dat een bericht is verstuurd blijft geregistreerd.",
            "Je cookiekeuze: zes maanden.",
            "Zoektermen uit Google Search Console en Bing Webmaster Tools: zestien maanden.",
            "Per pagina opgetelde cijfers uit Microsoft Clarity in onze eigen database: negentig dagen. Voor wat Microsoft zelf bewaart, zie hierboven onder gedragsopnames.",
          ],
        },

        { type: "heading", level: 2, content: "Jouw rechten" },
        {
          type: "paragraph",
          content: `Voor zover van toepassing op de betreffende verwerking heb je het recht om je gegevens in te zien, te laten corrigeren of verwijderen, de verwerking te laten beperken, bezwaar te maken en je gegevens overgedragen te krijgen. Toestemming die je hebt gegeven, bijvoorbeeld voor statistieken, kun je altijd intrekken. Mail daarvoor naar ${mail}. We reageren in principe binnen één maand. Is een verzoek complex of gaat het om meerdere verzoeken, dan kan die termijn volgens de AVG worden verlengd; in dat geval laten we je dat binnen die eerste maand weten.`,
        },
        {
          type: "paragraph",
          content:
            "Ben je niet tevreden over hoe we met je gegevens omgaan, dan kun je een klacht indienen bij de Autoriteit Persoonsgegevens.",
        },

        { type: "heading", level: 2, content: "Wijzigingen" },
        {
          type: "paragraph",
          content:
            "Deze verklaring kan veranderen als de website of onze dienstverlening verandert. De datum bovenaan geeft aan wanneer de tekst voor het laatst is aangepast.",
        },
      ],
    },
    en: {
      title: "Privacy statement",
      description:
        "Which personal data YM Creations processes through ymcreations.com and in its services, why, for how long, and what your rights are.",
      intro:
        "This statement describes which personal data YM Creations processes through ymcreations.com and in its services, why, how long it is kept, and what your rights are.",
      updatedIso: "2026-09-23",
      updatedLabel: "23 September 2026",
      blocks: [
        { type: "heading", level: 2, content: "Who is responsible" },
        {
          type: "paragraph",
          content: `${businessInfo.legalName}, located at ${address}, the Netherlands, registered with the Dutch Chamber of Commerce (KVK) under number ${businessInfo.kvk}, is the controller for your personal data. For privacy questions, contact ${mail} or ${businessInfo.phoneDisplay}.`,
        },

        { type: "heading", level: 2, content: "What we process and why" },
        { type: "heading", level: 3, content: "Contact form and project planner" },
        {
          type: "paragraph",
          content:
            "When you send a message through the contact form or the project planner, we process your name, email address and message and, if you fill them in, your company name and phone number. The project planner also records your answers about the project and your confirmation that you are acting on behalf of a business. We use this to answer your request and, if you want one, to make a proposal. The legal basis is that these steps are needed to enter into an agreement at your request.",
        },
        {
          type: "paragraph",
          content:
            "Your request is stored in our database and you receive a confirmation by email. If it does not lead to a collaboration, we delete the request twelve months after the last activity.",
        },
        {
          type: "paragraph",
          content:
            "With a request we also record through which channel the visit to the website began: a referring website, a search engine, an AI assistant such as ChatGPT, or a campaign, and on which page of our site the visit started. We use this to understand which channels lead to business requests. The legal basis is our legitimate interest in assessing our own visibility. For this we do not store the full referring web page, a visitor id, browser characteristics or an IP address; only the name of the source, the channel, a campaign name if there was one, and the path of the first page. This data belongs to the request and is deleted together with it.",
        },
        { type: "heading", level: 3, content: "Clients, quotes and invoices" },
        {
          type: "paragraph",
          content:
            "If you work with us, we process what the agreement and the administration require: your contact details, company details such as address, Chamber of Commerce and VAT number, and the quotes, invoices and payments that belong to the collaboration. The legal basis is the performance of the agreement and, for the administration, the statutory retention duty. Invoices and other personal data and documents that form part of our tax administration are kept for at least the statutory retention period of seven years. After that, we keep them longer only if there is still a valid legal or administrative reason to do so.",
        },
        {
          type: "paragraph",
          content:
            "Messages we send from our administration, such as quotes, invoices and payment information, are logged so we can see what was sent and when. The content of messages that are not part of the financial administration is deleted after twelve months.",
        },
        { type: "heading", level: 3, content: "Payments and direct debit" },
        {
          type: "paragraph",
          content:
            "Payments and direct debit mandates run through Mollie. For that we share your name, email address, the amount and a description with Mollie. Your bank details, such as your account number, are entered at Mollie and are not stored by YM Creations. For our administration we do keep the payment amount, the payment status and the references Mollie assigns to the payment, the customer and the mandate, as far as they are present in our system. For the payment data Mollie processes for its payment service, Mollie is an independent controller; Mollie's privacy policy applies to it.",
        },
        { type: "heading", level: 3, content: "Visiting the website and security" },
        {
          type: "paragraph",
          content:
            "The website is hosted by Vercel. Every visit involves technical data such as your IP address, your browser and the page requested, used to deliver and protect the website. We use these logs only for security and for fixing errors. The legal basis is our legitimate interest in a secure, working website.",
        },
        { type: "heading", level: 3, content: "Analytics" },
        {
          type: "paragraph",
          content: `Only with your consent do we use Google Analytics to understand how the website is used and to improve it. Data about your visit is then shared with Google. Without consent, Google Analytics is not loaded. You can change your choice at any time under Cookie settings at the bottom of the page. The [cookie statement](${getLocalizedPath("en", "cookies")}) has the details.`,
        },
        { type: "heading", level: 3, content: "Behaviour recordings (Microsoft Clarity)" },
        {
          type: "paragraph",
          content:
            "Only if you give separate consent for behaviour recordings do we load Microsoft Clarity. Clarity records how you use the website: where you click, how far you scroll and how you move from page to page. From that, Clarity creates reconstructed session recordings and click, scroll and attention heatmaps, and flags moments where visitors may get stuck, such as repeated or ineffective clicks and quickly going back. We use this to make the website easier to use. Without that consent Clarity is not loaded, not even if you consented to analytics. The legal basis is your consent; you can withdraw it at any time under Cookie settings.",
        },
        {
          type: "paragraph",
          content:
            "Forms, such as the contact form and the project planner, are masked in the recordings, and Clarity is not loaded on the payment and direct debit pages. We send Clarity no names, email addresses or other data by which you can be recognised, and we do not link recordings to a request or a client. Clarity does recognise a browser on a later visit by a pseudonymous code in a cookie; see the [cookie statement](" + getLocalizedPath("en", "cookies") + ").",
        },
        {
          type: "paragraph",
          content:
            "For Clarity, Microsoft and YM Creations are each an independent controller. Under Microsoft's terms, Microsoft may also use the personal data it collects through Clarity for its own purposes, including providing and improving its services and creating user profiles, including for advertising (Microsoft Advertising). We signal to Clarity that storage for advertising purposes is not allowed; what Microsoft does with the data is governed by the [Microsoft privacy statement](https://privacy.microsoft.com/en-us/privacystatement). Microsoft keeps recordings for thirty days and click and heatmap data and labelled recordings for nine months.",
        },
        {
          type: "paragraph",
          content:
            "In addition, we retrieve per-page totals from Clarity, such as the number of sessions, the average scroll depth and the number of repeated or ineffective clicks. We keep these ourselves and use them only in our own admin area; we do not copy recordings or heatmaps.",
        },
        { type: "heading", level: 3, content: "Visibility in search engines" },
        {
          type: "paragraph",
          content:
            "To see how the website is found in search engines, we retrieve figures that Google and Microsoft keep about their own search results from Google Search Console and Bing Webmaster Tools: search terms, pages, clicks and impressions, added up per day or per period. This data comes from the search engines, not from your browser; nothing is placed on your device for it. Search terms that look like an email address, phone number, web address or code are not stored. We never link a search term to a request or to a person. The legal basis is our legitimate interest in understanding how the website can be found.",
        },

        { type: "heading", level: 2, content: "Which data you have to provide" },
        {
          type: "paragraph",
          content:
            "Data marked as required in a form is needed to handle your request. Without it, we may not be able to handle your request or to perform an agreement. Optional fields are up to you.",
        },

        { type: "heading", level: 2, content: "Automated decision-making" },
        {
          type: "paragraph",
          content:
            "YM Creations does not use personal data for automated decision-making or profiling that produces legal effects or similarly significant effects for you. The indication the project planner gives is a non-binding estimate based on your own answers; every request is decided on by a person.",
        },

        { type: "heading", level: 2, content: "Who we share data with" },
        {
          type: "paragraph",
          content:
            "We do not sell data. We share it only with the parties needed to run the website and our services, and only for the purpose listed below.",
        },
        {
          type: "list",
          items: [
            "**Supabase** for the database and the storage of requests, client data and documents.",
            "**Resend** for sending email, such as confirmations, quotes and invoices.",
            "**Vercel** for hosting the website and its technical logs.",
            "**Mollie** for payments and direct debit; for the payment data Mollie processes for its payment service, Mollie is an independent controller.",
            "**Google** for analytics through Google Analytics, only with your consent.",
            "**Microsoft** for behaviour recordings and heatmaps through Microsoft Clarity, only with your consent for behaviour recordings; Microsoft is an independent controller for this.",
          ],
        },

        { type: "heading", level: 2, content: "Transfers outside the European Economic Area" },
        {
          type: "paragraph",
          content:
            "We use external service providers for our website and services, including Vercel, Supabase, Resend, Google Analytics when you consent to analytics, and Microsoft Clarity when you consent to behaviour recordings. Depending on the infrastructure used, these providers may process personal data outside the European Economic Area.",
        },
        {
          type: "paragraph",
          content:
            "Where personal data is processed outside the EEA, the safeguards required under applicable data protection law apply. Depending on the circumstances, this may for example include an adequacy decision of the European Commission or Standard Contractual Clauses approved by the European Commission.",
        },
        {
          type: "paragraph",
          content:
            "We use Mollie for payments. Mollie acts as an independent controller for the payment data it processes for its payment services and describes international transfers in its own privacy policy.",
        },

        { type: "heading", level: 2, content: "How we protect your data" },
        {
          type: "paragraph",
          content:
            "The connection to the website is encrypted. Access to client data is limited to YM Creations and protected by a personal login. Bank details you enter at Mollie are not stored by us.",
        },

        { type: "heading", level: 2, content: "How long we keep data" },
        {
          type: "list",
          items: [
            "Requests through the contact form or project planner that do not lead to a collaboration: twelve months after the last activity.",
            "Contact details of prospective clients where no collaboration follows: twelve months after the last contact or the last planned follow-up.",
            "Invoices and other personal data and documents that form part of our tax administration: at least the statutory retention period of seven years, and after that only for as long as there is still a valid legal or administrative reason.",
            "The content of other client messages: twelve months; the fact that a message was sent stays on record.",
            "Your cookie choice: six months.",
            "Search terms from Google Search Console and Bing Webmaster Tools: sixteen months.",
            "Per-page totals from Microsoft Clarity in our own database: ninety days. For what Microsoft itself keeps, see behaviour recordings above.",
          ],
        },

        { type: "heading", level: 2, content: "Your rights" },
        {
          type: "paragraph",
          content: `In so far as they apply to the processing in question, you have the right to access your data, to have it corrected or deleted, to restrict its processing, to object, and to receive it in a portable form. Consent you have given, for analytics for instance, can be withdrawn at any time. Email ${mail}. We normally respond within one month. If a request is complex or there are several requests, the GDPR allows that period to be extended; if so, we will let you know within that first month.`,
        },
        {
          type: "paragraph",
          content:
            "If you are unhappy with how we handle your data, you can lodge a complaint with the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).",
        },

        { type: "heading", level: 2, content: "Changes" },
        {
          type: "paragraph",
          content:
            "This statement may change when the website or our services change. The date at the top shows when the text was last updated.",
        },
      ],
    },
  },
};
