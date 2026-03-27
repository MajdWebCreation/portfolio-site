"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "ym-theme";

function getResolvedTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getResolvedTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function applyTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  const isLight = theme === "light";
  const nextTheme: Theme = isLight ? "dark" : "light";
  const icon = isLight ? "Sun" : "Moon";

  return (
    <div className="fixed bottom-4 left-4 z-40 md:bottom-6 md:left-6">
      <button
        type="button"
        onClick={() => applyTheme(nextTheme)}
        aria-label={`Switch to ${nextTheme} mode`}
        title={`Switch to ${nextTheme} mode`}
        className="group inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[var(--background-elevated)]/92 px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-[0_12px_26px_rgba(36,60,84,0.12)] backdrop-blur-sm transition hover:border-[color:var(--line-strong)] hover:shadow-[0_14px_30px_rgba(36,60,84,0.16)]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--background)] text-[0.72rem] text-[var(--accent-text)] transition group-hover:border-[color:var(--line-strong)]">
          {isLight ? "☼" : "◐"}
        </span>
        <span className="pr-1 text-[0.72rem] uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
          {icon}
        </span>
      </button>
    </div>
  );
}
