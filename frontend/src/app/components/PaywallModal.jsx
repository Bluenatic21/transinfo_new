"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useLang } from "../i18n/LangProvider";

export default function PaywallModal({ open, onClose, anonymous }) {
    const router = useRouter();
    const { t } = useLang?.() || { t: (k, f) => f || k };
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 dark:bg-black/50" onClick={onClose} />
            <div className="relative w-full max-w-md rounded-2xl border borderc bg-card p-5 text-fg shadow-2xl transition-colors">
                <div className="mb-2 text-xl font-semibold">
                    {t("paywall.title", "Доступ к заявкам ограничен")}
                </div>
                <div className="mb-4 text-sm text-muted">
                    {anonymous
                        ? t("paywall.text_anonymous", "Войдите или зарегистрируйтесь, чтобы видеть больше и активировать подписку.")
                        : t("paywall.text_authenticated", "Чтобы работать с заявками и видеть все данные, активируйте подписку.")}
                </div>
                <div className="flex justify-end gap-2">
                    {anonymous ? (
                        <>
                            <button
                                className="rounded-lg border borderc bg-[var(--control-bg)] px-3 py-2 text-sm font-semibold transition-colors hover:bg-[var(--control-bg-hover)]"
                                onClick={() => { onClose?.(); router.push("/auth"); }}
                            >
                                {t("paywall.cta.login", "Войти")}
                            </button>
                            <button
                                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
                                onClick={() => { onClose?.(); router.push("/register"); }}
                            >
                                {t("paywall.cta.register", "Зарегистрироваться")}
                            </button>
                        </>
                    ) : (
                        <button
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
                            onClick={() => { onClose?.(); router.push("/settings/billing"); }}
                        >
                            {t("paywall.cta.subscribe", "Активировать подписку")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
