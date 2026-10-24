#!/usr/bin/env node
/**
 * Imports a batch of new library articles into one insert migration.
 *
 *   node scripts/import-article-batch.mjs <source-dir> --covers <alt.json> --out <migration.sql>
 *
 * The first library (scripts/import-articles.mjs) carried its plan, links and
 * cover texts in the script itself. A later batch is written with all of that
 * in place: each markdown file has its own `published_at`, its internal links
 * are already in the prose and its SEO fields are final. This script only
 * converts and checks:
 *
 * - every internal link points at a route this site has, a live article or an
 *   article in the same batch (a link to one that is not live yet renders as
 *   plain text until it is, see `publishedArticlePaths` in ArticleRichText);
 * - every article has a cover in public/images/artikelen and an alt text;
 * - dates are real, distinct and in the future-or-today order of the plan;
 * - the snippet fields fit what a search result shows.
 *
 * The migration inserts and never updates: a slug that already exists fails
 * the migration instead of overwriting an article.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { docFromBlocks, parseBlocks, parseFrontmatter } from "./lib/article-markdown.mjs";

const sourceDir = process.argv[2];
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
};
const coversFile = option("--covers");
const target = option("--out");

if (!sourceDir || !coversFile || !target) {
  throw new Error("usage: import-article-batch.mjs <source-dir> --covers <alt.json> --out <migration.sql>");
}
if (existsSync(target)) {
  throw new Error(`${target} already exists and may already be applied; applied migrations are immutable.`);
}

const categoryByCluster = {
  "3D-configurators": "configurators",
  "Webapplicaties, klantportalen & maatwerksoftware": "webapplicaties",
  "Automatisering & koppelingen": "automatisering",
  "Websites & webshops": "websites",
  "Digitale techniek & strategie": "techniek",
};

const servicePaths = [
  "/nl/diensten/website-laten-maken",
  "/nl/diensten/webshop-laten-maken",
  "/nl/diensten/landingspagina",
  "/nl/diensten/webapplicatie-laten-maken",
  "/nl/diensten/3d-configurator",
  "/nl/diensten/koppelingen-automatisering",
  "/nl/diensten/redesign-optimalisatie",
  "/nl/diensten/performance",
];

const staticPaths = [
  "/nl",
  "/nl/diensten",
  "/nl/projecten",
  "/nl/tarieven",
  "/nl/projectplanner",
  "/nl/werkwijze",
  "/nl/contact",
  "/nl/blog",
  "/nl/websitecheck",
];

/** Articles already in public.articles when this batch is written. */
const liveArticles = [
  "wat-kost-een-maatwerk-website-in-2026",
  "checklist-launch-ready-website-seo-performance",
  "webapplicatie-laten-maken-stappenplan",
  "inp-uitgelegd-hoe-maak-je-een-site-echt-responsief",
  "website-of-webshop",
  "van-excel-naar-maatwerksoftware",
  "wat-is-een-3d-productconfigurator",
  "welke-bedrijfsprocessen-moet-je-automatiseren",
  "wat-kost-een-website-of-webshop",
  "technische-kwaliteit-website-webapp-beoordelen",
  "maatwerksoftware-of-standaardsoftware",
  "wanneer-is-een-3d-productconfigurator-zinvol",
  "zapier-make-of-maatwerk",
  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen",
  "wat-kost-een-webapplicatie",
  "technische-schuld-software",
  "api-koppeling-laten-maken",
  "wat-kost-een-3d-productconfigurator",
  "core-web-vitals-websiteperformance",
  "klantportaal-laten-maken",
  "website-koppelen-aan-crm",
  "technisch-onderhoud-website-webapp-na-livegang",
  "hoe-werkt-een-3d-productconfigurator-technisch",
  "website-code-data-eigendom-vendor-lock-in",
];

