import { Draw, timing } from "@/components/sketch/primitives";

/**
 * Hero visual of the services index: an exploded axonometric drawing of a
 * digital product. Three plates (interface, management, data) are drafted
 * one after the other, a data spine runs through them and external nodes
 * are connected last. The drawing builds itself once with CSS only; with
 * reduced motion the finished drawing is shown at once.
 *
 * Model space: u runs along the long plate edge (screen down-right), v along
 * the short edge (screen down-left), z upward. Everything is projected here
 * at render time so the drawing stays editable in model units.
 */

type Vec = readonly [number, number];

const COS = 0.8660254;
const SIN = 0.5;
const ORIGIN: Vec = [196, 268];
const PLATE = { u: 230, v: 120 } as const;
const LEVEL = { data: 0, admin: 120, ui: 240 } as const;

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const pair = (p: Vec) => `${fmt(p[0])},${fmt(p[1])}`;

function project(u: number, v: number, z: number): Vec {
  return [ORIGIN[0] + (u - v) * COS, ORIGIN[1] + (u + v) * SIN - z];
}

/* Straight segment, optionally overshooting both ends like a drafted line. */
function segment(a: Vec, b: Vec, overshoot = 0, overshootEnd = overshoot) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return `M${pair([a[0] - ux * overshoot, a[1] - uy * overshoot])} L${pair([b[0] + ux * overshootEnd, b[1] + uy * overshootEnd])}`;
}

function isoLine(
  u1: number,
  v1: number,
  u2: number,
  v2: number,
  z: number,
  overshoot = 0,
  overshootEnd = overshoot,
) {
  return segment(project(u1, v1, z), project(u2, v2, z), overshoot, overshootEnd);
}

function isoRect(u1: number, v1: number, u2: number, v2: number, z: number) {
  const pts = [
    project(u1, v1, z),
    project(u2, v1, z),
    project(u2, v2, z),
    project(u1, v2, z),
  ];
  return `M${pts.map(pair).join(" L")} Z`;
}

/* The four edges of a plate, each overshooting its corners. */
function plateEdges(z: number, overshoot: number) {
  const { u, v } = PLATE;
  return [
    isoLine(0, 0, u, 0, z, overshoot),
    isoLine(u, 0, u, v, z, overshoot),
    isoLine(u, v, 0, v, z, overshoot),
    isoLine(0, v, 0, 0, z, overshoot),
  ];
}

/* A line leaving the plate edge at (u, v) in model direction (du, dv). */
function leader(u: number, v: number, z: number, du: number, dv: number, length: number) {
  const start = project(u, v, z);
  const dir: Vec = [(du - dv) * COS, (du + dv) * SIN];
  const norm = Math.hypot(dir[0], dir[1]);
  const end: Vec = [start[0] + (dir[0] / norm) * length, start[1] + (dir[1] / norm) * length];
  return { start, end, d: segment(start, end) };
}

/* Plate outline: the definitive line plus a lighter, slightly offset pass. */
function Plate({ z, delay, step }: { z: number; delay: number; step: number }) {
  const edges = plateEdges(z, 7);

  return (
    <>
      <g transform="translate(0.9 -0.8)">
        {edges.map((d, i) => (
          <Draw key={i} d={d} tone="sk-ghost" delay={delay + i * step + 60} duration={460} />
        ))}
      </g>
      {edges.map((d, i) => (
        <Draw key={i} d={d} tone="sk-ink" delay={delay + i * step} duration={380} />
      ))}
    </>
  );
}

