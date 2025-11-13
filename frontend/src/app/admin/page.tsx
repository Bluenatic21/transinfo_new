"use client";
import React from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api, API_BASE } from "@/config/env";

export default function AdminDashboardPage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const [stats, setStats] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const token = localStorage.getItem("token"); // под ваш способ хранения
        fetch(api(`/admin/stats`), {
            headers: { Authorization: `Bearer ${token || ""}` },
            cache: "no-store",
        })
            .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
            .then(setStats)
            .catch(e => setError(String(e)));
    }, []);

    if (error) return <div className="text-red-600">{t("admin.common.error", "Ошибка")}: {error}</div>;
    if (!stats) return <div>{t("common.loading", "Загрузка...")}</div>;

    const Card = ({ label, value }: any) => (
        <div className="p-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 backdrop-blur shadow">
            <div className="text-slate-400 text-sm">{label}</div>
            <div className="text-3xl font-semibold mt-1 text-white">{value}</div>
        </div>
    );

    return (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <Card label={t("admin.stats.usersTotal", "Пользователи всего")} value={stats.users_total} />
            <Card label={t("admin.stats.users7d", "Новые за 7 дней")} value={stats.users_7d} />
            <Card label={t("admin.stats.users30d", "Новые за 30 дней")} value={stats.users_30d} />
            <Card label={t("admin.stats.ordersTotal", "Заявок всего")} value={stats.orders_total} />
            <Card label={t("admin.stats.transportsTotal", "Транспортов всего")} value={stats.transports_total} />
            <Card label={t("admin.stats.trackingActive", "Активный трекинг")} value={stats.tracking_active} />
        </div>
    );
}
