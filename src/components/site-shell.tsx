import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import type { Locale, SiteContent } from "@/lib/content/site-content";

type SiteShellProps = {
  locale: Locale;
  content: SiteContent;
  currentPath: string;
  children: React.ReactNode;
};

export default function SiteShell({
  locale,
  content,
  currentPath,
  children,
}: SiteShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-body">
      <SiteHeader locale={locale} content={content} currentPath={currentPath} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter locale={locale} content={content} currentPath={currentPath} />
    </div>
  );
}
