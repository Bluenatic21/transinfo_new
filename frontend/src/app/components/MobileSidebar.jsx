"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { FaBars, FaTimes } from "react-icons/fa";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import LangSwitcher from "./LangSwitcher";
import ThemeToggle from "./ThemeToggle";

// грузим тот же сайдбар, что на десктопе (с той же логикой по ролям)
const ProfileSidebar = dynamic(() => import("./ProfileSidebar"), { ssr: false });

export default function MobileSidebar() {
    const [open, setOpen] = useState(false);
    const { user, setShowAuth } = useUser();
    const { t } = useLang();

    // Жёстко блокируем фон при открытом меню (фиксируем body и возвращаем позицию)
    useEffect(() => {
        if (!open || typeof window === "undefined") return;
        const scrollY = window.scrollY || 0;
        const b = document.body;
        const prev = { overflow: b.style.overflow, position: b.style.position, top: b.style.top, width: b.style.width };
        b.style.overflow = "hidden";
        b.style.position = "fixed";
        b.style.top = `-${scrollY}px`;
        b.style.width = "100%";
        const html = document.documentElement;
        const prevHtmlOverscroll = html.style.overscrollBehaviorY;
        html.style.overscrollBehaviorY = "none";
        return () => {
            b.style.overflow = prev.overflow;
            b.style.position = prev.position;
            b.style.top = prev.top;
            b.style.width = prev.width;
            html.style.overscrollBehaviorY = prevHtmlOverscroll || "";
            window.scrollTo(0, scrollY);
        };
    }, [open]);

    const close = useCallback(() => setOpen(false), []);

    return (
        <>
            {/* кнопка открытия меню — показывается только на мобилке */}
            <button
                aria-label={t("menu.open", "Меню")}
                className="md:hidden inline-grid place-items-center"
                style={{
                    height: 40,
                    width: 40,
                    borderRadius: 12,
                    border: "1px solid var(--border-subtle)",
                    background: "var(--control-bg)",
                    color: "var(--text-primary)",
                    boxShadow: "var(--shadow-soft)",
                    transition: "background var(--transition-fast), border-color var(--transition-fast)",
                }}
                onClick={() => setOpen(true)}
            >
                <FaBars />
            </button>

            {open && (
                <div className="fixed inset-0 z-[12050] md:hidden">
                    <div
                        className="absolute inset-0 bg-black/60 z-[12049]"
                        onClick={close}
                        onWheel={(e) => e.preventDefault()}
                        onTouchMove={(e) => e.preventDefault()}
                        aria-hidden
                    />
                    <aside
                        role="dialog" aria-modal="true"
                        className="absolute right-0 top-0 h-full w-[86%] max-w-[360px] shadow-2xl z-[12050]"
                        style={{
                            background: "var(--sidebar-bg)",
                            color: "var(--sidebar-link)",
                            borderLeft: "1px solid var(--sidebar-border)",
                            boxShadow: "var(--sidebar-shadow)",
                            transition:
                                "background var(--transition-normal), color var(--transition-normal), border-color var(--transition-normal)",
                        }}
                        onClickCapture={(e) => {
                            const t = e.target;
                            const el = t && typeof t.closest === "function" ? t.closest("a,button[data-close]") : null;
                            if (el && !el.dataset.ignoreClose) setTimeout(close, 0);
                        }}
                        onWheelCapture={(e) => e.stopPropagation()}
                        onTouchMoveCapture={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", padding: 10 }}>
                            <span style={{ color: "var(--sidebar-link)", fontSize: 14 }}>{t("menu.title", "მენიუ")}</span>
                            <button
                                aria-label={t("menu.close", "Закрыть меню")}
                                onClick={close}
                                className="inline-grid place-items-center"
                                style={{
                                    height: 36,
                                    width: 36,
                                    borderRadius: 10,
                                    border: "1px solid var(--border-subtle)",
                                    background: "var(--control-bg)",
                                    color: "var(--text-primary)",
                                }}
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div
                            style={{
                                height: "calc(100svh - 56px)",
                                overflowY: "auto",
                                WebkitOverflowScrolling: "touch",
                                overscrollBehavior: "contain",
                                padding: "4px 8px calc(env(safe-area-inset-bottom) + 12px) 8px",
                            }}
                        >
                            {!user ? (
                                <div style={{ padding: 12 }}>
                                    {/* Заголовок + переключатель языка для гостей */}
                                    <div
                                        className="flex items-center gap-2 mb-2"
                                        style={{ padding: "2px 2px 6px 2px" }}
                                    >
                                        <div style={{ fontWeight: 800, fontSize: 18, color: "var(--sidebar-link)" }}>
                                            {t("language.choose", "язык")}
                                        </div>
                                        <div className="ml-auto">
                                            <LangSwitcher variant="compact" />
                                        </div>
                                    </div>
                                    {/* Кнопка входа/регистрации */}
                                    <button
                                        type="button"
                                        data-close
                                        onClick={() => setShowAuth?.(true)}
                                        className="w-full"
                                        style={{
                                            width: "100%",
                                            borderRadius: 12,
                                            padding: "12px 14px",
                                            background: "var(--sidebar-link-active-bg)",
                                            color: "var(--sidebar-link)",
                                            fontWeight: 700,
                                            border: "1px solid var(--sidebar-border)",
                                            boxShadow: "var(--sidebar-shadow)",
                                        }}
                                    >
                                        {t("auth.loginRegister", "შესვლა / რეგისტრაცია")}
                                    </button>
                                </div>
                            ) : (
                                // внутри — тот же десктопный сайдбар (все правила видимости по ролям сохраняются)
                                <ProfileSidebar variant="mobile" />
                            )}
                        </div>
                    </aside>
                </div>
            )}
        </>
    );
}
