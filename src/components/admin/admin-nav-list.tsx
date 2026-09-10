"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  adminModules,
  getAdminModulePath,
  isAdminPathActive,
} from "@/lib/admin/modules";

type AdminNavListProps = {
  /** Called after a link is chosen, so an overlay can close. */
  onNavigate?: () => void;
  /** Larger rows for the mobile overlay. */
  size?: "compact" | "large";
};

/**
 * The module list used by both the sidebar and the mobile menu. A planned
 * module (none since phase 3) would be set in muted ink with a dot.
 */
export default function AdminNavList({ onNavigate, size = "compact" }: AdminNavListProps) {
  const pathname = usePathname();

  return (
    <ul className={size === "large" ? "" : "space-y-0.5"}>
      {adminModules.map((module) => {
        const active = isAdminPathActive(pathname, module);
        const planned = module.status === "planned";
        const base =
          size === "large"
            ? "flex min-h-14 items-center justify-between gap-4 border-b border-line text-[1.25rem] font-medium tracking-[-0.01em]"
            : "flex min-h-9 items-center justify-between gap-3 rounded-xs px-2.5 text-[0.95rem]";
        const state = active
          ? size === "large"
            ? "text-accent"
            : "bg-ink font-medium text-paper"
          : planned
            ? "text-muted hover:text-ink"
            : "text-ink hover:bg-paper-deep";

        return (
          <li key={module.key}>
            <Link
              href={getAdminModulePath(module)}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`${base} ${state} transition-colors duration-150`}
            >
              <span className="truncate">{module.label}</span>
              {size === "large" ? (
                <span aria-hidden="true" className="text-faint">
                  →
                </span>
              ) : planned ? (
                <span
                  aria-hidden="true"
                  className={`block h-[5px] w-[5px] shrink-0 rounded-full ${
                    active ? "bg-paper/60" : "bg-line-strong"
                  }`}
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
