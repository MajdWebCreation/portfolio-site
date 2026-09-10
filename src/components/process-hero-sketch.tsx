import { Draw, fmt, line, rect, timing } from "@/components/sketch/primitives";

/**
 * Hero visual of the werkwijze page: one product drawn four times, each sheet
 * more concrete than the one before. Sheet 1 is the scope sketch (dashed
 * placement), sheet 2 the structure (thin wireframe), sheet 3 the built
 * product (filled and hatched), sheet 4 the live product (opaque sheet,
 * accent signal, connections). The sheets are laid down one after the other;
 * with reduced motion the finished stack is shown at once.
 *
 * Shares the drafting tone classes (sk-*) with the services sketch.
 */

const SHEET = { w: 230, h: 164 } as const;
const STEP = { x: 120, y: -42 } as const;
const FIRST = { x: 8, y: 222 } as const;
const RAIL_Y = 412;

function origin(index: number) {
  return { x: FIRST.x + STEP.x * index, y: FIRST.y + STEP.y * index };
}

/* Layout of the product, in sheet coordinates. */
const L = {
  logo: { x: 14, y: 12, w: 12, h: 10 },
  nav: [170, 186, 202],
  navY: 17,
  headerRule: 30,
  image: { x: 14, y: 42, w: 104, h: 70 },
  text: [
    { x: 130, y: 52, w: 86 },
    { x: 130, y: 62, w: 70 },
    { x: 130, y: 72, w: 58 },
  ],
  button: { x: 130, y: 88, w: 48, h: 14 },
  blocks: [
    { x: 14, y: 126, w: 62, h: 24 },
    { x: 84, y: 126, w: 62, h: 24 },
    { x: 154, y: 126, w: 62, h: 24 },
  ],
} as const;

/* Sheet 1: placement only, dashed, with one dimension line. */
function ScopeSheet({ delay }: { delay: number }) {
  const { image, text, blocks } = L;
  return (
    <>
      <Draw d={line(14, L.headerRule, 216, L.headerRule)} tone="sk-c-dash" delay={delay} />
      <Draw d={rect(image.x, image.y, image.w, image.h)} tone="sk-c-dash" delay={delay + 120} duration={520} />
      <Draw d={rect(text[0].x, 44, 86, 60)} tone="sk-c-dash" delay={delay + 260} duration={480} />
      {blocks.map((b, i) => (
        <Draw key={i} d={rect(b.x, b.y, b.w, b.h)} tone="sk-c-dash" delay={delay + 380 + i * 90} duration={360} />
      ))}
      <g className="sk-fine">
        <Draw d={`M14,156 h202 M14,152 v8 M216,152 v8`} tone="sk-c" delay={delay + 620} duration={360} />
      </g>
    </>
  );
}

/* Sheet 2: the structure as a thin wireframe. */
function StructureSheet({ delay }: { delay: number }) {
  const { logo, image, text, button, blocks } = L;
  return (
    <>
      <Draw d={rect(logo.x, logo.y, logo.w, logo.h)} tone="sk-ink-2" delay={delay} duration={240} />
      {L.nav.map((x, i) => (
        <Draw key={x} d={line(x, L.navY, x + 10, L.navY)} tone="sk-ink-2" delay={delay + 60 + i * 50} duration={160} fine />
      ))}
      <Draw d={line(14, L.headerRule, 216, L.headerRule)} tone="sk-ink-2" delay={delay + 80} duration={380} />
      <Draw d={rect(image.x, image.y, image.w, image.h)} tone="sk-ink-2" delay={delay + 200} duration={480} />
      <Draw d={line(image.x, image.y, image.x + image.w, image.y + image.h)} tone="sk-c" delay={delay + 520} duration={300} fine />
      {text.map((t, i) => (
        <Draw key={i} d={line(t.x, t.y, t.x + t.w, t.y)} tone="sk-ink-2" delay={delay + 360 + i * 80} duration={220} fine={i === 2} />
      ))}
      <Draw d={rect(button.x, button.y, button.w, button.h)} tone="sk-ink-2" delay={delay + 560} duration={260} />
      {blocks.map((b, i) => (
        <Draw key={i} d={rect(b.x, b.y, b.w, b.h)} tone="sk-ink-2" delay={delay + 520 + i * 90} duration={300} />
      ))}
    </>
  );
}

/* Sheets 3 and 4: outlines plus fills. Live adds the accent. */
function BuiltSheet({ delay, live }: { delay: number; live?: boolean }) {
  const { logo, image, text, button, blocks } = L;
  return (
    <>
      <rect
        x={logo.x}
        y={logo.y}
        width={logo.w}
        height={logo.h}
        className="sk-fade sk-fill"
        style={timing(delay)}
      />
      {L.nav.map((x, i) => (
        <Draw key={x} d={line(x, L.navY, x + 10, L.navY)} tone="sk-ink" delay={delay + 40 + i * 40} duration={140} fine />
      ))}
      <Draw d={line(14, L.headerRule, 216, L.headerRule)} tone="sk-ink" delay={delay + 60} duration={340} />
      <rect
        x={image.x}
        y={image.y}
        width={image.w}
        height={image.h}
        fill="url(#ym-hatch)"
        className="sk-wipe"
        style={timing(delay + 160)}
      />
      <Draw d={rect(image.x, image.y, image.w, image.h)} tone="sk-ink" delay={delay + 120} duration={440} />
      {text.map((t, i) => (
        <Draw key={i} d={line(t.x, t.y, t.x + t.w, t.y)} tone="sk-ink" delay={delay + 300 + i * 70} duration={200} fine={i === 2} />
      ))}
      <rect
        x={button.x}
        y={button.y}
        width={button.w}
        height={button.h}
        className={`sk-wipe ${live ? "sk-fill-acc" : "sk-fill"}`}
        style={timing(delay + 520)}
      />
      {blocks.map((b, i) => (
        <g key={i}>
          <Draw d={rect(b.x, b.y, b.w, b.h)} tone="sk-ink-2" delay={delay + 440 + i * 80} duration={280} />
          <Draw d={line(b.x + 8, b.y + 12, b.x + b.w - 14, b.y + 12)} tone="sk-ink-2" delay={delay + 600 + i * 80} duration={180} fine />
        </g>
      ))}
    </>
  );
}

