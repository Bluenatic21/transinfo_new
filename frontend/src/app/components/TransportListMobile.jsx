"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useMapHover } from "./MapHoverContext";
import MobileFilterSheet from "./mobile/MobileFilterSheet";
import MobileMapSheet from "./mobile/MobileMapSheet";
import TransportCardMobile from "./TransportCardMobile";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

/**
 * Мобильный список транспорта:
 * - липкая шапка с «Карта / Фильтр»
 * - безопасная нормализация входа
 * - live-превью количества по текущим настройкам фильтра в шторке
 */
export default function TransportListMobile({
    transports = [],
    loading = false,
    fetchTransports,
    filters,
    setFilters,
    handleResetFilters,
    visibleIds,
    setFiltersFromMap,
    onFilteredIdsChange,
    estimatedCount, // используем как стартовое значение, дальше считаем превью внутри
    onLoadMore,
    hasMore,
}) {
    const { t } = useLang();
    // синхронизация «карта ↔ список»: по клику на пин прокручиваем к карточке и подсвечиваем
    const cardRefs = useRef(new Map());
    const { clickedItemId } = useMapHover();
    // авторизованный fetch для превью-запросов
    const { authFetchWithRefresh } = useUser();

    useEffect(() => {
        if (!clickedItemId) return;
        const el = cardRefs.current.get(clickedItemId);
        if (el) {
            try {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch { }
            el.classList.add("highlight");
            setTimeout(() => el.classList.remove("highlight"), 1100);
            try {
                setMapOpen(false);
            } catch { }
        }
    }, [clickedItemId]);

    // хуки всегда сверху
    const [filterOpen, setFilterOpen] = useState(false);
    // Открываем фильтр только при прямом переходе (см. OrderListMobile).
    useEffect(() => {
        try {
            const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
            const mo = qs?.get?.("matches_only");
            const hasMatchesOnly = mo && mo !== "0" && String(mo).toLowerCase() !== "false";
            const openFromUrl = (qs?.get?.("openFilter") === "1");
            let openFromNav = false;
            try {
                if (typeof window !== "undefined") {
                    openFromNav = sessionStorage.getItem("openMobileFilterOnEntry") === "1";
                    if (openFromNav) sessionStorage.removeItem("openMobileFilterOnEntry");
                }
            } catch { }
            setFilterOpen(!hasMatchesOnly && (openFromUrl || openFromNav));
        } catch {
            setFilterOpen(false);
        }
    }, []);
    const [mapOpen, setMapOpen] = useState(false);

    const [previewCount, setPreviewCount] = useState(
        Number.isFinite(estimatedCount) ? estimatedCount : undefined
    );
    const previewReqRef = useRef(0);
    const previewAbortRef = useRef(null);
    useEffect(() => {
        if (Number.isFinite(estimatedCount)) setPreviewCount(estimatedCount);
    }, [estimatedCount]);

    const loadMoreRef = useRef(null);
    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting && hasMore && !loading) {
                    try { onLoadMore?.(); } catch { }
                }
            },
            { rootMargin: "280px 0px 320px 0px", threshold: 0 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, loading, onLoadMore]);

    // базовый URL берём из @/config/env через api()

    // стабильное превью количества транспорта (без «миганий», с отменой предыдущего)
    const handlePreview = async (norm) => {
        const reqId = ++previewReqRef.current;
        try { if (previewAbortRef.current) previewAbortRef.current.abort(); } catch { }
        const abort = new AbortController();
        previewAbortRef.current = abort;
        try {
            // сериализация как в десктопном TransportList (lat/lng только при radius>0)
            const pairs = Object.entries(norm).filter(([k, v]) => {
                if (v === "" || v === undefined || v === null) return false;
                if (typeof v === "boolean" && v === false) return false;
                if (k === "from_radius" && Number(v) <= 0) return false;
                if ((k === "from_location_lat" || k === "from_location_lng") && Number(norm?.from_radius) <= 0) return false;
                if (k === "to_radius" && Number(v) <= 0) return false;
                if ((k === "to_location_lat" || k === "to_location_lng") && Number(norm?.to_radius) <= 0) return false;
                return true;
            });
            const q = pairs
                .map(([k, v]) =>
                    Array.isArray(v)
                        ? v.map(val => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`).join("&")
                        : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join("&");
            const pageQuery = `page=1&page_size=1`;
            // NEW: если в фильтре есть даты — просим API включить «постоянно»
            const hasDate = !!(norm?.ready_date_from || norm?.ready_date_to);
            const queryString = [q, pageQuery, hasDate ? "include_permanent=1" : null]
                .filter(Boolean)
                .join("&");
            const url = api(`/transports?${queryString}`);
            const resp = await authFetchWithRefresh(url, { cache: "no-store", signal: abort.signal });
            const totalHeader = resp.headers.get("X-Total-Count") || resp.headers.get("x-total-count");
            const nextVal = totalHeader
                ? (parseInt(totalHeader, 10) || 0)
                : (async () => { try { return (Array.isArray(await resp.clone().json()) ? 1 : 0); } catch { return 0; } })();
            if (reqId === previewReqRef.current) {
                const val = typeof nextVal.then === "function" ? await nextVal : nextVal;
                setPreviewCount(Number.isFinite(val) ? val : 0);
            }
        } catch (e) {
            // оставляем предыдущее значение, чтобы не мигало
        }
    };

    const surface = "var(--surface, #182337)";
    const headerBg = "var(--header-bg, #212c46)";
    const accent = "var(--brand-blue, #43c8ff)";
    const textPrimary = "var(--text-primary, #0f172a)";
    const textSecondary = "var(--text-secondary, #8fb3d9)";
    const controlBg = "var(--control-bg, #ffffff)";
    const controlBorder = "var(--border-subtle, rgba(255,255,255,.15))";
    const surfaceSoft = "var(--surface-soft, #eef1f6)";

    const toolbarBtnStyle = {
        border: `1px solid ${controlBorder}`,
        background: controlBg,
        color: textPrimary,
        padding: "8px 12px",
        borderRadius: 12,
        fontWeight: 800,
        fontSize: 13,
        boxShadow: "var(--shadow-soft, none)",
        transition: "transform var(--transition-fast, 150ms ease-out)",
    };

    const rows = useMemo(() => {
        const arr = Array.isArray(transports) ? transports : [];
        const normalized = arr.map((t) => normalizeTransport(t));

        const radiusActive =
            Number(filters?.map_radius) > 0 &&
            Array.isArray(filters?.map_center) &&
            filters.map_center.length === 2;

        if (radiusActive && Array.isArray(visibleIds)) {
            return normalized.filter((t) => visibleIds.includes(t.id || t.uid));
        }

        return normalized;
    }, [transports, visibleIds, filters?.map_radius, filters?.map_center]);

    if (loading && rows.length === 0) {
        return (
            <div>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        style={{
                            width: "100%",
                            borderRadius: 16,
                            background: surfaceSoft,
                            boxShadow: "var(--shadow-soft, 0 3px 24px #00184455)",
                            padding: 14,
                            margin: "12px 0",
                            height: 110,
                            opacity: 0.7,
                        }}
                    />
                ))}
            </div>
        );
    }

    return (
        <div style={{ background: surface, minHeight: "100vh", paddingBottom: 64 }}>
            {/* липкая шапка */}
            <div
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    background: headerBg,
                    padding: "18px 16px 10px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <span style={{ fontWeight: 800, fontSize: 21, color: accent }}>
                    {t("transport.title", "Транспорт")}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setMapOpen(true)} style={toolbarBtnStyle}>
                        {t("common.map", "Карта")}
                    </button>
                    <button onClick={() => setFilterOpen(true)} style={toolbarBtnStyle}>
                        {t("common.filter", "Фильтр")}
                    </button>
                </div>
            </div>

            {rows.map((t) => (
                <div
                    key={t.id || t.uid}
                    ref={(el) => {
                        if (el && (t?.id || t?.uid)) {
                            cardRefs.current.set(t.id || t.uid, el);
                        }
                    }}
                >
                    <TransportCardMobile transport={t.raw || t} />
                </div>
            ))}

            <div
                ref={loadMoreRef}
                style={{
                    minHeight: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: textSecondary,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                }}
            >
                {loading
                    ? t("common.loading", "Загружаем...")
                    : hasMore
                        ? t("transport.more", "Прокрутите ниже, чтобы загрузить ещё")
                        : t("transport.noMore", "Больше транспорта нет")}
            </div>

            {/* шторка фильтра */}
            <MobileFilterSheet
                type="transport"
                open={filterOpen}
                initialFilters={filters}
                onClose={() => setFilterOpen(false)}
                estimatedCount={previewCount}
                onPreview={handlePreview}
                onReset={() => {
                    handleResetFilters?.();
                    setFilterOpen(false);
                }}
                onApply={(normalized) => {
                    // заменяем фильтры целиком, чтобы не оставались хвосты
                    setFilters?.(normalized);
                    fetchTransports?.();
                    setFilterOpen(false);
                }}
            />

            {/* шторка карты */}
            <MobileMapSheet
                open={mapOpen}
                onClose={() => setMapOpen(false)}
                transports={Array.isArray(transports) ? transports : []}
                filters={filters}
                setFiltersFromMap={setFiltersFromMap}
                onFilteredIdsChange={onFilteredIdsChange}
            />
        </div>
    );
}

/* ---------- helpers ---------- */

function normalizeTransport(raw) {
    const id =
        raw?.id ?? raw?._id ?? raw?.transport_id ?? raw?.uid ?? raw?.uuid ?? null;

    const from =
        raw?.from_location ||
        raw?.from ||
        raw?.origin ||
        raw?.start ||
        raw?.source ||
        raw?.location_from ||
        null;

    // как угодно названные направления «куда»
    let toArr =
        (Array.isArray(raw?.to_locations) && raw?.to_locations) ||
        (Array.isArray(raw?.to_location) && raw?.to_location) ||
        (Array.isArray(raw?.to) && raw?.to) ||
        (raw?.to_location ? [raw.to_location] : raw?.to ? [raw.to] : []);
    if (!toArr || toArr.length === 0) {
        if (raw?.destination) toArr = [raw.destination];
        const guess =
            raw?.to_city || raw?.to_region || raw?.to_country
                ? [
                    {
                        city: raw?.to_city,
                        region: raw?.to_region,
                        country: raw?.to_country,
                    },
                ]
                : null;
        if (guess) toArr = [guess];
    }

    const vehicleType = raw?.vehicle_type || raw?.truck_type || raw?.type || "";
    const body =
        raw?.body_type || raw?.body || raw?.cargo_body || raw?.trailer_body || "";
    const adr = raw?.adr || raw?.ADR || raw?.danger || raw?.hazmat || false;

    const readyFrom =
        raw?.ready_date_from ||
        raw?.ready_from ||
        raw?.date_from ||
        raw?.available_from ||
        null;
    const readyTo =
        raw?.ready_date_to || raw?.ready_to || raw?.date_to || raw?.available_to || null;

    const price =
        raw?.price ?? raw?.rate ?? raw?.budget ?? raw?.price_value ?? raw?.sum ?? null;
    const currency =
        raw?.currency || raw?.price_currency || raw?.cur || raw?.money || "";

    const weight = raw?.capacity_weight ?? raw?.weight ?? raw?.max_weight ?? null;
    const volume = raw?.capacity_volume ?? raw?.volume ?? raw?.max_volume ?? null;

    return {
        id,
        from: placeToText(from),
        to: (toArr || []).map(placeToText).filter(Boolean),
        vehicleType: [vehicleType, body].filter(Boolean).join(" • "),
        adr: !!adr,
        readyFrom: safeDate(readyFrom),
        readyTo: safeDate(readyTo),
        price: safePrice(price, currency),
        weight,
        volume,
        raw,
    };
}

function placeToText(p) {
    if (!p) return "";
    if (typeof p === "string") return p;
    const formatted =
        p?.formatted || [p?.city, p?.region, p?.country].filter(Boolean).join(", ");
    return formatted || "";
}

function safeDate(d) {
    if (!d) return "";
    const dt = new Date(d);
    return isNaN(dt.getTime())
        ? ""
        : dt.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
}

function safePrice(val, cur) {
    if (val == null || val === "") return "";
    try {
        const n = Number(val);
        const s = Number.isFinite(n) ? n.toLocaleString() : String(val);
        return cur ? `${s} ${cur}` : s;
    } catch {
        return String(val);
    }
}
