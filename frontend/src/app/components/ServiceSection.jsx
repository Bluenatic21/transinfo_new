"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";

export default function ServiceSection() {
    const { t } = useLang();
    const { resolvedTheme } = useTheme();
    const isLight = resolvedTheme === "light";
    const items = [
        {
            title: t("landing.service.1.title", "🔍 Интеллектуальная система подбора"),
            text: t("landing.service.1.text", "Наша платформа автоматически сопоставляет грузы и транспорт по маршруту, дате, типу кузова, радиусу поиска и даже текущей геолокации. Вы получаете только релевантные предложения, которые максимально соответствуют вашим требованиям — без ручной фильтрации."),
            img: isLight ? "/landing/match-light.png" : "/landing/match.webp"
        },
        {
            title: t("landing.service.2.title", "⚡ Работа в реальном времени"),
            text: t("landing.service.2.text", "Все обновления происходят мгновенно: новые заявки, изменения маршрутов, статус доставки или сообщения в чате. Платформа синхронизирует данные между пользователями без задержек."),
            img: isLight ? "/landing/realtime-light.png" : "/landing/realtime.webp"
        },
        {
            title: t("landing.service.3.title", "🗺 Умная карта и геоаналитика"),
            text: t("landing.service.3.text", "Мы используем кластеризацию и интеллектуальные подсказки на карте: группировка заявок по регионам, выделение оптимальных маршрутов, фильтр по радиусу и ключевым точкам. Это помогает видеть картину целиком и быстро находить наиболее подходящие варианты."),
            img: isLight ? "/landing/map-light.png" : "/landing/map.webp"
        },
        {
            title: t("landing.service.4.title", "🔔 Автоматические уведомления о новых предложениях"),
            text: t("landing.service.4.text", "Вам не нужно часами сидеть в поиске. Как только появляется груз или транспорт, соответствующий вашим критериям, система сразу уведомляет вас."),
            img: isLight ? "/landing/notify-light.png" : "/landing/notify.webp"
        },
        {
            title: t("landing.service.5.title", "🛡 Безопасность и контроль сделок"),
            text: t("landing.service.5.text", "Мы исключаем “серые” схемы: валидация пользователей, фиксация всех этапов сделки, защита файлов и переписок. Это делает платформу надежным инструментом для бизнеса."),
            img: isLight ? "/landing/security-light.png" : "/landing/security.webp"
        },
        {
            title: t("landing.service.6.title", "👥 Многоуровневая система ролей"),
            text: t("landing.service.6.text", "В одной учётной записи можно управлять разными ролями: грузовладелец, перевозчик или экспедитор. Это удобно для компаний, где несколько сотрудников работают в одной системе с разными правами доступа."),
            img: isLight ? "/landing/roles-light.png" : "/landing/roles.webp"
        },
        {
            title: t("landing.service.7.title", "🌍 Гибкость и масштабируемость"),
            text: t("landing.service.7.text", "Transinfo одинаково хорошо работает для локальных перевозок и международной логистики. Система готова к росту: чем больше заявок и транспорта — тем эффективнее работает механизм интеллектуального подбора."),
            img: isLight ? "/landing/global-light.png" : "/landing/global.webp"
        },
    ];

    return (
        // Наследуем фон страницы, чтобы не было скачков
        <section id="service" className="relative py-24">
            {/* Едва заметные разделители сверху/снизу для мягкого стыка секций */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-200 dark:bg-[rgba(255,255,255,0.06)]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-slate-200 dark:bg-[rgba(255,255,255,0.06)]"
            />

            <div className="relative mx-auto max-w-7xl px-6 space-y-28">
                {items.map((it, i) => (
                    <motion.div
                        key={it.title}
                        initial={{ opacity: 0, y: 48, scale: 0.96 }}
                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                        viewport={{ once: true, amount: 0.25 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className={`grid items-center gap-10 md:gap-14 md:grid-cols-2 ${i % 2 ? "md:[&>div:first-child]:order-2" : ""
                            }`}
                    >
                        {/* Текст */}
                        <div className="text-slate-900 dark:text-white">
                            <h3 className="text-2xl md:text-3xl font-bold mb-3">{it.title}</h3>
                            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-[#b9c7e6]">
                                {it.text}
                            </p>
                        </div>

                        {/* Иллюстрация с мягким приближением при появлении */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true, amount: 0.35 }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                            className="relative flex justify-center"
                        >
                            <Image
                                src={it.img}
                                alt={it.title}
                                width={720}
                                height={480}
                                priority={i < 2}
                                {...(i >= 2 ? { loading: "lazy" } : {})}
                                sizes="(max-width: 768px) 100vw, 720px"
                                className="rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
                            />
                        </motion.div>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
