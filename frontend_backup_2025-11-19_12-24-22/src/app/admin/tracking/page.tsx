"use client";
import React from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api, API_BASE } from "@/config/env";

export default function AdminTrackingPage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const [items, setItems] = React.useState<any[]>([]);
    const [isActive, setIsActive] = React.useState<string>("");

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    const load = React.useCallback(() => {
        const params = new URLSearchParams();
        if (isActive) params.set("is_active", isActive === "true" ? "true" : "false");
        fetch(api(`/admin/tracking/sessions?${params.toString()}`), { headers: { Authorization: `Bearer ${token || ""}` }, cache: "no-store" })
            .then(r => r.json()).then(setItems);
    }, [isActive, token]);

    React.useEffect(() => { load(); }, []);

    const revoke = async (id: number) => {
        const r = await fetch(api(`/admin/tracking/sessions/${id}/revoke`), { method: "POST", headers: { Authorization: `Bearer ${token || ""}` } });
        if (!r.ok) alert(await r.text()); else load();
    };

    return (
        <div className="space-y-4 text-slate-100">
            <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col">
                    <label className="text-sm text-gray-400">{t("admin.common.active.p", "Активные")}</label>
                    <select value={isActive} onChange={e => setIsActive(e.target.value)}
                        className="border border-slate-700 bg-slate-900/60 text-slate-100 rounded-xl px-3 py-2">
                        <option value="">{t("admin.common.all", "Все")}</option>
                        <option value="true">{t("common.yes", "Да")}</option>
                        <option value="false">{t("common.no", "Нет")}</option>
                    </select>
                </div>
                <button onClick={load} className="px-4 py-2 rounded-xl shadow bg-blue-600 hover:bg-blue-500 text-white">
                    {t("admin.common.filter", "Фильтровать")}
                </button>
            </div>

            <div className="overflow-auto rounded-2xl border border-slate-700/60 bg-slate-900/30">
                <table className="min-w-full text-sm text-slate-200">
                    <thead className="bg-slate-800/60">
                        <tr>
                            <th className="p-3 text-left">ID</th>
                            <th className="p-3 text-left">{t("admin.common.user", "Пользователь")}</th>
                            <th className="p-3 text-left">{t("admin.common.active.f", "Активна")}</th>
                            <th className="p-3 text-left">{t("admin.common.start", "Начало")}</th>
                            <th className="p-3 text-left">{t("admin.common.end", "Окончание")}</th>
                            <th className="p-3 text-left">{t("admin.common.actions", "Действия")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(s => (
                            <tr key={s.id} className="border-t border-slate-700/60 hover:bg-slate-800/30">
                                <td className="p-3">{s.id}</td>
                                <td className="p-3">{s.user_id ?? "-"}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded-lg ${s.is_active ? "bg-emerald-900/40 text-emerald-300" : "bg-slate-700/50 text-slate-300"}`}>
                                        {s.is_active ? t("common.yes", "Да") : t("common.no", "Нет")}
                                    </span>
                                </td>
                                <td className="p-3">{s.started_at ? new Date(s.started_at).toLocaleString() : "-"}</td>
                                <td className="p-3">{s.ended_at ? new Date(s.ended_at).toLocaleString() : "-"}</td>
                                <td className="p-3">{s.is_active && <button onClick={() => revoke(s.id)} className="px-3 py-1 rounded-lg border border-slate-700 hover:bg-slate-800/40">{t("admin.tracking.revoke", "Отозвать")}</button>}</td>
                            </tr>
                        ))}
                        {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">{t("admin.common.empty", "Пусто")}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
