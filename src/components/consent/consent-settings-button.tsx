"use client";

import { openConsentSettings } from "@/lib/consent/store";

/**
 * "Cookie-instellingen" in the footer: reopens the consent dialog on its
 * preferences layer. A button, not a link -- it changes nothing about where
 * the visitor is, only what is on top of it.
 */
export default function ConsentSettingsButton({ label, className = "" }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      {label}
    </button>
  );
}
