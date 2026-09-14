#!/usr/bin/env node
/**
 * Renders the general terms to public/legal/.
 *
 *   node scripts/make-terms-pdf.mjs
 *
 * `src/lib/content/terms.ts` is the legal source. The page reads it directly;
 * this turns the same data into the PDF, so the two documents cannot say
 * different things. Run it after every change to the terms and commit the
 * result -- the PDF is a build artefact of that file, not a second original.
 *
 * The component is TSX and the rest of the repo compiles it through Next or
 * Vitest, neither of which is available to a plain Node script. esbuild is
 * already here as part of Vite, so it bundles the component and its imports
 * to one throwaway module; nothing is added to the dependency list for this.
 * The bundle is written under node_modules/.cache so that the renderer and
 * React still resolve from the installed packages beside it.
 */
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const outFile = join(root, "public/legal/YM_Creations_Algemene_Voorwaarden_B2B_2026.pdf");

const work = join(root, "node_modules/.cache/ym-terms");
const bundle = join(work, "terms-pdf.mjs");
await mkdir(work, { recursive: true });

try {
  await build({
    entryPoints: [join(root, "src/lib/legal/terms-pdf.tsx")],
    outfile: bundle,
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    // Everything the component needs from the repo is bundled; the renderer
    // and React stay external so the installed versions are used.
    external: ["@react-pdf/renderer", "react", "react/jsx-runtime"],
    alias: { "@": join(root, "src") },
    logLevel: "warning",
  });

  const [{ default: TermsPdf }, { renderToBuffer }, { createElement }] = await Promise.all([
    import(pathToFileURL(bundle).href),
    import("@react-pdf/renderer"),
    import("react"),
  ]);

  const pdf = await renderToBuffer(createElement(TermsPdf));
  await writeFile(outFile, pdf);

  const { size } = await stat(outFile);
  console.log(`${outFile.replace(root + "/", "")} — ${Math.round(size / 1024)} kB`);
} finally {
  await rm(work, { recursive: true, force: true });
}
