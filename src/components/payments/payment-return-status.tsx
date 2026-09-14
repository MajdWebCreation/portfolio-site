"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BrandMark from "@/components/brand-mark";
import { checkPaymentReturnState } from "@/lib/payments/return-actions";
import {
  nextPollDelayMs,
  pollCeilingMs,
  shouldKeepPolling,
  viewAfterPolling,
  type ReturnView,
} from "@/lib/payments/return-polling";
import type { PaymentReturnState } from "@/lib/payments/return-state";

/**
 * The return page, while it waits and after it stops.
 *
 * The provider's redirect often arrives before its own webhook, so the first
 * answer from the server is usually "not settled yet". Refreshing is not the
 * customer's job: the page asks again by itself, about once a second, and
 * replaces the loader with the real message the moment the administration
 * confirms one.
 *
 * Until then it shows the wordmark and a quiet loader, and says nothing at
 * all about payments. Thanking someone is reachable from exactly one state --
 * `paid`, which means our own database calls the invoice settled -- and that
 * rule lives in `return-polling.ts`, where it is tested, not in this file.
 *
 * Nothing here knows which invoice this is. It holds the same opaque token
 * the address bar already shows, and gets back one of four words.
 */
export type ReturnCopy = { title: string; text: string };

type PaymentReturnStatusProps = {
  /** The answer the server already had when the page was rendered. */
  initial: PaymentReturnState;
  /** The opaque `state` from the URL; the only thing the checks need. */
  token?: string;
  /** Wording for this visitor's language, resolved on the server. */
  copy: Record<Exclude<ReturnView, "loading">, ReturnCopy>;
  waitingLabel: string;
  homeHref: string;
  homeLabel: string;
};

export default function PaymentReturnStatus({
  initial,
  token,
  copy,
  waitingLabel,
  homeHref,
  homeLabel,
}: PaymentReturnStatusProps) {
  const [state, setState] = useState<PaymentReturnState>(initial);
  /* Bumped after every check, so each answer schedules the next one. */
  const [attempt, setAttempt] = useState(0);
  const [stopped, setStopped] = useState(false);
  /* Set on the first effect run rather than at render: reading the clock while
     rendering is not a pure thing to do, and mount is the honest start. */
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;

    startedAt.current ??= Date.now();
    const elapsed = Date.now() - startedAt.current;
    if (!shouldKeepPolling(state, elapsed)) {
      if (state === "processing") setStopped(true);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void checkPaymentReturnState(token)
        .then((next) => {
          // A late answer for a page the visitor has left must not be applied.
          if (!cancelled) setState(next);
        })
        .catch(() => {
          /*
            A check that did not go through says nothing about the payment, so
            the state stands and the next tick tries again. Not reaching the
            server is never a reason to show a customer bad news.
          */
        })
        .finally(() => {
          if (!cancelled) setAttempt((count) => count + 1);
        });
    }, nextPollDelayMs(elapsed));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, attempt, token]);

  const view = viewAfterPolling(state, stopped ? pollCeilingMs : 0);

  if (view === "loading") {
    return (
      <div
        className="flex min-h-[70vh] flex-col items-center justify-center gap-10 py-20"
        role="status"
        aria-live="polite"
      >
        <BrandMark className="h-14 w-[190px] sm:h-16 sm:w-[220px]" priority />
        {/* A hairline that turns, not a spinner competing with the wordmark. */}
        <span
          aria-hidden="true"
          className="block h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none"
        />
        <span className="sr-only">{waitingLabel}</span>
      </div>
    );
  }

  const message = copy[view];

  return (
    <div className="flex min-h-[70vh] max-w-[42rem] flex-col justify-center py-20" role="status" aria-live="polite">
      <h1 className="display-md text-ink">{message.title}</h1>
      <p className="lede mt-5 text-body">{message.text}</p>
      <p className="mt-8">
        <Link href={homeHref} className="link-static text-ink">
          {homeLabel}
        </Link>
      </p>
    </div>
  );
}
