import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PAGES = ["/login", "/setup"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defence for state-changing API calls: the request must come from this site.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !pathname.startsWith("/api/cron/")) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }

  if (pathname.startsWith("/api/") || PUBLIC_PAGES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  // Cheap check here; the real session validation happens server-side on every page and API call.
  if (!req.cookies.get("mystore_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|email-logo.png|favicon-32.png|apple-touch-icon.png|icon-192.png|icon-512.png|manifest.webmanifest).*)"],
};
