"use client";
// app/components/ConfirmModal.js
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { useLang } from "../i18n/LangProvider";

/**
 * Универсальная модалка подтверждения.
 * Рендер через портал в document.body + высокий z-index,
 * чтобы модалка всегда была поверх мобильных шторок/карт/меню.
 * Также блокируем прокрутку фона на время показа.
 */
export default function ConfirmModal({ open, text, onConfirm, onCancel }) {
    const { t } = useLang();
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

    const overlay = (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 200000, // выше любых наших оверлеев/карт/меню
                background: "rgba(22,30,54,0.53)",
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
                    background: "#1d2c49",
                    padding: 24,
                    borderRadius: 20,
                    width: "min(420px, 92vw)",
                    color: "#e3f2fd",
                    boxShadow: "0 6px 32px #13204880",
                    textAlign: "center",
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
                            background: "#323b51",
                            color: "#e3f2fd",
                            border: "none",
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
                            background: "#43c8ff",
                            color: "#182337",
                            border: "none",
                            borderRadius: 10,
                            padding: "10px 20px",
                            fontWeight: 700,
                            fontSize: 15,
                            cursor: "pointer",
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
