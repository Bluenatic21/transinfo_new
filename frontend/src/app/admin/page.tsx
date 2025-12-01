"use client";
import React from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

type OnlineUser = {
    id: number;
    email?: string;
    name?: string;
    role?: string;
    phone?: string;
    last_seen_at?: string;
    last_path?: string | null;
};

type OnlineUsersResponse = {
    count: number;
    users: OnlineUser[];
    generated_at: string;
};

type VisitDay = {
    date: string;
    total_visits: number;
    unique_users: number;
};

type VisitStatsResponse = {
    from: string;
    to: string;
    days: VisitDay[];
};

const formatRelativeTime = (value?: string | null) => {
    if (!value) return "—";
    const ts = new Date(value);
    const diff = Date.now() - ts.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    return ts.toLocaleString();
};

const VisitsChart = ({ data }: { data: VisitDay[] }) => {
    if (!data.length) {
        return <div className="text-sm text-[color:var(--text-secondary)]">Нет данных о трафике</div>;
    }
    const width = 700;
    const height = 260;
    const paddingX = 40;
    const paddingY = 30;
    const maxValue = Math.max(
        1,
        ...data.map((d) => Math.max(d.total_visits || 0, d.unique_users || 0))
    );
    const maxIndex = Math.max(data.length - 1, 1);
    const scaleX = (idx: number) =>
        paddingX + (idx / maxIndex) * (width - paddingX * 2);
    const scaleY = (value: number) =>
        height - paddingY - (value / maxValue) * (height - paddingY * 2);

    const linePath = (values: number[]) =>
        values
            .map((value, idx) => {
                const command = idx === 0 ? "M" : "L";
                return `${command}${scaleX(idx)} ${scaleY(value)}`;
            })
            .join(" ");

    const totalLine = linePath(data.map((d) => d.total_visits));
    const uniqueLine = linePath(data.map((d) => d.unique_users));

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
            <defs>
                <linearGradient id="visitsGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
            </defs>
            <path
                d={`${totalLine} L${scaleX(Math.max(data.length - 1, 0))} ${height - paddingY} L${scaleX(0)} ${height - paddingY} Z`}
                fill="url(#visitsGradient)"
                opacity={0.25}
            />
            <path d={totalLine} fill="none" stroke="#38bdf8" strokeWidth={3} />
            <path
                d={uniqueLine}
                fill="none"
                stroke="#f472b6"
                strokeWidth={2}
                strokeDasharray="6 4"
            />
            {data.map((day, idx) => (
                <text
                    key={day.date}
                    x={scaleX(idx)}
                    y={height - 4}
                    textAnchor="middle"
                    className="fill-[color:var(--text-muted)] text-[10px]"
                >
                    {new Date(day.date).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                    })}
                </text>
            ))}
        </svg>
    );
};

