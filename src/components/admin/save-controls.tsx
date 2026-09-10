"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AdminButton from "@/components/admin/admin-button";
import type { ActionResult } from "@/lib/admin/action-result";
import { formatDateTime } from "@/lib/admin/format";

/**
 * Running an admin server action from a client component: one place for the
 * pending state, the error message and the refresh, so every editor in the
 * admin behaves the same and none of them invents its own.
 *
 * `router.refresh()` re-renders the server components with the stored record,
 * so what the screen shows after a save is what the database holds.
 */
export function useSave() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function save<T>(action: () => Promise<ActionResult<T>>, onSaved?: (value: T) => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date().toISOString());
      router.refresh();
      onSaved?.(result.value as T);
    });
  }

  return { save, pending, error, savedAt };
}

type SaveControlsProps = {
  label: string;
  pending: boolean;
  error: string | null;
  savedAt: string | null;
  onSave: () => void;
  /** Nothing to save yet; the button stays visible but inactive. */
  disabled?: boolean;
  className?: string;
};

/** Save button with its result, used by every editor in the admin. */
export default function SaveControls({ label, pending, error, savedAt, onSave, disabled, className = "" }: SaveControlsProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <AdminButton onClick={onSave} disabled={pending || disabled} className="w-full">
        {pending ? "Opslaan…" : label}
      </AdminButton>
      {error ? (
        <p role="alert" className="border-l-2 border-danger pl-3 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : savedAt ? (
        <p className="text-[0.85rem] text-muted">Opgeslagen {formatDateTime(savedAt)}</p>
      ) : null}
    </div>
  );
}
