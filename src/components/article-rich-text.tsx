import Link from "next/link";
import type { ArticleBlock } from "@/lib/content/blog";

type ArticleRichTextProps = {
  blocks: ArticleBlock[];
};

function renderInlineLinks(content: string) {
  const parts = content.split(/(\[[^\]]+\]\([^)]+\))/g);

  return parts.map((part, index) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

    if (!linkMatch) {
      return part.split("\n").map((line, lineIndex, lines) => (
        <span key={`${index}-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      ));
    }

    const [, label, href] = linkMatch;

    return (
      <Link
        key={`${href}-${index}`}
        href={href}
        className="text-cyan-300 transition hover:text-cyan-200"
      >
        {label}
      </Link>
    );
  });
}

export default function ArticleRichText({ blocks }: ArticleRichTextProps) {
  return (
    <div className="ym-reading-column space-y-7">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 2) {
            return (
              <h2
                key={index}
                className="pt-10 text-3xl font-semibold leading-tight text-white sm:text-[2.15rem]"
              >
                {block.content}
              </h2>
            );
          }

          return (
            <h3
              key={index}
              className="pt-5 text-2xl font-semibold leading-tight text-white"
            >
              {block.content}
            </h3>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={index} className="space-y-4 pl-5 text-white/72 marker:text-cyan-300">
              {block.items.map((item) => (
                <li key={item} className="list-disc text-[1.03rem] leading-8">
                  {renderInlineLinks(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="text-[1.05rem] leading-8 text-white/74">
            {renderInlineLinks(block.content)}
          </p>
        );
      })}
    </div>
  );
}
