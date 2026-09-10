"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import AdminNavList from "@/components/admin/admin-nav-list";
import SignOutButton from "@/components/admin/sign-out-button";
import BrandMark from "@/components/brand-mark";
import type { AdminIdentity } from "@/lib/admin/auth";
import { adminRoot } from "@/lib/admin/modules";
import { lockPageScroll } from "@/lib/scroll-lock";

/**
 * Top bar and menu below lg. The menu is a full-viewport overlay with the
 * same structure as the public mobile menu: a bar that never scrolls, a
 * scrollable module list and a footer, with page scrolling locked meanwhile.
 */
export default function AdminMobileNav({ admin }: { admin: AdminIdentity }) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const panelId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const openButton = openButtonRef.current;
    const unlock = lockPageScroll();
    closeButtonRef.current?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedOn(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlock();
      if (openButton?.isConnected) {
        openButton.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const buttonClass =
    "-mr-2 inline-flex min-h-11 items-center gap-3 px-2 text-[0.95rem] font-medium text-ink";

  return (
    <div className="sticky top-0 z-40 border-b border-line bg-paper lg:hidden">
      <div className="flex h-14 items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandMark href={adminRoot} className="h-7 w-[98px]" label="YM Creations admin" />
          <span className="label-mono mt-0.5 text-faint">Admin</span>
        </div>
        <button
          ref={openButtonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpenedOn(pathname)}
          className={buttonClass}
        >
          <span>Menu</span>
          <span aria-hidden="true" className="relative block h-3 w-5">
            <span className="absolute left-0 top-0 block h-px w-5 bg-ink" />
            <span className="absolute bottom-0 left-0 block h-px w-5 bg-ink" />
          </span>
        </button>
      </div>

      <div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-0 z-50 flex h-dvh flex-col bg-paper transition-[opacity,transform] duration-300 ease-out ${
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="flex-none border-b border-line bg-paper pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <BrandMark href={adminRoot} className="h-7 w-[98px]" label="YM Creations admin" />
              <span className="label-mono mt-0.5 text-faint">Admin</span>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-controls={panelId}
              onClick={() => setOpenedOn(null)}
              className={buttonClass}
            >
              <span>Sluiten</span>
              <span aria-hidden="true" className="relative block h-3 w-5">
                <span className="absolute left-0 top-0 block h-px w-5 translate-y-[5.5px] rotate-45 bg-ink" />
                <span className="absolute bottom-0 left-0 block h-px w-5 -translate-y-[5.5px] -rotate-45 bg-ink" />
              </span>
            </button>
          </div>
        </div>

        <nav
          aria-label="Adminnavigatie"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 sm:px-8"
        >
          <AdminNavList size="large" onNavigate={() => setOpenedOn(null)} />
        </nav>

        <div className="flex flex-none items-center justify-between gap-4 border-t border-line px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-[0.85rem] sm:px-8">
          <p className="min-w-0 truncate text-muted">{admin.displayName ?? admin.email ?? "Beheerder"}</p>
          <div className="flex flex-none items-center gap-4">
            <Link href="/nl" onClick={() => setOpenedOn(null)} className="link-static text-ink">
              Website
            </Link>
            <SignOutButton />
          </div>
        </div>
      </div>
    </div>
  );
}
