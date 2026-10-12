"use client";

import { useState, useTransition } from "react";
import AdminButton from "@/components/admin/admin-button";
import { SelectField } from "@/components/admin/form-field";
import { linkRequest, setRequestStatus } from "@/lib/admin/requests/actions";
import { requestStatuses, requestStatusAdminLabels, type RequestStatus } from "@/lib/requests/model";

/**
 * The admin's controls on one request: its status, and its project and
 * quote. Each saves on its own; the answer says what happened, including a
 * status update mail that could not be sent.
 */
export default function RequestControls({
  requestId,
  status,
  projectId,
  quoteId,
  projects,
  quotes,
}: {
  requestId: string;
  status: RequestStatus;
  projectId?: string;
  quoteId?: string;
  projects: { id: string; name: string }[];
  quotes: { id: string; label: string }[];
}) {
  const [nextStatus, setNextStatus] = useState<string>(status);
  const [project, setProject] = useState(projectId ?? "");
  const [quote, setQuote] = useState(quoteId ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "muted"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function saveStatus() {
    startTransition(async () => {
      const result = await setRequestStatus(requestId, nextStatus);
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      if (!result.value.changed) return setMessage({ tone: "muted", text: "De status was al zo." });
      const mail = result.value.mail;
      setMessage(
        mail?.sent
          ? { tone: "success", text: "Status opgeslagen; de klant heeft een update gekregen." }
          : { tone: "danger", text: `Status opgeslagen, maar de mail aan de klant is niet verstuurd: ${(mail?.reason ?? "onbekende fout").replace(/\.$/, "")}.` },
      );
    });
  }

  function saveLinks() {
    startTransition(async () => {
      const result = await linkRequest(requestId, { projectId: project || null, quoteId: quote || null });
      setMessage(result.ok ? { tone: "success", text: "Koppelingen opgeslagen." } : { tone: "danger", text: result.error });
    });
  }

  return (
    <div className="grid max-w-[40rem] gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <SelectField id="request-status" label="Status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
            {requestStatuses.map((value) => (
              <option key={value} value={value}>
                {requestStatusAdminLabels[value]}
              </option>
            ))}
          </SelectField>
        </div>
        <AdminButton onClick={saveStatus} disabled={pending || nextStatus === status}>
          Status opslaan
        </AdminButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="request-project" label="Project" optional value={project} onChange={(event) => setProject(event.target.value)}>
          <option value="">Geen project</option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField id="request-quote" label="Offerte" optional value={quote} onChange={(event) => setQuote(event.target.value)} hint="De klant ziet de offerte pas als die verzonden is.">
          <option value="">Geen offerte</option>
          {quotes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </SelectField>
      </div>
      <div>
        <AdminButton variant="secondary" onClick={saveLinks} disabled={pending || (project === (projectId ?? "") && quote === (quoteId ?? ""))}>
          Koppelingen opslaan
        </AdminButton>
      </div>

      {message ? (
        <p role="status" className={`text-[0.9rem] ${message.tone === "success" ? "text-success" : message.tone === "danger" ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
