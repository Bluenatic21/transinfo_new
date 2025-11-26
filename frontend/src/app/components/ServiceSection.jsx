"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";

export default function ServiceSection({ compact = false }) {
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

    const visibleItems = items;

    if (compact) {
        return (
            <section id="service" className="relative" style={{ color: "var(--text-primary)" }}>
                <div className="service-compact-grid">
                    {visibleItems.map((it, i) => (
                        <motion.div
                            key={it.title}
                            initial={{ opacity: 0, y: 14 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.3 }}
                            transition={{ duration: 0.35, ease: "easeOut", delay: i * 0.04 }}
                            className="service-compact-card"
                        >
                            <div className="service-compact-visual">
                                <Image
                                    src={it.img}
                                    alt={it.title}
                                    width={240}
                                    height={160}
                                    quality={95}
                                    sizes="240px"
                                    className="rounded-lg"
                                    loading={i === 0 ? "eager" : "lazy"}
                                />
                            </div>
                            <div className="service-compact-text">
                                <h3 className="service-compact-title">{it.title}</h3>
                                <p className="service-compact-desc">{it.text}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <style jsx>{`
                    .service-compact-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: clamp(12px, 1.5vw, 18px);
                    }
                    .service-compact-card {
                        display: flex;
                        flex-direction: column;
                        align-items: stretch;
                        gap: 12px;
                        padding: 12px 14px;
                        border-radius: 12px;
                        background: linear-gradient(145deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
                        border: 1px solid rgba(255,255,255,0.05);
                        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.16);
                        backdrop-filter: blur(4px);
                    }
                    :global([data-theme="light"]) .service-compact-card {
                        background: linear-gradient(145deg, rgba(255,255,255,0.9), rgba(255,255,255,0.78));
                        border-color: rgba(10, 30, 69, 0.06);
                        box-shadow: 0 14px 40px rgba(12, 48, 96, 0.14);
                    }
                    .service-compact-visual {
                        position: relative;
                        overflow: hidden;
                        border-radius: 10px;
                        isolation: isolate;
                        max-width: 240px;
                        margin: 0 auto;
                    }
                    .service-compact-visual :global(img) {
                        object-fit: contain;
                        width: 100%;
                        height: auto;
                        display: block;
                    }
                    .service-compact-text {
                        display: grid;
                        gap: 6px;
                    }
                    .service-compact-title {
                        font-size: 14px;
                        line-height: 1.3;
                        font-weight: 700;
                        color: var(--text-primary);
                    }
                    .service-compact-desc {
                        font-size: 13px;
                        line-height: 1.5;
                        color: var(--text-secondary);
                        margin: 0;
                    }
                `}</style>
            </section>
        );
    }

    return (
        // Наследуем фон страницы, чтобы не было скачков␊
        <section id="service" className="relative py-24" style={{ color: "var(--text-primary)" }}>
            {/* Едва заметные разделители сверху/снизу для мягкого стыка секций */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-200 dark:bg-[rgba(255,255,255,0.06)]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-slate-200 dark:bg-[rgba(255,255,255,0.06)]"
            />

            <div className="relative mx-auto max-w-5xl px-6 space-y-12 service-vertical-grid">
                {visibleItems.map((it, i) => (
                    <motion.div
                        key={it.title}
                        initial={{ opacity: 0, y: 32, scale: 0.98 }}
                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.55, ease: "easeOut" }}
                        className={`service-vertical-card ${i % 2 === 1 ? "reverse" : ""}`}
                    >
                        {/* Иллюстрация */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true, amount: 0.35 }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className="service-visual"
                        >
                            <Image
                                src={it.img}
                                alt={it.title}
                                width={260}
                                height={180}
                                quality={95}
                                priority={i < 2}
                                {...(i >= 2 ? { loading: "lazy" } : {})}
                                sizes="(max-width: 768px) 90vw, 320px"
                                className="rounded-xl"
                            />
                        </motion.div>

                        {/* Текст */}
                        <div className="service-text">
                            <h3 className="service-title">{it.title}</h3>
                            <p className="service-desc">{it.text}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <style jsx>{`
                .service-vertical-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: clamp(14px, 1.8vw, 22px);
                }
                .service-vertical-card {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    align-items: flex-start;
                    padding: clamp(12px, 1.4vw, 18px);
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.06);
                    background: linear-gradient(140deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
                    box-shadow: 0 12px 34px rgba(0,0,0,0.18);
                    backdrop-filter: blur(6px);
                }
                :global([data-theme="light"]) .service-vertical-card {
                    background: linear-gradient(140deg, rgba(255,255,255,0.9), rgba(255,255,255,0.75));
                    border-color: rgba(10, 30, 69, 0.08);
                    box-shadow: 0 18px 40px rgba(12, 48, 96, 0.14);
                }
                .service-visual {
                    width: 100%;
                    display: flex;
                    justify-content: center;
                }
                .service-visual :global(img) {
                    height: auto;
                    width: 100%;
                    max-width: 320px;
                    object-fit: contain;
                    background: rgba(255,255,255,0.02);
                    padding: clamp(6px, 0.8vw, 10px);
                }
                .service-text {
                    display: grid;
                    gap: 6px;
                }
                .service-title {
                    font-size: clamp(18px, 2vw, 22px);
                    line-height: 1.3;
                    font-weight: 800;
                    color: var(--text-primary);
                    margin: 0;
                }
                .service-desc {
                    margin: 0;
                    font-size: 14px;
                    line-height: 1.55;
                    color: var(--text-secondary);
                }

                @media (min-width: 900px) {
                    .service-vertical-card {
                        flex-direction: row;
                        align-items: center;
                        gap: clamp(16px, 2vw, 32px);
                    }
                    .service-vertical-card.reverse {
                        flex-direction: row-reverse;
                    }
                    .service-visual,
                    .service-text {
                        flex: 1;
                    }
                    .service-visual {
                        justify-content: flex-start;
                    }
                    .service-vertical-card.reverse .service-visual {
                        justify-content: flex-end;
                    }
                    .service-visual :global(img) {
                        max-width: 360px;
                    }
                }
            `}</style>
        </section>
    );
}