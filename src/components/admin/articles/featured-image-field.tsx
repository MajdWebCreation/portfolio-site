"use client";

import { useRef, useState } from "react";
import AdminButton from "@/components/admin/admin-button";
import { TextField } from "@/components/admin/form-field";
import {
  articleImageHint,
  articleImageObjectPath,
  articleImageRejection,
  articleImageUrl,
  articleMediaBucket,
  type FeaturedImage,
} from "@/lib/admin/articles/media";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FeaturedImageFieldProps = {
  value: FeaturedImage | null;
  onChange: (value: FeaturedImage | null) => void;
};

/**
 * Choosing, replacing and removing the featured image.
 *
 * The file goes straight from the browser to Supabase Storage under the
 * admin's own session, so the bytes never pass through the application and
 * the bucket's policies decide whether the upload is allowed. What comes back
 * — the object path — is what the editor holds; the row is written when the
 * article is saved.
 *
 * Each upload gets its own path, so replacing an image never overwrites the
 * one a published article is still showing. The old object is deleted by the
 * save action, after the row that pointed at it has been updated.
 */
export default function FeaturedImageField({ value, onChange }: FeaturedImageFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    const rejection = articleImageRejection(file);
    if (rejection) {
      setError(rejection);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const path = articleImageObjectPath(file.type);
      const { error: uploadError } = await createSupabaseBrowserClient()
        .storage.from(articleMediaBucket)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(`Uploaden mislukt: ${uploadError.message}`);
        return;
      }

      onChange({ path, alt: value?.alt ?? "" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section aria-labelledby="image-heading" className="space-y-3 border-t border-line pt-6">
      <h2 id="image-heading" className="label-mono text-ink">
        Uitgelichte afbeelding
      </h2>

      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a preview of an
              arbitrary uploaded object; the public page uses next/image. */}
          <img
            src={articleImageUrl(value.path)}
            alt={value.alt || "Voorbeeld van de uitgelichte afbeelding"}
            className="block aspect-[16/9] w-full rounded-sm border border-line bg-paper-deep object-cover"
          />
          <TextField
            id="featuredImageAlt"
            label="Alt-tekst"
            value={value.alt}
            onChange={(event) => onChange({ ...value, alt: event.target.value })}
            hint="Beschrijft de afbeelding voor wie hem niet ziet."
          />
        </>
      ) : (
        <p className="text-[0.82rem] leading-snug text-muted">
          Nog geen afbeelding. Een artikel zonder afbeelding werkt gewoon; de pagina laat hem dan weg.
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <AdminButton variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Uploaden…" : value ? "Vervangen" : "Afbeelding kiezen"}
        </AdminButton>
        {value ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            disabled={busy}
            className="link-static text-[0.9rem] text-ink"
          >
            Verwijderen
          </button>
        ) : null}
      </div>

      <p className="text-[0.82rem] leading-snug text-muted">{articleImageHint}</p>
      {error ? (
        <p role="alert" className="text-[0.85rem] leading-snug text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
