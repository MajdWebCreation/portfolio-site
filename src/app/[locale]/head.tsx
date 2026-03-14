import { getLocaleContent } from "@/lib/get-locale-content";

export default async function Head({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { locale: safeLocale, content } = getLocaleContent(locale);

  return (
    <>
      <title>{content.meta.title}</title>
      <meta name="description" content={content.meta.description} />
      <html lang={safeLocale} />
    </>
  );
}