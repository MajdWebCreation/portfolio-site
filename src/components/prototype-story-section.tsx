"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import type { SiteContent } from "@/lib/content/site-content";

type PrototypeStoryContent = SiteContent["prototypeStory"];

type PrototypeStorySectionProps = {
  content: PrototypeStoryContent;
  overviewHref: string;
};

type StoryStage = PrototypeStoryContent["stages"][number];

const STORY_PATH_VIEWBOX = { width: 1280, height: 720 };
const STORY_PATH =
  "M 88 188 C 214 102, 358 94, 476 152 S 662 294, 772 304 S 934 238, 1036 222 S 1156 254, 1204 414";

const PATH_RANGES = [
  [0.06, 0.23],
  [0.26, 0.46],
  [0.49, 0.7],
  [0.73, 0.94],
] as const;

const PENCIL = {
  width: 168,
  height: 60,
  tipX: 160,
  tipY: 42,
};

function useStoryReveal(
  progress: MotionValue<number>,
  start: number,
  end: number,
  options: {
    y?: number;
    blur?: number;
    scale?: number;
    radius?: number;
  } = {},
) {
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const y = useTransform(progress, [start, end], [options.y ?? 26, 0]);
  const scale = useTransform(progress, [start, end], [options.scale ?? 0.985, 1]);
  const blur = useTransform(progress, [start, end], [options.blur ?? 14, 0]);
  const clip = useTransform(progress, [start, end], [100, 0]);

  const filter = useMotionTemplate`blur(${blur}px)`;
  const clipPath = useMotionTemplate`inset(0 ${clip}% 0 0 round ${options.radius ?? 28}px)`;

  return { opacity, y, scale, filter, clipPath };
}

function usePencilMotion(
  pathRef: React.RefObject<SVGPathElement | null>,
  boardRef: React.RefObject<HTMLDivElement | null>,
  progress: MotionValue<number>,
) {
  const boardSizeRef = useRef({ width: 1, height: 1 });

  const pencilX = useMotionValue(0);
  const pencilY = useMotionValue(0);
  const pencilRotate = useMotionValue(0);

  const updatePencilPosition = useCallback(
    (latest: number) => {
      const pathNode = pathRef.current;
      const boardNode = boardRef.current;
      const boardSize = boardSizeRef.current;

      if (!pathNode || !boardNode || !boardSize.width || !boardSize.height) {
        return;
      }

      const totalLength = pathNode.getTotalLength();
      const currentPoint = pathNode.getPointAtLength(totalLength * latest);
      const nextPoint = pathNode.getPointAtLength(
        totalLength * Math.min(latest + 0.002, 1),
      );

      const scaleX = boardSize.width / STORY_PATH_VIEWBOX.width;
      const scaleY = boardSize.height / STORY_PATH_VIEWBOX.height;

      pencilX.set(currentPoint.x * scaleX - PENCIL.tipX);
      pencilY.set(currentPoint.y * scaleY - PENCIL.tipY);

      const angle =
        (Math.atan2(
          (nextPoint.y - currentPoint.y) * scaleY,
          (nextPoint.x - currentPoint.x) * scaleX,
        ) *
          180) /
        Math.PI;

      pencilRotate.set(angle);
    },
    [pathRef, boardRef, pencilRotate, pencilX, pencilY],
  );

  useEffect(() => {
    const boardNode = boardRef.current;

    if (!boardNode) {
      return;
    }

    const updateBoardSize = () => {
      const rect = boardNode.getBoundingClientRect();
      boardSizeRef.current = { width: rect.width, height: rect.height };
      updatePencilPosition(progress.get());
    };

    updateBoardSize();

    const observer = new ResizeObserver(updateBoardSize);
    observer.observe(boardNode);

    return () => observer.disconnect();
  }, [boardRef, progress, updatePencilPosition]);

  useEffect(() => {
    updatePencilPosition(progress.get());
  }, [progress, updatePencilPosition]);

  useMotionValueEvent(progress, "change", (latest) => {
    updatePencilPosition(latest);
  });

  return { pencilX, pencilY, pencilRotate };
}

function StoryBoardChrome({
  content,
}: {
  content: PrototypeStoryContent;
}) {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(113,227,255,0.14),transparent_24%),radial-gradient(circle_at_86%_14%,rgba(88,145,255,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
      <div className="ym-grid absolute inset-0 opacity-[0.035]" />
      <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(113,227,255,0.11),transparent_62%)]" />

      <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-cyan-200/76 backdrop-blur md:left-6 md:top-6">
        {content.boardLabel}
      </div>
    </>
  );
}

