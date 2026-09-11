#!/usr/bin/env node
/**
 * Checks an applied article seed against the migration that produced it.
 *
 *   node scripts/verify-articles.mjs [migration-file]
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

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const file = process.argv[2] ?? "supabase/migrations/20260911094500_articles_library_seed.sql";
const sql = readFileSync(file, "utf8");

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
  One entry per inserted row. Splitting on the row opener first keeps the
  document literal -- which contains everything, brackets and quotes included
  -- out of the pattern that finds the rows.
*/
const rows = sql
  .split(/\n {2}\((?='[a-z0-9-]+',\n)/)
  .slice(1)
  .map((part) => {
    const slug = part.match(/^'([a-z0-9-]+)'/)[1];
    const document = part.match(/'(\{"type":"doc".*?\})'::jsonb,\n {3}'published'/s)[1];
    return [slug, document];
  });

if (rows.length === 0) throw new Error(`no article rows found in ${file}`);

console.log("select slug, md5(content::text) as md5, length(content::text) as len");
console.log("  from public.articles order by published_at;\n");

for (const [slug, literal] of rows) {
  const text = canonical(JSON.parse(literal.replaceAll("''", "'")));
  console.log(`${createHash("md5").update(text).digest("hex")}  ${String(text.length).padStart(6)}  ${slug}`);
}

console.log(`\n${rows.length} articles in ${file}`);
