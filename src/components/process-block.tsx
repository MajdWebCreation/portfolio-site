"use client";

import type { CSSProperties } from "react";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

type ProcessStep = {
  number: string;
  title: string;
  text: string;
};

type ProcessBlockProps = {
  title: string;
  steps: readonly ProcessStep[];
};

type ProcessStepItemProps = {
  step: ProcessStep;
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
  start: number;
  end: number;
  shouldReduceMotion: boolean;
};

function ProcessStepItem({
  step,
  scrollYProgress,
  start,
  end,
  shouldReduceMotion,
}: ProcessStepItemProps) {
  const opacityTransform = useTransform(scrollYProgress, [start, end], [0.28, 1]);
  const yTransform = useTransform(scrollYProgress, [start, end], [24, 0]);
  const glowOpacityTransform = useTransform(
    scrollYProgress,
    [start, end],
    [0.02, 0.18],
  );

  return (
    <motion.article
      style={{
        opacity: shouldReduceMotion ? 1 : opacityTransform,
        y: shouldReduceMotion ? 0 : yTransform,
      }}
      className="relative grid gap-5 md:grid-cols-[56px_1fr] md:gap-6"
    >
      <div className="relative z-10 flex md:justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/25 bg-[#061019] text-[10px] tracking-[0.24em] text-cyan-200 shadow-[0_0_0_6px_rgba(2,6,10,0.92)]">
          {step.number}
        </div>
      </div>

      <motion.div
        style={
          {
            ["--glow-opacity" as string]: shouldReduceMotion
              ? 0.1
              : glowOpacityTransform,
          } as CSSProperties
        }
        className="relative border-b border-white/8 pb-6 last:border-b-0 last:pb-0"
      >
        <div
          className="absolute left-0 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(113,227,255,var(--glow-opacity)) 0%, rgba(113,227,255,calc(var(--glow-opacity) * 0.34)) 38%, rgba(113,227,255,0) 74%)",
          }}
        />
        <div className="relative">
          <h3 className="text-2xl font-medium text-white">{step.title}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/58">
            {step.text}
          </p>
        </div>
      </motion.div>
    </motion.article>
  );
}

export default function ProcessBlock({ title, steps }: ProcessBlockProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });

  const progressHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section ref={ref} className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14">
      <div className="lg:sticky lg:top-28 lg:h-fit">
        <div className="max-w-md">
          <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
            Guided sequence
          </p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight text-white">
            {title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-white/50">
            A clearer process usually makes the final result feel calmer, sharper, and more intentional.
          </p>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[18px] top-0 hidden h-full w-px bg-white/5 md:block" />
        <motion.div
          style={shouldReduceMotion ? undefined : { height: progressHeight }}
          className="absolute left-[18px] top-0 hidden w-px bg-gradient-to-b from-cyan-200 via-cyan-300/60 to-transparent md:block"
        />

        <div className="space-y-7">
          {steps.map((step, index) => {
            const start = steps.length === 1 ? 0 : index / steps.length;
            const end = steps.length === 1 ? 1 : (index + 1) / steps.length;

            return (
              <ProcessStepItem
                key={step.number}
                step={step}
                scrollYProgress={scrollYProgress}
                start={start}
                end={end}
                shouldReduceMotion={shouldReduceMotion}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}