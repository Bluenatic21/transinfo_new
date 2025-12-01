/* src/app/components/SavedOrdersSection.jsx */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/app/UserContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import CargoCompactCard from "@/app/components/CargoCompactCard";
import TransportCompactCard from "@/app/components/TransportCompactCard";
import SaveToggleButton from "@/app/components/SaveToggleButton";
import { FiSearch } from "react-icons/fi";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";
/* ----------------------------- UI helpers ----------------------------- */

const useSavedThemeColors = () => {
    const { resolvedTheme } = useTheme?.() || {};
    const isLight = resolvedTheme === "light";

    return useMemo(
        () => ({
            isLight,
            searchBg: isLight ? "#ffffff" : "#0B1324",
            searchBorder: isLight ? "#dbe4f3" : "#233659",
            searchText: isLight ? "#0f1b2a" : "#e3f2fd",
            searchPlaceholder: isLight ? "#6b7280" : "#9cc4e7",
            chipBg: isLight ? "rgba(99,164,255,0.12)" : "rgba(139,198,252,0.18)",
            chipBorder: isLight ? "rgba(99,164,255,0.4)" : "rgba(139,198,252,0.28)",
            emptyBg: isLight ? "rgba(99,164,255,0.08)" : "rgba(255,255,255,0.03)",
            emptyBorder: isLight ? "1px dashed rgba(99,164,255,0.32)" : "1px dashed rgba(139,198,252,0.25)",
            emptyText: isLight ? "#4b5563" : "rgba(227,242,253,0.85)",
            segmentedBg: isLight ? "#e9f1fb" : "linear-gradient(180deg, rgba(139,198,252,0.08), rgba(139,198,252,0.04))",
            segmentedBorder: isLight ? "#dbe4f3" : "rgba(139,198,252,0.35)",
            segmentedActiveBg: isLight ? "linear-gradient(180deg, #f7fbff, #e6f1ff)" : "linear-gradient(180deg, #1e3350, #15263f)",
            segmentedActiveText: isLight ? "#0f1b2a" : "#e3f2fd",
            segmentedInactiveText: isLight ? "#4b5563" : "rgba(227,242,253,0.7)",
            stickyBg: isLight ? "rgba(246,248,251,0.95)" : "transparent",
        }),
        [isLight]
    );
};

function SearchBar({ placeholder, value, onChange, colors }) {
    return (
        <div
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
                border: `1px solid ${colors.searchBorder}`,
                background: colors.searchBg,
            }}
        >
            <FiSearch size={18} style={{ opacity: 0.8, color: colors.searchPlaceholder }} />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={`w-full bg-transparent outline-none text-sm ${colors.isLight ? "placeholder:text-slate-500" : "placeholder:text-slate-300"}`}
                style={{ paddingTop: 2, paddingBottom: 2, color: colors.searchText }}
            />
        </div>
    );
}

function SectionHeader({ title, count, colors }) {
    return (
        <div className="flex items-center justify-between w-full">
            <div className="text-base font-semibold">{title}</div>
            <div
                className="text-xs"
                style={{
                    background: colors.chipBg,
                    border: `1px solid ${colors.chipBorder}`,
                    padding: "2px 8px",
                    borderRadius: 999,
                    color: colors.searchText,
                }}
            >
                {count}
            </div>
        </div>
    );
}

/* ----------------------------- Filters ----------------------------- */

function orderHaystack(o) {
    const parts = [
        o?.title,
        o?.from_location || o?.from_city || o?.from,
        o?.to_location || o?.to_city || o?.to,
        o?.truck_type || o?.transport_type,
        o?.cargo_name || o?.cargo,
        o?.comment,
        o?.owner_name,
    ].filter(Boolean);
    return parts.join(" ").toLowerCase();
}

function transportHaystack(t) {
    const parts = [
        t?.truck_type || t?.transport_kind || t?.transport_type,
        t?.from_location || t?.from_city || t?.from,
        Array.isArray(t?.to_locations) ? t.to_locations.join(" ") : (t?.to_city || t?.to),
        t?.mode,
        t?.regularity,
        t?.car_model,
        t?.body_type,
        t?.comment,
        t?.owner_name,
    ].filter(Boolean);
    return parts.join(" ").toLowerCase();
}

/* --------------------------- Lists (bodies) --------------------------- */

