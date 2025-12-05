"use client";
import React from "react";
import { useUser } from "@/app/UserContext";
import { useRouter } from "next/navigation";
import { useLang } from "../i18n/LangProvider";

export default function BlockedGateClient({ children }: { children: React.ReactNode }) {
    const { isActive, handleLogoutClick } = useUser();
    const router = useRouter();
    const { t } = useLang();

    const onLogout = async () => {
        try {
            // Полная очистка сессии (токен/локалсторадж/вебсокеты и т.п.)
            await Promise.resolve(handleLogoutClick?.());
        } finally {
            // Уводим на главную/логин (на твой вкус)
            router.push("/");
        }
    };
    if (isActive) return <>{children}</>;
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6"
            style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
            <div className="max-w-md text-center space-y-4">
                <div className="text-2xl font-semibold">{t("blockedGate.title", "Доступ ограничен")}</div>
                <p>{t("blockedGate.text", "Ваш аккаунт заблокирован. Если это ошибка — обратитесь в поддержку.")}</p>
                <div className="flex gap-3 justify-center">
                    <a href="mailto:support@yourdomain.tld" className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800/40">
                        {t("support.title", "Поддержка")}
                    </a>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
                    >
                        {t("nav.logout", "Выйти")}
                    </button>
                </div>
            </div>
        </div>
    );
}
