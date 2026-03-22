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
    <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 md:p-8">
      <h2 className="text-3xl font-semibold text-white">{title}</h2>
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5"
          >
            <summary className="cursor-pointer list-none text-lg font-medium text-white">
              {item.question}
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/65">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