function OrdersListBody() {
    const { t } = useLang();
    const { fetchSavedOrders, savedOrders = [] } = useUser();
    const [q, setQ] = useState("");
    // нужно знать, что мы на мобилке — тогда включим компактный вертикальный маршрут
    const isMobile = useIsMobile();
    const colors = useSavedThemeColors();


    useEffect(() => {
        fetchSavedOrders?.();
    }, [fetchSavedOrders]);

    const items = useMemo(() => {
        if (!q) return savedOrders;
        const needle = q.toLowerCase();
        return savedOrders.filter((o) => orderHaystack(o).includes(needle));
    }, [savedOrders, q]);

    return (
        <div className="flex flex-col gap-3">
            <SectionHeader title={t("saved.cargo.title", "Грузы")} count={savedOrders.length} colors={colors} />
            <SearchBar placeholder={t("saved.cargo.search", "Поиск по сохранённым грузам")} value={q} onChange={setQ} colors={colors} />

            {!items.length ? (
                <div
                    className="text-sm"
                    style={{
                        padding: "14px 10px",
                        borderRadius: 12,
                        background: colors.emptyBg,
                        border: colors.emptyBorder,
                        color: colors.emptyText,
                    }}
                >
                    {t("saved.cargo.empty", "Нет сохранённых грузов.")}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-w-0">
                    {items.map((o) => (
                        <div
                            key={o.id ?? o._id}
                            className="min-w-0"
                            style={{ position: "relative", width: "100%" }}
                        >
                            <div style={{ position: "absolute", right: 10, top: 10, zIndex: 3 }}>
                                <SaveToggleButton type="order" id={o.id ?? o._id} />
                            </div>
                            <Link
                                href={`/orders/${o.id ?? o._id}`}
                                style={{ display: "block", textDecoration: "none", color: "inherit" }}
                            >
                                <CargoCompactCard cargo={o} routeStacked={isMobile} />
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function TransportsListBody() {
    const { t } = useLang();
    const { fetchSavedTransports, savedTransports = [] } = useUser();
    const [q, setQ] = useState("");
    const colors = useSavedThemeColors();

    useEffect(() => {
        fetchSavedTransports?.();
    }, [fetchSavedTransports]);

    const items = useMemo(() => {
        if (!q) return savedTransports;
        const needle = q.toLowerCase();
        return savedTransports.filter((t) => transportHaystack(t).includes(needle));
    }, [savedTransports, q]);

    return (
        <div className="flex flex-col gap-3">
            <SectionHeader title={t("saved.transport.title", "Транспорт")} count={savedTransports.length} colors={colors} />
            <SearchBar placeholder={t("saved.transport.search", "Поиск по сохранённому транспорту")} value={q} onChange={setQ} colors={colors} />

            {!items.length ? (
                <div
                    className="text-sm"
                    style={{
                        padding: "14px 10px",
                        borderRadius: 12,
                        background: colors.emptyBg,
                        border: colors.emptyBorder,
                        color: colors.emptyText,
                    }}
                >
                    {t("saved.transport.empty", "Нет сохранённого транспорта.")}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-w-0">
                    {items.map((t) => (
                        <div
                            key={t.id ?? t._id}
                            className="min-w-0"
                            style={{ position: "relative", width: "100%" }}
                        >
                            <div style={{ position: "absolute", right: 10, top: 10, zIndex: 3 }}>
                                <SaveToggleButton type="transport" id={t.id} />
                            </div>
                            <TransportCompactCard transport={t} hideStatus hideLive />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ----------------------------- Exports ----------------------------- */

/** Комбинированная секция: табы «Грузы / Транспорт» */
export function SavedAllSection() {
    const [tab, setTab] = useState("cargo"); // cargo | transport
    const { t } = useLang();
    const colors = useSavedThemeColors();

    return (
        <div className="w-full min-w-0 max-w-none">
            <div className="sticky top-0 z-10 mb-3 md:mb-4" style={{ background: colors.stickyBg }}>
                <div
                    className="w-full grid grid-cols-2 rounded-2xl p-1"
                    style={{
                        border: `1px solid ${colors.segmentedBorder}`,
                        background: colors.segmentedBg,
                    }}
                >
                    <button
                        onClick={() => setTab("cargo")}
                        className="px-3 py-2 rounded-xl text-sm transition font-medium"
                        style={{
                            background: tab === "cargo" ? colors.segmentedActiveBg : "transparent",
                            border: tab === "cargo" ? `1px solid ${colors.segmentedBorder}` : "1px solid transparent",
                            color: tab === "cargo" ? colors.segmentedActiveText : colors.segmentedInactiveText,
                        }}
                    >
                        {t("saved.tabs.cargo", "Грузы")}
                    </button>
                    <button
                        onClick={() => setTab("transport")}
                        className="px-3 py-2 rounded-xl text-sm transition font-medium"
                        style={{
                            background: tab === "transport" ? colors.segmentedActiveBg : "transparent",
                            border: tab === "transport" ? `1px solid ${colors.segmentedBorder}` : "1px solid transparent",
                            color: tab === "transport" ? colors.segmentedActiveText : colors.segmentedInactiveText,
                        }}
                    >
                        {t("saved.tabs.transport", "Транспорт")}
                    </button>
                </div>
            </div>

            {tab === "cargo" ? <OrdersListBody /> : <TransportsListBody />}
        </div>
    );
}


/** Отдельная секция транспорта (для прямого импорта) */
export function SavedTransportsSection() {
    return <TransportsListBody />;
}

/**
 * ДЕФОЛТНЫЙ экспорт:
 * - на мобильном: комбинированные табы («Грузы / Транспорт»)
 * - на десктопе: сохраняем прежний вид (только список «Грузы»)
 */
export default function SavedOrdersSection() {
    const isMobile = useIsMobile();
    return isMobile ? <SavedAllSection /> : <OrdersListBody />;
}
