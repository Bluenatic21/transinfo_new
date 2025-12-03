// src/app/components/OrderListMobile.js
"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useMapHover } from "./MapHoverContext";
import OrderCardMobile from "./OrderCardMobile";
import MobileFilterSheet from "./mobile/MobileFilterSheet";
import MobileMapSheet from "./mobile/MobileMapSheet";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";
import { api } from "@/config/env";

export default function OrderListMobile({
    orders = [],
    fetchOrders,
    filters = {},
    setFilters,
    visibleIds,
    onFilteredIdsChange,
    setFiltersFromMap,
    estimatedCount, // initial from parent (текущее применённое)
    onLoadMore,
    loading,
    hasMore,
}) {
    const { t } = useLang();
    // синхронизируем «карта → список»: прокрутка к карточке после клика по пину
    const cardRefs = useRef(new Map());
    const { clickedItemId } = useMapHover();
    const { authFetchWithRefresh } = useUser();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };

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

    // фиксим иконки Leaflet (модуль общий для приложения)
    useEffect(() => {
        import("../leaflet-fix");
    }, []);

    const surface = "var(--surface, #182337)";
    const headerBg = "var(--header-bg, #212c46)";
    const accent = "var(--brand-blue, #43c8ff)";
    const textPrimary = "var(--text-primary, #0f172a)";
    const textSecondary = "var(--text-secondary, #8fb3d9)";
    const textMuted = "var(--text-muted, #9ca3af)";
    const controlBg = "var(--control-bg, #ffffff)";
    const controlBorder = "var(--border-subtle, rgba(255,255,255,.15))";
    const headingColor = resolvedTheme === "light" ? textPrimary : accent;

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

    const [mapOpen, setMapOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
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

    // NEW: стабильное превью количества (без «миганий»)
    const handlePreview = async (norm) => {
        // маркируем этот запрос как «последний»
        const reqId = ++previewReqRef.current;
        // отменяем предыдущий запрос, если ещё идёт
        try { if (previewAbortRef.current) previewAbortRef.current.abort(); } catch { }
        const abort = new AbortController();
        previewAbortRef.current = abort;
        try {
            // сериализация параметров
            const q = Object.entries(norm)
                .filter(([_, v]) => v !== "" && v !== undefined && v !== null && !(typeof v === "boolean" && v === false))
                .map(([k, v]) =>
                    Array.isArray(v)
                        ? v.map((val) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`).join("&")
                        : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
                )
                .join("&");
            const pageQuery = `page=1&page_size=1`;
            const url = api(`/orders${q ? "?" + q + "&" + pageQuery : "?" + pageQuery}`);
            const resp = await authFetchWithRefresh(url, { cache: "no-store", signal: abort.signal });
            const totalHeader = resp.headers.get("X-Total-Count") || resp.headers.get("x-total-count");
            // если хедера нет, аккуратно пытаемся прочесть JSON-клон (page_size=1 → 0 или 1)
            const nextVal = totalHeader
                ? (parseInt(totalHeader, 10) || 0)
                : (async () => { try { return (Array.isArray(await resp.clone().json()) ? 1 : 0); } catch { return 0; } })();
            if (reqId === previewReqRef.current) {
                const val = typeof nextVal.then === "function" ? await nextVal : nextVal;
                setPreviewCount(Number.isFinite(val) ? val : 0);
            }
        } catch (e) {
            // на ошибках/отмене предыдущее значение не трогаем — без «мигания»
        }
    };

    const filtered = useMemo(() => {
        const arr = Array.isArray(orders) ? orders : [];
        if (Array.isArray(visibleIds)) return arr.filter((o) => visibleIds.includes(o.id));
        return arr;
    }, [orders, visibleIds]);

    return (
        <div style={{ background: surface, minHeight: "100vh", paddingBottom: 64 }}>
            {/* шапка */}
            <div
                style={{
                    position: "sticky",
                    top: 0,
                    background: headerBg,
                    zIndex: 10,
                    padding: "18px 16px 10px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <span style={{ fontWeight: 800, fontSize: 21, color: headingColor }}>
                    {t("orders.title", "Заявки")}
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

            <div style={{ padding: "12px 0 0 0" }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", color: textMuted, marginTop: 30 }}>
                        {t("orders.emptyByFilter", "Нет заявок по выбранным фильтрам.")}
                    </div>
                ) : (
                    filtered.map((o, idx) => {
                        const key = o?.id ?? o?.uid ?? `order-${idx}`;
                        const refId = o?.id ?? o?.uid;
                        return (
                            <div
                                key={key}
                                data-order-id={refId ?? key}
                                ref={(el) => {
                                    if (el && refId) cardRefs.current.set(refId, el);
                                }}
                            >
                                <OrderCardMobile key={`card-${key}`} order={o} />
                            </div>
                        );
                    })
                )}
            </div>

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
                        ? t("orders.more", "Прокрутите ниже, чтобы загрузить ещё")
                        : t("orders.noMore", "Больше заявок нет")}
            </div>

            {/* Фильтр именно для заявок */}
            <MobileFilterSheet
                type="orders"
                open={filterOpen}
                initialFilters={filters}
                onClose={() => setFilterOpen(false)}
                estimatedCount={previewCount}
                onPreview={handlePreview}
                onReset={() => {
                    setFilters({});
                    setFilterOpen(false);
                }}
                onApply={(norm) => {
                    // заменяем фильтры целиком, чтобы не оставались хвосты
                    setFilters(norm);
                    fetchOrders?.();
                    setFilterOpen(false);
                }}
            />

            {/* Карта: передаём список ЗАЯВОК в проп orders */}
            <MobileMapSheet
                open={mapOpen}
                onClose={() => setMapOpen(false)}
                orders={Array.isArray(orders) ? orders : []}
                filters={filters}
                setFiltersFromMap={setFiltersFromMap || setFilters}
                onFilteredIdsChange={onFilteredIdsChange}
            />
        </div>
    );
}
