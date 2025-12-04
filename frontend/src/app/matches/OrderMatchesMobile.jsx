// src/app/matches/OrderMatchesMobile.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import TransportCardMobile from "../components/TransportCardMobile";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

const MobileMapSheet = dynamic(() => import("../components/mobile/MobileMapSheet"), { ssr: false });

export default function OrderMatchesMobile({ orderId, order, onBack }) {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mapOpen, setMapOpen] = useState(false);
    const { t } = useLang?.() || { t: (_k, f) => f };

    try { import("../leaflet-fix"); } catch { }

    useEffect(() => {
        let aborted = false;
        async function load() {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;
                const r = await fetch(api(`/orders/${orderId}/matching_transports`), {
                    headers: { Authorization: "Bearer " + token }
                });
                const data = r.ok ? await r.json() : [];
                if (!aborted) setList(Array.isArray(data) ? data : []);
                try {
                    await fetch(api(`/orders/${orderId}/view_matches`), {
                        method: "POST", headers: { Authorization: "Bearer " + token }
                    });
                } catch { }
            } finally {
                if (!aborted) setLoading(false);
            }
        }
        load();
        return () => { aborted = true; };
    }, [orderId]);

    const rows = useMemo(() => Array.isArray(list) ? list : [], [list]);

    const headerBtn = {
        border: "1px solid var(--border-subtle)",
        background: "var(--control-bg)",
        color: "var(--text-primary)",
        padding: "8px 12px",
        borderRadius: 12,
        fontWeight: 800,
        fontSize: 13,
        boxShadow: "var(--shadow-soft)",
    };

    return (
        <div
            style={{
                background: "var(--bg-body)",
                color: "var(--text-primary)",
                minHeight: "100vh",
                paddingBottom: 64,
            }}
        >
            <div style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "var(--bg-header)",
                padding: "18px 12px 12px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-soft)",
            }}>
                <button onClick={onBack} style={headerBtn}>{t("common.back", "Назад")}</button>
                <div style={{ fontWeight: 900, fontSize: 18, color: "var(--brand-blue)" }}>
                    {t("matches.transportTitle", "Соответствия: транспорт")}
                </div>
                <button onClick={() => setMapOpen(true)} style={headerBtn}>{t("common.map", "Карта")}</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "10px 12px 18px 12px" }}>
                {rows.map((t) => (
                    <TransportCardMobile key={t.id || t.uid} transport={t} />
                ))}
                {!loading && rows.length === 0 && (
                    <div style={{ color: "var(--text-secondary)" }}>{t("matches.noTransports", "Нет совпавшего транспорта.")}</div>
                )}
            </div>

            <MobileMapSheet
                open={mapOpen}
                onClose={() => setMapOpen(false)}
                transports={rows}
                filters={{}}
                setFiltersFromMap={() => { }}
                onFilteredIdsChange={() => { }}
            />
        </div>
    );
}
