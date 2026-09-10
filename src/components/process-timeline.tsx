type Phase = {
  number: string;
  title: string;
  text: string;
  result: string;
};

type ProcessTimelineProps = {
  phases: readonly Phase[];
  resultLabel: string;
  headingId: string;
  label: string;
};

/**
 * The four phases as one continuous process: a single rail on the left with
 * a node per phase, the phase title beside it and the explanation to the
 * right. The last node is the accent, where the live product is.
 */
export default function ProcessTimeline({
  phases,
  resultLabel,
  headingId,
  label,
}: ProcessTimelineProps) {
  return (
    <div className="container-x">
      <h2 id={headingId} className="label-mono">
        {label}
      </h2>
      <ol className="pt-timeline relative mt-6">
        {phases.map((phase, index) => {
          const last = index === phases.length - 1;
          return (
            <li
              key={phase.number}
              className="pt-phase relative grid gap-x-8 gap-y-3 py-9 pl-9 sm:pl-12 lg:grid-cols-12 lg:py-12"
            >
              <span
                aria-hidden="true"
                className={`pt-node absolute left-0 top-[2.55rem] block h-[11px] w-[11px] rounded-full border bg-paper lg:top-[3.3rem] ${
                  last ? "border-accent bg-accent" : "border-ink"
                }`}
              />
              <div className="lg:col-span-4">
                <p className="label-mono text-accent">{phase.number}</p>
                <h3 className="display-sm mt-1.5">{phase.title}</h3>
              </div>
              <div className="lg:col-span-7 lg:col-start-6">
                <p className="max-w-[34rem] text-[1.05rem] leading-relaxed text-body">
                  {phase.text}
                </p>
                <p className="mt-4 flex max-w-[34rem] gap-3 text-[0.95rem] leading-snug text-muted">
                  <span className="label-mono shrink-0 pt-[0.2em]">{resultLabel}</span>
                  <span>{phase.result}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
