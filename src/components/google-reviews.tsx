"use client";

import { useEffect, useState } from "react";
import type { ReviewsResponse } from "@/app/api/google-reviews/route";
import type { PlaceReview, PlaceReviews } from "@/lib/google/places";
import type { Locale } from "@/lib/content/site-content";

/**
 * Google reviews of YM Creations, as Google Maps content.
 *
 * Loaded after the page, from the site's own route, because Google's terms
 * allow no caching of reviews: a static page cannot carry them. While they
 * load the block keeps its place; when Google has nothing or cannot be
 * reached it disappears, and there is never a stand-in review.
 *
 * Attribution follows the Places policy: the Google Maps logo on the block,
 * each author's avatar, name and profile link, a link to every review on
 * Google Maps and to report it, and a line on how Google ordered them. The
 * tinted panel sets the Google content apart from the page's own.
 */

const copy = {
  nl: {
    heading: "Reviews op Google",
    ratingLabel: (rating: string) => `${rating} van 5 sterren`,
    count: (count: number) => `${count} ${count === 1 ? "beoordeling" : "beoordelingen"}`,
    viewPlace: "Bekijk op Google Maps",
    viewReview: "Bekijk op Google Maps",
    report: "Melden",
    more: "Meer lezen",
    less: "Minder",
    order: "De meest relevante reviews volgens Google, in de volgorde van Google. Reviews zonder tekst worden hier niet getoond.",
  },
  en: {
    heading: "Reviews on Google",
    ratingLabel: (rating: string) => `${rating} out of 5 stars`,
    count: (count: number) => `${count} ${count === 1 ? "review" : "reviews"}`,
    viewPlace: "View on Google Maps",
    viewReview: "View on Google Maps",
    report: "Report",
    more: "Read more",
    less: "Less",
    order: "The most relevant reviews according to Google, in Google's order. Reviews without text are not shown here.",
  },
} as const;

type Copy = (typeof copy)[Locale];

function Stars({ rating, label }: { rating: number; label: string }) {
  const filled = Math.round(rating);
  return (
    <span role="img" aria-label={label} className="inline-flex gap-px text-[0.95rem] leading-none text-ink">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < filled ? "" : "text-line-strong"}>
          ★
        </span>
      ))}
    </span>
  );
}

const external = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;

function ReviewCard({ review, text, locale }: { review: PlaceReview; text: Copy; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);
  /* Only long texts get the toggle; the clamp is visual, the full text is in the page. */
  const long = review.text.length > 280;

  const author = (
    <span className="flex min-w-0 items-center gap-2.5">
      {review.authorPhotoUri ? (
        // eslint-disable-next-line @next/next/no-img-element -- relayed avatar, not an optimisable asset
        <img
          src={review.authorPhotoUri}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-8 w-8 shrink-0 rounded-full bg-line"
        />
      ) : (
        <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full bg-line" />
      )}
      <span title={review.authorName} className="min-w-0 truncate text-[0.95rem] font-medium text-ink">
        {review.authorName}
      </span>
    </span>
  );

  return (
    <li className="flex min-w-0 flex-col border-t border-line-strong pt-4">
      <div className="flex items-center justify-between gap-3">
        {review.authorUri ? (
          <a href={review.authorUri} {...external} className="min-w-0 hover:underline">
            {author}
          </a>
        ) : (
          author
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] text-muted">
        {review.rating !== null ? (
          <Stars rating={review.rating} label={text.ratingLabel(review.rating.toLocaleString(locale))} />
        ) : null}
        {review.relativeTime ? <span>{review.relativeTime}</span> : null}
      </div>
      <p
        className={`mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed text-body [overflow-wrap:anywhere] ${
          long && !expanded ? "line-clamp-6" : ""
        }`}
      >
        {review.text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-1 self-start text-[0.85rem] text-ink underline underline-offset-2"
        >
          {expanded ? text.less : text.more}
        </button>
      ) : null}
      <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[0.8rem] text-muted">
        {review.reviewUri ? (
          <a href={review.reviewUri} {...external} className="link-static">
            {text.viewReview}
          </a>
        ) : null}
        {review.flagUri ? (
          <a href={review.flagUri} {...external} className="link-static">
            {text.report}
          </a>
        ) : null}
      </p>
    </li>
  );
}

function ReviewsPanel({ place, locale }: { place: PlaceReviews; locale: Locale }) {
  const text = copy[locale];

  return (
    <div className="rounded-sm bg-paper-deep p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h2 className="label-mono text-ink">{text.heading}</h2>
          {place.rating !== null ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[1.6rem] font-semibold leading-none tracking-[-0.02em] text-ink">
                {place.rating.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <Stars rating={place.rating} label={text.ratingLabel(place.rating.toLocaleString(locale))} />
              {place.ratingCount !== null ? (
                <span className="text-[0.9rem] text-muted">{text.count(place.ratingCount)}</span>
              ) : null}
            </p>
          ) : null}
          {place.placeUri ? (
            <a href={place.placeUri} {...external} className="link-static mt-2 inline-block text-[0.85rem] text-body">
              {text.viewPlace}
            </a>
          ) : null}
        </div>
        {/* Google's own logo file, unaltered, at 18px (the policy allows 16-19). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand asset */}
        <img
          src="/images/google/GoogleMaps_Logo_Gray.svg"
          alt="Google Maps"
          width={98}
          height={18}
          translate="no"
          className="h-[18px] w-auto shrink-0"
        />
      </div>

      {place.reviews.length > 0 ? (
        <>
          <ul className="mt-6 grid gap-6 md:grid-cols-3 md:gap-8">
            {place.reviews.map((review, index) => (
              <ReviewCard key={`${review.authorName}-${index}`} review={review} text={text} locale={locale} />
            ))}
          </ul>
          <p className="mt-5 text-[0.8rem] leading-snug text-muted">{text.order}</p>
        </>
      ) : null}
    </div>
  );
}

export default function GoogleReviews({ locale, className = "" }: { locale: Locale; className?: string }) {
  const [state, setState] = useState<"loading" | "hidden" | PlaceReviews>("loading");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/google-reviews?locale=${locale}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ReviewsResponse>) : null))
      .then((data) => {
        if (!data || !data.available) {
          setState("hidden");
          return;
        }
        const { placeName, rating, ratingCount, placeUri, reviews } = data;
        setState({ placeName, rating, ratingCount, placeUri, reviews });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState("hidden");
      });

    return () => controller.abort();
  }, [locale]);

  if (state === "hidden") return null;

  return (
    <section className={className} aria-busy={state === "loading"}>
      {state === "loading" ? (
        /* Holds the block's place while Google answers, so the page below does not jump. */
        <div aria-hidden="true" className="min-h-[15rem] rounded-sm bg-paper-deep md:min-h-[28rem]" />
      ) : (
        <ReviewsPanel place={state} locale={locale} />
      )}
    </section>
  );
}
