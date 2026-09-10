type ProcessStep = {
  number?: string;
  title: string;
  text: string;
};

type ProcessStepsProps = {
  steps: readonly ProcessStep[];
};

const columns = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
} as const;

/**
 * Three or four steps side by side on wide screens, stacked on narrow ones.
 * Each step starts with a strong rule so the sequence reads as a timeline.
 */
export default function ProcessSteps({ steps }: ProcessStepsProps) {
  const layout = steps.length <= 3 ? columns[3] : columns[4];

  return (
    <ol className={`grid gap-x-8 gap-y-8 sm:grid-cols-2 ${layout}`}>
      {steps.map((step, index) => (
        <li key={step.title} className="border-t-2 border-ink pt-4">
          <p className="label-mono text-accent">
            {step.number ?? String(index + 1).padStart(2, "0")}
          </p>
          <h3 className="mt-2 text-[1.2rem] font-semibold leading-snug text-ink">
            {step.title}
          </h3>
          <p className="mt-2.5 text-[0.95rem] leading-relaxed text-muted">
            {step.text}
          </p>
        </li>
      ))}
    </ol>
  );
}
