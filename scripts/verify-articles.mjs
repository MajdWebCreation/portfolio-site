#!/usr/bin/env node
/**
 * Checks the applied article documents against the migrations that wrote them.
 *
 *   node scripts/verify-articles.mjs              # the content in force now
 *   node scripts/verify-articles.mjs --seed       # each article as first seeded
 *   node scripts/verify-articles.mjs <file.sql>   # one migration, as written
 *
 * An article's text is not written once. The seed inserted twenty rows, and a
 * later migration rewrote every one of them; the next one may touch three.
 * So a bare run does not pick a file: it reads every migration that carries
 * article documents, in timestamp order, and lets a later one override an
 * earlier one slug by slug. What comes out is the text the database should
 * hold right now, and the run says which migration each article came from.
 *
 * `--seed` turns that around and keeps the first writer of each slug, which
 * is the library as it was originally seeded. Useful for reading history; it
 * is not what the database holds once a rewrite has been applied.
 *
 * Prints one SQL query and the digest every row should have. Run the query
 * against the project (SQL editor, CLI or the MCP connection) and compare:
 * `md5(content::text)` is Postgres's canonical form of the document, which
 * this script reproduces exactly -- jsonb sorts object keys by length and
 * then by bytes, and prints `", "` and `": "` between members.
 *
 * A row that differs is a document that did not arrive intact. Nothing else
 * about the article is checked here; the rest is plain columns you can read.
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";

const migrationsDir = "supabase/migrations";

/** Postgres jsonb text output, byte for byte. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(", ")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => {
      const left = Buffer.from(a);
      const right = Buffer.from(b);
      return left.length - right.length || Buffer.compare(left, right);
    });
    return `{${keys.map((key) => `${JSON.stringify(key)}: ${canonical(value[key])}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

/*
  The article rows in one migration, whatever shape it writes them in: the
  seed's full row, the rewrite's `(slug, content)` pair, or anything later
  that keeps the same layout. Documents are found first and each is attributed
  to the row it sits in, so the literal -- which contains brackets, quotes and
  whole paragraphs of prose -- never has to be part of the pattern that finds
  the slugs.
*/
function articleRows(sql) {
  const openers = [...sql.matchAll(/\n {2}\('([a-z0-9-]+)',/g)].map((match) => ({
    at: match.index,
    slug: match[1],
  }));

  const rows = [];
  for (const document of sql.matchAll(/'(\{"type":"doc".*?\})'::jsonb/gs)) {
    let owner = null;
    for (const opener of openers) {
      if (opener.at > document.index) break;
      owner = opener;
    }
    if (owner) rows.push([owner.slug, document[1]]);
  }

  return rows;
}

/** Every migration that writes article documents, oldest first. */
function contentMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ file: join(migrationsDir, name), sql: readFileSync(join(migrationsDir, name), "utf8") }))
    .map((migration) => ({ ...migration, rows: articleRows(migration.sql) }))
    .filter((migration) => migration.rows.length > 0);
}

const explicit = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const seedOnly = process.argv.includes("--seed");

const migrations = contentMigrations();
if (migrations.length === 0) throw new Error(`no migration in ${migrationsDir} writes article documents`);

/*
  Later migrations win, one slug at a time, which is what the database does
  when they run in order.
*/
const effective = new Map();
let sources;

if (explicit) {
  const chosen = { file: explicit, rows: articleRows(readFileSync(explicit, "utf8")) };
  if (chosen.rows.length === 0) throw new Error(`no article rows found in ${explicit}`);
  sources = [chosen];
} else {
  sources = migrations;
}

for (const migration of sources) {
  for (const [slug, document] of migration.rows) {
    if (seedOnly && effective.has(slug)) continue;
    effective.set(slug, { document, from: migration.file });
  }
}

const label = explicit
  ? `${explicit}, as written`
  : seedOnly
    ? `each article as first seeded, across ${migrations.length} migrations`
    : `the content in force after ${migrations.length} migrations`;

console.log(`Verifying: ${label}`);
for (const migration of sources) {
  const wins = [...effective.values()].filter((entry) => entry.from === migration.file).length;
  console.log(`  ${basename(migration.file)}  ${String(migration.rows.length).padStart(2)} rows, ${wins} used`);
}
console.log();

console.log("select slug, md5(content::text) as md5, length(content::text) as len");
console.log("  from public.articles order by published_at;\n");

for (const [slug, { document }] of effective) {
  const text = canonical(JSON.parse(document.replaceAll("''", "'")));
  console.log(`${createHash("md5").update(text).digest("hex")}  ${String(text.length).padStart(6)}  ${slug}`);
}

console.log(`\n${effective.size} articles`);
