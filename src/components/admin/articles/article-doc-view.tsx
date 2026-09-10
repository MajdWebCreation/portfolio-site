import Link from "next/link";
import type { ArticleDoc, DocInline, DocNode } from "@/lib/admin/articles/doc";

/**
 * Renders an editor document with the classes the public ArticleRichText
 * uses, so the preview reads like the live article. Only known node and
 * mark types render; text is always escaped by React.
 */
function Inline({ content }: { content: DocInline[] | undefined }) {
  return (
    <>
      {(content ?? []).map((node, index) => {
        if (node.type === "hardBreak") return <br key={index} />;
        let element: React.ReactNode = node.text;
        for (const mark of node.marks ?? []) {
          if (mark.type === "bold") element = <strong className="font-semibold text-ink">{element}</strong>;
          if (mark.type === "italic") element = <em>{element}</em>;
          if (mark.type === "link" && /^(https?:\/\/|\/|mailto:)/.test(mark.attrs.href)) {
            element = (
              <Link href={mark.attrs.href} className="link-static text-ink">
                {element}
              </Link>
            );
          }
        }
        return <span key={index}>{element}</span>;
      })}
    </>
  );
}

function Block({ node }: { node: DocNode }) {
  switch (node.type) {
    case "heading":
      return node.attrs.level === 2 ? (
        <h2 className="display-sm pt-8">
          <Inline content={node.content} />
        </h2>
      ) : (
        <h3 className="pt-3 text-[1.15rem] font-semibold text-ink">
          <Inline content={node.content} />
        </h3>
      );
    case "bulletList":
    case "orderedList": {
      const Tag = node.type === "bulletList" ? "ul" : "ol";
      return (
        <Tag className={`space-y-3 pl-5 marker:text-accent ${node.type === "orderedList" ? "list-decimal" : "list-disc"}`}>
          {(node.content ?? []).map((item, index) => (
            <li key={index} className="text-[1.05rem] leading-relaxed text-body">
              {(item.content ?? []).map((child, childIndex) =>
                child.type === "paragraph" ? <Inline key={childIndex} content={child.content} /> : <Block key={childIndex} node={child} />,
              )}
            </li>
          ))}
        </Tag>
      );
    }
    case "blockquote":
      return (
        <blockquote className="border-l-2 border-accent pl-5 text-[1.1rem] leading-relaxed text-ink">
          {(node.content ?? []).map((child, index) => (
            <Block key={index} node={child} />
          ))}
        </blockquote>
      );
    default:
      return (
        <p className="text-[1.05rem] leading-relaxed text-body">
          <Inline content={node.content} />
        </p>
      );
  }
}

export default function ArticleDocView({ doc }: { doc: ArticleDoc }) {
  return (
    <div className="reading space-y-6">
      {doc.content.map((node, index) => (
        <Block key={index} node={node} />
      ))}
    </div>
  );
}
