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
  const opacityTransform = useTransform(scrollYProgress, [start, end], [0.22, 1]);
  const scaleTransform = useTransform(scrollYProgress, [start, end], [0.96, 1]);
  const yTransform = useTransform(scrollYProgress, [start, end], [28, 0]);
  const glowOpacityTransform = useTransform(
    scrollYProgress,
    [start, end],
    [0.02, 0.34],
  );

  return (
    <motion.article
      style={{
        opacity: shouldReduceMotion ? 1 : opacityTransform,
        scale: shouldReduceMotion ? 1 : scaleTransform,
        y: shouldReduceMotion ? 0 : yTransform,
      }}
      className="relative md:grid md:grid-cols-[72px_1fr] md:gap-8"
    >
      <div className="relative z-10 mb-4 flex md:mb-0 md:justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/30 bg-[#07131b] text-xs tracking-[0.28em] text-cyan-200 shadow-[0_0_30px_rgba(53,180,255,0.14)]">
          {step.number}
        </div>
      </div>
      <motion.div
        style={
          {
            ["--glow-opacity" as string]: shouldReduceMotion
              ? 0.16
              : glowOpacityTransform,
          } as CSSProperties
        }
        className="relative overflow-hidden rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.008))] p-6 md:p-7"
      >
        <div
          className="absolute right-[-4.5rem] top-1/2 h-44 w-44 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(113,227,255,var(--glow-opacity)) 0%, rgba(113,227,255,calc(var(--glow-opacity) * 0.48)) 34%, rgba(113,227,255,0) 74%)",
          }}
        />
        <h3 className="text-2xl font-medium text-white">{step.title}</h3>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65">
          {step.text}
        </p>
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
    <section ref={ref} className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:h-fit">
        <div className="max-w-md">
          <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/72">
            Guided sequence
          </p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight text-white">
            {title}
          </h2>
          <p className="mt-5 text-sm leading-7 text-white/52">
            Each step clarifies the direction and intensifies the build quality before launch.
          </p>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[22px] top-0 hidden h-full w-px bg-white/6 md:block" />
        <motion.div
          style={shouldReduceMotion ? undefined : { height: progressHeight }}
          className="absolute left-[22px] top-0 hidden w-px bg-gradient-to-b from-cyan-200 via-cyan-300/70 to-transparent md:block"
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
