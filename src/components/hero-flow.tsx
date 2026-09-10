type FlowLayer = {
  label: string;
  title: string;
  status: string;
};

type HeroFlowProps = {
  caption: string;
  layers: readonly FlowLayer[];
  base: string;
};

/**
 * Hero visual: the layers of a product YM builds, shown as a request that
 * travels through them. Each layer lights up in turn (CSS only) and shows
 * what happens to the request there. With reduced motion the first layer
 * stays lit and nothing moves.
 */
export default function HeroFlow({ caption, layers, base }: HeroFlowProps) {
  return (
    <figure className="hero-flow rounded-md border border-line bg-surface p-4 shadow-image sm:p-5">
      <figcaption className="label-mono flex items-center gap-3 px-2 pb-3">
        <span aria-hidden="true" className="hero-flow-pulse block h-[7px] w-[7px] rounded-full bg-accent" />
        {caption}
      </figcaption>

      <ol className="hero-flow-layers relative">
        <span
          aria-hidden="true"
          className="absolute bottom-6 left-[1.1rem] top-6 w-px bg-line-strong sm:left-[1.35rem]"
        />
        {layers.map((layer, index) => (
          <li
            key={layer.label}
            className="hero-flow-layer relative grid grid-cols-[2.25rem_1fr] items-start gap-x-2 rounded-sm px-2 py-3 sm:grid-cols-[2.75rem_7rem_1fr] sm:items-center sm:gap-x-3 sm:py-3.5"
            style={{ "--flow-index": index } as React.CSSProperties}
          >
            <span aria-hidden="true" className="relative block h-full">
              <span className="hero-flow-node absolute left-[0.5rem] top-[0.55rem] block h-[9px] w-[9px] rounded-full border border-line-strong bg-surface sm:left-[0.75rem] sm:top-1/2 sm:-translate-y-1/2" />
            </span>
            <span className="label-mono hero-flow-label block pt-[0.35rem] sm:pt-0">{layer.label}</span>
            <span className="col-start-2 sm:col-start-3">
              <span className="block text-[0.95rem] font-medium leading-snug sm:text-[1rem]">
                {layer.title}
              </span>
              <span className="hero-flow-status mt-0.5 block text-[0.78rem] leading-snug text-accent">
                {layer.status}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p className="label-mono border-t border-line px-2 pt-4 mt-2 text-ink">{base}</p>
    </figure>
  );
}
