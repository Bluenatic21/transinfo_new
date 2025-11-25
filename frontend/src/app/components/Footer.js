"use client";
import React from "react";
import Link from "next/link";
import { useLang } from "../i18n/LangProvider";

export default function Footer() {
    const { t } = useLang();
    const year = new Date().getFullYear();
    return (
        <footer
            style={{
                marginTop: 0,
                background: "rgba(24, 34, 54, 0.94)",
                borderTop: "1.5px solid var(--border)",
                boxShadow: "0 -6px 32px #18336e22",
                width: "100%",
            }}
        >
            <div
                style={{
                    maxWidth: 1180,
                    margin: "0 auto",
                    padding: "22px 18px 20px 18px",
                    display: "grid",
                    gridTemplateColumns: "1.3fr 1fr 1fr",
                    gap: 16,
                }}
            >
                {/* Brand */}
                <div>
                    <div
                        style={{
                            fontWeight: 900,
                            fontSize: 22,
                            color: "var(--footer-brand-color, var(--accent))",
                            letterSpacing: ".02em",
                            textShadow: "0 1px 10px #11417080",
                            marginBottom: 6,
                        }}
                    >
                        TransInfo
                    </div>
                    <div style={{ color: "#b0bcdc", fontSize: 14, lineHeight: 1.45 }}>
                        {t("footer.brandLine", "Платформа логистики.")}
                    </div>
                    <div
                        style={{
                            color: "#8aa4c1",
                            fontSize: 13,
                            marginTop: 8,
                            opacity: 0.9,
                        }}
                    >
                        {t("footer.rights", "© 2019–{year} TransInfo. Все права защищены.").replace("{year}", String(year))}
                    </div>
                </div>

                {/* Навигация */}
                <nav aria-label={t("footer.nav", "Навигация")}>
                    <div
                        style={{
                            color: "#e3f2fd",
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 8,
                            letterSpacing: ".02em",
                        }}
                    >
                        {t("footer.nav", "Навигация")}
                    </div>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        <li><Link href="/orders" style={linkStyle}>{t("nav.orders", "Заявки")}</Link></li>
                        <li><Link href="/transport" style={linkStyle}>{t("nav.transport", "Транспорт")}</Link></li>
                        <li><Link href="/profile" style={linkStyle}>{t("nav.profile", "Профиль")}</Link></li>
                    </ul>
                </nav>

                {/* Инфо / Полезное (заглушки — позже наполните) */}
                <div>
                    <div
                        style={{
                            color: "#e3f2fd",
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 8,
                            letterSpacing: ".02em",
                        }}
                    >
                        {t("footer.info", "Информация")}
                    </div>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        <li><Link href="/#service" style={linkStyle}>{t("footer.company", "О компании")}</Link></li>
                        <li>
                            <a href="#" style={linkStyle}>{t("footer.privacy", "Политика конфиденциальности")}</a>
                        </li>
                        <li>
                            <a href="#" style={linkStyle}>{t("footer.terms", "Условия использования")}</a>
                        </li>
                    </ul>
                </div>
            </div>
        </footer >
    );
}

const linkStyle = {
    color: "#b0c8e6",
    textDecoration: "none",
    padding: "6px 0",
    display: "inline-block",
    transition: "color .14s, transform .12s",
};
