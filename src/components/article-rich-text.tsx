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
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 2) {
            return (
              <h2 key={index} className="pt-4 text-3xl font-semibold text-white">
                {block.content}
              </h2>
            );
          }

          return (
            <h3 key={index} className="pt-2 text-2xl font-semibold text-white">
              {block.content}
            </h3>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={index} className="space-y-3 pl-5 text-white/72">
              {block.items.map((item) => (
                <li key={item} className="list-disc text-base leading-8">
                  {renderInlineLinks(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="text-base leading-8 text-white/72">
            {renderInlineLinks(block.content)}
          </p>
        );
      })}
    </div>
  );
}
