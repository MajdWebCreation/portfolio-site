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
      <Link key={`${href}-${index}`} href={href} className="link-static text-ink">
        {label}
      </Link>
    );
  });
}

export default function ArticleRichText({ blocks }: ArticleRichTextProps) {
  return (
    <div className="reading space-y-6">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 2) {
            return (
              <h2 key={index} className="display-sm pt-8">
                {block.content}
              </h2>
            );
          }

          return (
            <h3 key={index} className="pt-3 text-[1.15rem] font-semibold text-ink">
              {block.content}
            </h3>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={index} className="space-y-3 pl-5 marker:text-accent">
              {block.items.map((item) => (
                <li key={item} className="list-disc text-[1.05rem] leading-relaxed text-body">
                  {renderInlineLinks(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="text-[1.05rem] leading-relaxed text-body">
            {renderInlineLinks(block.content)}
          </p>
        );
      })}
    </div>
  );
}
