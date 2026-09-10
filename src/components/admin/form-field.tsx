import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Marks the field as optional in the label; everything else is required. */
  optional?: boolean;
};

export const inputClass =
  "min-h-11 w-full rounded-sm border border-line bg-surface px-3 py-2 text-[0.95rem] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink aria-[invalid=true]:border-danger";

function Wrapper({ id, label, error, hint, optional, children }: FieldProps & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label-mono mb-1.5 flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {optional ? <span className="normal-case tracking-normal text-faint">optioneel</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.82rem] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.85rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function TextField({ id, label, error, hint, optional, className = "", ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} optional={optional}>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        required={!optional && props.required !== false}
        className={`${inputClass} ${className}`}
        {...props}
      />
    </Wrapper>
  );
}

export function SelectField({ id, label, error, hint, optional, className = "", children, ...props }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} optional={optional}>
      <select
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass} ${className}`}
        {...props}
      >
        {children}
      </select>
    </Wrapper>
  );
}

export function TextareaField({ id, label, error, hint, optional, className = "", ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} optional={optional}>
      <textarea
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass} min-h-28 leading-relaxed ${className}`}
        {...props}
      />
    </Wrapper>
  );
}
