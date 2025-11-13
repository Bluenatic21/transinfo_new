'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from "@/app/i18n/LangProvider";

function detectRoles(): string[] {
    try {
        const rawUser =
            localStorage.getItem('auth:user') ??
            localStorage.getItem('user') ??
            localStorage.getItem('profile');
        const rolesFromKey = localStorage.getItem('roles');
        const roles: string[] = [];
        if (rolesFromKey) {
            const r = JSON.parse(rolesFromKey);
            if (Array.isArray(r)) roles.push(...r);
        }
        if (rawUser) {
            const u = JSON.parse(rawUser);
            if (u) {
                if (Array.isArray(u.roles)) roles.push(...u.roles);
                if (typeof u.role === 'string') roles.push(u.role);
                if (typeof u.user_role === 'string') roles.push(u.user_role);
            }
        }
        return Array.from(new Set(roles.filter(Boolean).map(r => String(r).toLowerCase().trim())));
    } catch {
        return [];
    }
}

export default function MyResolver() {
    const router = useRouter();
    const [showMenu, setShowMenu] = useState(false);
    const roles = useMemo(() => detectRoles(), []);
    const hasOwner = roles.includes('owner') || roles.includes('owner_role') || roles.includes('cargo') || roles.includes('владелец');
    const hasTransport = roles.includes('transport') || roles.includes('carrier') || roles.includes('перевозчик');
    const { t } = useLang?.() || { t: (_k, f) => f };

    useEffect(() => {
        if (hasOwner && !hasTransport) { router.replace('/profile?orders=1'); return; }
        if (hasTransport && !hasOwner) { router.replace('/profile?transports=1'); return; }
        setShowMenu(true);
    }, [hasOwner, hasTransport, router]);

    if (!showMenu) {
        return <div className="min-h-[60vh] grid place-items-center text-sm opacity-70">{t("navigate.redirecting", "Перенаправляем…")}</div>;
    }

    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="w-[92%] max-w-[420px] rounded-2xl p-5 bg-[rgb(22,27,34)]/70 backdrop-blur shadow-xl border border-white/10">
                <h1 className="text-xl font-semibold mb-3">{t("navigate.whereTo", "Куда перейти?")}</h1>
                <p className="text-sm opacity-70 mb-5">{t("navigate.chooseMy", "Выберите раздел для «Моё».")}</p>
                <div className="grid gap-3">
                    <button onClick={() => router.replace('/profile?orders=1')} className="w-full rounded-xl px-4 py-3 bg-white/10 hover:bg-white/15 transition">{t("navigate.myOrders", "Мои грузы")}</button>
                    <button onClick={() => router.replace('/profile?transports=1')} className="w-full rounded-xl px-4 py-3 bg-white/10 hover:bg-white/15 transition">{t("navigate.myTransports", "Мой транспорт")}</button>
                </div>
            </div>
        </div>
    );
}