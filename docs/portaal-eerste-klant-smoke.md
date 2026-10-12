# Klantportaal – smoke bij de eerste echte klant (± 10 minuten)

Doe dit één keer, samen met (of direct na) de eerste klant die je uitnodigt. Geen nepklant, geen echte betaling en geen offerteacceptatie nodig. Werk in een privévenster, zodat je admin-sessie er niet doorheen loopt.

Vooraf in de admin: de klant heeft een correct contact-e-mailadres; als je het portaal wilt laten zien met inhoud, staat er minstens één verzonden factuur en/of offerte (met opgeslagen PDF).

| # | Stap | Verwacht |
|---|------|----------|
| 1 | Admin → klant → Portaaltoegang → uitnodigen | Melding "uitgenodigd"; de klant krijgt binnen een minuut een mail van YM Creations (niet van Supabase) met een link naar `/portaal/wachtwoord-instellen`. De link werkt één uur (Supabase-instelling); daarna vraagt de klant via "Wachtwoord vergeten" een nieuwe aan. Spreek dus af dat de klant de mail dezelfde dag kort na het versturen opent. |
| 2 | Klant opent de link en kiest een wachtwoord (≥ 10 tekens) | Komt direct in `/portaal`; een te kort of gelekt wachtwoord geeft een Nederlandse melding. |
| 3 | Overzicht | Bedrijfsnaam klopt; openstaand bedrag gelijk aan de admin (Betalingen → klant). Geen andere klantnamen zichtbaar. |
| 4 | Mijn gegevens → één veld wijzigen (bijv. telefoon) → Opslaan → pagina verversen | Wijziging blijft staan; in de admin staat dezelfde waarde. Inlog-e-mail is ongewijzigd. Draai de wijziging desgewenst terug. |
| 5 | Facturen → factuur openen → PDF downloaden (als er een is) | PDF opent en is exact het document uit de admin (zelfde nummer en bedrag). Bij een factuur die via automatische incasso wordt geïnd staat er géén betaalknop; na de vervaldatum vraagt de pagina om contact op te nemen in plaats van zelf te betalen (geen dubbele afschrijving). |
| 6 | Offertes → offerte openen → PDF downloaden (als er een is) | PDF opent; status "Wacht op uw reactie". Niet accepteren als dat commercieel nog niet hoort. |
| 7 | Verzoeken → Nieuw verzoek → met één foto of PDF als bijlage | Verzoek staat in de lijst; klant krijgt een bevestigingsmail; jij krijgt de interne melding. |
| 8 | Verzoek openen → bijlage downloaden | Bestand opent en is hetzelfde bestand. |
| 9 | Admin → Verzoeken → status op "Wordt bekeken" | Klant ziet na verversen de nieuwe status (en krijgt een statusmail). |
| 10 | Uitloggen → opnieuw inloggen | Uitloggen gaat naar de inlogpagina; opnieuw inloggen werkt. |

Als iets afwijkt: noteer de stap, het tijdstip en de melding op het scherm, en trek zo nodig de portaaltoegang in (Admin → klant → Portaaltoegang → intrekken). Intrekken werkt direct, ook voor een open sessie.

Na afloop in Supabase (alleen lezen): `select action, occurred_at from portal_events where customer_id = '<klant-id>' order by occurred_at;` toont `member_invited` en `membership_accepted`; `customer_requests` bevat het ene verzoek.
