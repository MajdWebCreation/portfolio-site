#!/usr/bin/env node
/**
 * Looks up a Google place ID for GOOGLE_PLACE_ID, once.
 *
 *   GOOGLE_PLACES_API_KEY=… node scripts/find-google-place-id.mjs "YM Creations Landsmeer"
 *
 * Text Search (New) with only the fields needed to recognise the right
 * listing. Nothing is guessed: it prints every match with its address and
 * Google Maps link, and choosing is up to you. The key is read from the
 * environment (or .env.local) and never printed.
 */
import { readFileSync } from "node:fs";

function keyFromEnvFile() {
  try {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((row) => row.startsWith("GOOGLE_PLACES_API_KEY="));
    return line?.slice("GOOGLE_PLACES_API_KEY=".length).trim() || undefined;
  } catch {
    return undefined;
  }
}

const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || keyFromEnvFile();
const query = process.argv.slice(2).join(" ").trim();

if (!apiKey || !query) {
  console.error('Gebruik: GOOGLE_PLACES_API_KEY=… node scripts/find-google-place-id.mjs "YM Creations Landsmeer"');
  process.exit(1);
}

const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri",
  },
  body: JSON.stringify({ textQuery: query, languageCode: "nl", regionCode: "NL" }),
});

const data = await response.json().catch(() => null);

if (!response.ok) {
  console.error(`Places API: HTTP ${response.status} ${data?.error?.message ?? ""}`.trim());
  process.exit(1);
}

const places = data?.places ?? [];
if (places.length === 0) {
  console.log("Geen resultaten. Staat het bedrijf als Google-bedrijfsprofiel op Maps?");
  process.exit(0);
}

for (const place of places) {
  console.log(`${place.displayName?.text ?? "?"} — ${place.formattedAddress ?? "?"}`);
  console.log(`  GOOGLE_PLACE_ID=${place.id}`);
  console.log(`  ${place.googleMapsUri ?? ""}\n`);
}
