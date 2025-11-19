"use client";

import { useMemo, useState } from "react";
import { FaFacebookF, FaLink, FaShareAlt, FaTelegramPlane, FaWhatsapp } from "react-icons/fa";
import { useLang } from "@/app/i18n/LangProvider";
import { buildOrderSharePayload } from "@/app/utils/orderShare";

const FALLBACK_T = { t: (key, fallback) => fallback || key };

export default function OrderShareButtons({ order, variant = "compact", buttonStyle, style }) {
    const langCtx = useLang?.() || FALLBACK_T;
    const { t } = langCtx;
    const [copied, setCopied] = useState(false);

    const share = useMemo(() => (order ? buildOrderSharePayload(order, { t }) : null), [order, t]);

    if (!share) return null;

    const baseCompactStyle = {
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

    const basePillStyle = {
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

    const containerStyle = {
        display: "flex",
        alignItems: "center",
        flexWrap: variant === "pills" ? "wrap" : "nowrap",
        gap: variant === "pills" ? 8 : 6,
        ...style,
    };

    const finalButtonStyle = variant === "pills" ? basePillStyle : baseCompactStyle;

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
                        document.body.removeChild(el);
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
        buttons.splice(1, 0, {
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

    return (
        <div style={containerStyle}>
            {buttons.map((btn) => {
                const commonProps = {
                    key: btn.key,
                    style: { ...finalButtonStyle, ...(variant === "compact" && buttonStyle ? buttonStyle : {}), color: btn.color || finalButtonStyle.color },
                    title: btn.title,
                    "aria-label": btn.title,
                };

                const content = (
                    <>
                        {btn.icon}
                        {variant === "pills" && <span>{btn.label}</span>}
                    </>
                );

                if (btn.href) {
                    return (
                        <a {...commonProps} href={btn.href} target="_blank" rel="noopener noreferrer">
                            {content}
                        </a>
                    );
                }

                return (
                    <button type="button" {...commonProps} onClick={btn.onClick}>
                        {content}
                    </button>
                );
            })}
        </div>
    );
}