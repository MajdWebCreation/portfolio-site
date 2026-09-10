type FaqItem = {
  question: string;
  answer: string;
};

type FaqListProps = {
  items: FaqItem[];
};

export default function FaqList({ items }: FaqListProps) {
  return (
    <div className="border-b border-line">
      {items.map((item) => (
        <details key={item.question} className="group border-t border-line">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-3 text-[1.05rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
            {item.question}
            <span
              aria-hidden="true"
              className="relative block h-4 w-4 shrink-0 text-faint transition-colors group-open:text-ink"
            >
              <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-current" />
              <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-current transition-transform duration-200 group-open:scale-y-0" />
            </span>
          </summary>
          <p className="reading pb-5 text-[0.98rem] leading-relaxed text-muted">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
