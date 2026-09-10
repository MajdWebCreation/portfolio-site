import { describe, expect, it } from "vitest";
import { blocksFromDoc, docFromBlocks } from "@/lib/admin/articles/doc";
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
  ];

  it("is the exact inverse of docFromBlocks", () => {
    expect(blocksFromDoc(docFromBlocks(blocks))).toEqual(blocks);
  });

  it("renders an ordered list as the one list kind the public model has", () => {
    expect(
      blocksFromDoc({
        type: "doc",
        content: [
          {
            type: "orderedList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Stap" }] }] }],
          },
        ],
      }),
    ).toEqual([{ type: "list", items: ["Stap"] }]);
  });

  it("flattens a blockquote into its own paragraphs", () => {
    expect(
      blocksFromDoc({
        type: "doc",
        content: [
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Citaat" }] }] },
        ],
      }),
    ).toEqual([{ type: "paragraph", content: "Citaat" }]);
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
