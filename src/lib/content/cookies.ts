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
  `indexable` is true since the text was reviewed and confirmed; flip it back
  while any of the above is being changed, so the sitemap and robots meta
  follow the text rather than run ahead of it.
*/
export const cookieStatement: LegalStatementSet = {
  indexable: true,
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

        { type: "heading", level: 2, content: "Overzicht" },
        {
          type: "table",
          head: ["Cookie", "Doel", "Categorie", "Looptijd"],
          rows: [
            ["ym_consent", "Onthoudt je cookiekeuze, de versie van de keuze en het moment waarop je die maakte.", "Noodzakelijk, eigen cookie", "6 maanden"],
            ["_ga", "Google Analytics: onderscheidt bezoekers.", "Statistieken, Google, alleen met toestemming", "90 dagen, niet verlengd"],
            ["_ga_*", "Google Analytics: houdt de sessie bij.", "Statistieken, Google, alleen met toestemming", "90 dagen vanaf het laatste bezoek"],
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
            "Onderaan elke pagina staat Cookie-instellingen. Daar zet je statistieken aan of uit. Zet je ze uit, dan stopt het meten direct en verwijderen we de Google Analytics-cookies voor zover dat vanuit de website kan. Na zes maanden vragen we je keuze opnieuw, en ook eerder als de cookies of de partijen die ze plaatsen wezenlijk veranderen.",
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

        { type: "heading", level: 2, content: "Overview" },
        {
          type: "table",
          head: ["Cookie", "Purpose", "Category", "Lifetime"],
          rows: [
            ["ym_consent", "Remembers your cookie choice, the version it was made under and when you made it.", "Necessary, first-party", "6 months"],
            ["_ga", "Google Analytics: tells visitors apart.", "Analytics, Google, only with consent", "90 days, not extended"],
            ["_ga_*", "Google Analytics: keeps track of the session.", "Analytics, Google, only with consent", "90 days from the last visit"],
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
            "Cookie settings sits at the bottom of every page. There you switch analytics on or off. Switching it off stops measurement immediately and removes the Google Analytics cookies as far as the website can. After six months we ask again, and sooner if the cookies or the parties setting them change materially.",
        },
        {
          type: "paragraph",
          content: `How we handle your data beyond cookies is in the [privacy statement](${getLocalizedPath("en", "privacy")}).`,
        },
      ],
    },
  },
};
