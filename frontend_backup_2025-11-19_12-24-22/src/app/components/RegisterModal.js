"use client";
import { useEffect } from "react";
import RegisterForm from "./RegisterForm";
import { useLang } from "../i18n/LangProvider";

export default function RegisterModal({ visible, onClose }) {
    const { t } = useLang();
    // Блокируем прокрутку фона, пока открыта модалка
    useEffect(() => {
        if (!visible) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev || ""; };
    }, [visible]);

    if (!visible) return null;
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.register", "Регистрация")}
            onClick={onClose}
            onKeyDown={(e) => { if (e.key === "Escape") onClose?.(); }}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1400,                 // поверх нижней навигации/оверлеев
                backdropFilter: "blur(3px)",
                background: "rgba(16, 24, 43, 0.62)",
                display: "flex",
                alignItems: "flex-start",     // важно для корректного scrollIntoView
                justifyContent: "center",
                minHeight: "100dvh",
                overflowY: "auto",            // скроллим содержимое модалки
                overscrollBehavior: "contain",// не прокручивать фон на iOS/Android
                padding: "24px 8px",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: 430,
                    width: "100%",
                    background: "none",
                }}
            >
                <RegisterForm onSuccess={onClose} />
            </div>
        </div>
    );
}
