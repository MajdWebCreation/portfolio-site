import { describe, expect, it } from "vitest";
import { blocksFromDoc, docFromBlocks, docToPlainText } from "@/lib/admin/articles/doc";
import type { ArticleBlock } from "@/lib/content/blog";

/**
 * The public articles were seeded by turning their parsed blocks into editor
 * documents, and the public pages turn those documents back into blocks. If
 * that round trip ever stops being exact, published articles change on the
 * page without anyone editing them.
 */
describe("blocksFromDoc", () => {
  const blocks: ArticleBlock[] = [
    { type: "paragraph", content: "Een gewone alinea." },
    { type: "heading", level: 2, content: "Een kop" },
    { type: "heading", level: 3, content: "Een subkop" },
    { type: "paragraph", content: "Met een [link naar diensten](/nl/diensten) erin." },
    { type: "paragraph", content: "Eerste regel\nTweede regel" },
    { type: "list", items: ["Eerste punt", "Tweede punt met [link](/nl/contact)"] },
    { type: "list", items: ["Stap een", "Stap twee"], ordered: true },
    { type: "quote", content: "Welke data is leidend?" },
    { type: "paragraph", content: "Dit is **vet**, dit *schuin* en dit een **[vette link](/nl/contact)**." },
    { type: "code", content: "formulier\n→ validatie\n→ CRM" },
    {
      type: "table",
      head: ["Onderdeel", "Eenvoudig", "Complexer"],
      rows: [
        ["Rollen", "admin + gebruiker", "overlappende rechten"],
        ["API's", "read-only", "two-way met [retries](/nl/blog/api-koppeling-laten-maken)"],
      ],
    },
  ];

  it("is the exact inverse of docFromBlocks", () => {
    expect(blocksFromDoc(docFromBlocks(blocks))).toEqual(blocks);
  });

  it("keeps a code block literal, link syntax included", () => {
    const doc = docFromBlocks([{ type: "code", content: "zie [niet](/nl/contact)" }]);
    expect(doc.content[0]).toEqual({
      type: "codeBlock",
      attrs: { language: null },
      content: [{ type: "text", text: "zie [niet](/nl/contact)" }],
    });
  });

  it("reads a table without a header row as rows only", () => {
    expect(
      blocksFromDoc({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] }],
              },
            ],
          },
        ],
      }),
    ).toEqual([{ type: "table", head: [], rows: [["A"]] }]);
  });

  it("reads a blockquote as a quote block", () => {
    expect(
      blocksFromDoc({
        type: "doc",
        content: [
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Citaat" }] }] },
        ],
      }),
    ).toEqual([{ type: "quote", content: "Citaat" }]);
  });

  it("clamps a heading level the public model does not have", () => {
    expect(
      blocksFromDoc({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Diep" }] }],
      }),
    ).toEqual([{ type: "heading", level: 3, content: "Diep" }]);
  });

  it("reads an empty document as no blocks at all", () => {
    expect(blocksFromDoc(undefined)).toEqual([]);
  });
});

describe("docToPlainText", () => {
  it("counts tables and code towards the article text", () => {
    const doc = docFromBlocks([
      { type: "code", content: "een twee" },
      { type: "table", head: ["Kop"], rows: [["Cel"]] },
    ]);
    expect(docToPlainText(doc)).toBe("een twee Kop Cel");
  });
});
