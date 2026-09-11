import type { ArticleBlock } from "@/lib/content/blog";

/**
 * Article content is stored as a ProseMirror/Tiptap JSON document: a stable,
 * serialisable tree that the editor produces and that a database can hold as
 * JSON. Only the node and mark types below are allowed; the preview renderer
 * ignores anything else, so no markup from the document ever reaches the
 * page unescaped.
 */
export type DocMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; attrs: { href: string; target?: string | null; rel?: string | null; class?: string | null } };

export type DocText = { type: "text"; text: string; marks?: DocMark[] };

export type DocNode =
  | { type: "paragraph"; content?: DocInline[] }
  | { type: "heading"; attrs: { level: number }; content?: DocInline[] }
  | { type: "bulletList"; content?: DocListItem[] }
  | { type: "orderedList"; attrs?: { start?: number }; content?: DocListItem[] }
  | { type: "blockquote"; content?: DocNode[] }
  | { type: "codeBlock"; attrs?: { language?: string | null }; content?: DocText[] }
  | { type: "table"; content?: DocTableRow[] };

export type DocInline = DocText | { type: "hardBreak" };
export type DocListItem = { type: "listItem"; content?: DocNode[] };
export type DocTableCell = {
  type: "tableHeader" | "tableCell";
  attrs?: { colspan?: number; rowspan?: number; colwidth?: number[] | null };
  content?: DocNode[];
};
export type DocTableRow = { type: "tableRow"; content?: DocTableCell[] };

/** A table cell as ProseMirror stores it: a cell holding one paragraph. */
function cell(kind: DocTableCell["type"], text: string): DocTableCell {
  return {
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: "paragraph", content: inlineFromMarkdownish(text) }],
  };
}

export type ArticleDoc = { type: "doc"; content: DocNode[] };

export const emptyDoc: ArticleDoc = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * The small inline syntax the public block model carries inside its strings:
 * `[label](href)` for a link, `**bold**`, `*italic*`, and a bold link written
 * as `**[label](href)**`. It is deliberately tiny -- it is not markdown, it is
 * the exact set of marks the editor can produce -- so that a document and its
 * blocks are two spellings of the same thing.
 */
export const inlinePattern =
  /(\*\*\[[^\]]+\]\([^)]+\)\*\*|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g;

function inlineFromMarkdownish(text: string): DocInline[] {
  const parts = text.split(inlinePattern);
  const inline: DocInline[] = [];

  parts.forEach((part) => {
    if (!part) return;

    const boldLink = part.match(/^\*\*\[([^\]]+)\]\(([^)]+)\)\*\*$/);
    if (boldLink) {
      inline.push({
        type: "text",
        text: boldLink[1],
        marks: [{ type: "bold" }, { type: "link", attrs: { href: boldLink[2] } }],
      });
      return;
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      inline.push({ type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2] } }] });
      return;
    }

    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      inline.push({ type: "text", text: bold[1], marks: [{ type: "bold" }] });
      return;
    }

    const italic = part.match(/^\*([^*\n]+)\*$/);
    if (italic) {
      inline.push({ type: "text", text: italic[1], marks: [{ type: "italic" }] });
      return;
    }

    part.split("\n").forEach((line, index) => {
      if (index > 0) inline.push({ type: "hardBreak" });
      if (line) inline.push({ type: "text", text: line });
    });
  });

  return inline;
}

/** The public site's parsed blocks as an editor document. */
export function docFromBlocks(blocks: ArticleBlock[]): ArticleDoc {
  const content: DocNode[] = blocks.map((block): DocNode => {
    if (block.type === "heading") {
      return { type: "heading", attrs: { level: block.level }, content: inlineFromMarkdownish(block.content) };
    }
    if (block.type === "list") {
      const items: DocListItem[] = block.items.map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: inlineFromMarkdownish(item) }],
      }));
      return block.ordered ? { type: "orderedList", content: items } : { type: "bulletList", content: items };
    }
    if (block.type === "quote") {
      return { type: "blockquote", content: [{ type: "paragraph", content: inlineFromMarkdownish(block.content) }] };
    }
    if (block.type === "code") {
      // Code is literal: no link syntax is parsed inside it.
      return { type: "codeBlock", attrs: { language: null }, content: block.content ? [{ type: "text", text: block.content }] : [] };
    }
    if (block.type === "table") {
      return {
        type: "table",
        content: [
          { type: "tableRow", content: block.head.map((text) => cell("tableHeader", text)) },
          ...block.rows.map((row): DocTableRow => ({ type: "tableRow", content: row.map((text) => cell("tableCell", text)) })),
        ],
      };
    }
    return { type: "paragraph", content: inlineFromMarkdownish(block.content) };
  });
  return { type: "doc", content: content.length ? content : emptyDoc.content };
}

