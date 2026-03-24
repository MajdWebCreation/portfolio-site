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
    <section className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14">
      <div className="lg:sticky lg:top-28 lg:h-fit">
        <div className="max-w-md">
          <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--accent-text)]">
            Guided sequence
          </p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight text-[var(--foreground)]">
            {title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
            A clearer process usually makes the final result feel calmer, sharper, and more intentional.
          </p>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[18px] top-0 hidden h-full w-px bg-[color:var(--line)] md:block" />

        <div className="space-y-7">
          {steps.map((step) => (
            <article
              key={step.number}
              className="relative grid gap-5 md:grid-cols-[56px_1fr] md:gap-6"
            >
              <div className="relative z-10 flex md:justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)] text-[10px] tracking-[0.24em] text-[var(--accent-text)] shadow-[0_0_0_6px_var(--background)]">
                  {step.number}
                </div>
              </div>

              <div className="relative border-b border-[color:var(--line)] pb-6 last:border-b-0 last:pb-0">
                <div className="relative">
                  <h3 className="text-2xl font-medium text-[var(--foreground)]">{step.title}</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--muted-foreground)]">
                    {step.text}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