function StaticPrototypeStory({
  content,
  overviewHref,
}: PrototypeStorySectionProps) {
  return (
    <div className="ym-hairline ym-panel-glow relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,11,17,0.94),rgba(4,8,12,0.98))] p-5 sm:p-6 md:p-8">
      <StoryBoardChrome content={content} />

      <div className="relative pt-16 md:pt-20">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {content.stages.map((stage, index) => (
            <article
              key={stage.label}
              className={`rounded-[1.8rem] border border-white/10 p-5 ${
                index === 3
                  ? "bg-[linear-gradient(180deg,rgba(35,72,97,0.62),rgba(8,14,22,0.96))]"
                  : "bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]"
              }`}
            >
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/76">
                {stage.label}
              </p>
              <h3 className="mt-4 text-2xl font-medium leading-tight text-white">
                {stage.title}
              </h3>
              <p className="mt-4 text-sm leading-7 text-white/62">{stage.text}</p>

              {index === 2 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {content.interfaceChips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-white/62"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}

              {index === 3 ? (
                <Link
                  href={overviewHref}
                  data-track-event="primary_cta_click"
                  data-track-category="homepage"
                  data-track-label={content.ctaLabel}
                  data-track-location="prototype-story-static"
                  className="mt-6 inline-flex rounded-full border border-white/15 bg-black/30 px-5 py-3 text-sm font-medium text-white transition hover:border-cyan-300/40 hover:bg-black/45"
                >
                  {content.ctaLabel}
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function DesktopPrototypeStory({
  content,
  overviewHref,
}: PrototypeStorySectionProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const pathProgress = useTransform(scrollYProgress, [0.04, 0.94], [0, 1]);
  const pathGlowOpacity = useTransform(pathProgress, [0, 1], [0.1, 0.42]);

  const { pencilX, pencilY, pencilRotate } = usePencilMotion(
    pathRef,
    boardRef,
    pathProgress,
  );

  const zoneOne = useStoryReveal(scrollYProgress, PATH_RANGES[0][0], PATH_RANGES[0][1], {
    y: 34,
    blur: 18,
    scale: 0.98,
    radius: 30,
  });

  const zoneTwo = useStoryReveal(scrollYProgress, PATH_RANGES[1][0], PATH_RANGES[1][1], {
    y: 34,
    blur: 16,
    scale: 0.985,
    radius: 34,
  });

  const zoneThree = useStoryReveal(scrollYProgress, PATH_RANGES[2][0], PATH_RANGES[2][1], {
    y: 30,
    blur: 15,
    scale: 0.985,
    radius: 32,
  });

  const zoneFour = useStoryReveal(scrollYProgress, PATH_RANGES[3][0], PATH_RANGES[3][1], {
    y: 28,
    blur: 12,
    scale: 0.99,
    radius: 34,
  });

  return (
    <div ref={sectionRef} className="relative h-[430vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <div
          ref={boardRef}
          className="ym-hairline ym-panel-glow relative min-h-[78vh] w-full overflow-hidden rounded-[3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,11,17,0.94),rgba(4,8,12,0.98))]"
        >
          <StoryBoardChrome content={content} />

          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${STORY_PATH_VIEWBOX.width} ${STORY_PATH_VIEWBOX.height}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              ref={pathRef}
              d={STORY_PATH}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <motion.path
              d={STORY_PATH}
              fill="none"
              stroke="rgba(113,227,255,0.16)"
              strokeWidth="10"
              strokeLinecap="round"
              style={{ pathLength: pathProgress, opacity: pathGlowOpacity }}
            />
            <motion.path
              d={STORY_PATH}
              fill="none"
              stroke="rgba(184,243,255,0.76)"
              strokeWidth="2.4"
              strokeLinecap="round"
              style={{ pathLength: pathProgress }}
            />
          </svg>

          <motion.div
            style={zoneOne}
            className="absolute left-[5%] top-[14%] w-[26%] rounded-[2rem] border border-white/10 bg-[rgba(8,13,19,0.82)] p-6 backdrop-blur-md"
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/74">
              {content.stages[0].label}
            </p>
            <h3 className="mt-4 text-[2rem] font-medium leading-tight text-white">
              {content.stages[0].title}
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/58">
              {content.stages[0].text}
            </p>

            <div className="mt-6 space-y-3">
              <div className="h-3 rounded-full bg-white/10" />
              <div className="h-3 w-[72%] rounded-full bg-white/6" />
            </div>
          </motion.div>

          <motion.div
            style={zoneTwo}
            className="absolute left-[34%] top-[12%] w-[38%] rounded-[2.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,22,31,0.92),rgba(6,10,15,0.96))] p-6"
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/74">
              {content.stages[1].label}
            </p>

            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/14" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              </div>

              <div className="mt-4 h-28 rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.015]" />

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="h-14 rounded-[1rem] border border-white/8 bg-white/[0.015]" />
                <div className="h-14 rounded-[1rem] border border-white/8 bg-white/[0.015]" />
                <div className="h-14 rounded-[1rem] border border-white/8 bg-white/[0.015]" />
              </div>
            </div>

            <p className="mt-4 max-w-md text-sm leading-7 text-white/58">
              {content.stages[1].text}
            </p>
          </motion.div>

          <motion.div
            style={zoneThree}
            className="absolute left-[14%] bottom-[10%] w-[27%] rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-6 backdrop-blur-md"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/76">
              {content.stages[2].label}
            </p>
            <h3 className="mt-4 text-[2rem] font-medium leading-tight text-white">
              {content.stages[2].title}
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/62">
              {content.stages[2].text}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {content.interfaceChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-white/62"
                >
                  {chip}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            style={zoneFour}
            className="absolute right-[6%] bottom-[8%] w-[23%] rounded-[2.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(35,72,97,0.62),rgba(8,14,22,0.96))] p-6"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(113,227,255,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/78">
                {content.finalEyebrow}
              </p>
              <h3 className="mt-4 text-[2rem] font-semibold leading-tight text-white">
                {content.finalTitle}
              </h3>
              <p className="mt-4 text-sm leading-7 text-white/68">
                {content.finalText}
              </p>
              <Link
                href={overviewHref}
                data-track-event="primary_cta_click"
                data-track-category="homepage"
                data-track-label={content.ctaLabel}
                data-track-location="prototype-story-desktop"
                className="mt-6 inline-flex rounded-full border border-white/15 bg-black/30 px-5 py-3 text-sm font-medium text-white transition hover:border-cyan-300/40 hover:bg-black/45"
              >
                {content.ctaLabel}
              </Link>
            </div>
          </motion.div>

          <motion.div
            aria-hidden
            style={{
              x: pencilX,
              y: pencilY,
              rotate: pencilRotate,
              transformOrigin: `${PENCIL.tipX}px ${PENCIL.tipY}px`,
            }}
            className="pointer-events-none absolute left-0 top-0 z-30 will-change-transform"
          >
            <div className="relative h-[60px] w-[168px]">
              <Image
                src="/images/visuals/story-pencil.svg"
                alt=""
                width={PENCIL.width}
                height={PENCIL.height}
                className="h-full w-full"
              />
              <div className="absolute right-0 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-cyan-300/16 blur-xl" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function MobilePrototypeStory({
  content,
  overviewHref,
}: PrototypeStorySectionProps) {
  const isEnglishMobileStory = content.ctaLabel === "Open project thinking";
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const pathProgress = useTransform(scrollYProgress, [0.04, 0.94], [0, 1]);
  const pathGlowOpacity = useTransform(pathProgress, [0, 1], [0.08, 0.34]);

  const { pencilX, pencilY, pencilRotate } = usePencilMotion(
    pathRef,
    boardRef,
    pathProgress,
  );

  const zoneOne = useStoryReveal(scrollYProgress, PATH_RANGES[0][0], PATH_RANGES[0][1], {
    y: 24,
    blur: 16,
    scale: 0.985,
    radius: 28,
  });

  const zoneTwo = useStoryReveal(scrollYProgress, PATH_RANGES[1][0], PATH_RANGES[1][1], {
    y: 24,
    blur: 14,
    scale: 0.985,
    radius: 28,
  });

  const zoneThree = useStoryReveal(scrollYProgress, PATH_RANGES[2][0], PATH_RANGES[2][1], {
    y: 22,
    blur: 13,
    scale: 0.99,
    radius: 28,
  });

  const zoneFour = useStoryReveal(scrollYProgress, PATH_RANGES[3][0], PATH_RANGES[3][1], {
    y: 22,
    blur: 12,
    scale: 0.99,
    radius: 28,
  });

  return (
    <div ref={sectionRef} className="relative h-[360vh]">
      <div className="sticky top-0 flex h-screen items-center py-6">
        <div
          ref={boardRef}
          className="ym-hairline ym-panel-glow relative min-h-[82vh] w-full overflow-hidden rounded-[2.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,11,17,0.94),rgba(4,8,12,0.98))]"
        >
          <StoryBoardChrome content={content} />

          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${STORY_PATH_VIEWBOX.width} ${STORY_PATH_VIEWBOX.height}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              ref={pathRef}
              d={STORY_PATH}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <motion.path
              d={STORY_PATH}
              fill="none"
              stroke="rgba(113,227,255,0.14)"
              strokeWidth="9"
              strokeLinecap="round"
              style={{ pathLength: pathProgress, opacity: pathGlowOpacity }}
            />
            <motion.path
              d={STORY_PATH}
              fill="none"
              stroke="rgba(184,243,255,0.72)"
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ pathLength: pathProgress }}
            />
          </svg>

          <motion.div
            style={zoneOne}
            className="absolute inset-x-4 top-[20%] rounded-[1.8rem] border border-white/10 bg-[rgba(8,13,19,0.84)] p-5 backdrop-blur-md"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/76">
              {content.stages[0].label}
            </p>
            <h3 className="mt-4 text-[1.9rem] font-medium leading-tight text-white">
              {content.stages[0].title}
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/60">
              {content.stages[0].text}
            </p>
            <div className="mt-5 space-y-3">
              <div className="h-3 rounded-full bg-white/10" />
              <div className="h-3 w-[72%] rounded-full bg-white/6" />
            </div>
          </motion.div>

          <motion.div
            style={zoneTwo}
            className="absolute inset-x-4 top-[40%] rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,22,31,0.92),rgba(6,10,15,0.96))] p-5"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/76">
              {content.stages[1].label}
            </p>

            <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/14" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              </div>
              <div className="mt-4 h-24 rounded-[1.1rem] border border-dashed border-white/10 bg-white/[0.015]" />
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="h-12 rounded-[0.9rem] border border-white/8 bg-white/[0.015]" />
                <div className="h-12 rounded-[0.9rem] border border-white/8 bg-white/[0.015]" />
                <div className="h-12 rounded-[0.9rem] border border-white/8 bg-white/[0.015]" />
              </div>
            </div>

            <p className="mt-4 text-sm leading-7 text-white/60">
              {content.stages[1].text}
            </p>
          </motion.div>

          <motion.div
            style={zoneThree}
            className="absolute inset-x-4 bottom-[23%] rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-5 backdrop-blur-md"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/76">
              {content.stages[2].label}
            </p>
            <h3 className="mt-4 text-[1.9rem] font-medium leading-tight text-white">
              {content.stages[2].title}
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/60">
              {content.stages[2].text}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {content.interfaceChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-white/62"
                >
                  {chip}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            style={zoneFour}
            className={`absolute inset-x-4 bottom-[4%] rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(35,72,97,0.62),rgba(8,14,22,0.96))] p-5 ${
              isEnglishMobileStory ? "pr-16" : ""
            }`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(113,227,255,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
            <div
              className={`relative ${
                isEnglishMobileStory ? "max-w-[14rem]" : "max-w-[16rem]"
              }`}
            >
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/78">
                {content.finalEyebrow}
              </p>
              <h3 className="mt-4 text-[1.85rem] font-semibold leading-tight text-white">
                {content.finalTitle}
              </h3>
              <p className="mt-4 text-sm leading-7 text-white/68">
                {content.finalText}
              </p>
              <Link
                href={overviewHref}
                data-track-event="primary_cta_click"
                data-track-category="homepage"
                data-track-label={content.ctaLabel}
                data-track-location="prototype-story-mobile"
                className="mt-6 inline-flex rounded-full border border-white/15 bg-black/30 px-5 py-3 text-sm font-medium text-white transition hover:border-cyan-300/40 hover:bg-black/45"
              >
                {content.ctaLabel}
              </Link>
            </div>
          </motion.div>

          <motion.div
            aria-hidden
            style={{
              x: pencilX,
              y: pencilY,
              rotate: pencilRotate,
              transformOrigin: `${PENCIL.tipX}px ${PENCIL.tipY}px`,
            }}
            className="pointer-events-none absolute left-0 top-0 z-30 will-change-transform"
          >
            <div className="relative h-[60px] w-[168px] scale-[0.88]">
              <Image
                src="/images/visuals/story-pencil.svg"
                alt=""
                width={PENCIL.width}
                height={PENCIL.height}
                className="h-full w-full"
              />
              <div className="absolute right-0 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-cyan-300/14 blur-xl" />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function PrototypeStorySection(
  props: PrototypeStorySectionProps,
) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-10 lg:py-24">
      <div className="absolute inset-0">
        <div className="ym-bg-sweep absolute inset-x-[-10%] top-[18%] h-[26rem] opacity-[0.24]" />
        <div className="ym-bg-curve absolute inset-x-[-8%] bottom-[-10%] h-[24rem] opacity-[0.22]" />
      </div>

      <div className="relative">
        {shouldReduceMotion ? (
          <StaticPrototypeStory {...props} />
        ) : (
          <>
            <div className="hidden md:block">
              <DesktopPrototypeStory {...props} />
            </div>
            <div className="md:hidden">
              <MobilePrototypeStory {...props} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
