"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaFacebookF, FaLink, FaShareAlt, FaTelegramPlane, FaWhatsapp } from "react-icons/fa";
import { useLang } from "@/app/i18n/LangProvider";
import { buildOrderSharePayload } from "@/app/utils/orderShare";
import { useTheme } from "@/app/providers/ThemeProvider";

const FALLBACK_T = { t: (key, fallback) => fallback || key };

export default function OrderShareButtons({ order, variant = "compact", buttonStyle, style }) {
    const langCtx = useLang?.() || FALLBACK_T;
    const { t } = langCtx;
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const [copied, setCopied] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const wrapperRef = useRef(null);

    const share = useMemo(() => (order ? buildOrderSharePayload(order, { t }) : null), [order, t]);

    if (!share) return null;

    const isLight = resolvedTheme === "light";

    const baseCompactStyle = isLight
        ? {
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
            fontSize: 15,
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
        }
        : {
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid #243a60",
            background: "#16243d",
            color: "#9ec3ff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "opacity 0.15s ease",
            fontSize: 15,
        };

    const basePillStyle = isLight
        ? {
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 14px",
            borderRadius: 999,
            border: "1px solid color-mix(in srgb, var(--brand-blue) 26%, var(--border-subtle))",
            background: "color-mix(in srgb, var(--brand-blue) 10%, #ffffff)",
            color: "var(--text-primary)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            transition: "opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
        }
        : {
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #213759",
            background: "#132642",
            color: "#e0f1ff",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            transition: "opacity 0.15s ease",
        };

    const triggerStyleBase = variant === "pills" ? basePillStyle : baseCompactStyle;
    const triggerStyle = {
        ...triggerStyleBase,
        ...(buttonStyle || {}),
    };

    const shareMessage = [share.message, share.url].filter(Boolean).join(" \n").trim();

    const encodedMessage = encodeURIComponent(shareMessage);
    const encodedUrl = encodeURIComponent(share.url);

    const buttons = [
        {
            key: "copy",
            label: copied ? t("share.copied", "Скопировано") : t("share.copy", "Скопировать"),
            icon: <FaLink />,
            color: "#9ec3ff",
            onClick: async () => {
                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(share.copyText);
                    } else {
                        const el = document.createElement("textarea");
                        el.value = share.copyText;
                        el.style.position = "fixed";
                        el.style.top = "-1000px";
                        document.body.appendChild(el);
                        el.focus();
                        el.select();
                        document.execCommand("copy");
                        if (el.parentNode === document.body) {
                            document.body.removeChild(el);
                        }
                    }
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch (err) {
                    console.warn("copy failed", err);
                    alert(t("share.copyError", "Не удалось скопировать ссылку"));
                }
            },
            title: t("share.copyLink", "Скопировать ссылку"),
        },
        {
            key: "whatsapp",
            label: "WhatsApp",
            icon: <FaWhatsapp />,
            href: `https://wa.me/?text=${encodedMessage}`,
            title: "WhatsApp",
            color: "#43d854",
        },
        {
            key: "telegram",
            label: "Telegram",
            icon: <FaTelegramPlane />,
            href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedMessage}`,
            title: "Telegram",
            color: "#2ba4e0",
        },
        {
            key: "facebook",
            label: "Facebook",
            icon: <FaFacebookF />,
            href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
            title: "Facebook",
            color: "#2d68ff",
        },
    ];

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        buttons.unshift({
            key: "native",
            label: t("share.native", "Поделиться"),
            icon: <FaShareAlt />,
            color: "#43c8ff",
            onClick: async () => {
                try {
                    await navigator.share({
                        title: share.title,
                        text: share.text || share.description,
                        url: share.url,
                    });
                } catch (err) {
                    if (err?.name !== "AbortError") {
                        console.warn("native share failed", err);
                    }
                }
            },
            title: t("share.native", "Поделиться"),
        });
    }

    const wrapperStyle = {
        display: "inline-flex",
        position: "relative",
        alignItems: "center",
        gap: variant === "pills" ? 10 : 0,
        ...style,
    };

    const menuBaseStyle = isLight
        ? {
            position: "absolute",
            top: "calc(100% + 8px)",
            right: variant === "compact" ? 0 : "auto",
            left: variant === "pills" ? 0 : "auto",
            background: "var(--surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 14,
            boxShadow: "0 16px 32px rgba(15, 23, 42, 0.18)",
            padding: variant === "compact" ? 8 : 12,
            zIndex: 20,
            display: "flex",
            flexDirection: variant === "compact" ? "row" : "column",
            gap: variant === "compact" ? 8 : 10,
            flexWrap: variant === "compact" ? "wrap" : "nowrap",
            minWidth: variant === "pills" ? 220 : undefined,
        }
        : {
            position: "absolute",
            top: "calc(100% + 8px)",
            right: variant === "compact" ? 0 : "auto",
            left: variant === "pills" ? 0 : "auto",
            background: "#0f1c30",
            border: "1px solid rgba(67, 200, 255, 0.35)",
            borderRadius: 14,
            boxShadow: "0 12px 24px rgba(0, 0, 0, 0.45)",
            padding: variant === "compact" ? 8 : 12,
            zIndex: 20,
            display: "flex",
            flexDirection: variant === "compact" ? "row" : "column",
            gap: variant === "compact" ? 8 : 10,
            flexWrap: variant === "compact" ? "wrap" : "nowrap",
            minWidth: variant === "pills" ? 220 : undefined,
        };

    const compactItemStyle = isLight
        ? {
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            cursor: "pointer",
            transition: "opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
            textDecoration: "none",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
        }
        : {
            width: 34,
            height: 34,
            borderRadius: 10,
            border: "1px solid #243a60",
            background: "#16243d",
            color: "#9ec3ff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            cursor: "pointer",
            transition: "opacity 0.15s ease",
            textDecoration: "none",
        };

    const pillItemStyle = isLight
        ? {
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 12px",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--brand-blue) 6%, #ffffff)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            fontSize: 14,
            minWidth: 200,
            textDecoration: "none",
        }
        : {
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(14, 24, 44, 0.9)",
            border: "1px solid rgba(67, 200, 255, 0.2)",
            color: "#e0f1ff",
            fontSize: 14,
            minWidth: 200,
            textDecoration: "none",
        };

    useEffect(() => {
        if (!menuOpen) return undefined;
        const handleClick = (event) => {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        };
        const handleKey = (event) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [menuOpen]);

    useEffect(() => {
        setMenuOpen(false);
    }, [order?.id]);

    return (
        <div ref={wrapperRef} style={wrapperStyle}>
            <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                style={triggerStyle}
                title={t("share.openMenu", "Поделиться")}
                aria-expanded={menuOpen}
                aria-haspopup="true"
            >
                <FaShareAlt />
                {variant === "pills" && <span>{t("share.openMenu", "Поделиться")}</span>}
            </button>
            {menuOpen && (
                <div style={menuBaseStyle} role="menu">
                    {buttons.map((btn) => {
                        const commonProps = {

                            title: btn.title,
                            "aria-label": btn.title,
                        };
                        const isCompact = variant === "compact";
                        const content = isCompact ? (
                            btn.icon
                        ) : (
                            <>
                                <span
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 8,
                                        background: "rgba(67, 200, 255, 0.1)",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: btn.color || "#9ec3ff",
                                        fontSize: 15,
                                    }}
                                >
                                    {btn.icon}
                                </span>
                                <span>{btn.label}</span>
                            </>
                        );

                        const baseStyle = isCompact ? compactItemStyle : pillItemStyle;
                        const finalStyle = { ...baseStyle, color: btn.color || baseStyle.color };

                        if (btn.href) {
                            return (
                                <a
                                    key={btn.key}
                                    {...commonProps}
                                    href={btn.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={finalStyle}
                                >
                                    {content}
                                </a>
                            );
                        }

                        const actionStyle = { ...finalStyle, border: baseStyle.border || "none" };

                        return (
                            <button
                                key={btn.key}
                                type="button"
                                {...commonProps}
                                onClick={btn.onClick}
                                style={actionStyle}
                            >
                                {content}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}