type FaqItem = {
  question: string;
  answer: string;
};

type FaqBlockProps = {
  title: string;
  items: FaqItem[];
};

export default function FaqBlock({ title, items }: FaqBlockProps) {
  return (
    <section className="relative overflow-hidden rounded-[2.2rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/94 p-6 md:p-8">
      <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(113,227,255,0.08),transparent_65%)]" />
      <h2 className="relative text-3xl font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <details
            key={item.question}
            className="group relative overflow-hidden rounded-[1.5rem] border border-[color:var(--line)] bg-[var(--background)]/84 p-5 transition duration-300 open:border-[color:var(--line-strong)]"
          >
            <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[var(--accent-text)] to-transparent opacity-0 transition duration-300 group-open:opacity-100" />
            <summary className="cursor-pointer list-none text-lg font-medium text-[var(--foreground)]">
              {item.question}
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--muted-foreground)]">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
