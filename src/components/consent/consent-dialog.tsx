"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import CtaButton from "@/components/cta-button";
import { trackEvent } from "@/lib/analytics/track";
import { syncAttributionStorage } from "@/lib/attribution/capture";
import { closeConsentSettings, decideConsent, hydrateConsent, useConsentSnapshot } from "@/lib/consent/store";

export type ConsentCopy = {
  title: string;
  body: string;
  necessaryOnly: string;
  acceptAll: string;
  preferences: string;
  privacyLink: string;
  cookiesLink: string;
  preferencesTitle: string;
  back: string;
  close: string;
  necessaryLabel: string;
  necessaryStatus: string;
  necessaryText: string;
  analyticsLabel: string;
  analyticsText: string;
  analyticsToggle: string;
  save: string;
};

type ConsentDialogProps = {
  copy: ConsentCopy;
  privacyHref: string;
  cookiesHref: string;
};

/**
 * The cookie choice, as a card.
 *
 * Shown in two situations: no current choice is stored (the first visit, or
 * the schema moved on), and the visitor opened "Cookie-instellingen" in the
 * footer. It is not modal. Nothing behind it is locked, dimmed or trapped;
 * the site is fully usable with the card open and fully usable after either
 * answer.
 *
 * The first layer offers "necessary only" and "accept all" as the same
 * control in the same size, side by side, one Tab apart. There is no close
 * button and Escape does nothing on that layer: closing without answering
 * would be an answer nobody gave, and the honest way out is one of the two
 * buttons. The preferences layer has a back button, and when the dialog was
 * opened from the footer, a close button and Escape as well -- there a choice
 * already exists and leaving it as it is means exactly that.
 *
 * On its first appearance the card does not take focus: it is an offer, not
 * an interruption. Opened from the footer it is what the visitor asked for,
 * so focus moves to its title and returns to the footer button on close.
 */
