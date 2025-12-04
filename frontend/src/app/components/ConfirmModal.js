"use client";
// app/components/ConfirmModal.js
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";

/**
 * Универсальная модалка подтверждения.
 * Рендер через портал в document.body + высокий z-index,
 * чтобы модалка всегда была поверх мобильных шторок/карт/меню.
 * Также блокируем прокрутку фона на время показа.
 */
export default function ConfirmModal({ open, text, onConfirm, onCancel }) {
    const { t } = useLang();
    const { resolvedTheme } = useTheme();
    // SSR guard
    if (typeof document === "undefined") return null;
    const portalTarget = document.body;

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    if (!open) return null;

    const isLight = resolvedTheme === "light";
    const themeStyles = isLight
        ? {
            overlay: "rgba(7,12,24,0.35)",
            dialogBg: "var(--bg-card)",
            dialogColor: "var(--text-primary)",
            dialogShadow: "var(--shadow-soft)",
            dialogBorder: "1px solid var(--border-subtle)",
            cancelBg: "var(--control-bg)",
            cancelColor: "var(--text-primary)",
            cancelBorder: "1px solid var(--border-subtle)",
            confirmBg: "var(--cta-gradient)",
            confirmColor: "var(--cta-text)",
            confirmShadow: "var(--cta-shadow)",
        }
        : {
            overlay: "rgba(22,30,54,0.53)",
            dialogBg: "#1d2c49",
            dialogColor: "#e3f2fd",
            dialogShadow: "0 6px 32px #13204880",
            dialogBorder: "none",
            cancelBg: "#323b51",
            cancelColor: "#e3f2fd",
            cancelBorder: "none",
            confirmBg: "#43c8ff",
            confirmColor: "#182337",
            confirmShadow: "none",
        };

    const overlay = (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 200000, // выше любых наших оверлеев/карт/меню
                background: themeStyles.overlay,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onCancel && onCancel();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                style={{
                    background: themeStyles.dialogBg,
                    padding: 24,
                    borderRadius: 20,
                    width: "min(420px, 92vw)",
                    color: themeStyles.dialogColor,
                    boxShadow: themeStyles.dialogShadow,
                    textAlign: "center",
                    border: themeStyles.dialogBorder,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                    {text}
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: 14,
                        justifyContent: "center",
                        marginTop: 10,
                    }}
                >
                    <button
                        onClick={onCancel}
                        style={{
                            background: themeStyles.cancelBg,
                            color: themeStyles.cancelColor,
                            border: themeStyles.cancelBorder,
                            borderRadius: 10,
                            padding: "10px 20px",
                            fontWeight: 600,
                            fontSize: 15,
                            cursor: "pointer",
                        }}
                    >
                        {t("common.cancel", "Отмена")}
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            background: themeStyles.confirmBg,
                            color: themeStyles.confirmColor,
                            border: "none",
                            borderRadius: 10,
                            padding: "10px 20px",
                            fontWeight: 700,
                            fontSize: 15,
                            cursor: "pointer",
                            boxShadow: themeStyles.confirmShadow,
                        }}
                    >
                        {t("common.delete", "Удалить")}
                    </button>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(overlay, portalTarget);
}
