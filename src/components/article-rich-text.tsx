import Link from "next/link";
import { inlinePattern } from "@/lib/admin/articles/doc";
import type { ArticleBlock } from "@/lib/content/blog";

type ArticleRichTextProps = {
  blocks: ArticleBlock[];
  /**
   * The article paths that are live. An internal reference to an article that
   * is scheduled but not published yet renders as plain text instead of a
   * link, so a cross-reference written today never becomes a 404 tomorrow;
   * it turns into a link by itself once the target is published.
   *
   * Omitted means "do not check": every link renders as a link.
   */
  publishedArticlePaths?: ReadonlySet<string>;
};

const articleBase = "/nl/blog/";

function isExternal(href: string) {
  return /^https?:\/\//.test(href);
}

function renderLink(
  label: React.ReactNode,
  href: string,
  key: string,
  publishedArticlePaths?: ReadonlySet<string>,
) {
  if (isExternal(href)) {
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="link-static text-ink">
        {label}
      </a>
    );
  }

  // A reference to an article that is scheduled but not live yet stays text.
  if (publishedArticlePaths && href.startsWith(articleBase) && !publishedArticlePaths.has(href)) {
    return <span key={key}>{label}</span>;
  }

  return (
    <Link key={key} href={href} className="link-static text-ink">
      {label}
    </Link>
  );
}

function renderInline(content: string, publishedArticlePaths?: ReadonlySet<string>) {
  const parts = content.split(inlinePattern);

  return parts.map((part, index) => {
    if (!part) return null;

    const boldLink = part.match(/^\*\*\[([^\]]+)\]\(([^)]+)\)\*\*$/);
    if (boldLink) {
      return renderLink(
        <strong className="font-semibold">{boldLink[1]}</strong>,
        boldLink[2],
        `${index}-boldlink`,
        publishedArticlePaths,
      );
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return renderLink(link[1], link[2], `${index}-link`, publishedArticlePaths);
    }

    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <strong key={`${index}-bold`} className="font-semibold text-ink">
          {bold[1]}
        </strong>
      );
    }

    const italic = part.match(/^\*([^*\n]+)\*$/);
    if (italic) {
      return <em key={`${index}-italic`}>{italic[1]}</em>;
    }

    return part.split("\n").map((line, lineIndex, lines) => (
      <span key={`${index}-${lineIndex}`}>
        {line}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    ));
  });
}

export default function ArticleRichText({ blocks, publishedArticlePaths }: ArticleRichTextProps) {
  const inline = (content: string) => renderInline(content, publishedArticlePaths);

  return (
    <div className="reading space-y-6">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 2) {
            return (
              <h2 key={index} className="display-sm pt-8">
                {inline(block.content)}
              </h2>
            );
          }

          return (
            <h3 key={index} className="pt-3 text-[1.15rem] font-semibold text-ink">
              {inline(block.content)}
            </h3>
          );
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";

          return (
            <Tag key={index} className="space-y-3 pl-5 marker:text-accent">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`${index}-${itemIndex}`}
                  className={`text-[1.05rem] leading-relaxed text-body ${
                    block.ordered ? "list-decimal" : "list-disc"
                  }`}
                >
                  {inline(item)}
                </li>
              ))}
            </Tag>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-accent pl-5 text-[1.1rem] leading-relaxed text-ink"
            >
              {inline(block.content)}
            </blockquote>
          );
        }

        /*
          The articles use fenced blocks for flow sketches and small data
          examples, so they are set as preformatted text rather than styled
          as syntax. Wide diagrams scroll inside their own box; the page
          itself never scrolls sideways.
        */
        if (block.type === "code") {
          return (
            <div
              key={index}
              className="overflow-x-auto rounded-sm border border-line bg-paper-deep/60 px-4 py-3.5"
            >
              <pre className="whitespace-pre font-mono text-[0.88rem] leading-relaxed text-ink">
                {block.content}
              </pre>
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-[0.95rem]">
                {block.head.length > 0 ? (
                  <thead>
                    <tr>
                      {block.head.map((heading, headIndex) => (
                        <th
                          key={headIndex}
                          scope="col"
                          className="label-mono border-b border-line-strong pb-2 pr-5 align-bottom text-ink last:pr-0"
                        >
                          {inline(heading)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-line align-top">
                      {row.map((column, columnIndex) => (
                        <td
                          key={columnIndex}
                          className={`py-2.5 pr-5 leading-relaxed last:pr-0 ${
                            columnIndex === 0 ? "text-ink" : "text-body"
                          }`}
                        >
                          {inline(column)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={index} className="text-[1.05rem] leading-relaxed text-body">
            {inline(block.content)}
          </p>
        );
      })}
    </div>
  );
}
