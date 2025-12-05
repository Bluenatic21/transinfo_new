// app/not-found.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLang } from "./i18n/LangProvider";

/** Синхронизируем высоту header/footer в CSS-переменные */
function SyncHeaderFooterSize() {
    useEffect(() => {
        const set = () => {
            const header = document.querySelector("header") as HTMLElement | null;
            const footer = document.querySelector("footer") as HTMLElement | null;
            document.documentElement.style.setProperty("--header-h", `${header?.offsetHeight ?? 0}px`);
            document.documentElement.style.setProperty("--footer-h", `${footer?.offsetHeight ?? 0}px`);
        };
        set();
        const ro = new ResizeObserver(set);
        const header = document.querySelector("header") as HTMLElement | null;
        const footer = document.querySelector("footer") as HTMLElement | null;
        header && ro.observe(header);
        footer && ro.observe(footer);
        window.addEventListener("resize", set);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", set);
        };
    }, []);
    return null;
}

export default function NotFound() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    return (
        <>
            <SyncHeaderFooterSize />

            {/* === ФОН: закрывает всё между header и footer, поверх «синего» бэкграунда сайта === */}
            <div
                aria-hidden
                className="
          fixed inset-x-0
          top-[var(--header-h,0px)]
          bottom-[var(--footer-h,0px)]
          -z-10 pointer-events-none
        "
            >
                {/* Картинка (dark) */}
                <div
                    className="
            hidden dark:block absolute inset-0
            bg-[#0b0f14] bg-no-repeat bg-cover
            bg-center md:bg-right
            bg-[url('/img/404-dark.webp')]
          "
                />
                {/* Картинка (light) */}
                <div
                    className="
            block dark:hidden absolute inset-0
            bg-white bg-no-repeat bg-cover
            bg-center md:bg-right
            bg-[url('/img/404-light.webp')]
          "
                />
                {/* Плавное «слияние» с темой + читаемость текста слева */}
                <div className="hidden dark:block absolute inset-0 bg-gradient-to-r from-[#0b0f14] via-[#0b0f14]/75 to-transparent" />
                <div className="block dark:hidden absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent" />
                {/* Лёгкая виньетка, чтобы края не «резались» */}
                <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_50%,rgba(0,0,0,0.35),transparent_60%)] dark:bg-[radial-gradient(120%_80%_at_0%_50%,rgba(0,0,0,0.55),transparent_60%)]" />
            </div>

            {/* === КОНТЕНТ === */}
            <main
                className="
          relative isolate
          min-h-[calc(100dvh-var(--header-h,0px)-var(--footer-h,0px))]
          text-slate-900 dark:text-slate-100
        "
            >
                <section className="mx-auto w-full max-w-6xl px-6 md:px-8 py-14 md:py-20">
                    <div className="max-w-2xl">
                        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
                            {t("notFound.title", "Страница не найдена")}
                        </h1>

                        <p className="mt-5 text-base md:text-lg text-slate-700 dark:text-slate-200/90 drop-shadow">
                            {t("notFound.desc", "Запрошенная страница недоступна. Похоже, наш погрузчик свернул не туда — пересчитываем маршрут.")}
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                href="/"
                                className="inline-flex items-center rounded-xl px-5 py-3 bg-[#2563eb] text-white hover:opacity-90 transition"
                            >
                                {t("notFound.home", "На главную")}
                            </Link>
                            <Link
                                href="/orders"
                                className="inline-flex items-center rounded-xl px-5 py-3 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                            >
                                {t("notFound.orders", "Заявки")}
                            </Link>
                            <Link
                                href="/support"
                                className="inline-flex items-center rounded-xl px-5 py-3 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                            >
                                {t("notFound.support", "Поддержка")}
                            </Link>
                        </div>

                        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                            {t("notFound.codeLabel", "Код события")}: <span className="font-mono">404_ROUTE_LOST</span>
                        </p>
                    </div>
                </section>

                {/* (опционально) короткий оверлей справа на самой сцене */}
                {/* <div className="hidden md:block absolute right-8 top-8 max-w-[40ch] text-right">
          <h2 className="text-xl font-semibold drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]">Lost in the warehouse?</h2>
          <p className="mt-2 text-sm text-slate-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
            Маршрут прервался. Используйте действия слева, чтобы быстро вернуться к работе.
          </p>
        </div> */}
            </main>
        </>
    );
}
