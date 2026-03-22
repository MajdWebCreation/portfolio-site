import { NextResponse, type NextRequest } from "next/server";

const LOCALE_HEADER = "x-ym-locale";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  const locale = pathname.startsWith("/nl") ? "nl" : "en";

  requestHeaders.set(LOCALE_HEADER, locale);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
