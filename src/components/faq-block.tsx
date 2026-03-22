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
    <section className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 md:p-8">
      <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(113,227,255,0.13),transparent_65%)]" />
      <h2 className="relative text-3xl font-semibold text-white">{title}</h2>
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <details
            key={item.question}
            className="group relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#091119]/84 p-5 transition duration-300 open:border-cyan-300/25"
          >
            <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-cyan-300/45 to-transparent opacity-0 transition duration-300 group-open:opacity-100" />
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