export default function ServiceHeroSketch({ className = "" }: { className?: string }) {
  const ui = LEVEL.ui;
  const admin = LEVEL.admin;
  const data = LEVEL.data;

  /* Data spine: through the drum and both plates above it. */
  const spineU = 90;
  const spineV = 50;
  const drumBase = project(spineU, spineV, data);
  const drumR = 28;
  const drumH = 36;
  const rx = drumR * Math.SQRT2 * COS;
  const ry = drumR * Math.SQRT2 * SIN;
  const [cx, cy] = drumBase;
  const drumTopY = cy - drumH;
  const spineAdmin = project(spineU, spineV, admin);
  const spineUi = project(spineU, spineV, ui);

  const ellipse = (y: number) =>
    `M${fmt(cx - rx)},${fmt(y)} A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)},${fmt(y)} A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)},${fmt(y)}`;
  const frontArc = (y: number) =>
    `M${fmt(cx - rx)},${fmt(y)} A${fmt(rx)} ${fmt(ry)} 0 0 0 ${fmt(cx + rx)},${fmt(y)}`;

  /* External nodes, leaving the management plate. */
  const nodeA = leader(150, 0, admin, 0, -1, 140);
  const nodeB = leader(190, 0, admin, 0, -1, 250);
  const nodeC = leader(230, 30, admin, 1, 0, 120);

  /* Corner guides of the exploded view. */
  const left = [project(0, PLATE.v, ui), project(0, PLATE.v, data)] as const;
  const front = [project(PLATE.u, PLATE.v, ui), project(PLATE.u, PLATE.v, data)] as const;
  const right = [project(PLATE.u, 0, ui), project(PLATE.u, 0, data)] as const;

  const levels = [
    { mark: "01", y: left[0][1] },
    { mark: "02", y: project(0, PLATE.v, admin)[1] },
    { mark: "03", y: left[1][1] },
  ];

  return (
    <svg
      viewBox="0 0 640 470"
      className={`sk ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Phase 1: construction. Long axes, corner guides, level marks. */}
      <g className="sk-settle" style={timing(3900)}>
        <Draw d={isoLine(0, 0, 0, PLATE.v, ui, 70, 22)} tone="sk-c" delay={0} duration={900} fine />
        <Draw d={isoLine(0, 0, PLATE.u, 0, ui, 50)} tone="sk-c" delay={80} duration={900} fine />
        <Draw d={isoLine(0, PLATE.v, PLATE.u, PLATE.v, data, 40)} tone="sk-c" delay={160} duration={900} fine />

        <path
          d={`M${pair(left[0])} m0,-16 V${fmt(left[1][1] + 16)}`}
          className="sk-fade sk-c-dash"
          style={timing(200)}
        />
        <path
          d={`M${pair(front[0])} m0,-16 V${fmt(front[1][1] + 16)}`}
          className="sk-fade sk-c-dash"
          style={timing(300)}
        />
        <path
          d={`M${pair(right[0])} m0,-16 V${fmt(right[1][1] + 16)}`}
          className="sk-fade sk-c-dash"
          style={timing(400)}
        />
        <path
          d={`M${pair(spineUi)} V${fmt(spineUi[1] - 46)} M${fmt(cx)},${fmt(cy)} V${fmt(cy + 26)}`}
          className="sk-fade sk-c-dash"
          style={timing(2600)}
        />

        {levels.map((level) => (
          <g key={level.mark} className="sk-fade sk-fine" style={timing(3500)}>
            <path d={`M${fmt(left[0][0] - 17)},${fmt(level.y)} H${fmt(left[0][0] - 5)}`} className="sk-c" />
            <text x={fmt(left[0][0] - 23)} y={fmt(level.y + 3)} textAnchor="end" className="sk-text">
              {level.mark}
            </text>
          </g>
        ))}
      </g>

      {/* Phase 2: the interface plate and its layout. */}
      <Plate z={ui} delay={350} step={150} />
      <g>
        <Draw d={isoLine(12, 14, 218, 14, ui)} tone="sk-ink-2" delay={900} duration={420} />
        <Draw d={isoRect(14, 10, 22, 18, ui)} tone="sk-ink-2" delay={980} duration={260} />
        <Draw d={isoLine(172, 14, 180, 14, ui)} tone="sk-ink-2" delay={1040} duration={200} fine />
        <Draw d={isoLine(188, 14, 196, 14, ui)} tone="sk-ink-2" delay={1090} duration={200} fine />
        <Draw d={isoLine(204, 14, 212, 14, ui)} tone="sk-ink-2" delay={1140} duration={200} fine />
        <Draw d={isoRect(12, 28, 120, 108, ui)} tone="sk-ink-2" delay={1000} duration={520} />
        <Draw d={isoLine(24, 46, 92, 46, ui)} tone="sk-ink-2" delay={1260} duration={260} />
        <Draw d={isoLine(24, 56, 76, 56, ui)} tone="sk-ink-2" delay={1320} duration={260} />
        <Draw d={isoRect(24, 84, 58, 96, ui)} tone="sk-ink-2" delay={1400} duration={300} />
        <Draw d={isoRect(132, 28, 218, 62, ui)} tone="sk-ink-2" delay={1160} duration={420} />
        <Draw d={isoLine(142, 40, 190, 40, ui)} tone="sk-ink-2" delay={1400} duration={240} fine />
        <Draw d={isoRect(132, 74, 218, 108, ui)} tone="sk-ink-2" delay={1280} duration={420} />
        <Draw d={isoLine(142, 86, 196, 86, ui)} tone="sk-ink-2" delay={1500} duration={240} fine />
      </g>

      {/* Phase 3: the management plate behind it. */}
      <Plate z={admin} delay={1500} step={120} />
      <g>
        <Draw d={isoRect(12, 10, 52, 110, admin)} tone="sk-ink-2" delay={1900} duration={480} />
        <Draw d={isoLine(20, 26, 44, 26, admin)} tone="sk-ink-2" delay={2100} duration={200} fine />
        <Draw d={isoLine(20, 38, 44, 38, admin)} tone="sk-ink-2" delay={2150} duration={200} fine />
        <Draw d={isoLine(20, 50, 40, 50, admin)} tone="sk-ink-2" delay={2200} duration={200} fine />
        <Draw d={isoLine(66, 16, 218, 16, admin)} tone="sk-ink-2" delay={1960} duration={380} />
        {[34, 52, 70, 88].map((v, i) => (
          <g key={v}>
            <Draw d={isoRect(66, v - 3, 72, v + 3, admin)} tone="sk-ink-2" delay={2060 + i * 110} duration={220} />
            <Draw d={isoLine(80, v, 180, v, admin)} tone="sk-ink-2" delay={2100 + i * 110} duration={300} />
            <Draw d={isoLine(196, v, 218, v, admin)} tone="sk-ink-2" delay={2180 + i * 110} duration={200} fine />
          </g>
        ))}
      </g>

      {/* Phase 4: the data plate, drum and records. */}
      <Plate z={data} delay={2250} step={110} />
      <g>
        <g transform="translate(0.9 -0.8)">
          <Draw d={ellipse(drumTopY)} tone="sk-ghost" delay={2720} duration={520} />
        </g>
        <Draw d={ellipse(drumTopY)} tone="sk-ink" delay={2660} duration={520} />
        <Draw d={`M${fmt(cx - rx)},${fmt(drumTopY)} V${fmt(cy)}`} tone="sk-ink" delay={2900} duration={260} />
        <Draw d={`M${fmt(cx + rx)},${fmt(drumTopY)} V${fmt(cy)}`} tone="sk-ink" delay={2900} duration={260} />
        <Draw d={frontArc(cy)} tone="sk-ink" delay={3100} duration={320} />
        <Draw d={frontArc(cy - drumH / 2)} tone="sk-ink-2" delay={3160} duration={320} fine />
        {[30, 50, 70].map((v, i) => (
          <g key={v}>
            <Draw d={isoRect(140, v - 3, 146, v + 3, data)} tone="sk-ink-2" delay={2800 + i * 120} duration={220} />
            <Draw d={isoLine(154, v, 214, v, data)} tone="sk-ink-2" delay={2840 + i * 120} duration={280} />
          </g>
        ))}
      </g>

      {/* Phase 5: the data spine and the external connections. */}
      <Draw d={`M${fmt(cx)},${fmt(drumTopY)} V${fmt(spineUi[1])}`} tone="sk-acc" delay={3100} duration={700} />
      <path
        d={`M${fmt(cx)},${fmt(drumTopY)} V${fmt(spineUi[1])}`}
        pathLength={1}
        className="sk-signal"
      />
      <circle cx={fmt(cx)} cy={fmt(drumTopY)} r="2.6" className="sk-fade sk-dot" style={timing(3100)} />
      <circle cx={fmt(spineAdmin[0])} cy={fmt(spineAdmin[1])} r="3.2" className="sk-fade sk-joint" style={timing(3500)} />
      <circle cx={fmt(spineUi[0])} cy={fmt(spineUi[1])} r="4.4" className="sk-end sk-dot" style={timing(3800)} />

      <Draw d={nodeA.d} tone="sk-ink-2" delay={3300} duration={420} />
      <Draw d={nodeB.d} tone="sk-ink-2" delay={3420} duration={520} />
      <Draw d={nodeC.d} tone="sk-ink-2" delay={3540} duration={380} fine />
      <Draw d={isoRect(147, -3, 153, 3, admin)} tone="sk-ink-2" delay={3300} duration={200} fine />
      <Draw d={isoRect(187, -3, 193, 3, admin)} tone="sk-ink-2" delay={3420} duration={200} fine />
      <Draw d={isoRect(227, 27, 233, 33, admin)} tone="sk-ink-2" delay={3540} duration={200} fine />

      {/* Phase 6: nodes. */}
      <g className="sk-fade" style={timing(3720)}>
        <circle cx={fmt(nodeA.end[0])} cy={fmt(nodeA.end[1])} r="6" className="sk-node" />
        <circle cx={fmt(nodeA.end[0])} cy={fmt(nodeA.end[1])} r="1.8" className="sk-dot-ink" />
      </g>
      <g className="sk-fade" style={timing(3900)}>
        <circle cx={fmt(nodeB.end[0])} cy={fmt(nodeB.end[1])} r="10.5" className="sk-ring" />
        <circle cx={fmt(nodeB.end[0])} cy={fmt(nodeB.end[1])} r="5.2" className="sk-dot" />
      </g>
      <g className="sk-fade sk-fine" style={timing(3960)}>
        <rect
          x={fmt(nodeC.end[0] - 5.5)}
          y={fmt(nodeC.end[1] - 5.5)}
          width="11"
          height="11"
          className="sk-node"
        />
        <circle cx={fmt(nodeC.end[0])} cy={fmt(nodeC.end[1])} r="1.6" className="sk-dot-ink" />
      </g>
    </svg>
  );
}
