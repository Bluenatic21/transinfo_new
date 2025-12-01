"use client";
import React from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

export default function AdminAuditPage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const [items, setItems] = React.useState<any[]>([]);
    const [action, setAction] = React.useState("");
    const [targetType, setTargetType] = React.useState("");
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    const load = React.useCallback(() => {
        const params = new URLSearchParams();
        if (action) params.set("action", action);
        if (targetType) params.set("target_type", targetType);
        fetch(api(`/admin/audit?${params.toString()}`), { headers: { Authorization: `Bearer ${token || ""}` }, cache: "no-store" })
            .then(r => r.json()).then(setItems);
    }, [action, targetType, token]);

    React.useEffect(() => { load(); }, []);

    return (
        <div className="space-y-4 text-[color:var(--text-primary)]">
            <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col">
                    <label className="text-sm text-[color:var(--text-secondary)]">{t("admin.audit.action", "Действие")}</label>
                    <input value={action} onChange={e => setAction(e.target.value)}
                        className="border border-[color:var(--border-subtle)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] rounded-xl px-3 py-2 shadow-[var(--shadow-soft)]"
                        placeholder={t("admin.audit.action.ph", "USER_PATCH / ORDER_ACTIVATE ...")} />
                </div>
                <div className="flex flex-col">
                    <label className="text-sm text-[color:var(--text-secondary)]">{t("admin.audit.targetType", "Тип объекта")}</label>
                    <input value={targetType} onChange={e => setTargetType(e.target.value)}
                        className="border border-[color:var(--border-subtle)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] rounded-xl px-3 py-2 shadow-[var(--shadow-soft)]"
                        placeholder={t("admin.audit.targetType.ph", "user / order / transport ...")} />
                </div>
                <button onClick={load} className="px-4 py-2 rounded-xl shadow bg-blue-600 hover:bg-blue-500 text-white">
                    {t("admin.common.filter", "Фильтровать")}
                </button>
            </div>

            <div className="overflow-auto rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] shadow-[var(--shadow-soft)]">
                <table className="min-w-full text-sm text-[color:var(--text-primary)]">
                    <thead className="bg-[color:var(--bg-card-soft)] text-[color:var(--text-secondary)]">
                        <tr>
                            <th className="p-3 text-left">ID</th>
                            <th className="p-3 text-left">{t("admin.audit.admin", "Админ")}</th>
                            <th className="p-3 text-left">{t("admin.audit.action", "Действие")}</th>
                            <th className="p-3 text-left">{t("admin.audit.object", "Объект")}</th>
                            <th className="p-3 text-left">{t("admin.audit.before", "До")}</th>
                            <th className="p-3 text-left">{t("admin.audit.after", "После")}</th>
                            <th className="p-3 text-left">{t("admin.audit.time", "Время")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(a => (
                            <tr key={a.id} className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--control-bg-hover)]">
                                <td className="p-3">{a.id}</td>
                                <td className="p-3">{a.admin_user_id}</td>
                                <td className="p-3">{a.action}</td>
                                <td className="p-3">{a.target_type}#{a.target_id}</td>
                                <td className="p-3 max-w-[320px] truncate" title={a.payload_before || ""}>{a.payload_before || "-"}</td>
                                <td className="p-3 max-w-[320px] truncate" title={a.payload_after || ""}>{a.payload_after || "-"}</td>
                                <td className="p-3">{a.created_at ? new Date(a.created_at).toLocaleString() : "-"}</td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr><td colSpan={7} className="p-6 text-center text-[color:var(--text-secondary)]">{t("admin.common.empty", "Пусто")}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
