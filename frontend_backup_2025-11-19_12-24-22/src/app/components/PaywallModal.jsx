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
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900">
                <div className="text-xl font-semibold mb-2">
                    {t("paywall.title", "Доступ к заявкам ограничен")}
                </div>
                <div className="text-sm opacity-80 mb-4">
                    {anonymous
                        ? t("paywall.text_anonymous", "Войдите или зарегистрируйтесь, чтобы видеть больше и активировать подписку.")
                        : t("paywall.text_authenticated", "Чтобы работать с заявками и видеть все данные, активируйте подписку.")}
                </div>
                <div className="flex gap-2 justify-end">
                    {anonymous ? (
                        <>
                            <button
                                className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700"
                                onClick={() => { onClose?.(); router.push("/auth"); }}
                            >
                                {t("paywall.cta.login", "Войти")}
                            </button>
                            <button
                                className="px-3 py-2 rounded-lg bg-blue-600 text-white"
                                onClick={() => { onClose?.(); router.push("/register"); }}
                            >
                                {t("paywall.cta.register", "Зарегистрироваться")}
                            </button>
                        </>
                    ) : (
                        <button
                            className="px-3 py-2 rounded-lg bg-blue-600 text-white"
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
