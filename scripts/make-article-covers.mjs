#!/usr/bin/env node
/**
 * Draws the cover image of every library article.
 *
 *   node scripts/make-article-covers.mjs                 (all covers)
 *   node scripts/make-article-covers.mjs <slug> <slug>   (only these)
 *
 * The covers are technical drawings, not photography: hairlines and mono
 * labels on paper, one accent colour, the same language as the sketches on
 * the services and process pages. Each one draws the idea the article is
 * actually about, so the image carries information instead of decoration.
 *
 * Written as SVG and rasterised to WebP at 1200x675 -- the 16:9 box the
 * article page reserves -- into public/images/artikelen. The alt text lives
 * with the article, in scripts/import-articles.mjs.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const W = 1200;
const H = 675;

const paper = "#f4f3ee";
const deep = "#e9e8e1";
const line = "#d6d5cd";
const strong = "#b9b8ae";
const ink = "#101827";
const body = "#2c3547";
const muted = "#5d6677";
const accent = "#2149c9";

const sans = "Helvetica Neue, Helvetica, Arial, sans-serif";
const mono = "Menlo, Monaco, Consolas, monospace";

const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------ primitives --*/

const label = (x, y, text, { size = 13, fill = muted, anchor = "start", track = 0.08 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${mono}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${(size * track).toFixed(2)}">${esc(text)}</text>`;

const text = (x, y, value, { size = 20, fill = ink, anchor = "start", weight = 500 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${sans}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;

const box = (x, y, w, h, { stroke = strong, fill = "none", r = 4, width = 1.5 } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;

const seg = (x1, y1, x2, y2, { stroke = strong, width = 1.5, dash = null } = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;

const dot = (x, y, r = 5, fill = accent) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

const ring = (x, y, r = 6, stroke = strong) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${paper}" stroke="${stroke}" stroke-width="1.5"/>`;

/** A short arrow, horizontal or vertical. */
const arrow = (x, y, length, { dir = "right", stroke = strong } = {}) => {
  const head = 6;
  if (dir === "right") {
    return (
      seg(x, y, x + length, y, { stroke }) +
      `<path d="M${x + length},${y} l${-head},${-head * 0.6} l0,${head * 1.2} Z" fill="${stroke}"/>`
    );
  }
  return (
    seg(x, y, x, y + length, { stroke }) +
    `<path d="M${x},${y + length} l${-head * 0.6},${-head} l${head * 1.2},0 Z" fill="${stroke}"/>`
  );
};

/** A labelled node box in a flow. */
const node = (x, y, w, h, caption, { tone = strong, fill = paper } = {}) =>
  box(x, y, w, h, { stroke: tone, fill }) + label(x + w / 2, y + h / 2 + 4, caption, { anchor: "middle", size: 12, fill: tone === accent ? accent : body });

/* ------------------------------------------------------------- the sheet --*/

function sheet(kicker, drawing) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${paper}"/>
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${line}" stroke-width="1"/>
  ${label(64, 82, kicker.toUpperCase(), { size: 13, fill: muted, track: 0.16 })}
  ${seg(64, 100, W - 64, 100, { stroke: line, width: 1 })}
  ${drawing}
</svg>`;
}

/* ----------------------------------------------------------- the covers --*/

const covers = {
  /* Websites & webshops ---------------------------------------------------*/
  "website-of-webshop": () => {
    const top = ["informatie", "vertrouwen", "aanvraag"];
    const bottom = ["product", "winkelmand", "checkout", "betaling", "order", "fulfilment"];
    let out = text(64, 170, "Twee routes door hetzelfde aanbod", { size: 26, weight: 600 });
    let x = 64;
    top.forEach((caption, index) => {
      out += node(x, 240, 150, 58, caption);
      if (index < top.length - 1) out += arrow(x + 158, 269, 26);
      x += 184;
    });
    out += label(x + 10, 274, "→ sales", { size: 13, fill: muted });
    x = 64;
    bottom.forEach((caption, index) => {
      const last = index === bottom.length - 1;
      out += node(x, 420, 150, 58, caption, { tone: last ? accent : strong, fill: last ? "#eef1fc" : paper });
      if (index < bottom.length - 1) out += arrow(x + 158, 449, 26);
      x += 184;
    });
    out += label(64, 345, "website", { size: 13, fill: muted });
    out += label(64, 525, "webshop", { size: 13, fill: accent });
    return out;
  },

  "wat-kost-een-website-of-webshop": () => {
    const parts = [
      ["strategie", 180],
      ["design", 300],
      ["content", 260],
      ["techniek", 420],
      ["integraties", 340],
      ["migratie", 220],
      ["seo", 200],
      ["onderhoud", 280],
    ];
    let out = text(64, 170, "Waar de scope vandaan komt", { size: 26, weight: 600 });
    let y = 230;
    parts.forEach(([caption, width], index) => {
      const tone = index === 3 ? accent : strong;
      out += box(240, y, width, 30, { stroke: tone, fill: index === 3 ? "#eef1fc" : paper, r: 3 });
      out += label(224, y + 20, caption, { size: 13, anchor: "end", fill: index === 3 ? accent : muted });
      y += 46;
    });
    out += seg(240, 214, 240, y - 10, { stroke: line, width: 1 });
    out += label(240, 622, "één label, zeer verschillende projecten", { size: 13, fill: muted });
    return out;
  },

  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen": () => {
    const steps = [
      ["optimaliseren", "losse onderdelen", 1],
      ["redesignen", "uitstraling en UX", 2],
      ["replatformen", "technisch fundament", 3],
      ["herbouwen", "strategie tot techniek", 5],
    ];
    let out = text(64, 170, "Vier ingrepen, van klein naar groot", { size: 26, weight: 600 });
    steps.forEach(([caption, note, weight], index) => {
      const x = 110 + index * 260;
      const last = index === steps.length - 1;
      out += box(x, 250, 220, 250, { stroke: line, width: 1 });
      for (let row = 0; row < weight; row += 1) {
        out += box(x + 20, 460 - row * 44, 180, 32, {
          stroke: last ? accent : strong,
          fill: last ? "#eef1fc" : deep,
          r: 2,
        });
      }
      out += label(x, 532, caption, { size: 13, fill: last ? accent : ink });
      out += label(x, 556, note, { size: 11, fill: muted });
    });
    out += label(110, 610, "kies de kleinste die het probleem echt oplost", { size: 13, fill: muted });
    return out;
  },

  "core-web-vitals-websiteperformance": () => {
    const meters = [
      ["LCP", "laden", 0.62],
      ["INP", "reageren", 0.38],
      ["CLS", "stabiliteit", 0.8],
    ];
    let out = text(64, 170, "Drie metingen, drie verschillende problemen", { size: 26, weight: 600 });
    meters.forEach(([name, caption, fill], index) => {
      const x = 120 + index * 340;
      out += box(x, 250, 240, 240, { stroke: strong });
      out += box(x + 24, 470 - 130 * fill, 192, 130 * fill, { stroke: index === 1 ? accent : strong, fill: index === 1 ? "#eef1fc" : deep, r: 2 });
      out += seg(x + 24, 470, x + 216, 470, { stroke: line, width: 1 });
      out += text(x + 110, 300, name, { size: 22, weight: 600, fill: index === 1 ? accent : ink });
      out += label(x + 110, 322, caption, { size: 13, fill: muted });
    });
    out += label(64, 560, "een groene score is geen bedrijfsdoel", { size: 13, fill: muted });
    return out;
  },

  /* Webapplicaties & portalen ---------------------------------------------*/
  "van-excel-naar-maatwerksoftware": () => {
    let out = text(64, 170, "Van cellen naar bedrijfsobjecten", { size: 26, weight: 600 });
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        out += box(90 + column * 78, 250 + row * 46, 78, 46, { stroke: line, width: 1, r: 0 });
      }
    }
    out += arrow(520, 365, 80);
    const objects = ["organisatie", "project", "offerte", "factuur"];
    objects.forEach((caption, index) => {
      const x = 660 + (index % 2) * 230;
      const y = 250 + Math.floor(index / 2) * 150;
      out += box(x, y, 190, 74, { stroke: index === 0 ? accent : strong, fill: index === 0 ? "#eef1fc" : paper });
      out += label(x + 95, y + 42, caption, { anchor: "middle", size: 13, fill: index === 0 ? accent : body });
    });
    out += seg(755, 324, 755, 400, { stroke: strong, width: 1 });
    out += seg(985, 324, 985, 400, { stroke: strong, width: 1 });
    out += seg(850, 287, 890, 287, { stroke: strong, width: 1 });
    out += seg(850, 437, 890, 437, { stroke: strong, width: 1 });
    out += label(90, 560, "hetzelfde proces, met relaties, rollen en historie", { size: 13, fill: muted });
    return out;
  },

  "maatwerksoftware-of-standaardsoftware": () => {
    const options = [
      ["SaaS", 120],
      ["CMS", 160],
      ["low-code", 210],
      ["maatwerk", 300],
      ["hybride", 250],
    ];
    let out = text(64, 170, "Vijf routes, niet twee", { size: 26, weight: 600 });
    options.forEach(([caption, height], index) => {
      const x = 110 + index * 200;
      const last = index === options.length - 1;
      out += box(x, 500 - height, 150, height, { stroke: last ? accent : strong, fill: last ? "#eef1fc" : paper });
      if (last) out += seg(x, 500 - height + 70, x + 150, 500 - height + 70, { stroke: accent, width: 1, dash: "4 4" });
      out += label(x + 75, 528, caption, { anchor: "middle", size: 13, fill: last ? accent : muted });
    });
    out += seg(90, 500, W - 90, 500, { stroke: line, width: 1 });
    out += label(110, 580, "procesfit tegen implementatie- en levenscycluslast", { size: 13, fill: muted });
    return out;
  },

  "wat-kost-een-webapplicatie": () => {
    let out = text(64, 170, "Rollen × workflows × integraties", { size: 26, weight: 600 });
    const x0 = 220;
    const y0 = 240;
    for (let column = 0; column <= 6; column += 1) {
      out += seg(x0 + column * 110, y0, x0 + column * 110, y0 + 240, { stroke: line, width: 1 });
    }
    for (let row = 0; row <= 4; row += 1) {
      out += seg(x0, y0 + row * 60, x0 + 660, y0 + row * 60, { stroke: line, width: 1 });
    }
    const points = [
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
      [4, 2],
      [4, 3],
      [5, 3],
      [3, 0],
      [5, 1],
    ];
    points.forEach(([column, row], index) =>
      (out += dot(x0 + column * 110, y0 + row * 60 + 30, 6, index % 3 === 0 ? accent : body)),
    );
    out += label(x0 - 16, y0 + 34, "rollen", { size: 13, anchor: "end", fill: muted });
    out += label(x0 - 16, y0 + 154, "workflows", { size: 13, anchor: "end", fill: muted });
    out += label(x0, y0 + 280, "integraties →", { size: 13, fill: muted });
    out += label(x0, 600, "de scope groeit op de kruispunten, niet op het aantal schermen", { size: 13, fill: muted });
    return out;
  },

  "klantportaal-laten-maken": () => {
    let out = text(64, 170, "Selfservice boven bestaande systemen", { size: 26, weight: 600 });
    const sources = ["CRM", "ERP", "boekhouding", "documentopslag"];
    sources.forEach((caption, index) => {
      const y = 240 + index * 78;
      out += box(80, y, 190, 54, { stroke: strong });
      out += label(175, y + 32, caption, { anchor: "middle", size: 13, fill: body });
      out += arrow(280, y + 27, 60);
    });
    out += box(370, 240, 300, 288, { stroke: accent, fill: "#eef1fc" });
    out += label(520, 278, "klantportaal", { anchor: "middle", size: 13, fill: accent });
    ["projectstatus", "documenten", "facturen", "aanvraag"].forEach((caption, index) => {
      out += box(400, 300 + index * 54, 240, 40, { stroke: accent, fill: paper, r: 3 });
      out += label(420, 325 + index * 54, caption, { size: 12, fill: body });
    });
    out += arrow(690, 384, 60);
    out += ring(790, 384, 22, strong);
    out += label(790, 389, "klant", { anchor: "middle", size: 11, fill: body });
    out += label(80, 600, "een dashboard is geen nieuwe bron van waarheid", { size: 13, fill: muted });
    return out;
  },

  /* 3D-configurators -------------------------------------------------------*/
  "wat-is-een-3d-productconfigurator": () => {
    const layers = ["productdefinitie", "gebruikerskeuze", "configuratiestate", "regels en validatie", "3D-weergave"];
    let out = text(64, 170, "De 3D-laag komt als laatste", { size: 26, weight: 600 });
    layers.forEach((caption, index) => {
      const y = 230 + index * 72;
      const last = index === layers.length - 1;
      out += box(300, y, 600, 52, { stroke: last ? accent : strong, fill: last ? "#eef1fc" : paper });
      out += label(600, y + 32, caption, { anchor: "middle", size: 13, fill: last ? accent : body });
      if (index < layers.length - 1) out += arrow(600, y + 54, 16, { dir: "down" });
    });
    out += label(64, 600, "de renderer toont wat de configuratielaag heeft besloten", { size: 13, fill: muted });
    return out;
  },

  "wanneer-is-een-3d-productconfigurator-zinvol": () => {
    const axes = [
      ["productvariatie", -1, -1],
      ["visualisatiebehoefte", 1, -1],
      ["herhaalbaar saleswerk", -1, 1],
      ["formaliseerbare regels", 1, 1],
    ];
    let out = text(64, 170, "Vier factoren die samen moeten komen", { size: 26, weight: 600 });
    const cx = 600;
    const cy = 400;
    axes.forEach(([caption, dx, dy]) => {
      const x = cx + dx * 300;
      const y = cy + dy * 150;
      out += box(x - 150, y - 30, 300, 60, { stroke: strong });
      out += label(x, y + 5, caption, { anchor: "middle", size: 13, fill: body });
      out += seg(x - dx * 150, y, cx + dx * 40, cy + dy * 24, { stroke: line, width: 1 });
    });
    out += ring(cx, cy, 34, accent);
    out += dot(cx, cy, 7);
    out += label(64, 624, "één positief antwoord is nog geen businesscase", { size: 13, fill: muted });
    return out;
  },

  "wat-kost-een-3d-productconfigurator": () => {
    let out = text(64, 170, "Gelijk van buiten, niet van binnen", { size: 26, weight: 600 });
    [0, 1].forEach((side) => {
      const x = 140 + side * 540;
      out += box(x, 230, 380, 90, { stroke: strong, fill: deep });
      out += label(x + 190, 282, side === 0 ? "configurator A" : "configurator B", { anchor: "middle", size: 13, fill: body });
      const layers = side === 0 ? 2 : 7;
      for (let index = 0; index < layers; index += 1) {
        const y = 350 + index * 34;
        out += box(x, y, 380, 26, { stroke: side === 1 ? accent : strong, fill: side === 1 ? "#eef1fc" : paper, r: 2 });
      }
      out += label(x, 616, side === 0 ? "leadformulier" : "regels, prijs, versies, ERP", { size: 13, fill: side === 1 ? accent : muted });
    });
    return out;
  },

  "hoe-werkt-een-3d-productconfigurator-technisch": () => {
    const layers = [
      ["UI", "keuzes en feedback"],
      ["configuratiestate", "wat de gebruiker koos"],
      ["rule engine", "welke combinaties geldig zijn"],
      ["pricing", "prijscomponenten"],
      ["renderer", "state naar beeld"],
      ["backend", "validatie en integraties"],
    ];
    let out = text(64, 170, "De lagen onder de scène", { size: 26, weight: 600 });
    layers.forEach(([name, caption], index) => {
      const y = 220 + index * 62;
      const highlight = index === 2;
      out += box(150, y, 420, 46, { stroke: highlight ? accent : strong, fill: highlight ? "#eef1fc" : paper });
      out += label(170, y + 29, name, { size: 13, fill: highlight ? accent : ink });
      out += label(600, y + 29, caption, { size: 13, fill: muted });
      if (index < layers.length - 1) out += arrow(360, y + 48, 12, { dir: "down" });
    });
    return out;
  },

  /* Automatisering & koppelingen ------------------------------------------*/
  "welke-bedrijfsprocessen-moet-je-automatiseren": () => {
    let out = text(64, 170, "Waarde tegen complexiteit en risico", { size: 26, weight: 600 });
    const x0 = 260;
    const y0 = 230;
    const size = 300;
    out += box(x0, y0, size * 2, size, { stroke: line, width: 1 });
    out += seg(x0 + size, y0, x0 + size, y0 + size, { stroke: line, width: 1 });
    out += seg(x0, y0 + size / 2, x0 + size * 2, y0 + size / 2, { stroke: line, width: 1 });
    out += box(x0, y0, size, size / 2, { stroke: accent, fill: "#eef1fc" });
    const cells = [
      ["sterke eerste kandidaat", 0, 0, accent],
      ["ontwerpen en piloten", 1, 0, body],
      ["alleen als quick win", 0, 1, body],
      ["meestal niet", 1, 1, muted],
    ];
    cells.forEach(([caption, column, row, fill]) => {
      out += label(x0 + column * size + size / 2, y0 + row * (size / 2) + size / 4 + 5, caption, { anchor: "middle", size: 13, fill });
    });
    out += label(x0 - 20, y0 + 80, "hoge waarde", { size: 13, anchor: "end", fill: muted });
    out += label(x0 - 20, y0 + 230, "lage waarde", { size: 13, anchor: "end", fill: muted });
    out += label(x0, y0 + size + 36, "lage complexiteit", { size: 13, fill: muted });
    out += label(x0 + size * 2, y0 + size + 36, "hoge complexiteit", { size: 13, anchor: "end", fill: muted });
    return out;
  },

  "zapier-make-of-maatwerk": () => {
    let out = text(64, 170, "Platform of eigen code", { size: 26, weight: 600 });
    out += seg(600, 230, 600, 350, { stroke: line, width: 1 });
    out += seg(600, 410, 600, 520, { stroke: line, width: 1 });
    out += label(600, 384, "of", { anchor: "middle", size: 13, fill: muted });

    out += box(110, 230, 400, 290, { stroke: strong });
    out += label(134, 268, "platform", { size: 13, fill: muted });
    ["connectors", "workflowstappen", "retries van het platform", "execution history"].forEach((caption, index) => {
      const y = 296 + index * 48;
      out += box(134, y, 352, 34, { stroke: line, width: 1, fill: deep, r: 2 });
      out += label(152, y + 22, caption, { size: 12, fill: body });
    });

    out += box(690, 230, 400, 290, { stroke: accent, fill: "#eef1fc" });
    out += label(714, 268, "eigen integratielaag", { size: 13, fill: accent });
    ["eigen datamodel", "idempotency", "queues en recovery", "observability"].forEach((caption, index) => {
      const y = 296 + index * 48;
      out += box(714, y, 352, 34, { stroke: accent, fill: paper, r: 2 });
      out += label(732, y + 22, caption, { size: 12, fill: accent });
    });

    out += label(110, 604, "kies op operationele verantwoordelijkheid, niet op uitstraling", { size: 13, fill: muted });
    return out;
  },

  "api-koppeling-laten-maken": () => {
    const steps = ["auth", "call", "validatie", "verwerking", "status"];
    let out = text(64, 170, "Meer dan systeem A praat met systeem B", { size: 26, weight: 600 });
    out += box(70, 300, 150, 90, { stroke: strong });
    out += label(145, 352, "systeem A", { anchor: "middle", size: 13, fill: body });
    out += box(980, 300, 150, 90, { stroke: strong });
    out += label(1055, 352, "systeem B", { anchor: "middle", size: 13, fill: body });
    steps.forEach((caption, index) => {
      const x = 258 + index * 140;
      out += ring(x, 345, 9, index === 4 ? accent : strong);
      out += label(x, 385, caption, { anchor: "middle", size: 12, fill: index === 4 ? accent : muted });
      if (index < steps.length - 1) out += seg(x + 10, 345, x + 130, 345, { stroke: line, width: 1 });
    });
    out += seg(230, 345, 248, 345, { stroke: line, width: 1 });
    out += seg(828, 345, 978, 345, { stroke: line, width: 1 });
    out += `<path d="M818,404 C818,486 398,486 398,404" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="5 5"/>`;
    out += label(608, 520, "retry, monitoring en recovery", { anchor: "middle", size: 13, fill: accent });
    out += label(70, 600, "betrouwbaarheid is ook detecteerbaarheid en herstelbaarheid", { size: 13, fill: muted });
    return out;
  },

  "website-koppelen-aan-crm": () => {
    let out = text(64, 170, "Van formulier naar het juiste record", { size: 26, weight: 600 });
    out += box(80, 280, 210, 150, { stroke: strong });
    ["naam", "e-mail", "bericht"].forEach((caption, index) => {
      out += box(104, 306 + index * 40, 160, 26, { stroke: line, width: 1, r: 2 });
      out += label(114, 324 + index * 40, caption, { size: 11, fill: muted });
    });
    out += arrow(300, 355, 50);
    out += `<path d="M420,315 L470,355 L420,395 L370,355 Z" fill="${paper}" stroke="${accent}" stroke-width="1.5"/>`;
    out += label(420, 359, "lookup", { anchor: "middle", size: 11, fill: accent });
    out += arrow(480, 355, 50);
    ["contact", "bedrijf", "deal"].forEach((caption, index) => {
      const y = 270 + index * 90;
      out += box(560, y, 210, 62, { stroke: strong });
      out += label(665, y + 36, caption, { anchor: "middle", size: 13, fill: body });
      out += seg(530, 355, 560, y + 31, { stroke: line, width: 1 });
    });
    out += box(850, 300, 200, 120, { stroke: strong, fill: deep });
    out += label(950, 365, "CRM", { anchor: "middle", size: 13, fill: body });
    out += seg(770, 355, 850, 355, { stroke: line, width: 1 });
    out += label(80, 580, "eerst identiteit bepalen, daarna records maken", { size: 13, fill: muted });
    return out;
  },

  /* Techniek & strategie ---------------------------------------------------*/
  "technische-kwaliteit-website-webapp-beoordelen": () => {
    const gauges = [
      ["onderhoudbaar", 0.7],
      ["architectuur", 0.55],
      ["data", 0.85],
      ["tests", 0.35],
      ["observability", 0.45],
      ["security", 0.75],
      ["herstel", 0.25],
    ];
    let out = text(64, 170, "Kwaliteit wordt zichtbaar bij verandering", { size: 26, weight: 600 });
    gauges.forEach(([caption, value], index) => {
      const x = 110 + index * 148;
      out += box(x, 240, 90, 240, { stroke: line, width: 1 });
      const height = 240 * value;
      const low = value < 0.4;
      out += box(x, 480 - height, 90, height, { stroke: low ? accent : strong, fill: low ? "#eef1fc" : deep, r: 2 });
      out += label(x + 45, 512, caption, { anchor: "middle", size: 11, fill: low ? accent : muted });
    });
    out += label(110, 580, "de lage staven bepalen het risico, niet het gemiddelde", { size: 13, fill: muted });
    return out;
  },

  "technische-schuld-software": () => {
    let out = text(64, 170, "De rente loopt op", { size: 26, weight: 600 });
    out += seg(150, 520, 1060, 520, { stroke: line, width: 1 });
    out += seg(150, 230, 150, 520, { stroke: line, width: 1 });
    out += `<path d="M150,500 C420,494 640,470 790,400 C900,348 970,290 1030,240" fill="none" stroke="${accent}" stroke-width="2.5"/>`;
    out += seg(150, 500, 1030, 470, { stroke: strong, width: 1.5, dash: "6 6" });
    out += label(1040, 470, "verwacht", { size: 12, fill: muted });
    out += label(1040, 236, "werkelijk", { size: 12, fill: accent });
    ["kleine wijziging", "nieuwe bug", "uitgestelde update", "workaround"].forEach((caption, index) => {
      const x = 300 + index * 190;
      out += dot(x, 520, 4, strong);
      out += label(x, 550, caption, { anchor: "middle", size: 11, fill: muted });
    });
    out += label(150, 210, "kosten per wijziging", { size: 13, fill: muted });
    return out;
  },

  "technisch-onderhoud-website-webapp-na-livegang": () => {
    const layers = [
      ["laag 4", "veranderbaarheid", "tests, documentatie, deployments"],
      ["laag 3", "gezondheid", "updates, dependencies, monitoring"],
      ["laag 2", "herstel", "backups, restore, recovery"],
      ["laag 1", "beschikbaarheid", "hosting, uptime, domein, certificaten"],
    ];
    let out = text(64, 170, "Livegang is het begin", { size: 26, weight: 600 });
    layers.forEach(([index_, name, caption], index) => {
      const y = 230 + index * 90;
      const base = index === layers.length - 1;
      out += box(140, y, 920, 70, { stroke: base ? accent : strong, fill: base ? "#eef1fc" : paper });
      out += label(170, y + 42, index_, { size: 12, fill: muted });
      out += text(260, y + 45, name, { size: 18, weight: 600, fill: base ? accent : ink });
      out += label(560, y + 42, caption, { size: 13, fill: muted });
    });
    return out;
  },

  "website-code-data-eigendom-vendor-lock-in": () => {
    const keys = ["broncode", "data", "domein", "hosting", "accounts", "credentials", "documentatie", "deployment"];
    let out = text(64, 170, "Eigendom is meer dan de code", { size: 26, weight: 600 });
    const cx = 260;
    const cy = 390;
    out += `<circle cx="${cx}" cy="${cy}" r="60" fill="none" stroke="${ink}" stroke-width="2.5"/>`;
    out += label(cx, cy + 5, "eigendom", { anchor: "middle", size: 12, fill: ink });
    keys.forEach((caption, index) => {
      const y = 240 + index * 42;
      const highlight = index === 1;
      out += seg(cx + 58, cy, 430, y + 14, { stroke: line, width: 1 });
      out += box(440, y, 260, 30, { stroke: highlight ? accent : strong, fill: highlight ? "#eef1fc" : paper, r: 3 });
      out += label(458, y + 20, caption, { size: 12, fill: highlight ? accent : body });
      out += ring(440, y + 15, 3, highlight ? accent : strong);
    });
    out += label(760, 390, "kunnen we zelfstandig verder?", { size: 14, fill: ink });
    out += label(64, 600, "rechten, toegang, data, accounts en documentatie samen", { size: 13, fill: muted });
    return out;
  },

  /* Websites & webshops (tweede reeks) ------------------------------------*/
  "herroepingsknop-webshop": () => {
    let out = text(64, 170, "Herroepen als vaste route door de webshop", { size: 26, weight: 600 });
    out += label(80, 226, "ingangen", { size: 12, fill: muted });
    ["orderbevestiging", "account", "footer"].forEach((caption, index) => {
      const y = 240 + index * 76;
      out += node(80, y, 200, 50, caption);
      out += seg(280, y + 25, 340, 341, { stroke: line, width: 1 });
    });
    out += node(340, 311, 210, 60, "herroepen", { tone: accent, fill: "#eef1fc" });
    out += arrow(558, 341, 54);
    ["bestelling", "bevestigen", "ontvangstmail"].forEach((caption, index) => {
      const x = 620 + index * 170;
      out += node(x, 316, 140, 50, caption);
      if (index < 2) out += arrow(x + 146, 341, 18);
    });
    out += seg(1030, 366, 1030, 430, { stroke: line, width: 1 });
    out += seg(690, 430, 1030, 430, { stroke: line, width: 1 });
    ["retour", "terugbetaling", "boekhouding"].forEach((caption, index) => {
      const x = 620 + index * 170;
      out += seg(x + 70, 430, x + 70, 470, { stroke: line, width: 1 });
      out += node(x, 470, 140, 44, caption);
    });
    out += label(64, 600, "scheid wat de wet vraagt van wat een ontwerpkeuze is", { size: 13, fill: muted });
    return out;
  },

  "wat-is-een-goede-landingspagina": () => {
    let out = text(64, 170, "Eén doel, één bezoeker, één volgende stap", { size: 26, weight: 600 });
    out += box(80, 250, 240, 130, { stroke: strong });
    out += label(100, 280, "advertentie", { size: 12, fill: muted });
    out += box(100, 298, 200, 14, { stroke: accent, fill: "#eef1fc", r: 2 });
    out += box(100, 326, 170, 10, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(100, 346, 140, 10, { stroke: line, width: 1, fill: deep, r: 2 });
    out += label(80, 410, "wat de bezoeker verwacht", { size: 12, fill: muted });

    out += box(440, 220, 320, 370, { stroke: strong });
    out += seg(440, 252, 760, 252, { stroke: line, width: 1 });
    out += label(460, 241, "landingspagina", { size: 11, fill: muted });
    out += box(464, 276, 272, 20, { stroke: accent, fill: "#eef1fc", r: 2 });
    [260, 230, 250].forEach((width, index) => {
      out += box(464, 316 + index * 18, width, 10, { stroke: line, width: 1, fill: deep, r: 2 });
    });
    out += box(464, 384, 272, 60, { stroke: line, width: 1, fill: deep, r: 2 });
    out += label(480, 418, "bewijs", { size: 11, fill: muted });
    out += box(464, 462, 240, 10, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(464, 480, 200, 10, { stroke: line, width: 1, fill: deep, r: 2 });
    out += node(520, 516, 160, 44, "volgende stap", { tone: accent, fill: "#eef1fc" });

    out += `<path d="M300,305 C380,305 390,286 464,286" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="5 5"/>`;
    out += label(382, 270, "zelfde belofte", { anchor: "middle", size: 11, fill: accent });

    out += arrow(690, 538, 100);
    out += node(810, 510, 200, 56, "één doel", { tone: accent, fill: "#eef1fc" });
    out += label(810, 494, "meetbaar", { size: 12, fill: muted });
    out += label(64, 624, "een campagnepagina doet ander werk dan een SEO-pagina", { size: 13, fill: muted });
    return out;
  },

  "website-migreren-zonder-seo-verlies": () => {
    const old = ["/diensten/oud", "/over-ons", "/blog/artikel", "/producten/item", "/contact-oud"];
    const fresh = ["/over", "/diensten/nieuw", "/kennis/artikel", "/contact", "/aanbod/item"];
    const map = [1, 0, 2, 4, 3];
    let out = text(64, 170, "Elke oude URL krijgt een bestemming", { size: 26, weight: 600 });
    out += label(100, 226, "oud", { size: 12, fill: muted });
    out += label(570, 226, "redirectmap", { anchor: "middle", size: 12, fill: muted });
    out += label(780, 226, "nieuw", { size: 12, fill: muted });
    old.forEach((caption, index) => {
      const y = 240 + index * 50;
      const target = 240 + map[index] * 50;
      const highlight = index === 2;
      out += box(100, y, 260, 36, { stroke: strong, r: 3 });
      out += label(116, y + 23, caption, { size: 12, fill: body });
      out += seg(360, y + 18, 780, target + 18, { stroke: highlight ? accent : strong, width: highlight ? 1.5 : 1 });
      out += dot(780, target + 18, 3.5, highlight ? accent : strong);
    });
    fresh.forEach((caption, index) => {
      const y = 240 + index * 50;
      const highlight = index === 2;
      out += box(780, y, 260, 36, { stroke: highlight ? accent : strong, fill: highlight ? "#eef1fc" : paper, r: 3 });
      out += label(796, y + 23, caption, { size: 12, fill: highlight ? accent : body });
    });
    const phases = ["inventaris", "redirectmap", "testen", "livegang", "monitoren"];
    out += seg(120, 540, 1020, 540, { stroke: line, width: 1 });
    phases.forEach((caption, index) => {
      const x = 120 + index * 225;
      const last = index === phases.length - 1;
      out += last ? dot(x, 540, 6) : ring(x, 540, 6);
      out += label(x, 572, caption, { anchor: "middle", size: 12, fill: last ? accent : muted });
    });
    out += label(64, 624, "controleer per URL, voor en na livegang", { size: 13, fill: muted });
    return out;
  },

  /* Webapplicaties & portalen (tweede reeks) ------------------------------*/
  "reserveringssysteem-website": () => {
    let out = text(64, 170, "Beschikbaarheid is het eigenlijke model", { size: 26, weight: 600 });
    const x0 = 230;
    const y0 = 250;
    for (let column = 0; column <= 6; column += 1) {
      out += seg(x0 + column * 80, y0, x0 + column * 80, y0 + 192, { stroke: line, width: 1 });
    }
    for (let row = 0; row <= 3; row += 1) {
      out += seg(x0, y0 + row * 64, x0 + 480, y0 + row * 64, { stroke: line, width: 1 });
    }
    ["medewerker", "ruimte", "apparaat"].forEach((caption, row) => {
      out += label(x0 - 16, y0 + row * 64 + 36, caption, { size: 12, anchor: "end", fill: muted });
    });
    const bookings = [
      [0, 0, 2],
      [0, 3, 1],
      [1, 1, 2],
      [1, 5, 1],
      [2, 0, 1],
      [2, 2, 2],
    ];
    bookings.forEach(([row, column, span]) => {
      out += box(x0 + column * 80 + 6, y0 + row * 64 + 10, span * 80 - 12, 44, { stroke: strong, fill: deep, r: 2 });
    });
    out += `<rect x="${x0 + 4 * 80 + 3}" y="${y0 - 12}" width="74" height="216" rx="4" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    out += label(x0 + 4 * 80 + 40, y0 + 230, "boekbaar", { anchor: "middle", size: 12, fill: accent });
    out += label(x0, y0 + 230, "tijd →", { size: 12, fill: muted });

    out += arrow(726, 346, 56);
    out += label(800, 240, "rond de boeking", { size: 12, fill: muted });
    ["regels en prijzen", "aanbetaling", "annulering en no-show", "bevestiging en agenda", "eigen systemen"].forEach((caption, index) => {
      const y = 258 + index * 46;
      out += box(800, y, 290, 36, { stroke: strong, r: 3 });
      out += label(816, y + 23, caption, { size: 12, fill: body });
    });
    out += label(64, 600, "een agenda volstaat tot beschikbaarheid van meerdere dingen afhangt", { size: 13, fill: muted });
    return out;
  },

  "app-laten-maken-webapp-of-native": () => {
    let out = text(64, 170, "Begin bij het gebruik, niet bij de vorm", { size: 26, weight: 600 });
    ["wie opent het", "hoe vaak", "welke apparaatfuncties", "offline of online", "zoekmachine of appwinkel"].forEach((caption, index) => {
      const y = 240 + index * 52;
      out += box(80, y, 280, 38, { stroke: strong, r: 3 });
      out += label(96, y + 24, caption, { size: 12, fill: body });
      out += seg(360, y + 19, 446, 380, { stroke: line, width: 1 });
    });
    out += ring(470, 380, 26, accent);
    out += dot(470, 380, 6);
    out += seg(470, 354, 470, 250, { stroke: strong, width: 1 });
    out += seg(470, 250, 1030, 250, { stroke: strong, width: 1 });
    out += seg(650, 250, 650, 290, { stroke: strong, width: 1 });
    out += seg(850, 250, 850, 275, { stroke: strong, width: 1 });
    out += seg(1030, 250, 1030, 275, { stroke: strong, width: 1 });

    // webapp: a browser window
    out += box(560, 290, 180, 140, { stroke: strong });
    out += seg(560, 312, 740, 312, { stroke: line, width: 1 });
    [574, 586, 598].forEach((x) => (out += ring(x, 301, 3)));
    out += box(576, 326, 148, 14, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(576, 352, 120, 10, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(576, 370, 140, 10, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(576, 394, 70, 22, { stroke: strong, r: 3 });

    // PWA: a phone that still has an address bar
    out += box(800, 275, 100, 180, { stroke: strong, r: 14 });
    out += box(812, 290, 76, 12, { stroke: line, width: 1, r: 6 });
    out += box(814, 318, 72, 12, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(814, 338, 60, 8, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(814, 354, 66, 8, { stroke: line, width: 1, fill: deep, r: 2 });
    out += box(814, 376, 40, 18, { stroke: strong, r: 3 });
    out += seg(830, 440, 870, 440, { stroke: strong, width: 1.5 });

    // native: a phone with an app grid
    out += box(980, 275, 100, 180, { stroke: strong, r: 14 });
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        out += box(995 + column * 26, 300 + row * 28, 18, 18, { stroke: strong, fill: deep, r: 4 });
      }
    }
    out += seg(1010, 440, 1050, 440, { stroke: strong, width: 1.5 });

    out += label(650, 490, "webapp", { anchor: "middle", size: 13, fill: body });
    out += label(850, 490, "PWA", { anchor: "middle", size: 13, fill: body });
    out += label(1030, 490, "native app", { anchor: "middle", size: 13, fill: body });
    out += label(64, 600, "de vorm volgt uit wie het opent, hoe vaak en waarvoor", { size: 13, fill: muted });
    return out;
  },

  /* 3D-configurators (tweede reeks) ---------------------------------------*/
  "productconfigurator-webshop": () => {
    const columns = ["keuzes", "regels", "prijs", "winkelmand", "orderregel", "productie"];
    const lanes = [
      ["plugin of app", [0, 0, 0, 0, 0, 0]],
      ["eigen frontend", [1, 1, 1, 0, 0, 1]],
      ["volledig maatwerk", [1, 1, 1, 1, 1, 1]],
    ];
    let out = text(64, 170, "Waar de configuratie de winkelmand in gaat", { size: 26, weight: 600 });
    const x0 = 330;
    columns.forEach((caption, column) => {
      out += label(x0 + column * 130 + 59, 250, caption, { anchor: "middle", size: 12, fill: muted });
    });
    lanes.forEach(([caption, cells], row) => {
      const y = 272 + row * 76;
      out += label(x0 - 20, y + 32, caption, { anchor: "end", size: 12, fill: body });
      cells.forEach((own, column) => {
        out += box(x0 + column * 130, y, 118, 56, { stroke: own ? accent : strong, fill: own ? "#eef1fc" : deep, r: 3 });
      });
    });
    const split = x0 + 3 * 130 - 6;
    out += seg(split, 262, split, 494, { stroke: accent, width: 1.5, dash: "5 5" });
    out += label(split, 516, "overdracht", { anchor: "middle", size: 12, fill: accent });
    out += box(330, 548, 24, 16, { stroke: strong, fill: deep, r: 2 });
    out += label(364, 561, "platform of plugin", { size: 12, fill: muted });
    out += box(560, 548, 24, 16, { stroke: accent, fill: "#eef1fc", r: 2 });
    out += label(594, 561, "eigen code", { size: 12, fill: accent });
    out += label(64, 620, "grenzen van varianten en opties bepalen de route", { size: 13, fill: muted });
    return out;
  },

  /* Automatisering & koppelingen (tweede reeks) ---------------------------*/
  "ideal-wero-webshop": () => {
    let out = text(64, 170, "Eén betaalmethode, drie soorten integratie", { size: 26, weight: 600 });
    out += seg(140, 240, 760, 240, { stroke: strong });
    out += seg(760, 240, 1040, 240, { stroke: strong, dash: "6 6" });
    out += ring(140, 240, 6);
    out += dot(420, 240, 6);
    out += ring(760, 240, 6);
    out += ring(1040, 240, 6, line);
    out += label(140, 272, "nu", { anchor: "middle", size: 12, fill: muted });
    out += label(420, 272, "co-branding", { anchor: "middle", size: 12, fill: accent });
    out += label(760, 272, "migratie na goedkeuring", { anchor: "middle", size: 12, fill: muted });
    out += label(1040, 272, "einddatum nog open", { anchor: "middle", size: 12, fill: muted });
    const rows = [
      ["hosted checkout", "afspraken bij je betaalprovider nalopen"],
      ["eigen API-integratie", "statussen, tests en weergave zelf aanpassen"],
      ["platformplugin", "updates van de plugin volgen"],
    ];
    rows.forEach(([route, todo], index) => {
      const y = 330 + index * 68;
      const highlight = index === 1;
      out += box(140, y, 300, 48, { stroke: highlight ? accent : strong, fill: highlight ? "#eef1fc" : paper });
      out += label(160, y + 29, route, { size: 13, fill: highlight ? accent : ink });
      out += arrow(452, y + 24, 60);
      out += box(530, y, 510, 48, { stroke: line, width: 1, fill: deep, r: 3 });
      out += label(550, y + 29, todo, { size: 12, fill: body });
    });
    out += label(64, 600, "scheid wat bevestigd is van wat nog niet vaststaat", { size: 13, fill: muted });
    return out;
  },

  "webshop-koppelen-boekhouding": () => {
    let out = text(64, 170, "Order, factuur, betaling en uitbetaling zijn niet hetzelfde", { size: 26, weight: 600 });
    ["order", "factuur", "betaling", "uitbetaling", "bankrekening"].forEach((caption, index) => {
      const x = 80 + index * 210;
      out += node(x, 250, 170, 56, caption);
      if (index < 4) out += arrow(x + 176, 278, 28);
    });
    out += seg(165, 306, 165, 420, { stroke: line, width: 1 });
    out += node(80, 420, 170, 48, "btw en OSS");
    out += seg(375, 306, 375, 420, { stroke: accent, width: 1.5, dash: "5 5" });
    out += node(290, 420, 170, 48, "creditnota");

    out += label(670, 392, "tussenrekening", { anchor: "middle", size: 12, fill: accent });
    out += box(490, 404, 360, 90, { stroke: accent, fill: "#eef1fc" });
    out += seg(670, 404, 670, 494, { stroke: accent, width: 1 });
    out += seg(585, 306, 580, 404, { stroke: line, width: 1 });
    out += seg(795, 306, 760, 404, { stroke: line, width: 1 });
    out += label(580, 454, "ontvangen", { anchor: "middle", size: 12, fill: body });
    out += label(760, 442, "uitbetaald", { anchor: "middle", size: 12, fill: body });
    out += label(760, 466, "kosten", { anchor: "middle", size: 12, fill: body });

    out += `<path d="M1005,306 L1005,449 L850,449" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="5 5"/>`;
    out += label(928, 440, "aansluiten", { anchor: "middle", size: 12, fill: accent });
    out += label(64, 600, "elk bedrag één keer, op de juiste rekening", { size: 13, fill: muted });
    return out;
  },

  /* Techniek & strategie (tweede reeks) -----------------------------------*/
  "toegankelijkheid-website-verplicht": () => {
    const diamond = (cx, cy, hw, hh) =>
      `<path d="M${cx - hw},${cy} L${cx},${cy - hh} L${cx + hw},${cy} L${cx},${cy + hh} Z" fill="${paper}" stroke="${strong}" stroke-width="1.5"/>`;
    let out = text(64, 170, "Eerst de vraag of je eronder valt", { size: 26, weight: 600 });
    out += diamond(210, 320, 130, 56);
    out += label(210, 324, "in scope van de wet?", { anchor: "middle", size: 12, fill: body });
    out += arrow(345, 320, 50);
    out += label(368, 308, "ja", { anchor: "middle", size: 12, fill: muted });
    out += diamond(545, 320, 140, 56);
    out += label(545, 324, "micro-onderneming?", { anchor: "middle", size: 12, fill: body });
    out += arrow(690, 320, 50);
    out += label(713, 308, "nee", { anchor: "middle", size: 12, fill: muted });
    out += node(750, 290, 330, 60, "toegankelijk maken", { tone: accent, fill: "#eef1fc" });

    out += arrow(210, 380, 50, { dir: "down" });
    out += label(222, 410, "nee", { size: 12, fill: muted });
    out += node(100, 440, 220, 50, "niet van toepassing");
    out += arrow(545, 380, 50, { dir: "down" });
    out += label(557, 410, "ja", { size: 12, fill: muted });
    out += node(415, 440, 260, 50, "alleen diensten vrijgesteld");

    out += seg(780, 350, 780, 563, { stroke: line, width: 1 });
    ["toetsenbord", "schermlezer", "checkout", "toegankelijkheidsverklaring", "testen"].forEach((caption, index) => {
      const y = 370 + index * 44;
      out += seg(780, y + 17, 800, y + 17, { stroke: line, width: 1 });
      out += box(800, y, 280, 34, { stroke: strong, r: 3 });
      out += label(816, y + 22, caption, { size: 12, fill: body });
    });
    out += label(64, 624, "eerst de definities, daarna de techniek", { size: 13, fill: muted });
    return out;
  },

  "cookiebanner-verplicht": () => {
    let out = text(64, 170, "Geen tags vóór de keuze", { size: 26, weight: 600 });
    out += node(80, 297, 180, 56, "pagina laadt");
    out += arrow(266, 325, 54);
    out += box(330, 240, 300, 170, { stroke: accent, fill: "#eef1fc" });
    out += label(350, 270, "keuze van de bezoeker", { size: 12, fill: accent });
    out += node(350, 303, 125, 44, "accepteren");
    out += node(485, 303, 125, 44, "weigeren");
    out += label(480, 384, "even makkelijk", { anchor: "middle", size: 12, fill: muted });

    out += arrow(640, 325, 104);
    out += label(692, 312, "na akkoord", { anchor: "middle", size: 12, fill: muted });
    ["analysetags", "advertentietags", "overige trackers"].forEach((caption, index) => {
      const y = 244 + index * 60;
      out += `<rect x="760" y="${y}" width="260" height="46" rx="4" fill="none" stroke="${strong}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      out += label(780, y + 28, caption, { size: 12, fill: muted });
    });

    out += arrow(420, 412, 52, { dir: "down" });
    out += node(330, 470, 180, 50, "vastleggen");
    out += arrow(518, 495, 36);
    out += node(562, 470, 180, 50, "intrekken");
    out += arrow(750, 495, 36);
    out += node(794, 470, 226, 50, "tags weer uit");
    out += label(64, 600, "de banner klopt pas als de techniek erachter klopt", { size: 13, fill: muted });
    return out;
  },
};

/* ------------------------------------------------------------------ run --*/

const kickers = {
  "website-of-webshop": "Websites & webshops",
  "wat-kost-een-website-of-webshop": "Websites & webshops",
  "website-vernieuwen-optimaliseren-redesign-herbouwen-replatformen": "Websites & webshops",
  "core-web-vitals-websiteperformance": "Websites & webshops",
  "van-excel-naar-maatwerksoftware": "Webapplicaties & portalen",
  "maatwerksoftware-of-standaardsoftware": "Webapplicaties & portalen",
  "wat-kost-een-webapplicatie": "Webapplicaties & portalen",
  "klantportaal-laten-maken": "Webapplicaties & portalen",
  "wat-is-een-3d-productconfigurator": "3D-configurators",
  "wanneer-is-een-3d-productconfigurator-zinvol": "3D-configurators",
  "wat-kost-een-3d-productconfigurator": "3D-configurators",
  "hoe-werkt-een-3d-productconfigurator-technisch": "3D-configurators",
  "welke-bedrijfsprocessen-moet-je-automatiseren": "Automatisering & koppelingen",
  "zapier-make-of-maatwerk": "Automatisering & koppelingen",
  "api-koppeling-laten-maken": "Automatisering & koppelingen",
  "website-koppelen-aan-crm": "Automatisering & koppelingen",
  "technische-kwaliteit-website-webapp-beoordelen": "Techniek & strategie",
  "technische-schuld-software": "Techniek & strategie",
  "technisch-onderhoud-website-webapp-na-livegang": "Techniek & strategie",
  "website-code-data-eigendom-vendor-lock-in": "Techniek & strategie",
  "herroepingsknop-webshop": "Websites & webshops",
  "wat-is-een-goede-landingspagina": "Websites & webshops",
  "website-migreren-zonder-seo-verlies": "Websites & webshops",
  "reserveringssysteem-website": "Webapplicaties & portalen",
  "app-laten-maken-webapp-of-native": "Webapplicaties & portalen",
  "productconfigurator-webshop": "3D-configurators",
  "ideal-wero-webshop": "Automatisering & koppelingen",
  "webshop-koppelen-boekhouding": "Automatisering & koppelingen",
  "toegankelijkheid-website-verplicht": "Techniek & strategie",
  "cookiebanner-verplicht": "Techniek & strategie",
};

const outDir = "public/images/artikelen";
mkdirSync(outDir, { recursive: true });

const slugs = Object.keys(covers);
if (slugs.length !== 30) throw new Error(`expected 30 covers, have ${slugs.length}`);

// Optional filter: `node scripts/make-article-covers.mjs <slug> <slug> ...`
// writes only the named covers; no arguments writes all of them.
const requested = process.argv.slice(2);
for (const slug of requested) {
  if (!covers[slug]) throw new Error(`${slug}: no such cover`);
}
const selected = requested.length > 0 ? requested : slugs;

const svgDir = process.env.COVER_SVG_DIR;
if (svgDir) mkdirSync(svgDir, { recursive: true });

for (const slug of selected) {
  const kicker = kickers[slug];
  if (!kicker) throw new Error(`${slug}: no cluster kicker`);

  const svg = sheet(kicker, covers[slug]());
  if (svgDir) writeFileSync(`${svgDir}/${slug}.svg`, svg);

  const info = await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(`${outDir}/${slug}.webp`);
  console.log(`${slug}.webp  ${(info.size / 1024).toFixed(1)} kB`);
}
