import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ArticleRichText from "@/components/article-rich-text";
import type { ArticleBlock } from "@/lib/content/blog";

/**
 * The library is published three articles a week, so an article that is live
 * today can reference a sibling that is written, scheduled and not yet
 * readable. Those references have to stay readable text until the sibling
 * appears -- a link to an article the database does not hand out is a 404.
 */
describe("ArticleRichText internal references", () => {
  const live = new Set(["/nl/blog/website-of-webshop"]);

  const blocks: ArticleBlock[] = [
    { type: "paragraph", content: "Zie [website of webshop?](/nl/blog/website-of-webshop) voor de keuze." },
    { type: "paragraph", content: "Zie [klantportaal laten maken](/nl/blog/klantportaal-laten-maken) voor portalen." },
    { type: "paragraph", content: "Meer bij [webapplicatie laten maken](/nl/diensten/webapplicatie-laten-maken)." },
    { type: "paragraph", content: "Bron: [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)." },
  ];

  const html = renderToStaticMarkup(
    <ArticleRichText blocks={blocks} publishedArticlePaths={live} />,
  );

  it("links to an article that is live", () => {
    expect(html).toContain('href="/nl/blog/website-of-webshop"');
  });

  it("does not link to an article that is only scheduled, but keeps its words", () => {
    expect(html).not.toContain('href="/nl/blog/klantportaal-laten-maken"');
    expect(html).toContain("klantportaal laten maken");
  });

  it("always links service pages, which are not scheduled", () => {
    expect(html).toContain('href="/nl/diensten/webapplicatie-laten-maken"');
  });

  it("opens external sources in a new tab without leaking the referrer", () => {
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("links everything when no publication set is given", () => {
    const all = renderToStaticMarkup(<ArticleRichText blocks={blocks} />);
    expect(all).toContain('href="/nl/blog/klantportaal-laten-maken"');
  });
});