export default function ConsentDialog({ copy, privacyHref, cookiesHref }: ConsentDialogProps) {
  const { hydrated, decision, settingsOpen } = useConsentSnapshot();
  const [layer, setLayer] = useState<"choice" | "preferences">("choice");
  const [analytics, setAnalytics] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  const analyticsTextId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    hydrateConsent();
  }, []);

  const open = hydrated && (decision === null || settingsOpen);
  const showPreferences = settingsOpen || layer === "preferences";
  const storedAnalytics = decision?.analytics ?? false;

  // Opened from the footer: the dialog starts on preferences and the switch
  // reflects the stored choice. State derived from a prop change is set
  // during render, the way React asks, rather than from an effect.
  const [wasSettingsOpen, setWasSettingsOpen] = useState(settingsOpen);
  if (settingsOpen !== wasSettingsOpen) {
    setWasSettingsOpen(settingsOpen);
    if (settingsOpen) {
      setLayer("preferences");
      setAnalytics(storedAnalytics);
    }
  }

  // ...and focus moves in, with Escape as a way out, and goes back to where
  // it came from afterwards. Only for the footer-opened dialog: on its first
  // appearance the card takes nothing from the visitor.
  useEffect(() => {
    if (!settingsOpen) return;

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeConsentSettings();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [settingsOpen]);

  // Focus follows a layer change the visitor made, so a keyboard user is not
  // left on a button that no longer exists. After the commit, when the new
  // title is in the document; and only then, never on the first appearance.
  const focusTitleOnLayer = useRef(false);
  useEffect(() => {
    if (!focusTitleOnLayer.current) return;
    focusTitleOnLayer.current = false;
    titleRef.current?.focus({ preventScroll: true });
  }, [layer]);

  if (!open) {
    return null;
  }

  /*
    Records the choice, and when it is a yes, measures that it was given:
    the one event that can only ever exist after consent. Where the card
    was opened from is the only parameter. A no is never sent anywhere.
  */
  function decide(analytics: boolean) {
    decideConsent(analytics);
    /* The visit's origin follows the same choice: kept across a reload only with a yes. */
    syncAttributionStorage(analytics);
    if (analytics) {
      trackEvent("consent_granted", { placement: settingsOpen ? "settings" : "banner" });
    }
  }

  function openPreferences() {
    setAnalytics(storedAnalytics);
    focusTitleOnLayer.current = true;
    setLayer("preferences");
  }

  function backToChoice() {
    focusTitleOnLayer.current = true;
    setLayer("choice");
  }

  function onDialogKeyDown(event: React.KeyboardEvent) {
    // Escape on the preferences layer of a first-time choice goes back; the
    // footer-opened case is handled by the window listener above.
    if (event.key === "Escape" && !settingsOpen && layer === "preferences") {
      event.stopPropagation();
      backToChoice();
    }
  }

  const linkClass = "link-static text-[0.85rem] text-muted transition-colors hover:text-ink";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={showPreferences ? undefined : bodyId}
      onKeyDown={onDialogKeyDown}
      className="consent-in fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] overflow-y-auto overscroll-contain rounded-t-lg border-t border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lift sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[27rem] sm:rounded-lg sm:border sm:p-6 sm:pb-6"
    >
      {showPreferences ? (
        <div>
          <div className="flex items-center justify-between gap-4">
            {settingsOpen ? (
              <button type="button" onClick={closeConsentSettings} className="link-line -ml-0.5 text-[0.9rem] font-medium text-ink">
                {copy.close}
              </button>
            ) : (
              <button type="button" onClick={backToChoice} className="link-line -ml-0.5 inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-ink">
                <span aria-hidden="true">←</span>
                {copy.back}
              </button>
            )}
          </div>

          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="mt-4 text-[1.05rem] font-semibold text-ink outline-none">
            {copy.preferencesTitle}
          </h2>

          <dl className="mt-4 divide-y divide-line border-y border-line">
            <div className="flex items-start justify-between gap-6 py-4">
              <div>
                <dt className="label-mono text-ink">{copy.necessaryLabel}</dt>
                <dd className="mt-1.5 text-[0.9rem] leading-relaxed text-muted">{copy.necessaryText}</dd>
              </div>
              <dd className="label-mono shrink-0 pt-0.5 text-faint">{copy.necessaryStatus}</dd>
            </div>
            <div className="flex items-start justify-between gap-6 py-4">
              <div>
                <dt className="label-mono text-ink">{copy.analyticsLabel}</dt>
                <dd id={analyticsTextId} className="mt-1.5 text-[0.9rem] leading-relaxed text-muted">
                  {copy.analyticsText}
                </dd>
              </div>
              <dd className="shrink-0 pt-0.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={analytics}
                  aria-label={copy.analyticsToggle}
                  aria-describedby={analyticsTextId}
                  onClick={() => setAnalytics((value) => !value)}
                  className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-200 ${
                    analytics ? "border-accent bg-accent" : "border-line-strong bg-paper-deep"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0.5 h-[1.1rem] w-[1.1rem] rounded-full bg-surface shadow-sm transition-transform duration-200 ${
                      analytics ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </dd>
            </div>
          </dl>

          <CtaButton variant="primary" onClick={() => decide(analytics)} className="mt-5 w-full">
            {copy.save}
          </CtaButton>
        </div>
      ) : (
        <div>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-[1.05rem] font-semibold text-ink outline-none">
            {copy.title}
          </h2>
          <p id={bodyId} className="mt-2 text-[0.9rem] leading-relaxed text-muted">
            {copy.body}
          </p>

          {/* Two answers, one shape: the same variant, the same width, one Tab apart. */}
          <div className="mt-5 grid gap-3 xs:grid-cols-2">
            <CtaButton variant="secondary" onClick={() => decide(false)} className="w-full px-3">
              {copy.necessaryOnly}
            </CtaButton>
            <CtaButton variant="secondary" onClick={() => decide(true)} className="w-full px-3">
              {copy.acceptAll}
            </CtaButton>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button type="button" onClick={openPreferences} className="link-line inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-ink">
              {copy.preferences}
              <span aria-hidden="true">→</span>
            </button>
            <Link href={privacyHref} className={linkClass}>
              {copy.privacyLink}
            </Link>
            <Link href={cookiesHref} className={linkClass}>
              {copy.cookiesLink}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
