type ScaleRow = {
  label: string;
  weights: readonly [number, number, number, number];
};

type ProcessScaleProps = {
  title: string;
  text: string;
  phaseLabels: readonly [string, string, string, string];
  phaseNumbers: readonly string[];
  rows: readonly ScaleRow[];
  note: string;
  headingId: string;
};

/**
 * The same four phases at two sizes: each row is one line, split into the
 * four phases; a compact project is simply a shorter line. Proportions are
 * indicative, which the note says out loud.
 */
export default function ProcessScale({
  title,
  text,
  phaseLabels,
  phaseNumbers,
  rows,
  note,
  headingId,
}: ProcessScaleProps) {
  const longest = Math.max(
    ...rows.map((row) => row.weights.reduce((sum, weight) => sum + weight, 0)),
  );

  return (
    <div>
      <h2 id={headingId} className="display-sm">
        {title}
      </h2>
      <p className="mt-3 max-w-[30rem] text-[1rem] leading-relaxed text-muted">{text}</p>

      <ul className="mt-8 space-y-6" aria-label={title}>
        {rows.map((row) => {
          const total = row.weights.reduce((sum, weight) => sum + weight, 0);
          return (
            <li key={row.label}>
              <p className="text-[0.95rem] font-medium text-ink">{row.label}</p>
              <ol
                className="mt-2 flex gap-1"
                style={{ width: `${(total / longest) * 100}%` }}
              >
                {row.weights.map((weight, index) => (
                  <li
                    key={phaseLabels[index]}
                    className={`min-w-0 border-t-2 pt-1.5 ${
                      index === 3 ? "border-accent" : "border-ink"
                    }`}
                    style={{ flexGrow: weight, flexBasis: 0 }}
                  >
                    <span className="label-mono block text-[0.62rem]" aria-hidden="true">
                      {phaseNumbers[index]}
                    </span>
                    <span className="sr-only">{phaseLabels[index]}</span>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-[0.85rem] leading-snug text-faint">{note}</p>
    </div>
  );
}
