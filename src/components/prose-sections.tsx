import ArticleRichText from "@/components/article-rich-text";
import type { ArticleBlock } from "@/lib/content/blog";

export type ProseSection = {
  heading: string;
  paragraphs: string[];
};

/**
 * Running text on a page that is not an article: a service, a case.
 *
 * It hands the sections to the article renderer, so prose outside the library
 * is set exactly like prose inside it -- the same headings, the same reading
 * width, the same `[label](/pad)` inline links. No published-article set is
 * passed because these sections link to pages, never to articles.
 *
 * The caller supplies its own section wrapper; this renders the column only.
 */
export default function ProseSections({
  sections,
}: {
  sections: readonly ProseSection[];
}) {
  const blocks: ArticleBlock[] = sections.flatMap((section) => [
    { type: "heading", level: 2, content: section.heading },
    ...section.paragraphs.map(
      (paragraph): ArticleBlock => ({ type: "paragraph", content: paragraph }),
    ),
  ]);

  return <ArticleRichText blocks={blocks} />;
}
