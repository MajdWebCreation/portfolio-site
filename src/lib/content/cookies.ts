import type { LegalStatementSet } from "@/lib/content/legal-statements";
import { getLocalizedPath } from "@/lib/content/routes";

/*
  The cookie statement, in both languages.

  It describes exactly what the code does: one first-party cookie for the
  choice itself (lib/consent/consent.ts, six months), Google Analytics only
  after consent (components/consent/analytics-scripts.tsx) with its cookies
  configured for ninety days -- `_ga` not renewed on a later visit
  (cookie_update: false), `_ga_<id>` rewritten by GA4 with fresh session
  state on every hit and therefore ninety days from the last visit -- and
  nothing else on the public site. The admin's authentication cookie is the
  Supabase session cookie written by @supabase/ssr with its library defaults
  (`sb-<project-ref>-auth-token`, chunked when large, Max-Age 400 days,
  lib/supabase/session.ts and server.ts); how long the signed-in session is
  actually valid is decided by the Auth service, not by that cookie.
  Microsoft Clarity (components/consent/clarity-script.tsx) is loaded only
  after consent for behaviour recordings. The cookie names below are the ones
  Microsoft documents ("Clarity cookies", learn.microsoft.com, checked 23
  September 2026): first-party _clck and _clsk, and on Microsoft's own
  domains MUID, CLID, ANONCHK, MR and SM. Microsoft's page gives no
  lifetimes, so none are stated here; they are to be read off a browser
  running the real tag and added then, together with any cookie that
  appears and is not listed.

  `indexable` is false while the Clarity part awaits that check and the
  owner's review; set it back to true only after both, so the sitemap and
  robots meta follow the text rather than run ahead of it.
*/
export const cookieStatement: LegalStatementSet = {
  indexable: false,
  content: {
    nl: {
      title: "Cookieverklaring",
      description: "Welke cookies ymcreations.com plaatst, waarvoor, hoe lang, en hoe je je keuze aanpast.",
      intro: "Deze verklaring beschrijft welke cookies ymcreations.com plaatst, waarvoor ze dienen, hoe lang ze blijven staan en hoe je je keuze aanpast.",
      updatedIso: "2026-09-23",
      updatedLabel: "23 september 2026",
      blocks: [
        { type: "heading", level: 2, content: "Wat cookies zijn" },
        {
          type: "paragraph",
          content:
            "Een cookie is een klein tekstbestand dat een website in je browser plaatst. Bij een volgend bezoek kan de website het weer uitlezen, bijvoorbeeld om een keuze te onthouden of om bezoeken te tellen.",
        },

        { type: "heading", level: 2, content: "Noodzakelijk" },
        {
          type: "paragraph",
          content:
            "De website plaatst één noodzakelijke cookie: de cookie die je cookiekeuze onthoudt. Daarvoor is geen toestemming nodig. Verder plaatst de publieke website geen cookies en gebruikt hij geen lokale opslag in je browser. Lettertypen worden vanaf onze eigen server geladen, niet van Google.",
        },
        {
          type: "paragraph",
          content:
            "De beheeromgeving van YM Creations plaatst na het inloggen van een medewerker een authenticatiecookie. De naam begint met sb- en eindigt op -auth-token, soms verdeeld over meerdere delen. Die cookie bewaart de ingelogde sessie van de medewerker, is noodzakelijk voor het beheer en wordt bij een gewoon bezoek aan de website nooit geplaatst. De cookie kan tot 400 dagen in de browser blijven staan; hoe lang de ingelogde sessie daadwerkelijk geldig is, wordt afzonderlijk door de authenticatiedienst beheerd.",
        },

        { type: "heading", level: 2, content: "Statistieken, alleen met toestemming" },
        {
          type: "paragraph",
          content:
            "Met jouw toestemming laden we Google Analytics om te begrijpen hoe de website wordt gebruikt en om die te verbeteren. Google plaatst dan cookies om bezoeken en bezoekers van elkaar te onderscheiden, en gegevens over je bezoek worden gedeeld met Google. Die cookies zijn ingesteld op een looptijd van negentig dagen. De cookie die bezoekers onderscheidt wordt bij een nieuw bezoek niet verlengd; de cookie die de sessie bijhoudt wordt bij elk bezoek opnieuw voor negentig dagen gezet, omdat Google daarin de sessiestatus bijwerkt. Zonder toestemming wordt het script niet geladen en worden deze cookies niet geplaatst. Statistieken staan standaard uit.",
        },

        { type: "heading", level: 2, content: "Gedragsopnames, alleen met toestemming" },
        {
          type: "paragraph",
          content:
            "Alleen als je toestemming geeft voor gedragsopnames, laden we Microsoft Clarity. Clarity laat zien waar bezoekers klikken, hoe ver ze scrollen en waar ze mogelijk vastlopen, via heatmaps en gereconstrueerde sessieopnames. Clarity plaatst dan twee cookies op onze website: één die je browser bij een volgend bezoek herkent aan een pseudonieme code, en één die de pagina's van één bezoek samenvoegt tot één opname. Zonder die toestemming wordt Clarity niet geladen en worden deze cookies niet geplaatst, ook niet als je toestemming voor statistieken gaf. Gedragsopnames staan standaard uit.",
        },
        {
          type: "paragraph",
          content:
            "Microsoft kan daarnaast op zijn eigen domeinen cookies plaatsen of uitlezen. Microsoft noemt daarvoor MUID, CLID, ANONCHK, MR en SM; die dienen er volgens Microsoft onder meer voor om een browser over sites heen te herkennen, en MUID wordt volgens Microsoft ook voor advertenties gebruikt. Wij geven Clarity het signaal dat opslag voor advertentiedoeleinden niet is toegestaan. Deze cookies staan op domeinen van Microsoft en vallen onder de [privacyverklaring van Microsoft](https://privacy.microsoft.com/nl-nl/privacystatement); wij kunnen ze niet uitlezen of verwijderen.",
        },

        { type: "heading", level: 2, content: "Overzicht" },
        {
          type: "table",
          head: ["Cookie", "Doel", "Categorie", "Looptijd"],
          rows: [
            ["ym_consent", "Onthoudt je cookiekeuze, de versie van de keuze en het moment waarop je die maakte.", "Noodzakelijk, eigen cookie", "6 maanden"],
            ["_ga", "Google Analytics: onderscheidt bezoekers.", "Statistieken, Google, alleen met toestemming", "90 dagen, niet verlengd"],
            ["_ga_*", "Google Analytics: houdt de sessie bij.", "Statistieken, Google, alleen met toestemming", "90 dagen vanaf het laatste bezoek"],
            ["_clck", "Microsoft Clarity: herkent je browser bij een volgend bezoek aan een pseudonieme code en bewaart Clarity-voorkeuren.", "Gedragsopnames, Microsoft, alleen met toestemming", "Door Microsoft bepaald"],
            ["_clsk", "Microsoft Clarity: voegt de pagina's van één bezoek samen tot één opname.", "Gedragsopnames, Microsoft, alleen met toestemming", "Door Microsoft bepaald"],
            ["MUID, CLID, ANONCHK, MR, SM", "Microsoft: op Microsofts eigen domeinen, onder meer om een browser over sites heen te herkennen.", "Gedragsopnames, Microsoft, alleen met toestemming; cookies van Microsoft zelf", "Door Microsoft bepaald"],
            [
              "sb-*-auth-token",
              "Authenticatiecookie van de beheeromgeving: bewaart de ingelogde sessie van een medewerker.",
              "Noodzakelijk; uitsluitend in de beheeromgeving, uitsluitend na medewerker-login, nooit bij een publiek websitebezoek",
              "Tot 400 dagen in de browser; de geldigheid van de sessie zelf wordt afzonderlijk beheerd",
            ],
          ],
        },

        { type: "heading", level: 2, content: "Je keuze aanpassen" },
        {
          type: "paragraph",
          content:
            "Onderaan elke pagina staat Cookie-instellingen. Daar zet je statistieken en gedragsopnames elk afzonderlijk aan of uit. Zet je statistieken uit, dan stopt het meten direct en verwijderen we de Google Analytics-cookies voor zover dat vanuit de website kan. Zet je gedragsopnames uit, dan vragen we Clarity te stoppen en zijn cookies te wissen, verwijderen we de Clarity-cookies op onze website en laadt de pagina opnieuw zonder Clarity. Cookies op domeinen van Microsoft kunnen wij niet verwijderen. Na zes maanden vragen we je keuze opnieuw, en ook eerder als de cookies of de partijen die ze plaatsen wezenlijk veranderen.",
        },
        {
          type: "paragraph",
          content: `Hoe we verder met je gegevens omgaan staat in de [privacyverklaring](${getLocalizedPath("nl", "privacy")}).`,
        },
      ],
    },
    en: {
      title: "Cookie statement",
      description: "Which cookies ymcreations.com sets, what for, for how long, and how to change your choice.",
      intro: "This statement describes which cookies ymcreations.com sets, what they are for, how long they last, and how to change your choice.",
      updatedIso: "2026-09-23",
      updatedLabel: "23 September 2026",
      blocks: [
        { type: "heading", level: 2, content: "What cookies are" },
        {
          type: "paragraph",
          content:
            "A cookie is a small text file a website places in your browser. On a later visit the website can read it again, for instance to remember a choice or to count visits.",
        },

        { type: "heading", level: 2, content: "Necessary" },
        {
          type: "paragraph",
          content:
            "The website sets one necessary cookie: the one that remembers your cookie choice. It needs no consent. Beyond that, the public website sets no cookies and uses no local storage in your browser. Fonts are served from our own server, not from Google.",
        },
        {
          type: "paragraph",
          content:
            "The YM Creations admin area sets an authentication cookie after a staff member signs in. Its name starts with sb- and ends in -auth-token, sometimes split into several parts. It holds the staff member's signed-in session, is necessary for the admin area and is never set during an ordinary visit to the website. The cookie can remain in the browser for up to 400 days; how long the signed-in session itself stays valid is managed separately by the authentication service.",
        },

        { type: "heading", level: 2, content: "Analytics, only with consent" },
        {
          type: "paragraph",
          content:
            "With your consent we load Google Analytics to understand how the website is used and to improve it. Google then sets cookies to tell visits and visitors apart, and data about your visit is shared with Google. Those cookies are set to last ninety days. The cookie that tells visitors apart is not extended by a later visit; the cookie that tracks the session is set again for ninety days on each visit, because Google updates the session state in it. Without consent the script is not loaded and these cookies are not set. Analytics is off by default.",
        },

        { type: "heading", level: 2, content: "Behaviour recordings, only with consent" },
        {
          type: "paragraph",
          content:
            "Only if you consent to behaviour recordings do we load Microsoft Clarity. Clarity shows where visitors click, how far they scroll and where they may get stuck, through heatmaps and reconstructed session recordings. Clarity then sets two cookies on our website: one that recognises your browser on a later visit by a pseudonymous code, and one that joins the pages of one visit into one recording. Without that consent Clarity is not loaded and these cookies are not set, not even if you consented to analytics. Behaviour recordings are off by default.",
        },
        {
          type: "paragraph",
          content:
            "Microsoft may also set or read cookies on its own domains. Microsoft lists MUID, CLID, ANONCHK, MR and SM for this; according to Microsoft they serve, among other things, to recognise a browser across sites, and MUID is also used for advertising. We signal to Clarity that storage for advertising purposes is not allowed. These cookies live on Microsoft's domains and are governed by the [Microsoft privacy statement](https://privacy.microsoft.com/en-us/privacystatement); we cannot read or remove them.",
        },

        { type: "heading", level: 2, content: "Overview" },
        {
          type: "table",
          head: ["Cookie", "Purpose", "Category", "Lifetime"],
          rows: [
            ["ym_consent", "Remembers your cookie choice, the version it was made under and when you made it.", "Necessary, first-party", "6 months"],
            ["_ga", "Google Analytics: tells visitors apart.", "Analytics, Google, only with consent", "90 days, not extended"],
            ["_ga_*", "Google Analytics: keeps track of the session.", "Analytics, Google, only with consent", "90 days from the last visit"],
            ["_clck", "Microsoft Clarity: recognises your browser on a later visit by a pseudonymous code and keeps Clarity preferences.", "Behaviour recordings, Microsoft, only with consent", "Set by Microsoft"],
            ["_clsk", "Microsoft Clarity: joins the pages of one visit into one recording.", "Behaviour recordings, Microsoft, only with consent", "Set by Microsoft"],
            ["MUID, CLID, ANONCHK, MR, SM", "Microsoft: on Microsoft's own domains, among other things to recognise a browser across sites.", "Behaviour recordings, Microsoft, only with consent; Microsoft's own cookies", "Set by Microsoft"],
            [
              "sb-*-auth-token",
              "Authentication cookie of the admin area: holds a staff member's signed-in session.",
              "Necessary; admin area only, only after staff sign-in, never during a public visit",
              "Up to 400 days in the browser; the validity of the session itself is managed separately",
            ],
          ],
        },

        { type: "heading", level: 2, content: "Changing your choice" },
        {
          type: "paragraph",
          content:
            "Cookie settings sits at the bottom of every page. There you switch analytics and behaviour recordings on or off, each on its own. Switching analytics off stops measurement immediately and removes the Google Analytics cookies as far as the website can. Switching behaviour recordings off asks Clarity to stop and erase its cookies, removes the Clarity cookies on our website and reloads the page without Clarity. Cookies on Microsoft's domains cannot be removed by us. After six months we ask again, and sooner if the cookies or the parties setting them change materially.",
        },
        {
          type: "paragraph",
          content: `How we handle your data beyond cookies is in the [privacy statement](${getLocalizedPath("en", "privacy")}).`,
        },
      ],
    },
  },
};
