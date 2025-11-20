"use client";
import React from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

export default function AdminTransportsPage() {
    const { t: translate } = useLang?.() || { t: (_k, f) => f };
    const [items, setItems] = React.useState<any[]>([]);
    const [q, setQ] = React.useState("");
    const [isActive, setIsActive] = React.useState<string>("");
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    const load = React.useCallback(() => {
        setLoading(true); setErr(null);
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (isActive) params.set("is_active", isActive === "true" ? "true" : "false");
        fetch(api(`/admin/transports?${params.toString()}`), { headers: { Authorization: `Bearer ${token || ""}` }, cache: "no-store" })
            .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
            .then(setItems).catch(e => setErr(String(e))).finally(() => setLoading(false));
    }, [q, isActive, token]);

    React.useEffect(() => { load(); }, []);
    const toggle = async (transport: any) => {
        const op = transport.is_active ? "deactivate" : "activate";
        const r = await fetch(api(`/admin/transports/${transport.id}/${op}`), { method: "POST", headers: { Authorization: `Bearer ${token || ""}` } });
        if (!r.ok) throw new Error(await r.text());
        load();
    };

    return (
        <div className="space-y-4 text-slate-100">
            <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col">
                    <label className="text-sm text-gray-400">{translate("admin.common.search", "Поиск")}</label>
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder={translate("admin.transports.search.ph", "название/маршрут/водитель")}
                        className="border border-slate-700 bg-slate-900/60 text-slate-100 placeholder-slate-400 rounded-xl px-3 py-2" />
                </div>
                <div className="flex flex-col">
                    <label className="text-sm text-gray-400">{translate("admin.common.active.m", "Активен")}</label>
                    <select value={isActive} onChange={e => setIsActive(e.target.value)}
                        className="border border-slate-700 bg-slate-900/60 text-slate-100 rounded-xl px-3 py-2">
                        <option value="">{translate("admin.common.all", "Все")}</option>
                        <option value="true">Да</option>
                        <option value="false">Нет</option>
                    </select>
                </div>
                <button onClick={load} className="px-4 py-2 rounded-xl shadow bg-blue-600 hover:bg-blue-500 text-white">
                    {translate("admin.common.filter", "Фильтровать")}
                </button>
            </div>

            {err && <div className="text-red-400">{translate("admin.common.error", "Ошибка")}: {err}</div>}
            {loading ? <div>{translate("common.loading", "Загрузка...")}</div> : (
                <div className="overflow-auto rounded-2xl border border-slate-700/60 bg-slate-900/30">
                    <table className="min-w-full text-sm text-slate-200">
                        <thead className="bg-slate-800/60">
                            <tr>
 <th className="p-3 text-left">ID</th>
                                <th className="p-3 text-left">{translate("admin.common.status", "Статус")}</th>
                                <th className="p-3 text-left">{translate("admin.common.active.m", "Активен")}</th>
                                <th className="p-3 text-left">{translate("admin.common.created.m", "Создан")}</th>
                                <th className="p-3 text-left">{translate("admin.common.actions", "Действия")}</th>
                            </tr>
                        </thead>
                        <tbody>
                                                       {items.map(transport => (
                                <tr key={transport.id} className="border-t border-slate-700/60 hover:bg-slate-800/30">
                                    <td className="p-3">{transport.id}</td>
                                    <td className="p-3">{transport.status || "-"}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded-lg ${transport.is_active ? "bg-emerald-900/40 text-emerald-300" : "bg-slate-700/50 text-slate-300"}`}>
                                            {transport.is_active ? translate("common.yes", "Да") : translate("common.no", "Нет")}
                                        </span>
                                    </td>
                                    <td className="p-3">{transport.created_at ? new Date(transport.created_at).toLocaleString() : "-"}</td>
                                    <td className="p-3">
                                        <button onClick={() => toggle(transport)} className="px-3 py-1 rounded-lg border border-slate-700 hover:bg-slate-800/40">
                                            {transport.is_active ? translate("admin.common.deactivate", "Деактивировать") : translate("admin.common.activate", "Активировать")}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">{translate("admin.common.nothing", "Ничего не найдено")}</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
     </div>
    );
}