/** Inverse of `inlineFromMarkdownish`: an inline run back as public text. */
function markdownishFromInline(content: DocInline[] | undefined): string {
  return (content ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\n";

      const link = node.marks?.find((mark) => mark.type === "link");
      const bold = node.marks?.some((mark) => mark.type === "bold");
      const italic = node.marks?.some((mark) => mark.type === "italic");

      let text = link && link.type === "link" ? `[${node.text}](${link.attrs.href})` : node.text;
      if (bold) text = `**${text}**`;
      else if (italic) text = `*${text}*`;
      return text;
    })
    .join("");
}

function listItemsFromNodes(items: DocListItem[] | undefined): string[] {
  return (items ?? []).map((item) =>
    (item.content ?? [])
      .map((node) => (node.type === "paragraph" || node.type === "heading" ? markdownishFromInline(node.content) : ""))
      .filter(Boolean)
      .join("\n"),
  );
}

/** The plain text of a table cell, link syntax included. */
function cellText(item: DocTableCell): string {
  return (item.content ?? [])
    .map((node) => (node.type === "paragraph" || node.type === "heading" ? markdownishFromInline(node.content) : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * An editor document as the blocks the public article renderer takes. The
 * inverse of `docFromBlocks`, so an article that was seeded from markdown
 * renders exactly what was imported.
 *
 * Every node type the editor can produce has a block here; anything else is
 * dropped rather than guessed at. A table without a header row keeps an empty
 * head, which the renderer reads as "no thead".
 */
export function blocksFromDoc(doc: ArticleDoc | undefined): ArticleBlock[] {
  const walk = (nodes: DocNode[]): ArticleBlock[] =>
    nodes.flatMap((node): ArticleBlock[] => {
      switch (node.type) {
        case "paragraph":
          return [{ type: "paragraph", content: markdownishFromInline(node.content) }];
        case "heading":
          return [
            {
              type: "heading",
              level: node.attrs.level >= 3 ? 3 : 2,
              content: markdownishFromInline(node.content),
            },
          ];
        case "bulletList":
          return [{ type: "list", items: listItemsFromNodes(node.content) }];
        case "orderedList":
          return [{ type: "list", items: listItemsFromNodes(node.content), ordered: true }];
        case "blockquote":
          return walk(node.content ?? []).map((block) =>
            block.type === "paragraph" ? { type: "quote", content: block.content } : block,
          );
        case "codeBlock":
          return [{ type: "code", content: (node.content ?? []).map((text) => text.text).join("") }];
        case "table": {
          const rows = node.content ?? [];
          const first = rows[0]?.content ?? [];
          const headed = first.length > 0 && first.every((item) => item.type === "tableHeader");
          return [
            {
              type: "table",
              head: headed ? first.map(cellText) : [],
              rows: (headed ? rows.slice(1) : rows).map((row) => (row.content ?? []).map(cellText)),
            },
          ];
        }
      }
    });

  return walk(doc?.content ?? []);
}

function inlineText(content: DocInline[] | undefined): string {
  return (content ?? []).map((node) => (node.type === "text" ? node.text : " ")).join("");
}

/** Plain text of the whole document, for word counts and search. */
export function docToPlainText(doc: ArticleDoc | undefined): string {
  if (!doc) return "";
  const walk = (nodes: DocNode[]): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case "paragraph":
          case "heading":
            return inlineText(node.content);
          case "bulletList":
          case "orderedList":
            return (node.content ?? []).map((item) => walk(item.content ?? [])).join("\n");
          case "blockquote":
            return walk(node.content ?? []);
          case "codeBlock":
            return (node.content ?? []).map((text) => text.text).join("");
          case "table":
            return (node.content ?? [])
              .flatMap((row) => (row.content ?? []).map((item) => walk(item.content ?? [])))
              .join("\n");
        }
      })
      .join("\n");
  return walk(doc.content).replace(/\s+/g, " ").trim();
}

export function countWords(doc: ArticleDoc | undefined): number {
  const text = docToPlainText(doc);
  return text ? text.split(" ").length : 0;
}

/** Reading time like the public articles use ("8 min"), at 200 words per minute. */
export function readingTimeLabel(doc: ArticleDoc | undefined): string {
  return `${Math.max(1, Math.round(countWords(doc) / 200))} min`;
}

export function isDocEmpty(doc: ArticleDoc | undefined): boolean {
  return countWords(doc) === 0;
}

/** Slug the way the public articles are named: lowercase, ascii, hyphens. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
