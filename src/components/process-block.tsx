import RevealSection from "@/components/reveal-section";

type ProcessStep = {
  number: string;
  title: string;
  text: string;
};

type ProcessBlockProps = {
  title: string;
  steps: readonly ProcessStep[];
};

export default function ProcessBlock({ title, steps }: ProcessBlockProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur md:p-8">
      <h2 className="text-3xl font-semibold text-white">{title}</h2>
      <div className="mt-8 space-y-8">
        {steps.map((step, index) => (
          <RevealSection key={step.number} delay={index * 0.05}>
            <div className="grid gap-4 border-b border-white/8 pb-8 last:border-b-0 last:pb-0 md:grid-cols-[92px_1fr]">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">
                {step.number}
              </p>
              <div>
                <h3 className="text-2xl font-medium text-white">{step.title}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">
                  {step.text}
                </p>
              </div>
            </div>
          </RevealSection>
        ))}
      </div>
    </section>
  );
}
