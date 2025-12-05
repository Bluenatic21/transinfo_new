"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useUser } from "@/app/UserContext";
import { useRouter } from "next/navigation";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

/**
 * Плавающий тост в левом-нижнем углу:
 * - подписывается на /ws/notifications (нужен user_id и token),
 * - при GPS_REQUEST_CREATED тянет /track/requests/incoming и показывает карточку,
 * - "Принять"/"Отказать" бьют в /track/requests/{id}/respond.
 */
export default function GpsRequestToast() {
    const { user, authFetchWithRefresh, emitMonitoringReload, onNotification } = useUser();
    const router = useRouter();
    const { t } = useLang();
    const [queue, setQueue] = useState([]); // [{id, order_id, from_user_name}]
    const wsRef = useRef(null);

    // первичная подгрузка входящих «ожидает ответа»
    async function loadIncoming() {
        try {
            const r = await authFetchWithRefresh(api("/track/requests/incoming"));
            const items = await r.json();
            const mapped = (Array.isArray(items) ? items : []).map(i => ({
                id: i?.request?.id,
                order_id: i?.request?.order_id,
                from_user_id: i?.from_user_id ?? null,
                from_user_name: i?.from_user_name || t("gps.toast.fromUserFallback", "Пользователь"),
                message: i?.request?.message ?? null
            })).filter(x => x.id);
            setQueue(curr => {
                const ids = new Set(curr.map(x => x.id));
                return [...curr, ...mapped.filter(x => !ids.has(x.id))];
            });
        } catch { }
    }

    // открыть WS: требуется токен (берём через /refresh-token)
    async function openWs() { return; } // WS больше не открываем здесь

    // подписка на общий WS: подтягиваем входящие и обновляем «Кому я делюсь»
    useEffect(() => {
        if (!onNotification) return;
        const off = onNotification((msg) => {
            const evt = msg?.event || msg?.type;
            if (evt === "GPS_REQUEST_CREATED" || evt === "GPS_REQUEST_RESPONDED") {
                loadIncoming();
                emitMonitoringReload?.();
            }
        });
        return () => { try { off && off(); } catch { } };
    }, [onNotification]);

    useEffect(() => {
        loadIncoming();
        openWs();
        const poll = setInterval(loadIncoming, 60_000); // резервный поллинг раз в минуту
        return () => clearInterval(poll);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    async function respond(id, accept) {
        try {
            await authFetchWithRefresh(api(`/track/requests/${id}/respond`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accept }),
            });
        } catch { }
        setQueue(q => q.filter(x => x.id !== id));
        emitMonitoringReload?.();// показать новый "шеринг" в "Кому я делюсь" сразу
    }

    if (typeof document === "undefined") return null;
    return ReactDOM.createPortal(
        <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 1100, display: "flex", flexDirection: "column", gap: 10 }}>
            {queue.map(item => (
                <div key={item.id}
                    style={{
                        width: 360, maxWidth: "92vw",
                        background: "#12233a", color: "#e3f2fd",
                        border: "1px solid #223b64", borderRadius: 12,
                        boxShadow: "0 10px 28px #0008", padding: 12
                    }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#43c8ff", marginBottom: 6 }}>
                        {t("gps.toast.title", "Запрос GPS по грузу")} #{item.order_id}
                    </div>
                    <div
                        style={{ fontSize: 13, opacity: 0.9, marginBottom: 10, cursor: item.from_user_id ? "pointer" : "default", textDecoration: item.from_user_id ? "underline" : "none" }}
                        onClick={() => { if (item.from_user_id) router.push(`/profile/${item.from_user_id}`); }}>
                        {t("gps.toast.from", "от")} {item.from_user_name}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => respond(item.id, true)}
                            style={{ flex: 1, background: "#1f8b4c", color: "white", border: 0, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
                            {t("gps.accept", "Принять")}
                        </button>
                        <button onClick={() => respond(item.id, false)}
                            style={{ flex: 1, background: "#7a2730", color: "white", border: 0, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
                            {t("gps.decline", "Отказать")}
                        </button>
                    </div>
                </div>
            ))}
        </div>,
        document.body
    );
}