export default function ProcessHeroSketch({ className = "" }: { className?: string }) {
  const sheets = [0, 1, 2, 3].map(origin);
  const last = sheets[3];
  const railTicks = sheets.map((s) => s.x + SHEET.w / 2);
  /* Sheet delays: each one is laid down after the previous has been drawn. */
  const at = [300, 1250, 2200, 3150];

  const corner = (i: number, dx: number, dy: number) => ({
    x: sheets[i].x + dx,
    y: sheets[i].y + dy,
  });
  const transfer = (dx: number, dy: number, over: number) => {
    const a = corner(0, dx, dy);
    const b = corner(3, dx, dy);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    return line(a.x - ux * over, a.y - uy * over, b.x + ux * over, b.y + uy * over);
  };

  const nodes = [
    { y: last.y + 54 },
    { y: last.y + 96 },
  ];
  const nodeX = last.x + SHEET.w + 30;

  return (
    <svg
      viewBox="0 0 640 440"
      className={`sk sk--process ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id="ym-hatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" className="sk-hatch" />
        </pattern>
      </defs>

      {/* Construction: transfer lines through the sheet corners, and the rail. */}
      <g className="sk-settle" style={timing(4100)}>
        <Draw d={transfer(0, 0, 36)} tone="sk-c" delay={0} duration={900} fine />
        <Draw d={transfer(SHEET.w, SHEET.h, 36)} tone="sk-c" delay={120} duration={900} fine />
        <Draw d={line(FIRST.x, RAIL_Y, nodeX, RAIL_Y)} tone="sk-c" delay={200} duration={800} />
      </g>

      {/* Rail ticks and numerals: each lights up when its sheet is laid down. */}
      {railTicks.map((x, i) => (
        <g key={x}>
          <path d={line(x, RAIL_Y - 5, x, RAIL_Y + 5)} className="sk-c" />
          <path
            d={line(x, RAIL_Y - 5, x, RAIL_Y + 5)}
            className={`sk-fade ${i === 3 ? "sk-acc" : "sk-ink"}`}
            style={timing(at[i] + 200)}
          />
          <text
            x={fmt(x)}
            y={fmt(RAIL_Y + 20)}
            textAnchor="middle"
            className="sk-text sk-fade sk-fine"
            style={timing(at[i] + 200)}
          >
            0{i + 1}
          </text>
        </g>
      ))}

      {/* Sheet 1: scope. */}
      <g className="sk-sheet" style={timing(at[0])}>
        <rect x={sheets[0].x} y={sheets[0].y} width={SHEET.w} height={SHEET.h} className="sk-paper sk-paper--scope" />
        <g transform={`translate(${sheets[0].x} ${sheets[0].y})`}>
          <ScopeSheet delay={at[0] + 250} />
        </g>
      </g>

      {/* Sheet 2: structure. */}
      <g className="sk-sheet" style={timing(at[1])}>
        <rect x={sheets[1].x} y={sheets[1].y} width={SHEET.w} height={SHEET.h} className="sk-paper" />
        <g transform={`translate(${sheets[1].x} ${sheets[1].y})`}>
          <StructureSheet delay={at[1] + 250} />
        </g>
      </g>

      {/* Sheet 3: built. */}
      <g className="sk-sheet" style={timing(at[2])}>
        <rect x={sheets[2].x} y={sheets[2].y} width={SHEET.w} height={SHEET.h} className="sk-paper sk-paper--built" />
        <g transform={`translate(${sheets[2].x} ${sheets[2].y})`}>
          <BuiltSheet delay={at[2] + 250} />
        </g>
      </g>

      {/* Sheet 4: live. Opaque, with the accent and its connections. */}
      <g className="sk-sheet" style={timing(at[3])}>
        <rect x={last.x} y={last.y} width={SHEET.w} height={SHEET.h} className="sk-paper-live" />
        <g transform={`translate(${last.x} ${last.y})`}>
          <BuiltSheet delay={at[3] + 250} live />
        </g>
      </g>

      {/* Connections of the live product. */}
      {nodes.map((n, i) => (
        <g key={n.y}>
          <Draw
            d={line(last.x + SHEET.w, n.y, nodeX - 6, n.y)}
            tone="sk-ink-2"
            delay={at[3] + 900 + i * 140}
            duration={260}
          />
          <g className="sk-fade" style={timing(at[3] + 1120 + i * 140)}>
            <circle cx={nodeX} cy={n.y} r="5.5" className="sk-node" />
            <circle cx={nodeX} cy={n.y} r="1.6" className="sk-dot-ink" />
          </g>
        </g>
      ))}

      {/* Live signal on the top-right corner of the final sheet. */}
      <g className="sk-fade" style={timing(at[3] + 1000)}>
        <circle cx={last.x + SHEET.w} cy={last.y} r="10" className="sk-ring sk-live" />
        <circle cx={last.x + SHEET.w} cy={last.y} r="4.6" className="sk-dot" />
      </g>
    </svg>
  );
}
