import { Draw, fmt, line, rect, timing } from "@/components/sketch/primitives";

/**
 * Hero visual of the pricing page: a project scope being built up, drawn as a
 * front elevation with dimension lines. A base is drafted first; content,
 * functionality, management, integrations and finally custom work are added
 * on top and beside it, and the dimension line on the left grows with every
 * level. The drawing builds once; with reduced motion the finished drawing
 * is shown at once. Shares the sk-* tones with the other sketches.
 */

const X1 = 214;
const X2 = 468;
const W = X2 - X1;
const GROUND = 372;
const DIM_X = 154;
const LEVELS = [332, 282, 232, 182, 132] as const;

/* Drafting dimension tick: a short oblique stroke through the line. */
const tick = (x: number, y: number) => line(x - 4, y + 4, x + 4, y - 4);
const extension = (y: number) => line(X1 - 6, y, DIM_X - 8, y);

export default function PricingHeroSketch({ className = "" }: { className?: string }) {
  const at = { base: 400, content: 1050, fn: 1600, admin: 2150, links: 2700, custom: 3250 };
  const nodesX = 506;
  const nodeW = 36;

  return (
    <svg
      viewBox="0 0 640 440"
      className={`sk sk--pricing ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id="ym-hatch-scope"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" className="sk-hatch" />
        </pattern>
      </defs>

      {/* Construction: guides, ground and extension lines. */}
      <g className="sk-settle" style={timing(4200)}>
        <path d={line(X1, 92, X1, GROUND + 12)} className="sk-fade sk-c-dash" style={timing(0)} />
        <path d={line(X2, 92, X2, GROUND + 12)} className="sk-fade sk-c-dash" style={timing(120)} />
        <Draw d={line(96, GROUND, 584, GROUND)} tone="sk-c" delay={100} duration={800} />
        <g className="sk-fade sk-fine" style={timing(500)}>
          {Array.from({ length: 27 }, (_, i) => 190 + i * 12).map((x) => (
            <path key={x} d={line(x, GROUND + 9, x + 7, GROUND + 2)} className="sk-c" />
          ))}
        </g>
        <Draw d={extension(GROUND)} tone="sk-c" delay={300} duration={300} fine />
        <Draw d={extension(LEVELS[0])} tone="sk-c" delay={at.base + 420} duration={300} fine />
        <Draw d={extension(LEVELS[1])} tone="sk-c" delay={at.content + 420} duration={300} fine />
        <Draw d={extension(LEVELS[2])} tone="sk-c" delay={at.fn + 420} duration={300} fine />
        <Draw d={extension(LEVELS[3])} tone="sk-c" delay={at.admin + 420} duration={300} fine />
        <Draw d={extension(LEVELS[4])} tone="sk-c" delay={at.custom + 420} duration={300} fine />
        <Draw d={line(X2, 272, X2, 304)} tone="sk-c" delay={at.links + 500} duration={200} fine />
        <Draw d={line(nodesX + nodeW, 272, nodesX + nodeW, 304)} tone="sk-c" delay={at.links + 500} duration={200} fine />
      </g>

      {/* Level 1: the base. */}
      <Draw d={rect(X1, LEVELS[0], W, GROUND - LEVELS[0])} tone="sk-ink" delay={at.base} duration={520} />
      <Draw d={line(X1 + 84, LEVELS[0], X1 + 84, GROUND)} tone="sk-ink-2" delay={at.base + 300} duration={200} />
      <Draw d={line(X1 + 170, LEVELS[0], X1 + 170, GROUND)} tone="sk-ink-2" delay={at.base + 360} duration={200} />

      {/* Level 2: content and structure. */}
      <Draw d={rect(X1, LEVELS[1], 118, 50)} tone="sk-ink" delay={at.content} duration={420} />
      <Draw d={rect(X1 + 132, LEVELS[1], 122, 50)} tone="sk-ink" delay={at.content + 120} duration={420} />
      <Draw d={line(X1 + 16, LEVELS[1] + 18, X1 + 96, LEVELS[1] + 18)} tone="sk-ink-2" delay={at.content + 380} duration={200} fine />
      <Draw d={line(X1 + 16, LEVELS[1] + 30, X1 + 72, LEVELS[1] + 30)} tone="sk-ink-2" delay={at.content + 440} duration={200} fine />
      <Draw d={line(X1 + 148, LEVELS[1] + 18, X1 + 236, LEVELS[1] + 18)} tone="sk-ink-2" delay={at.content + 440} duration={200} fine />
      <Draw d={line(X1 + 148, LEVELS[1] + 30, X1 + 204, LEVELS[1] + 30)} tone="sk-ink-2" delay={at.content + 500} duration={200} fine />

      {/* Level 3: functionality, a form and an action. */}
      <Draw d={rect(X1, LEVELS[2], W, 50)} tone="sk-ink" delay={at.fn} duration={480} />
      <Draw d={rect(X1 + 16, LEVELS[2] + 12, 110, 11)} tone="sk-ink-2" delay={at.fn + 300} duration={240} />
      <Draw d={rect(X1 + 16, LEVELS[2] + 28, 110, 11)} tone="sk-ink-2" delay={at.fn + 380} duration={240} />
      <rect
        x={X1 + 160}
        y={LEVELS[2] + 17}
        width="78"
        height="17"
        className="sk-wipe sk-fill"
        style={timing(at.fn + 480)}
      />

      {/* Level 4: management and data, a table. */}
      <Draw d={rect(X1, LEVELS[3], W, 50)} tone="sk-ink" delay={at.admin} duration={480} />
      <Draw d={line(X1 + 16, LEVELS[3] + 14, X1 + 238, LEVELS[3] + 14)} tone="sk-ink-2" delay={at.admin + 300} duration={260} />
      <Draw d={line(X1 + 16, LEVELS[3] + 26, X1 + 238, LEVELS[3] + 26)} tone="sk-ink-2" delay={at.admin + 360} duration={260} fine />
      <Draw d={line(X1 + 16, LEVELS[3] + 38, X1 + 238, LEVELS[3] + 38)} tone="sk-ink-2" delay={at.admin + 420} duration={260} fine />
      <Draw d={line(X1 + 90, LEVELS[3] + 8, X1 + 90, LEVELS[3] + 44)} tone="sk-ink-2" delay={at.admin + 460} duration={200} fine />
      <Draw d={line(X1 + 168, LEVELS[3] + 8, X1 + 168, LEVELS[3] + 44)} tone="sk-ink-2" delay={at.admin + 500} duration={200} fine />

      {/* Level 5: integrations beside the structure. */}
      {[209, 259].map((y, i) => (
        <g key={y}>
          <Draw d={line(X2, y, nodesX, y)} tone="sk-ink-2" delay={at.links + i * 160} duration={220} />
          <Draw d={rect(nodesX, y - 13, nodeW, 26)} tone="sk-ink" delay={at.links + 160 + i * 160} duration={300} />
          <Draw d={line(nodesX + 10, y, nodesX + 26, y)} tone="sk-ink-2" delay={at.links + 380 + i * 160} duration={160} fine />
          <circle cx={X2} cy={y} r="2.6" className="sk-fade sk-dot" style={timing(at.links + 60 + i * 160)} />
        </g>
      ))}
      <g className="sk-fine">
        <Draw d={line(X2, 300, nodesX + nodeW, 300)} tone="sk-acc" delay={at.links + 600} duration={260} />
        <Draw d={tick(X2, 300)} tone="sk-ink" delay={at.links + 600} duration={120} />
        <Draw d={tick(nodesX + nodeW, 300)} tone="sk-ink" delay={at.links + 800} duration={120} />
      </g>

      {/* Level 6: custom work on top, hatched. */}
      <rect
        x={X1}
        y={LEVELS[4]}
        width="156"
        height="50"
        fill="url(#ym-hatch-scope)"
        className="sk-wipe"
        style={timing(at.custom + 200)}
      />
      <Draw d={rect(X1, LEVELS[4], 156, 50)} tone="sk-ink" delay={at.custom} duration={480} />
      <Draw d={rect(X1 + 170, LEVELS[4] + 22, 84, 28)} tone="sk-ink" delay={at.custom + 260} duration={320} />
      <Draw d={rect(X1 + 184, LEVELS[4] + 30, 56, 12)} tone="sk-ink-2" delay={at.custom + 520} duration={200} fine />
      <Draw d={line(X1 + 58, LEVELS[4], X1 + 58, LEVELS[4] - 26)} tone="sk-ink" delay={at.custom + 560} duration={200} />
      <Draw d={line(X1 + 94, LEVELS[4], X1 + 94, LEVELS[4] - 26)} tone="sk-ink" delay={at.custom + 600} duration={200} />
      <Draw d={line(X1 + 58, LEVELS[4] - 26, X1 + 94, LEVELS[4] - 26)} tone="sk-ink" delay={at.custom + 700} duration={160} />

      {/* Dimension line: grows one level at a time. */}
      <Draw d={tick(DIM_X, GROUND)} tone="sk-ink" delay={300} duration={120} />
      {LEVELS.map((y, i) => {
        const from = i === 0 ? GROUND : LEVELS[i - 1];
        const delay = [at.base, at.content, at.fn, at.admin, at.custom][i] + 380;
        return (
          <g key={y}>
            <Draw d={line(DIM_X, from, DIM_X, y)} tone="sk-acc" delay={delay} duration={300} />
            <Draw d={tick(DIM_X, y)} tone="sk-ink" delay={delay + 260} duration={120} />
          </g>
        );
      })}
      <circle
        cx={DIM_X}
        cy={fmt(LEVELS[4] - 26)}
        r="4.4"
        className="sk-fade sk-dot sk-live"
        style={timing(at.custom + 900)}
      />
      <Draw d={line(DIM_X, LEVELS[4], DIM_X, LEVELS[4] - 26)} tone="sk-acc" delay={at.custom + 760} duration={200} />
      <Draw d={extension(LEVELS[4] - 26)} tone="sk-c" delay={at.custom + 820} duration={200} fine />
    </svg>
  );
}
