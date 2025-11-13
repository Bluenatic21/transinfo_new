// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LOCALE } from "./src/app/i18n/locales";

const SUPPORTED = ["ka", "ru", "en", "tr", "az", "hy"] as const;

// Любые статические файлы (отдаются напрямую из /public или как ассеты)
const PUBLIC_FILE =
  /\.(?:png|jpg|jpeg|webp|gif|svg|ico|txt|xml|json|map|css|js|mjs|cjs|woff|woff2|ttf|otf|eot|mp3|wav|mp4|webm)$/i;

function pickFromAccept(accept: string): string {
  const list = accept.split(",").map((s) => s.trim().split(";")[0].toLowerCase());
  const hit = list.map((c) => c.slice(0, 2)).find((c) => (SUPPORTED as readonly string[]).includes(c));
  return hit || DEFAULT_LOCALE; // дефолт — ka
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Системные и статические пути пропускаем БЕЗ изменений
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/assets/") || // если есть собственная папка ассетов
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname === "/auth") {
    const q = req.nextUrl.searchParams;
    const tok = q.get("token") || q.get("access_token");
    const isRecovery = q.get("type") === "recovery";
    if (tok || isRecovery) {
      // ХОСТ БЕРЁМ ИЗ req.url (через прокси), чтобы не было https://localhost:3001
      const redirect = new URL("/auth/reset", req.url);
      redirect.search = "";
      if (tok) redirect.searchParams.set("token", tok);
      return NextResponse.redirect(redirect, 307);
    }
  }


   // 1.1) Восстановление пароля — всегда доступно и не редиректим его никуда
  if (pathname.startsWith("/auth/reset")) {
    return NextResponse.next();
  }


  // 2) Устанавливаем cookie языка, если отсутствует/некорректна
  const res = NextResponse.next();
  const has = req.cookies.get("lang")?.value?.toLowerCase();
  if (!has || !(SUPPORTED as readonly string[]).includes(has)) {
    const fromBrowser = pickFromAccept(req.headers.get("accept-language") || "");
    res.cookies.set("lang", fromBrowser, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 год
      httpOnly: false,
      sameSite: "lax",
    });
  }

  return res;
}

// 3) Matcher: middleware НЕ вызывается для _next, api и любых путей с точкой (включая файлы из /public)
export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
