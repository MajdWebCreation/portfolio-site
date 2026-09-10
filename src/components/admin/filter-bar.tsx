import type { ReactNode } from "react";
import { inputClass } from "@/components/admin/form-field";

/** Row of filter controls above a list. */
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-end gap-x-4 gap-y-3">
      {children}
    </div>
  );
}

export function SearchField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="w-full sm:w-64">
      <label htmlFor={id} className="label-mono mb-1.5 block">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputClass} min-h-10 py-1.5`}
      />
    </div>
  );
}

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-w-[10rem] flex-1 sm:flex-none">
      <label htmlFor={id} className="label-mono mb-1.5 block">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} min-h-10 py-1.5`}
      >
        {children}
      </select>
    </div>
  );
}

/** Radio group styled as segments; one option is always chosen. */
export function SegmentedField<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="label-mono mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-sm border border-line bg-surface p-1">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block cursor-pointer rounded-xs px-3 py-1.5 text-[0.88rem] font-medium text-muted transition-colors peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent hover:text-ink">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
