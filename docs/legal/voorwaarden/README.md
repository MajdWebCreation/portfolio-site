# Algemene Voorwaarden B2B — publicatieregister

Intern register van iedere gepubliceerde set, zoals artikel 29.5 van de voorwaarden vraagt: van elke set liggen de exacte publicatie- en ingangsdatum vast. Zo blijft aantoonbaar welke set bij welke offerte of overeenkomst ter beschikking is gesteld.

Extern heet elke set naar het jaartal ("Algemene Voorwaarden B2B — 2026"). Twee sets met dezelfde editie onderscheid je aan hun publicatiedatum.

De bron van de actuele set is `src/lib/content/terms.ts`. De webpagina `/nl/algemene-voorwaarden` en de PDF in `public/legal/` worden allebei daaruit gegenereerd (`node scripts/make-terms-pdf.mjs`). In `public/legal/` staat alleen de actuele set. Hier staat elke set die ooit is gepubliceerd, als kopie van precies de PDF die in die periode online stond. Een bestand in deze map wordt nooit overschreven.

| Editie | Gepubliceerd en ingegaan | Status | Bestand | SHA-256 | Bron |
| --- | --- | --- | --- | --- | --- |
| 2026 | 14 september 2026 | vervangen op 29 september 2026 | `YM_Creations_Algemene_Voorwaarden_B2B_2026_gepubliceerd-2026-09-14.pdf` | `cc854f15b529ada2e2712ae2728c3f9bd259a3caf82fcdab743fda5a192e4534` | commit `5d348b2` |
| 2026 | 29 september 2026 | actueel | `YM_Creations_Algemene_Voorwaarden_B2B_2026_gepubliceerd-2026-09-29.pdf` | `dfe5c669fed5ea7b3675b4a62dffca7be6f66c70d5f1acc7fd36b1db454a366d` | commit van deze publicatie |

## Wijzigingen per set

**29 september 2026** — Bijlage A1 (indicatieve beheerklassen) aangepast aan het prijsmodel voor technisch beheer. De instapniveaus gaan van EUR 10 / 25 / 35 / 49 naar EUR 15 / 29 / 39 / 69 p/m. De voetnoot noemt EUR 69 in plaats van EUR 49 als bedrag dat geen plafond is. Verder is geen bepaling gewijzigd.

**14 september 2026** — Eerste publicatie van editie 2026.

## Een nieuwe set publiceren

1. Pas `src/lib/content/terms.ts` aan en zet `dateIso` en `dateLabel` op de nieuwe publicatiedatum.
2. Genereer de PDF: `node scripts/make-terms-pdf.mjs`.
3. Kopieer `public/legal/YM_Creations_Algemene_Voorwaarden_B2B_<editie>.pdf` naar deze map als `..._gepubliceerd-<datum>.pdf`.
4. Zet in de tabel hierboven de vorige set op "vervangen", voeg de nieuwe regel toe (SHA-256 met `shasum -a 256`) en beschrijf de wijziging.

`src/lib/content/terms.test.ts` controleert dat er voor de huidige publicatiedatum een archiefbestand bestaat.