const covers = JSON.parse(readFileSync(coversFile, "utf8"));
const files = readdirSync(sourceDir).filter((name) => name.endsWith(".md")).sort();
const sources = files.map((file) => ({ file, ...parseFrontmatter(readFileSync(join(sourceDir, file), "utf8")) }));
const batchSlugs = sources.map(({ meta }) => meta.slug);

const knownPaths = new Set([
  ...servicePaths,
  ...staticPaths,
  ...[...liveArticles, ...batchSlugs].map((slug) => `/nl/blog/${slug}`),
]);

function texts(blocks) {
  return blocks.flatMap((block) => {
    if (block.type === "code") return [];
    if (block.type === "list") return block.items;
    if (block.type === "table") return [...block.head, ...block.rows.flat()];
    return [block.content];
  });
}

const rows = [];
for (const { file, meta, body } of sources) {
  const fail = (message) => {
    throw new Error(`${file}: ${message}`);
  };

  const { slug } = meta;
  if (!slug || `${slug}.md` !== file) fail(`frontmatter slug ${slug} does not match the file name`);
  if (liveArticles.includes(slug)) fail("slug is already live");

  const category = categoryByCluster[meta.cluster];
  if (!category) fail(`unknown cluster ${meta.cluster}`);

  for (const field of ["title", "excerpt", "meta_title", "meta_description", "published_at"]) {
    if (!meta[field]) fail(`missing ${field}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.published_at) || Number.isNaN(Date.parse(meta.published_at))) {
    fail(`published_at ${meta.published_at} is not a date`);
  }
  if (meta.meta_title.length > 70) fail(`meta_title is ${meta.meta_title.length} characters`);
  if (meta.meta_description.length > 165) fail(`meta_description is ${meta.meta_description.length} characters`);

  const alt = covers[slug];
  if (!alt) fail("no cover alt text");
  if (!existsSync(`public/images/artikelen/${slug}.webp`)) fail("no cover image in public/images/artikelen");

  const blocks = parseBlocks(body);
  for (const text of texts(blocks)) {
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^https?:\/\//.test(href) || href.startsWith("mailto:")) continue;
      if (!knownPaths.has(href)) fail(`unknown internal link ${href}`);
    }
  }

  rows.push({
    slug,
    title: meta.title,
    excerpt: meta.excerpt,
    content: JSON.stringify(docFromBlocks(blocks)),
    category,
    published_at: meta.published_at,
    seo_title: meta.meta_title,
    meta_description: meta.meta_description,
    featured_image: JSON.stringify({ path: `/images/artikelen/${slug}.webp`, alt }),
  });
}

rows.sort((a, b) => a.published_at.localeCompare(b.published_at));
const dates = rows.map((row) => row.published_at);
if (new Set(dates).size !== dates.length) throw new Error(`two articles share a date: ${dates.join(", ")}`);

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

const header = `-- A new batch of library articles, with its publication plan.
--
-- Generated by scripts/import-article-batch.mjs from the markdown sources;
-- not retyped. As with the first library, publication is the database's job:
-- the RLS policy on public.articles hands a row out once published_at has
-- arrived, so each article appears on its own date without touching the admin.
--
${rows.map((row) => `--   ${row.published_at}  ${row.slug}`).join("\n")}
--
-- Insert only: an existing slug fails this migration rather than being overwritten.

insert into public.articles
  (slug, title, excerpt, content, status, category, published_at, seo_title, meta_description, featured_image)
values
`;

const values = rows
  .map(
    (row) => `  (${quote(row.slug)},
   ${quote(row.title)},
   ${quote(row.excerpt)},
   ${quote(row.content)}::jsonb,
   'published',
   ${quote(row.category)},
   ${quote(row.published_at)}::date,
   ${quote(row.seo_title)},
   ${quote(row.meta_description)},
   ${quote(row.featured_image)}::jsonb)`,
  )
  .join(",\n");

writeFileSync(target, `${header}${values};\n`);

const counts = rows.reduce((all, row) => ({ ...all, [row.category]: (all[row.category] ?? 0) + 1 }), {});
console.log(`${rows.length} articles -> ${target}`);
console.log(counts);
