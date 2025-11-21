"use client";

import { motion } from "framer-motion";
import { useLang } from "../i18n/LangProvider";

export default function CompactHero({
    title,
    subtitle,
    stats, // { index, cargos, trucks, users, tenders }
    onFindCargo,
    onFindTransport,
}) {
    const { t } = useLang();
    const s = stats || {};
    const titleText = title ?? t("hero.title", "Интеллектуальная платформа для грузоперевозок");
    const subtitleText = subtitle ?? t("hero.subtitle", "Умный подбор грузов и транспорта по маршруту, дате и геолокации. Всё работает в реальном времени — быстро, удобно и прозрачно.");

    return (
        <section
            id="hero"
            className="relative py-6 md:py-5 xl:py-4"
            aria-label="Hero"
            style={{ color: "var(--text-primary)" }}
        >
            <div className="mx-auto max-w-7xl px-6">
                {/* Заголовок и подзаголовок — компактно и аккуратно */}
                <div className="text-center text-slate-900 dark:text-white">
                    <motion.h1
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="text-[26px] md:text-[30px] font-extrabold tracking-tight"
                        style={{ color: "var(--text-primary)" }}
                    >
                        {titleText}
                    </motion.h1>

                    {/* Тонкий акцент-бар под заголовком */}
                    <div
                        aria-hidden
                        className="mx-auto mt-2 h-[2px] w-16 rounded-full bg-gradient-to-r from-cyan-300/70 via-cyan-200 to-cyan-300/70"
                    />

                    {subtitleText && (
                        <p
                            className="mt-2 text-[14.5px] md:text-[15px] leading-relaxed max-w-3xl mx-auto"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            {subtitleText}
                        </p>
                    )}
                </div>

                {/* Метрики — БЕЗ анимации, сразу видимы при загрузке */}
                <div className="mt-4">
                    <div className="mx-auto max-w-5xl rounded-2xl bg-white shadow-[0_6px_24px_rgba(0,0,0,0.12)] ring-1 ring-slate-200 px-3.5 py-2.5 md:px-5 md:py-3.5 backdrop-blur-[2px] dark:bg-white/[0.04] dark:ring-white/5 dark:shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2 text-center">
                            <Metric label={t("hero.metric.index", "TransInfo-Индекс")} value={s.index} />
                            <Metric label={t("hero.metric.cargos", "Грузы")} value={s.cargos} accent="orange" />
                            <Metric label={t("hero.metric.trucks", "Машины")} value={s.trucks} />
                            <Metric label={t("hero.metric.users", "Участники")} value={s.users} />
                            <Metric label={t("hero.metric.tenders", "Тендеры")} value={s.tenders} accent="violet" />
                        </div>
                    </div>
                </div>

                {/* CTA — компактно на одной линии */}
                <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={onFindCargo}
                        className="rounded-xl px-4 md:px-5 py-2.5 text-[15px] font-semibold
                       bg-gradient-to-r from-[#1fb6ff] to-[#54d1ff] text-[#0b1222]
                       shadow-[0_6px_24px_rgba(0,0,0,0.35)] hover:opacity-95 active:translate-y-[1px]
                       ring-1 ring-cyan-300/40"
                    >
                        {t("hero.cta.findCargo", "Найти груз")}
                    </button>
                    <button
                        type="button"
                        onClick={onFindTransport}
                        className="rounded-xl px-4 md:px-5 py-2.5 text-[15px] font-semibold
                       bg-gradient-to-r from-[#2ea9ff] to-[#71c6ff] text-[#0b1222]
                       shadow-[0_6px_24px_rgba(0,0,0,0.35)] hover:opacity-95 active:translate-y-[1px]
                       ring-1 ring-cyan-300/40"
                    >
                        {t("hero.cta.findTransport", "Найти транспорт")}
                    </button>
                </div>
            </div>

            {/* Деликатные разделители для ровного стыка секций */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-slate-200 dark:bg-white/5" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-slate-200 dark:bg-white/5" />
        </section>
    );
}

function Metric({ label, value, accent }) {
    const color =
        accent === "orange"
            ? "text-[#ffae5a]"
            : accent === "violet"
                ? "text-[#c29cff]"
                : "text-[#4ee6b6]";

    return (
        <div className="flex flex-col items-center">
            <div className={`text-[18px] md:text-[19px] font-extrabold ${color}`}>{value ?? "—"}</div>
            <div className="text-[12.5px] text-slate-600 dark:text-[#9fb0d5]">{label}</div>
        </div>
    );
}
