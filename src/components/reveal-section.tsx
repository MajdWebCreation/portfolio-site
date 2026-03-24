import { ReactNode } from "react";

type RevealSectionProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  yOffset?: number;
};

export default function RevealSection({
  children,
  className = "",
  delay = 0,
  yOffset = 28,
}: RevealSectionProps) {
  void delay;
  void yOffset;

  return <div className={className}>{children}</div>;
}
