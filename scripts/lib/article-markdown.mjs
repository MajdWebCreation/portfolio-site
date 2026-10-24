/**
 * Markdown to the article model, shared by the article import scripts.
 *
 * The markdown files are the editorial source; the site reads
 * `public.articles`. These turn one file into the block model of
 * lib/content/blog.ts and then into the ProseMirror document the editor
 * works with -- the same mapping as docFromBlocks() in
 * lib/admin/articles/doc.ts.
 */

/* --------------------------------------------------------------- parsing --*/

export function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error("no frontmatter");

  const meta = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    // List values (secondary_keywords) are not used here; their items are
    // indented and simply skipped.
    if (field && field[2] !== "") meta[field[1]] = field[2].replace(/^"|"$/g, "");
  }

  return { meta, body: raw.slice(match[0].length) };
}

/** Inline text as the article block model spells it. */
function inline(text) {
  return (
    text
      // Inline code has no mark in the article model; the words carry it.
      .replace(/`([^`]+)`/g, "$1")
      .trim()
  );
}

/** A sources list item written as "Name: https://url" becomes a real link. */
function sourceLink(item) {
  const match = item.match(/^(.+?):\s+(https?:\/\/\S+)$/);
  return match ? `[${match[1]}](${match[2]})` : item;
}

/**
 * Markdown to article blocks.
 *
 * Headings collapse to the two levels the site renders: the files mix `#` and
 * `##` for sections of the same weight, so both become h2 and anything deeper
 * becomes h3. A line ending in two spaces is a hard break inside its
 * paragraph, which is how the sources set label-and-explanation pairs.
 */
export function parseBlocks(body) {
  const lines = body.split("\n");
  const blocks = [];

  let paragraph = [];
  let list = null;
  let quote = [];
  let table = [];
  let titleSeen = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", content: inline(paragraph.join("")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: "list", items: list.items.map(inline), ...(list.ordered ? { ordered: true } : {}) });
    list = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    blocks.push({ type: "quote", content: inline(quote.join("\n")) });
    quote = [];
  };
  const flushTable = () => {
    if (table.length === 0) return;
    const cells = (row) =>
      row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((value) => inline(value));
    const separator = table[1] && /^\s*\|[\s:|-]+\|\s*$/.test(table[1]);
    blocks.push({
      type: "table",
      head: separator ? cells(table[0]) : [],
      rows: (separator ? table.slice(2) : table).map(cells),
    });
    table = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
    flushTable();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("```")) {
      flushAll();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", content: code.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      if (heading[1].length === 1 && !titleSeen) {
        // The first h1 is the article title, which the page renders itself.
        titleSeen = true;
        continue;
      }
      blocks.push({ type: "heading", level: heading[1].length <= 2 ? 2 : 3, content: inline(heading[2]) });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      flushTable();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }

    if (line.trim().startsWith("|")) {
      flushParagraph();
      flushList();
      flushQuote();
      table.push(line);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      flushQuote();
      flushTable();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(sourceLink((bullet ?? ordered)[1].trim()));
      continue;
    }

    flushList();
    flushQuote();
    flushTable();
    // Two trailing spaces are a hard break; otherwise lines of one paragraph
    // join with a space.
    const hardBreak = /\s{2,}$/.test(line);
    if (paragraph.length > 0) paragraph.push(hardBreak ? "" : " ");
    paragraph.push(line.trim());
    if (hardBreak) paragraph.push("\n");
  }

  flushAll();
  return blocks;
}

/* ------------------------------------------------- blocks to a document --
   The same mapping as docFromBlocks() in lib/admin/articles/doc.ts. The test
   in doc.test.ts guards the round trip, and scripts/check-import.test.ts
   checks this output against the real implementation.
*/
const inlinePattern = /(\*\*\[[^\]]+\]\([^)]+\)\*\*|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g;

function inlineNodes(text) {
  const nodes = [];
  for (const part of text.split(inlinePattern)) {
    if (!part) continue;

    const boldLink = part.match(/^\*\*\[([^\]]+)\]\(([^)]+)\)\*\*$/);
    if (boldLink) {
      nodes.push({ type: "text", text: boldLink[1], marks: [{ type: "bold" }, { type: "link", attrs: { href: boldLink[2] } }] });
      continue;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      nodes.push({ type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2] } }] });
      continue;
    }
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      nodes.push({ type: "text", text: bold[1], marks: [{ type: "bold" }] });
      continue;
    }
    const italic = part.match(/^\*([^*\n]+)\*$/);
    if (italic) {
      nodes.push({ type: "text", text: italic[1], marks: [{ type: "italic" }] });
      continue;
    }
    part.split("\n").forEach((line, index) => {
      if (index > 0) nodes.push({ type: "hardBreak" });
      if (line) nodes.push({ type: "text", text: line });
    });
  }
  return nodes;
}

function cell(kind, text) {
  return {
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: "paragraph", content: inlineNodes(text) }],
  };
}

export function docFromBlocks(blocks) {
  return {
    type: "doc",
    content: blocks.map((block) => {
      if (block.type === "heading") {
        return { type: "heading", attrs: { level: block.level }, content: inlineNodes(block.content) };
      }
      if (block.type === "list") {
        const items = block.items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: inlineNodes(item) }],
        }));
        return { type: block.ordered ? "orderedList" : "bulletList", content: items };
      }
      if (block.type === "quote") {
        return { type: "blockquote", content: [{ type: "paragraph", content: inlineNodes(block.content) }] };
      }
      if (block.type === "code") {
        return {
          type: "codeBlock",
          attrs: { language: null },
          content: block.content ? [{ type: "text", text: block.content }] : [],
        };
      }
      if (block.type === "table") {
        return {
          type: "table",
          content: [
            { type: "tableRow", content: block.head.map((text) => cell("tableHeader", text)) },
            ...block.rows.map((row) => ({ type: "tableRow", content: row.map((text) => cell("tableCell", text)) })),
          ],
        };
      }
      return { type: "paragraph", content: inlineNodes(block.content) };
    }),
  };
}
