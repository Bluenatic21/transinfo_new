"use client";

import { motion } from "framer-motion";
import { useLang } from "../i18n/LangProvider";

export default function CompactHero({
    title,
    subtitle,
    stats, // { index, cargos, trucks, users, tenders }
    onFindCargo,
    onFindTransport,
    hideText = false,
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
                {!hideText && (
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
                )}

                {/* Метрики — компактный блок сразу под навигацией, центрированный в ширине карты */}
                <div className="mt-5 md:mt-6 xl:mt-7 mb-1">
                    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6">
                        <div className="flex justify-center">
                            <div className="w-full rounded-xl bg-white shadow-[0_8px_28px_rgba(0,0,0,0.12)] ring-1 ring-slate-200 px-3 py-2 md:px-5 md:py-4 backdrop-blur-[2px] dark:bg-white/[0.04] dark:ring-white/5 dark:shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 gap-y-1.5 text-left md:text-center">
                                    <Metric label={t("hero.metric.index", "TransInfo-Индекс")} value={s.index} />
                                    <Metric label={t("hero.metric.cargos", "Грузы")} value={s.cargos} />
                                    <Metric label={t("hero.metric.trucks", "Машины")} value={s.trucks} />
                                    <Metric label={t("hero.metric.users", "Участники")} value={s.users} />
                                    <Metric label={t("hero.metric.tenders", "Тендеры")} value={s.tenders} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Деликатные разделители для ровного стыка секций */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-slate-200 dark:bg-white/5" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-slate-200 dark:bg-white/5" />
        </section>
    );
}

function Metric({ label, value }) {
    const color = "text-[#1e3a8a] dark:text-[#8bc0ff]";

    return (
        <div className="flex flex-col items-start md:items-center leading-tight">
            <div className={`text-[16px] md:text-[17px] font-extrabold ${color}`}>{value ?? "—"}</div>
            <div className="text-[11.5px] text-slate-600 dark:text-[#9fb0d5]">{label}</div>
        </div>
    );
}
