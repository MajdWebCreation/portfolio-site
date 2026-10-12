"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FilePicker, UploadList, useRequestUploads } from "@/components/portal/request-uploads";
import { attachmentRules } from "@/lib/requests/model";

/**
 * Adding files to an open request from its page -- also the way back after
 * a file failed while the request was submitted. Each finished upload
 * refreshes the page, so the list above shows what is stored.
 */
export default function RequestAttachmentAdder({ customerId, requestId, existing }: { customerId: string; requestId: string; existing: number }) {
  const router = useRouter();
  const uploads = useRequestUploads(customerId, requestId);
  const busy = uploads.items.some((item) => item.state === "uploading" || item.state === "waiting");
  const done = uploads.items.filter((item) => item.state === "done").length;

  useEffect(() => {
    if (done > 0) router.refresh();
  }, [done, router]);

  const remaining = attachmentRules.maxFiles - existing - uploads.items.filter((item) => item.state !== "failed" && item.state !== "done").length;

  return (
    <div className="mt-6">
      <FilePicker
        id="request-add-files"
        label="Bijlage toevoegen"
        disabled={busy}
        remaining={remaining}
        onFiles={(files) => {
          const queued = uploads.add(files);
          void uploads.start(requestId, queued);
        }}
      />
      <UploadList items={uploads.items.filter((item) => item.state !== "done")} onRetry={uploads.retry} onRemove={uploads.remove} />
    </div>
  );
}