export default function AdminDashboardPage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const [stats, setStats] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [online, setOnline] = React.useState<OnlineUsersResponse | null>(null);
    const [onlineError, setOnlineError] = React.useState<string | null>(null);
    const [visits, setVisits] = React.useState<VisitStatsResponse | null>(null);
    const [visitsError, setVisitsError] = React.useState<string | null>(null);

    const fetchWithAuth = React.useCallback(async (path: string) => {
        const token = localStorage.getItem("token");
        const response = await fetch(api(path), {
            headers: { Authorization: `Bearer ${token || ""}` },
            cache: "no-store",
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || response.statusText);
        }
        return response.json();
    }, []);

    React.useEffect(() => {
        fetchWithAuth(`/admin/stats`)
            .then(setStats)
            .catch((e) => setError(String(e)));
    }, [fetchWithAuth]);

    const refreshOnline = React.useCallback(() => {
        fetchWithAuth(`/admin/stats/online-users`)
            .then(setOnline)
            .catch((e) => setOnlineError(e.message));
    }, [fetchWithAuth]);

    React.useEffect(() => {
        refreshOnline();
        const id = setInterval(refreshOnline, 20000);
        return () => clearInterval(id);
    }, [refreshOnline]);

    const refreshVisits = React.useCallback(() => {
        fetchWithAuth(`/admin/stats/visits`)
            .then(setVisits)
            .catch((e) => setVisitsError(e.message));
    }, [fetchWithAuth]);

    React.useEffect(() => {
        refreshVisits();
        const id = setInterval(refreshVisits, 5 * 60 * 1000);
        return () => clearInterval(id);
    }, [refreshVisits]);

    if (error) return <div className="text-red-600">{t("admin.common.error", "Ошибка")}: {error}</div>;
    if (!stats) return <div>{t("common.loading", "Загрузка...")}</div>;

    const Card = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="p-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] backdrop-blur shadow-[var(--shadow-soft)]">
            <div className="text-sm text-[color:var(--text-secondary)]">{label}</div>
            <div className="text-3xl font-semibold mt-1 text-[color:var(--text-primary)]">{value}</div>
        </div>
    );

    const onlineUsers = (online?.users || []).slice(0, 10);
    const visitDays = visits?.days || [];

    return (
        <div className="flex flex-col gap-6 text-[color:var(--text-primary)]">
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                <Card label={t("admin.stats.usersTotal", "Пользователи всего")} value={stats.users_total} />
                <Card label={t("admin.stats.users7d", "Новые за 7 дней")} value={stats.users_7d} />
                <Card label={t("admin.stats.users30d", "Новые за 30 дней")} value={stats.users_30d} />
                <Card label={t("admin.stats.ordersTotal", "Заявок всего")} value={stats.orders_total} />
                <Card label={t("admin.stats.transportsTotal", "Транспортов всего")} value={stats.transports_total} />
                <Card label={t("admin.stats.trackingActive", "Активный трекинг")} value={stats.tracking_active} />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
                <div className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] backdrop-blur shadow-[var(--shadow-soft)] flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-[color:var(--text-secondary)]">Online прямо сейчас</p>
                            <p className="text-4xl font-semibold text-[color:var(--text-primary)]">{online?.count ?? "—"}</p>
                            <p className="text-xs text-[color:var(--text-muted)]">
                                {online?.generated_at
                                    ? `обновлено ${new Date(online.generated_at).toLocaleTimeString()}`
                                    : onlineError || ""}
                            </p>
                        </div>
                        <button
                            onClick={refreshOnline}
                            className="text-xs px-3 py-1 rounded-full border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] bg-[color:var(--control-bg)] hover:bg-[color:var(--control-bg-hover)] shadow-[var(--shadow-soft)]"
                        >
                            Обновить
                        </button>
                    </div>
                    <div className="overflow-auto max-h-80">
                        {onlineError && (
                            <div className="text-xs text-red-500 mb-2">{onlineError}</div>
                        )}
                        {!onlineUsers.length && !onlineError ? (
                            <div className="text-sm text-[color:var(--text-secondary)]">Нет активных пользователей</div>
                        ) : (
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="text-[color:var(--text-muted)] text-xs uppercase">
                                        <th className="py-2">Пользователь</th>
                                        <th className="py-2">Роль</th>
                                        <th className="py-2">Активность</th>
                                        <th className="py-2">Страница</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {onlineUsers.map((user) => (
                                        <tr key={user.id} className="border-t border-[color:var(--border-subtle)]">
                                            <td className="py-2">
                                                <div className="text-[color:var(--text-primary)]">{user.name || user.email}</div>
                                                <div className="text-xs text-[color:var(--text-muted)]">{user.phone || user.email}</div>
                                            </td>
                                            <td className="py-2 text-[color:var(--text-secondary)]">{user.role}</td>
                                            <td className="py-2 text-[color:var(--text-secondary)]">{formatRelativeTime(user.last_seen_at)}</td>
                                            <td className="py-2 text-[color:var(--text-secondary)] truncate max-w-[150px]">{user.last_path || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div className="xl:col-span-2 p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] backdrop-blur shadow-[var(--shadow-soft)]">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm text-[color:var(--text-secondary)]">Трафик (30 дней)</p>
                            {visits && (
                                <p className="text-xs text-[color:var(--text-muted)]">
                                    {new Date(visits.from).toLocaleDateString()} — {new Date(visits.to).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={refreshVisits}
                            className="text-xs px-3 py-1 rounded-full border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] bg-[color:var(--control-bg)] hover:bg-[color:var(--control-bg-hover)] shadow-[var(--shadow-soft)]"
                        >
                            Обновить
                        </button>
                    </div>
                    {visitsError && <div className="text-xs text-red-500 mb-2">{visitsError}</div>}
                    <VisitsChart data={visitDays} />
                    <div className="mt-4 overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-[color:var(--text-muted)] uppercase">
                                    <th className="py-2 text-left">Дата</th>
                                    <th className="py-2 text-right">Визиты</th>
                                    <th className="py-2 text-right">Уник. пользователи</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visitDays.slice(-10).map((day) => (
                                    <tr key={day.date} className="border-t border-[color:var(--border-subtle)]">
                                        <td className="py-2 text-[color:var(--text-primary)]">
                                            {new Date(day.date).toLocaleDateString(undefined, {
                                                day: "2-digit",
                                                month: "short",
                                            })}
                                        </td>
                                        <td className="py-2 text-right text-[color:var(--text-primary)]">{day.total_visits}</td>
                                        <td className="py-2 text-right text-[color:var(--text-primary)]">{day.unique_users}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}