"use client";
import React, { useEffect, useState } from "react";
import { useUser } from "@/app/UserContext";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

type ReqItem = {
    id: number;
    order_id: number;
    from_user_id?: number | null;
    from_user_name?: string | null;
    to_user_id?: number | null;
    to_user_name?: string | null;
    message?: string | null;
    status?: string | null;
    created_at?: string | null;
};

export default function GpsRequestsSection(
    { preset, hideTabs = false }: { preset?: "in" | "out"; hideTabs?: boolean }
) {
    const { authFetchWithRefresh, monitoringReloadTick } = useUser();
    const [tab, setTab] = useState<"in" | "out">(preset ?? "in");
    useEffect(() => { if (preset) setTab(preset); }, [preset]);
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<ReqItem[]>([]);
    const { t } = useLang();

    async function load() {
        setLoading(true);
        try {
            const url = tab === "in"
                ? api("/track/requests/incoming")
                : api("/track/requests/outgoing");
            const r = await authFetchWithRefresh(url);
            const data = await r.json();

            if (tab === "in") {
                // [{ request: {...}, from_user_name, from_user_id }]
                const list = (Array.isArray(data) ? data : []).map((x: any) => ({
                    id: x?.request?.id,
                    order_id: x?.request?.order_id,
                    from_user_id: x?.from_user_id ?? null,
                    from_user_name: x?.from_user_name ?? null,
                    message: x?.request?.message ?? null,
                    status: x?.request?.status ?? "PENDING",
                    created_at: x?.request?.created_at ?? null,
                })).filter((i: ReqItem) => i.id);
                setItems(list);
            } else {
                // [{ request: {...}, to_user_name }]
                const list = (Array.isArray(data) ? data : []).map((x: any) => ({
                    id: x?.request?.id,
                    order_id: x?.request?.order_id,
                    to_user_id: x?.request?.target_user_id ?? null,
                    to_user_name: x?.to_user_name ?? null,
                    message: x?.request?.message ?? null,
                    status: x?.request?.status ?? null,
                    created_at: x?.request?.created_at ?? null,
                })).filter((i: ReqItem) => i.id);
                setItems(list);
            }
        } catch (e) {
            setItems([]);
        }
        setLoading(false);
    }

    useEffect(() => { load(); }, [tab, monitoringReloadTick]);

    async function respond(id: number, accept: boolean) {
        try {
            await authFetchWithRefresh(api(`/track/requests/${id}/respond`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accept }),
            });
            // обновим после действия
            load();
        } catch (e) { }
    }

    return (
        <div style={{ background: "#182033", borderRadius: 14, border: "1px solid #233655", padding: 14, boxShadow: "0 2px 14px #19396922" }}>
            {!hideTabs && (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button
                        onClick={() => setTab("in")}
                        style={{
                            background: tab === "in" ? "#1f2a37" : "#0c1520",
                            color: tab === "in" ? "#e3f2fd" : "#b3d5fa",
                            border: "1px solid rgba(255,255,255,.06)",
                            borderRadius: 10,
                            padding: "8px 12px",
                            fontWeight: 800,
                            cursor: "pointer",
                        }}>
                        {t("gps.tabs.in", "Входящие запросы")}
                    </button>
                    <button
                        onClick={() => setTab("out")}
                        style={{
                            background: tab === "out" ? "#0f1b2e" : "#152541",
                            color: tab === "out" ? "#43c8ff" : "#9bc7ff",
                            border: "1px solid #2a4872",
                            borderRadius: 10,
                            padding: "8px 12px",
                            fontWeight: 800,
                            cursor: "pointer",
                        }}>
                        {t("gps.tabs.out", "Исходящие запросы")}
                    </button>
                </div>
            )}

            {loading && <div style={{ color: "#9cc4e7" }}>{t("common.loading", "Загрузка…")}</div>}
            {!loading && items.length === 0 && <div style={{ color: "#9cc4e7" }}>{t("common.empty", "Пусто")}</div>}

            <div style={{ display: "grid", gap: 8 }}>
                {items.map((it) => (
                    <div key={it.id}
                        style={{ background: "#14243d", border: "1px solid #1f3961", borderRadius: 10, padding: 10 }}>
                        <div style={{ color: "#43c8ff", fontWeight: 800, marginBottom: 4 }}>
                            {t("gps.order", "Груз")} #{it.order_id}{" "}
                            <span style={{ color: "#9bc7ff", fontWeight: 600 }}>({it.status || "PENDING"})</span>
                        </div>
                        {tab === "in" ? (
                            <div style={{ color: "#9bc7ff", marginBottom: 8 }}>
                                {t("gps.from", "От:")} <b
                                    onClick={() => it.from_user_id && (window.location.href = `/profile/${it.from_user_id}`)}
                                    style={{ cursor: it.from_user_id ? "pointer" : "default", textDecoration: it.from_user_id ? "underline" : "none", color: "#d7ecff" }}>
                                    {it.from_user_name || t("common.user", "Пользователь")}
                                </b>
                                {it.message ? <><br />{t("gps.message", "Сообщение:")} {it.message}</> : null}
                            </div>
                        ) : (
                            <div style={{ color: "#9bc7ff", marginBottom: 8 }}>
                                {t("gps.to", "Кому:")} <b style={{ color: "#d7ecff" }}>{it.to_user_name || t("common.user", "Пользователь")}</b>
                                {it.message ? <><br />{t("gps.message", "Сообщение:")} {it.message}</> : null}
                            </div>
                        )}

                        {tab === "in" && (it.status === "PENDING" || !it.status) && (
                            <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => respond(it.id, true)}
                                    style={{ background: "#33de7b", color: "#102030", border: 0, borderRadius: 10, padding: "8px 14px", fontWeight: 800, cursor: "pointer" }}>
                                    {t("gps.accept", "Принять")}
                                </button>
                                <button onClick={() => respond(it.id, false)}
                                    style={{ background: "#3a4f74", color: "#9bc7ff", border: 0, borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>
                                    {t("gps.decline", "Отказать")}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
