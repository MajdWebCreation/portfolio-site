"use client";

import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

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
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
