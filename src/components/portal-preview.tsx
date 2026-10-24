import Image from "next/image";
import { portalPreviewContent } from "@/lib/content/process";
import type { Locale } from "@/lib/content/site-content";

/**
 * The client portal as the customer sees it: the overview on a laptop-width
 * frame, and a quote on a phone in front of it. Both are captures of the
 * real portal with a sample customer, so the caption says so.
 */
export default function PortalPreview({ locale }: { locale: Locale }) {
  const copy = portalPreviewContent[locale];

  return (
    <figure className="pp">
      <div className="relative pb-[16%] pr-[22%] sm:pb-[9%] sm:pr-[16%]">
        <div className="pp-frame">
          <div className="pp-frame-bar">
            <span aria-hidden="true" className="pp-lock" />
            <span className="truncate">ymcreations.com/portaal</span>
          </div>
          <Image
            src="/images/portal/portaal-overzicht.webp"
            alt={copy.desktopAlt}
            width={1600}
            height={1076}
            sizes="(min-width: 1024px) 50vw, 80vw"
            className="block h-auto w-full"
          />
        </div>

        <div className="pp-phone">
          <Image
            src="/images/portal/portaal-offerte-mobiel.webp"
            alt={copy.phoneAlt}
            width={780}
            height={1688}
            sizes="(min-width: 1024px) 14vw, 34vw"
            className="block h-auto w-full"
          />
        </div>
      </div>

      <figcaption className="label-mono mt-4 text-muted">{copy.caption}</figcaption>
    </figure>
  );
}
