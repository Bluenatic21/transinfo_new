// src/app/layout.tsx
import "./globals.css";
import "./styles/theme.css";
import type { Metadata } from "next";

// Шрифты Geist (актуальные подпути)
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import Providers from "./providers";
import "leaflet/dist/leaflet.css";
import { cookies, headers } from "next/headers";
import { type Locale, normalizeLocale, DEFAULT_LOCALE } from "./i18n/locales";
import "./styles/mobile-form.css";

import CallOverlay from "./components/CallOverlay";
import BootLoaderClient from "./components/BootLoaderClient";
import RouteLoader from "./components/RouteLoader";
import ClientOnly from "./components/ClientOnly";
import MonitoringSoonGuard from "./profile/MonitoringSoonGuard";
import AuthGate from "./components/AuthGate";
import GlobalEnvClient from "./components/GlobalEnvClient";
import { API_BASE } from "@/config/env";

// Серверно-безопасная локализация единственной строки boot-экрана
const BOOT_I18N: Record<Locale, string> = {
  ka: "იტვირთება…",
  ru: "Загрузка…",
  en: "Loading…",
  tr: "Yükleniyor…",
  az: "Yüklənir…",
  hy: "Բեռնվում է…",
};

export const metadata: Metadata = {
  title: "Transinfo",
  description: "Logistics platform & messenger",
  icons: { icon: "/favicon.ico" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const hdrs = await headers();
  const rawLangCookie = cookieStore.get("lang")?.value || null;

  const accept = hdrs.get("accept-language") || "";
  const pickFromAccept = (al: string): Locale | null => {
    const supported = ["ka", "ru", "en", "tr", "az", "hy"];
    const list = al.split(",").map((s) => s.trim().split(";")[0].toLowerCase());
    const hit = list.map((code) => code.slice(0, 2)).find((code) => supported.includes(code));
    return (hit as Locale) ?? null;
  };

  const chosen: Locale = normalizeLocale(
    rawLangCookie ?? pickFromAccept(accept) ?? DEFAULT_LOCALE
  );

  return (
    <html
      lang={chosen}
      data-booting="1"
      data-theme="light"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="light dark" />
        {/* Ранняя инициализация глобальной переменной для легаси-кода */}
        <script
          // Важно: выполняется до гидратации клиентских бандлов
          dangerouslySetInnerHTML={{
            __html: `window.API_URL=${JSON.stringify(API_BASE)};`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        data-theme="light"
        className="antialiased min-h-[100dvh] bg-bg text-fg overflow-x-hidden"
      >
        {/* Boot‑loader первого кадра */}
        <div id="boot-loader" aria-hidden="true">
          <div className="boot-spinner">
            <span className="boot-dot" />
            <span className="boot-dot" />
            <span className="boot-dot" />
          </div>
          <p className="boot-text" data-i18n="common.loading">
            {BOOT_I18N[chosen] ?? BOOT_I18N[DEFAULT_LOCALE]}
          </p>
        </div>

        {/* Снимаем флаг boot‑экрана после маунта */}
        <BootLoaderClient />

        {/* Дублируем установку window.API_URL на всякий случай */}
        <GlobalEnvClient />

        {/* Тонкая полоска прогресса при навигации */}
        <RouteLoader />

        <Providers initialLang={chosen}>
          <div id="providers-root">
            <div
              id="page-root"
              suppressHydrationWarning
              className="min-h-[100dvh] md:min-h-screen md:pb-0 pb-[calc(64px+env(safe-area-inset-bottom))]"
            >
              <ClientOnly>{children}</ClientOnly>
            </div>

            {/* Независимые client-only блоки — корректная вложенность */}
            <ClientOnly>
              <CallOverlay />
            </ClientOnly>

            <ClientOnly>
              <AuthGate />
            </ClientOnly>

            <ClientOnly>
              <MonitoringSoonGuard />
            </ClientOnly>
          </div>
        </Providers>

        {/* Корень для порталов (модалки/шиты) */}
        <div id="modal-root" />
      </body>
    </html>
  );
}

// ---- staging-only dynamic overrides ----
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const dynamicParams = true;
// ----------------------------------------
