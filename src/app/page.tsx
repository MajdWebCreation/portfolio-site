"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Image from "next/image";
import { useRef, useState } from "react";
import RevealSection from "@/components/reveal-section";
import { Locale, siteContent } from "@/lib/site-content";

type SiteContent = (typeof siteContent)[Locale];
type ServicesContent = SiteContent["services"];
type ProjectsContent = SiteContent["projects"];
type AboutContent = SiteContent["about"];
type ContactContent = SiteContent["contact"];
type FooterContent = SiteContent["footer"];

export default function Home() {
const [locale, setLocale] = useState<Locale>("en");
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const content = siteContent[locale];

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <BlueprintBackground />

      <header className="relative z-30">
  <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-10">
    <div className="flex items-center gap-3">
      <div className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.9)]" />
      <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-white/90 sm:text-sm">
        YM Creations
      </span>
    </div>

    <div className="hidden items-center gap-8 text-sm text-white/70 md:flex">
      <a href="#services" className="transition hover:text-white">
        {content.nav.services}
      </a>
      <a href="#projects" className="transition hover:text-white">
        {content.nav.projects}
      </a>
      <a href="#about" className="transition hover:text-white">
        {content.nav.about}
      </a>
      <a href="#contact" className="transition hover:text-white">
        {content.nav.contact}
      </a>
    </div>

    <div className="hidden items-center gap-3 md:flex">
      <div className="rounded-full border border-white/10 bg-white/5 p-1">
        <button
          onClick={() => setLocale("en")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            locale === "en"
              ? "bg-white text-black"
              : "text-white/65 hover:text-white"
          }`}
        >
          EN
        </button>
        <button
          onClick={() => setLocale("nl")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            locale === "nl"
              ? "bg-white text-black"
              : "text-white/65 hover:text-white"
          }`}
        >
          NL
        </button>
      </div>

      <a
        href="#contact"
        className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
      >
        {content.nav.cta}
      </a>
    </div>

    <div className="flex items-center gap-2 md:hidden">
      <a
        href="#contact"
        className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
      >
        {content.nav.cta}
      </a>

      <button
        type="button"
        aria-label="Toggle menu"
        onClick={() => setMobileMenuOpen((prev) => !prev)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5"
      >
        <div className="flex flex-col gap-1.5">
          <span
            className={`block h-px w-5 bg-white transition ${
              mobileMenuOpen ? "translate-y-[7px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition ${
              mobileMenuOpen ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-px w-5 bg-white transition ${
              mobileMenuOpen ? "-translate-y-[7px] -rotate-45" : ""
            }`}
          />
        </div>
      </button>
    </div>
  </nav>

  <motion.div
    initial={false}
    animate={{
      opacity: mobileMenuOpen ? 1 : 0,
      y: mobileMenuOpen ? 0 : -10,
      pointerEvents: mobileMenuOpen ? "auto" : "none",
    }}
    transition={{ duration: 0.22 }}
    className="absolute inset-x-4 top-full mt-2 rounded-[1.75rem] border border-white/10 bg-black/90 p-4 backdrop-blur-md md:hidden"
  >
    <div className="mb-4 flex rounded-full border border-white/10 bg-white/5 p-1">
      <button
        onClick={() => setLocale("en")}
        className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition ${
          locale === "en" ? "bg-white text-black" : "text-white/65"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLocale("nl")}
        className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition ${
          locale === "nl" ? "bg-white text-black" : "text-white/65"
        }`}
      >
        NL
      </button>
    </div>

    <div className="flex flex-col">
      <a
        href="#services"
        onClick={() => setMobileMenuOpen(false)}
        className="rounded-2xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
      >
        {content.nav.services}
      </a>
      <a
        href="#projects"
        onClick={() => setMobileMenuOpen(false)}
        className="rounded-2xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
      >
        {content.nav.projects}
      </a>
      <a
        href="#about"
        onClick={() => setMobileMenuOpen(false)}
        className="rounded-2xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
      >
        {content.nav.about}
      </a>
      <a
        href="#contact"
        onClick={() => setMobileMenuOpen(false)}
        className="rounded-2xl px-4 py-3 text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
      >
        {content.nav.contact}
      </a>
    </div>
  </motion.div>
</header>

      <section className="relative z-20 mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-7xl items-center px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-10 lg:px-10">
        <div className="grid w-full gap-10 sm:gap-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="mb-5 text-[11px] uppercase tracking-[0.3em] text-cyan-300/80 sm:text-sm"
            >
              {content.hero.eyebrow}
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1 }}
            className="max-w-4xl text-[3rem] font-semibold leading-[0.98] text-white sm:text-6xl lg:text-7xl"
            >
              {content.hero.title}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="mt-6 max-w-2xl text-base leading-8 text-white/65 sm:mt-8 sm:text-lg"
            >
              {content.hero.description}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              className="mt-8 flex flex-wrap gap-3 sm:mt-10 sm:gap-4"
            >
              <a
                href="#projects"
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90"
              >
                {content.hero.primaryCta}
              </a>

              <a
                href="#contact"
                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
              >
                {content.hero.secondaryCta}
              </a>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.25 }}
            className="relative"
          >
            <div className="absolute inset-0 rounded-[2rem] bg-cyan-400/10 blur-3xl" />

            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-[0_0_80px_rgba(34,211,238,0.08)] backdrop-blur-md sm:rounded-[2rem] sm:p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="text-xs uppercase tracking-[0.25em] text-white/40">
                  {content.hero.blueprintLabel}
                </span>
                <div className="flex gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-400/80" />
                </div>
              </div>

              <div className="relative mt-6 aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:42px_42px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.15),transparent_45%)]" />

                <motion.div
                  animate={{ y: [0, -14, 0], x: [0, 8, 0] }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute left-[12%] top-[12%] h-24 w-40 rounded-2xl border border-cyan-300/30 bg-cyan-400/5"
                />

                <motion.div
                  animate={{ y: [0, 16, 0], x: [0, -10, 0] }}
                  transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute right-[10%] top-[22%] h-32 w-32 rounded-full border border-white/15"
                />

                <motion.div
                  animate={{ y: [0, -12, 0] }}
                  transition={{
                    duration: 7,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute bottom-[16%] left-[18%] h-20 w-56 rounded-[1.5rem] border border-white/10 bg-white/5"
                />

                <motion.div
                  animate={{ rotate: [0, 8, 0] }}
                  transition={{
                    duration: 9,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute bottom-[20%] right-[16%] h-28 w-28 border border-cyan-300/30"
                  style={{
                    clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
                  }}
                />

                <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">
                    {content.hero.cardEyebrow}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/70">
                    {content.hero.cardText}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <ServicesSection content={content.services} />
      <ProjectsSection content={content.projects} />
      <AboutSection content={content.about} />
      <ContactSection content={content.contact} footer={content.footer} />
      <FooterSection content={content.footer} />
    </main>
  );
}

function ServicesSection({ content }: { content: ServicesContent }) {
  return (
    <section
      id="services"
      className="relative z-20 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-10 lg:py-28"
    >
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <RevealSection>
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
            {content.eyebrow}
          </p>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
            {content.title}
          </h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/65">
            {content.description}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {content.notes.map((note) => (
              <span
                key={note}
                className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-cyan-200/80"
              >
                {note}
              </span>
            ))}
          </div>
        </RevealSection>

        <RevealSection delay={0.08}>
          <BlueprintSystemMap labels={content.labels} />
        </RevealSection>
      </div>
    </section>
  );
}

function BlueprintSystemMap({ labels }: { labels: readonly string[] }) {
  const desktopPoints = [
    { top: "10%", left: "18%" },
    { top: "18%", left: "64%" },
    { top: "38%", left: "10%" },
    { top: "42%", left: "72%" },
    { top: "70%", left: "20%" },
    { top: "74%", left: "62%" },
  ];

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:rounded-[2.25rem] md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.28em] text-white/35 sm:text-xs">
          System blueprint
        </span>
        <div className="flex gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400/80" />
        </div>
      </div>

      <div className="relative hidden aspect-[1/1] overflow-hidden rounded-[1.8rem] border border-white/10 bg-black md:block">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.10),transparent_45%)]" />

        <svg
          viewBox="0 0 1000 1000"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          {[
            "M220 170 C 360 170, 420 250, 500 320",
            "M690 240 C 620 300, 580 310, 500 320",
            "M500 320 C 420 400, 350 420, 230 440",
            "M500 320 C 590 390, 655 405, 760 455",
            "M230 440 C 250 620, 310 690, 330 760",
            "M760 455 C 740 610, 690 705, 650 775",
          ].map((path, index) => (
            <motion.path
              key={path}
              d={path}
              stroke="rgba(34,211,238,0.35)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.2 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: false, amount: 0.45 }}
              transition={{ duration: 1.4, delay: index * 0.08, ease: "easeInOut" }}
            />
          ))}
        </svg>

        <motion.div
          initial={{ scale: 0.92, opacity: 0.5 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: false, amount: 0.45 }}
          transition={{ duration: 0.9 }}
          className="absolute left-1/2 top-[31%] flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/8 text-center shadow-[0_0_40px_rgba(34,211,238,0.18)]"
        >
          <span className="px-3 text-[10px] uppercase tracking-[0.18em] text-cyan-200/85">
            Core system
          </span>
        </motion.div>

        {desktopPoints.map((point, index) => (
          <motion.div
            key={labels[index]}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: false, amount: 0.35 }}
            transition={{ duration: 0.7, delay: index * 0.08 }}
            className="absolute"
            style={{ top: point.top, left: point.left }}
          >
            <div className="relative rounded-2xl border border-white/10 bg-black/70 px-4 py-3 backdrop-blur">
              <div className="mb-2 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.95)]" />
              <p className="max-w-[130px] text-xs uppercase tracking-[0.18em] text-white/78">
                {labels[index]}
              </p>
            </div>
          </motion.div>
        ))}

        <motion.div
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-[31%] h-24 w-24 -translate-x-1/2 rounded-full border border-cyan-300/35"
        />
      </div>

      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black md:hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:34px_34px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.10),transparent_45%)]" />

        <div className="relative p-4">
          <div className="mb-4 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/8 text-center shadow-[0_0_30px_rgba(34,211,238,0.18)]">
              <span className="px-2 text-[10px] uppercase tracking-[0.16em] text-cyan-200/85">
                Core system
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {labels.map((label, index) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.25 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="rounded-[1.15rem] border border-white/10 bg-black/70 px-3 py-4 backdrop-blur"
              >
                <div className="mb-2 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.95)]" />
                <p className="text-[11px] uppercase leading-5 tracking-[0.16em] text-white/78">
                  {label}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectsSection({ content }: { content: ProjectsContent }) {
  return (
    <section
      id="projects"
      className="relative z-20 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-10 lg:py-28"
    >
      <ProjectsDrawIntro content={content} />
    </section>
  );
}

function ProjectsDrawIntro({ content }: { content: ProjectsContent }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.92", "end 0.18"],
  });

  const drawProgress = useTransform(scrollYProgress, [0.08, 0.72], [0, 1]);
  const headingReveal = useTransform(
    scrollYProgress,
    [0.1, 0.3],
    ["inset(0 100% 0 0)", "inset(0 0% 0 0)"]
  );
  const cardReveal = useTransform(
    scrollYProgress,
    [0.16, 0.62],
    ["inset(0 100% 0 0 round 2rem)", "inset(0 0% 0 0 round 2rem)"]
  );
  const sideReveal = useTransform(
    scrollYProgress,
    [0.24, 0.76],
    ["inset(0 100% 0 0)", "inset(0 0% 0 0)"]
  );

  const pencilX = useTransform(scrollYProgress, [0.08, 0.78], [-140, 540]);
  const pencilY = useTransform(scrollYProgress, [0.08, 0.78], [0, 150]);
  const pencilRotate = useTransform(scrollYProgress, [0.08, 0.78], [-8, 8]);
  const pencilOpacity = useTransform(
    scrollYProgress,
    [0, 0.08, 0.8, 0.9, 1],
    [0, 1, 1, 0, 0]
  );

  const mobileCardReveal = useTransform(
    scrollYProgress,
    [0.14, 0.62],
    ["inset(0 100% 0 0 round 1.5rem)", "inset(0 0% 0 0 round 1.5rem)"]
  );

  const mobilePencilX = useTransform(scrollYProgress, [0.1, 0.72], [-40, 210]);
  const mobilePencilY = useTransform(scrollYProgress, [0.1, 0.72], [-10, 120]);
  const mobilePencilRotate = useTransform(scrollYProgress, [0.1, 0.72], [-16, 6]);
  const mobilePencilOpacity = useTransform(
    scrollYProgress,
    [0, 0.08, 0.72, 0.82, 1],
    [0, 1, 1, 0, 0]
  );

  return (
    <div ref={ref} className="relative">
      <motion.div
        style={shouldReduceMotion ? undefined : { clipPath: headingReveal }}
        className="mb-10 overflow-hidden sm:mb-14"
      >
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
          {content.eyebrow}
        </p>
        <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
          {content.title}
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-8 text-white/65">
          {content.description}
        </p>
      </motion.div>

      <div className="hidden gap-8 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="relative h-[560px] overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#050505]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(34,211,238,0.12),transparent_34%)]" />

          <ProjectSketchLayer progress={drawProgress} />

          <motion.div
            style={shouldReduceMotion ? undefined : { clipPath: cardReveal }}
            className="absolute inset-0 p-6"
          >
            <FinalProjectPanel content={content} />
          </motion.div>
        </div>

        <motion.div
          style={shouldReduceMotion ? undefined : { clipPath: sideReveal }}
          className="overflow-hidden"
        >
          <div className="space-y-5">
            {content.stages.map((stage, index) => (
              <div key={stage} className="flex items-start gap-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/8 text-sm text-cyan-200">
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-cyan-300/75">
                    {stage}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/62">
                    {index === 0 &&
                      "Loose concept and direction take shape first."}
                    {index === 1 &&
                      "The structure becomes clearer and more deliberate."}
                    {index === 2 &&
                      "The interface gains refinement, hierarchy, and rhythm."}
                    {index === 3 &&
                      "The result feels polished and ready to represent a brand."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="space-y-6 lg:hidden">
        <div className="relative h-[520px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050505]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(34,211,238,0.12),transparent_34%)]" />

          <ProjectSketchLayer progress={drawProgress} />

          <motion.div
            style={shouldReduceMotion ? undefined : { clipPath: mobileCardReveal }}
            className="absolute inset-0 p-4"
          >
            <FinalProjectPanelMobile content={content} />
          </motion.div>

          <div className="pointer-events-none absolute inset-0 z-30">
            <motion.div
              style={
                shouldReduceMotion
                  ? undefined
                  : {
                      x: mobilePencilX,
                      y: mobilePencilY,
                      rotate: mobilePencilRotate,
                      opacity: mobilePencilOpacity,
                    }
              }
              className="absolute left-[42%] top-[76px] w-[220px] origin-center"
            >
              <div style={{ transform: "scaleX(-1)" }}>
                <Image
                  src="/images/pencil.png"
                  alt=""
                  width={1600}
                  height={900}
                  priority
                  className="h-auto w-full select-none object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.72)]"
                />
              </div>
            </motion.div>
          </div>
        </div>

        <div className="space-y-5">
          {content.stages.map((stage, index) => (
            <div key={stage} className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/8 text-sm text-cyan-200">
                {index + 1}
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-cyan-300/75">
                  {stage}
                </p>
                <p className="mt-2 text-sm leading-7 text-white/62">
                  {index === 0 &&
                    "Loose concept and direction take shape first."}
                  {index === 1 &&
                    "The structure becomes clearer and more deliberate."}
                  {index === 2 &&
                    "The interface gains refinement, hierarchy, and rhythm."}
                  {index === 3 &&
                    "The result feels polished and ready to represent a brand."}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-30 hidden lg:block">
        <motion.div
          style={
            shouldReduceMotion
              ? undefined
              : {
                  x: pencilX,
                  y: pencilY,
                  rotate: pencilRotate,
                  opacity: pencilOpacity,
                }
          }
          className="absolute left-[44%] top-[170px] w-[380px] origin-center"
        >
          <div style={{ transform: "scaleX(-1)" }}>
            <Image
              src="/images/pencil.png"
              alt=""
              width={1600}
              height={900}
              priority
              className="h-auto w-full select-none object-contain drop-shadow-[0_24px_50px_rgba(0,0,0,0.72)]"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function FinalProjectPanelMobile({ content }: { content: ProjectsContent }) {
  return (
    <div className="h-full overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.05] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="max-w-[70%] text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
          {content.itemTitle}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          Concept
        </span>
      </div>

      <div className="relative h-[calc(100%-49px)] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,rgba(34,211,238,0.14),transparent_34%)]" />

        <div className="absolute left-[12%] top-[9%] h-14 w-40 rounded-2xl border border-cyan-300/30 bg-cyan-400/8" />
        <div className="absolute left-[63%] top-[11%] h-20 w-20 rounded-full border border-white/12" />

        <div className="absolute left-[12%] top-[22%] right-[12%] rounded-[1.2rem] border border-white/10 bg-black/28 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
            Progress
          </p>
          <div className="mt-4 space-y-3">
            {content.stages.map((stage, index) => (
              <div key={stage} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/8 text-[11px] text-cyan-200">
                  {index + 1}
                </div>
                <span className="text-sm uppercase tracking-[0.18em] text-white/78">
                  {stage}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-[10%] left-[10%] right-[10%] rounded-[1.2rem] border border-white/10 bg-black/55 p-4 backdrop-blur">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">
            Premium build
          </p>
          <p className="mt-3 text-sm leading-7 text-white/68">
            Clean structure, deliberate hierarchy, and a polished final presentation.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProjectSketchLayer({
  progress,
}: {
  progress: MotionValue<number>;
}) {
  const lineOpacity = useTransform(progress, [0, 0.15, 1], [0.12, 0.4, 0.7]);

  return (
    <>
      <svg
        viewBox="0 0 1000 700"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        {[
          "M90 90 L 910 90",
          "M90 90 L 90 610",
          "M90 610 L 910 610",
          "M910 90 L 910 610",
          "M130 150 L 610 150",
          "M700 150 L 860 150",
          "M620 150 L 620 560",
          "M150 230 L 530 230 L 530 380 L 150 380 Z",
          "M150 440 L 470 440 L 470 560 L 150 560 Z",
          "M670 230 L 840 230",
          "M670 290 L 840 290",
          "M670 350 L 840 350",
          "M670 410 L 840 410",
          "M670 480 L 860 480 L 860 560 L 670 560 Z",
        ].map((d) => (
          <motion.path
            key={d}
            d={d}
            style={{ pathLength: progress, opacity: lineOpacity }}
            stroke="rgba(193,246,255,0.8)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {[
          { x1: 180, y1: 470, x2: 420, y2: 470 },
          { x1: 180, y1: 510, x2: 390, y2: 510 },
          { x1: 700, y1: 255, x2: 820, y2: 255 },
          { x1: 700, y1: 315, x2: 800, y2: 315 },
          { x1: 700, y1: 375, x2: 830, y2: 375 },
          { x1: 700, y1: 520, x2: 805, y2: 520 },
        ].map((line, index) => (
          <motion.line
            key={index}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            style={{ pathLength: progress, opacity: lineOpacity }}
            stroke="rgba(255,255,255,0.34)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
      </svg>

      <motion.div
        style={{ opacity: lineOpacity }}
        className="absolute left-[15%] top-[18%] h-[28%] w-[42%] rounded-[2rem] border border-cyan-300/15 bg-cyan-400/[0.03]"
      />
    </>
  );
}

function FinalProjectPanel({ content }: { content: ProjectsContent }) {
  return (
    <div className="h-full overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.05] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <span className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">
          {content.itemTitle}
        </span>
        <span className="text-xs uppercase tracking-[0.22em] text-white/35">
          Concept
        </span>
      </div>

      <div className="grid h-[calc(100%-57px)] gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative overflow-hidden border-b border-white/10 lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:34px_34px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,rgba(34,211,238,0.16),transparent_34%)]" />

          <div className="absolute left-[12%] top-[16%] h-20 w-48 rounded-2xl border border-cyan-300/30 bg-cyan-400/8" />
          <div className="absolute right-[14%] top-[22%] h-28 w-28 rounded-full border border-white/12" />

          <div className="absolute bottom-[14%] left-[12%] right-[12%] rounded-[1.4rem] border border-white/10 bg-black/50 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/70">
              Refined direction
            </p>
            <p className="mt-3 text-sm leading-7 text-white/70">
              {content.itemText}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/35">
              Progress
            </p>
            <div className="mt-5 space-y-4">
              {content.stages.map((stage, index) => (
                <div key={stage} className="flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/8 text-xs text-cyan-200">
                    {index + 1}
                  </div>
                  <span className="text-sm uppercase tracking-[0.2em] text-white/75">
                    {stage}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-white/10 bg-black/30 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/70">
              Premium build
            </p>
            <p className="mt-3 text-sm leading-7 text-white/65">
              Clean structure, deliberate hierarchy, and a more polished final
              presentation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutSection({ content }: { content: AboutContent }) {
  return (
    <section
      id="about"
      className="relative z-20 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-10 lg:py-28"
    >
      <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr]">
        <RevealSection>
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
            {content.eyebrow}
          </p>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
            {content.title}
          </h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/65">
            {content.description}
          </p>
        </RevealSection>

        <RevealSection delay={0.08}>
          <ProcessTimeline steps={content.steps} />
        </RevealSection>
      </div>
    </section>
  );
}

function ProcessTimeline({ steps }: { steps: AboutContent["steps"] }) {
  return (
    <div className="relative pl-6 sm:pl-8">
      <div className="absolute left-[12px] top-0 h-full w-px bg-gradient-to-b from-cyan-400/40 via-white/12 to-transparent sm:left-[17px]" />

      <div className="space-y-12">
        {steps.map((step, index) => (
          <RevealSection key={step.title} delay={index * 0.05}>
            <div className="relative">
             <div className="absolute -left-[22px] top-2 h-4 w-4 rounded-full border border-cyan-300/30 bg-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.8)] sm:-left-[32px]" />

              <div className="grid gap-4 md:grid-cols-[100px_1fr] md:gap-8">
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">
                  {step.number}
                </p>

                <div>
                  <h3 className="text-2xl font-medium text-white">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">
                    {step.text}
                  </p>
                </div>
              </div>
            </div>
          </RevealSection>
        ))}
      </div>
    </div>
  );
}

function ContactSection({
  content,
  footer,
}: {
  content: ContactContent;
  footer: FooterContent;
}) {
  return (
    <section
      id="contact"
      className="relative z-20 mx-auto w-full max-w-7xl px-6 py-28 lg:px-10"
    >
      <RevealSection>
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.13),transparent_34%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:42px_42px]" />

          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
          <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-cyan-300/20 to-transparent" />

          <motion.div
            animate={{ scale: [0.96, 1.04, 0.96], opacity: [0.25, 0.55, 0.25] }}
            transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/20"
          />

          <div className="relative z-10 grid gap-10 lg:grid-cols-[1fr_0.75fr] lg:items-end">
            <div>
              <p className="mb-4 text-sm uppercase tracking-[0.3em] text-cyan-300/80">
                {content.eyebrow}
              </p>
              <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                {content.title}
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/65">
                {content.description}
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#"
                  className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:opacity-90"
                >
                  {content.primary}
                </a>
                <a
                  href={`mailto:${content.email}`}
                  className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition hover:border-cyan-400/50 hover:bg-white/10"
                >
                  {content.secondary}
                </a>
              </div>
            </div>

            <div className="rounded-[1.8rem] border border-white/10 bg-black/45 p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/75">
                {content.signal}
              </p>
              <div className="mt-5 space-y-4 text-sm text-white/72">
                <p>{content.email}</p>
                <p>{content.phone}</p>
                <p>ymcreations.com</p>
                <p>{footer.kvkLabel}: 96175354</p>
              </div>
            </div>
          </div>
        </div>
      </RevealSection>
    </section>
  );
}

function FooterSection({ content }: { content: FooterContent }) {
  return (
    <footer className="relative z-20 border-t border-white/10">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr] lg:px-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.9)]" />
            <span className="text-sm font-medium uppercase tracking-[0.25em] text-white/90">
              YM Creations
            </span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">
            {content.description}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-white">{content.company}</p>
          <ul className="mt-5 space-y-3 text-sm text-white/60">
            {content.companyLinks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium text-white">{content.services}</p>
          <ul className="mt-5 space-y-3 text-sm text-white/60">
            {content.serviceLinks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium text-white">{content.contact}</p>
          <ul className="mt-5 space-y-3 text-sm text-white/60">
            <li>hello@ymcreations.com</li>
            <li>+31 6 12345678</li>
            <li>ymcreations.com</li>
            <li>{content.kvkLabel}: 96175354</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function BlueprintBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.08),transparent_22%),linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)]" />

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:80px_80px] opacity-30" />

      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[-10%] top-[10%] h-[420px] w-[420px] rounded-full border border-cyan-300/10"
      />

      <motion.div
        animate={{ y: [0, 24, 0], x: [0, 12, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute right-[-6%] top-[18%] h-[520px] w-[520px] rounded-full border border-white/5"
      />

      <motion.div
        animate={{ x: [0, 20, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[12%] left-[8%] h-px w-[320px] bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent"
      />
    </div>
  );
}
