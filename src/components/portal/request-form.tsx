"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FilePicker, UploadList, useRequestUploads } from "@/components/portal/request-uploads";
import { createRequestAction, type CreateRequestState } from "@/lib/portal/requests/actions";
import { portalRequestPath } from "@/lib/portal/paths";
import { attachmentRules, normalizeRequest, requestCategories, requestCategoryLabels, requestLimits, validateRequest, type RequestErrors } from "@/lib/requests/model";

/**
 * "Nieuw verzoek". The request is submitted first and on its own, under an
 * id this form made once: pressing the button twice, or again after a
 * timeout, names the same intention and the server returns the request it
 * already made. Then the chosen files go to that request one by one. When
 * all of them arrive the customer lands on the request; when one does not,
 * the request is in and the form says which file to try again.
 */
export default function RequestForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [submissionId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState({ category: "", subject: "", description: "" });
  const [errors, setErrors] = useState<RequestErrors>({});
  const [state, setState] = useState<CreateRequestState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const requestId = state.status === "created" ? state.requestId : undefined;
  const uploads = useRequestUploads(customerId, requestId);

  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading || requestId) return;
    const found = validateRequest(normalizeRequest(values));
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`request-${first}`)?.focus();
      return;
    }

    const form = new FormData();
    form.set("customerId", customerId);
    form.set("submissionId", submissionId);
    for (const [key, value] of Object.entries(values)) form.set(key, value);

    startTransition(async () => {
      let result: CreateRequestState;
      try {
        result = await createRequestAction({ status: "idle" }, form);
      } catch {
        /* No answer -- a timeout, a dropped connection. Pressing again sends the same submission id: the server returns the request if it was made. */
        setState({ status: "error", message: "We kregen geen antwoord. Probeer het opnieuw; uw verzoek wordt niet dubbel ingediend." });
        return;
      }
      setState(result);
      if (result.status === "invalid") setErrors(result.errors);
      if (result.status !== "created") return;

      const queue = uploads.items.filter((item) => item.state === "waiting");
      if (queue.length === 0) {
        router.push(portalRequestPath(result.requestId));
        return;
      }
      setUploading(true);
      await uploads.start(result.requestId, queue);
      setUploading(false);
    });
  }

  const failed = uploads.items.filter((item) => item.state === "failed");
  const allDone = Boolean(requestId) && !uploading && uploads.items.length > 0 && failed.length === 0;
  useEffect(() => {
    if (allDone && requestId) router.push(portalRequestPath(requestId));
  }, [allDone, requestId, router]);

  const busy = pending || uploading;

  return (
    <form onSubmit={submit} noValidate className="mt-10 grid max-w-[40rem] gap-6">
      <div>
        <label htmlFor="request-category" className="block text-[0.88rem] text-ink">
          Categorie
        </label>
        <select
          id="request-category"
          value={values.category}
          onChange={set("category")}
          disabled={Boolean(requestId)}
          aria-invalid={errors.category ? true : undefined}
          className={`mt-1.5 min-h-11 w-full rounded-sm border bg-surface px-3 text-[0.95rem] text-ink outline-none focus:border-ink ${errors.category ? "border-danger" : "border-line"}`}
        >
          <option value="">Kies een categorie</option>
          {requestCategories.map((category) => (
            <option key={category} value={category}>
              {requestCategoryLabels[category]}
            </option>
          ))}
        </select>
        {errors.category ? <p className="mt-1.5 text-[0.85rem] text-danger">{errors.category}</p> : null}
      </div>

      <div>
        <label htmlFor="request-subject" className="block text-[0.88rem] text-ink">
          Onderwerp
        </label>
        <input
          id="request-subject"
          value={values.subject}
          onChange={set("subject")}
          maxLength={requestLimits.subject}
          disabled={Boolean(requestId)}
          aria-invalid={errors.subject ? true : undefined}
          className={`mt-1.5 min-h-11 w-full rounded-sm border bg-surface px-3 text-[0.95rem] text-ink outline-none focus:border-ink ${errors.subject ? "border-danger" : "border-line"}`}
        />
        {errors.subject ? <p className="mt-1.5 text-[0.85rem] text-danger">{errors.subject}</p> : null}
      </div>

      <div>
        <label htmlFor="request-description" className="block text-[0.88rem] text-ink">
          Omschrijving
        </label>
        <textarea
          id="request-description"
          value={values.description}
          onChange={set("description")}
          maxLength={requestLimits.description}
          rows={7}
          disabled={Boolean(requestId)}
          aria-invalid={errors.description ? true : undefined}
          className={`mt-1.5 w-full rounded-sm border bg-surface px-3 py-2.5 text-[0.95rem] leading-relaxed text-ink outline-none focus:border-ink ${errors.description ? "border-danger" : "border-line"}`}
        />
        <p className="mt-1.5 text-[0.82rem] text-muted">Wat wilt u, waar gaat het om, en is er een termijn of voorbeeld?</p>
        {errors.description ? <p className="mt-1.5 text-[0.85rem] text-danger">{errors.description}</p> : null}
      </div>

      <div>
        <FilePicker
          id="request-files"
          disabled={busy || Boolean(requestId)}
          remaining={attachmentRules.maxFiles - uploads.items.length}
          onFiles={(files) => uploads.add(files)}
        />
        <UploadList items={uploads.items} {...(requestId ? { onRetry: uploads.retry } : {})} onRemove={requestId ? undefined : uploads.remove} />
      </div>

      {requestId && failed.length > 0 && !uploading ? (
        <div role="alert" className="border-l-2 border-accent pl-4 text-[0.92rem] text-body">
          <p>Uw verzoek is ingediend. Niet alle bijlagen zijn aangekomen; probeer ze hierboven opnieuw of voeg ze later toe bij het verzoek.</p>
          <p className="mt-2">
            <Link href={portalRequestPath(requestId)} className="link-static text-ink">
              Naar uw verzoek
            </Link>
          </p>
        </div>
      ) : null}

      {state.status === "error" || state.status === "stale_customer" ? (
        <p role="alert" className="border-l-2 border-danger pl-4 text-[0.92rem] text-body">
          {state.message}
        </p>
      ) : null}

      {!requestId ? (
        <div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-5 text-[0.95rem] font-medium text-paper transition-opacity disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? "Bezig met indienen…" : "Verzoek indienen"}
          </button>
        </div>
      ) : uploading ? (
        <p className="text-[0.9rem] text-muted" role="status">
          Uw verzoek is ingediend; de bijlagen worden toegevoegd…
        </p>
      ) : null}
    </form>
  );
}
