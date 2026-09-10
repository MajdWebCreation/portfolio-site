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
  | { type: "blockquote"; content?: DocNode[] };

export type DocInline = DocText | { type: "hardBreak" };
export type DocListItem = { type: "listItem"; content?: DocNode[] };

export type ArticleDoc = { type: "doc"; content: DocNode[] };

export const emptyDoc: ArticleDoc = { type: "doc", content: [{ type: "paragraph" }] };

/** Text of an inline run, splitting the public "[label](href)" link syntax into marks. */
function inlineFromMarkdownish(text: string): DocInline[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  const inline: DocInline[] = [];
  parts.forEach((part) => {
    if (!part) return;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      inline.push({ type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2] } }] });
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
  const content: DocNode[] = blocks.map((block) => {
    if (block.type === "heading") {
      return { type: "heading", attrs: { level: block.level }, content: inlineFromMarkdownish(block.content) };
    }
    if (block.type === "list") {
      return {
        type: "bulletList",
        content: block.items.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: inlineFromMarkdownish(item) }] })),
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
      return link && link.type === "link" ? `[${node.text}](${link.attrs.href})` : node.text;
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

/**
 * An editor document as the blocks the public article renderer takes. The
 * inverse of `docFromBlocks`, so an article that was seeded from the old
 * file-based content renders byte for byte the same as it did before.
 *
 * The public model knows paragraphs, two heading levels and one kind of
 * list, so an ordered list renders as a list and a blockquote as its own
 * paragraphs. Anything else is dropped rather than guessed at.
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
        case "orderedList":
          return [{ type: "list", items: listItemsFromNodes(node.content) }];
        case "blockquote":
          return walk(node.content ?? []);
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
