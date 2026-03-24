import type { ReactNode } from "react";

type ParallaxLayerProps = {
  children: ReactNode;
  className?: string;
  yRange?: [number, number];
  scaleRange?: [number, number];
};

export default function ParallaxLayer({
  children,
  className = "",
  yRange = [-24, 24],
  scaleRange = [1, 1],
}: ParallaxLayerProps) {
  void yRange;
  void scaleRange;

  return <div className={className}>{children}</div>;
}
