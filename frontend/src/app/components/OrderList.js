"use client";
import countries from "i18n-iso-countries";
import "i18n-iso-countries/langs/en.json";
import "i18n-iso-countries/langs/ru.json";
import "i18n-iso-countries/langs/tr.json";
import "i18n-iso-countries/langs/ka.json";
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ru.json"));
countries.registerLocale(require("i18n-iso-countries/langs/tr.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ka.json"));
import UserAvatar from "./UserAvatar";
import { formatPrice } from "../utils/currency";
import { useLang } from "../i18n/LangProvider";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import OrderFilter from "./OrderFilter";
import { useIsMobile } from "../../hooks/useIsMobile";
import OrderListMobile from "./OrderListMobile";
import { useRouter, useSearchParams } from "next/navigation";
import { FaPhone, FaWhatsapp, FaTelegram, FaViber, FaComments, FaGavel, FaRegCommentDots, FaChevronUp } from "react-icons/fa";
import { useUser } from "../UserContext";
import { useMessenger } from "./MessengerContext";
import { motion, AnimatePresence } from "framer-motion";
import ReactCountryFlag from "react-country-flag";
import { api, abs } from "@/config/env";
import SaveToggleButton from "./SaveToggleButton";
import { useMapHover } from "./MapHoverContext";
import OrderShareButtons from "./OrderShareButtons";
import CargoCompactCard from "./CargoCompactCard";
import IconLabel from "./ui/IconLabel";
import {
    FiMap as MapIcon,
    FiList as ListIcon,
    FiGrid as GridIcon,
    FiAlignJustify as CompactIcon,
} from "react-icons/fi";
import { useTheme } from "../providers/ThemeProvider";

import MobileFilterSheet from "./mobile/MobileFilterSheet";
import MobileMapSheet from "./mobile/MobileMapSheet"; // если у грузов тоже одна и та же SimpleMap
import { CURRENCIES } from "../utils/currency";
import { LOADING_TYPES, getTruckBodyTypes, getLoadingTypes } from "./truckOptions";

// Цвет рейтинга 0→красный, 10→зелёный
function ratingToColor(value) {
    const v = Math.max(0, Math.min(10, Number(value) || 0));
    const hue = (v / 10) * 120; // 0=red, 120=green
    return `hsl(${hue}, 90%, 45%)`;
}

const SimpleMap = dynamic(() => import("./SimpleMap"), { ssr: false });
const UI_LANG =
    typeof navigator !== "undefined"
        ? (navigator.language || "ru").split("-")[0]
        : "ru";
// --- НОРМАЛИЗАЦИЯ ДАТ ДЛЯ ЗАПРОСОВ К БЭКЕНДУ ---
function toISODate(v) {
    if (!v) return "";
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) {
        const [, d, mo, y] = m;
        const pad = (x) => String(x).padStart(2, "0");
        return `${y}-${pad(mo)}-${pad(d)}`;
    }
    const dt = new Date(s);
    return isNaN(dt) ? "" : dt.toISOString().slice(0, 10);
}

function normalizeOrderFilters(f) {
    const out = { ...f };
    // ключи фильтров по датам у заказов
    const isoFrom = toISODate(out.load_date_from);
    const isoTo = toISODate(out.load_date_to);
    if (isoFrom) out.load_date_from = isoFrom; else delete out.load_date_from;
    if (isoTo) out.load_date_to = isoTo; else delete out.load_date_to;
    return out;
}
const LANGS = ["en", "ru", "tr", "ka"];

// --- Skeleton loader ---
function OrderSkeleton() {
    return (
        <motion.div
            initial={{ opacity: 0.12, scale: 0.96 }}
            animate={{ opacity: 0.8, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, repeatType: "reverse" }}
            style={{
                width: "100%",
                height: 140,
                borderRadius: 16,
                background: "linear-gradient(90deg, #1a2743 60%, #263961 100%)",
                marginBottom: 22,
                marginTop: 12,
            }}
        />
    );
}

function FlagIcon({ country, size = 22 }) {
    if (!country) return null;
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: size,
                height: size,
                minWidth: size,
                minHeight: size,
                background: "#193158",
                borderRadius: 6,
                border: "1.2px solid #234167",
                marginRight: 8,
                boxShadow: "0 1px 6px #23416711",
                overflow: "hidden",
            }}
        >
            <ReactCountryFlag
                countryCode={country}
                svg
                style={{ width: size - 3, height: size - 3, objectFit: "cover", borderRadius: 4, background: "#fff" }}
                title={country}
            />
        </span>
    );
}

function getCountryCode(location) {
    if (!location) return null;
    const parts = location.split(",").map((s) => s.trim());
    let country = parts[parts.length - 1];
    if (!country) return null;
    let code = null;
    for (const lang of LANGS) {
        code = countries.getAlpha2Code(country, lang);
        if (code) break;
    }
    if (!code && parts.length > 1) {
        for (let i = parts.length - 1; i >= 0; i--) {
            for (const lang of LANGS) {
                code = countries.getAlpha2Code(parts[i], lang);
                if (code) break;
            }
            if (code) break;
        }
    }
    return code || null;
}

export default function OrderList() {
    const router = useRouter();
    const ctx = useUser() || {};
    const user = ctx.user || null;
    const isBlocked = typeof ctx.isBlocked === "function" ? ctx.isBlocked : () => false;
    const authFetchWithRefresh = ctx.authFetchWithRefresh;
    const isManagerAccount = ["manager", "employee"].includes((user?.role || "").toLowerCase());
    const [orders, setOrders] = useState([]);
    const ordersRef = useRef([]);
    const [placeLabels, setPlaceLabels] = useState(null); // { [id]: {label,country_iso2} }
    const [displayedOrders, setDisplayedOrders] = useState([]);
    const { t } = useLang?.() || { t: (k, f) => f || k };
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";
    const [filters, setFilters] = useState({});
    const CARD_SIZE_STORAGE_KEY = "ordersCardSize";
    const [cardSize, setCardSize] = useState("large");
    // Reset to page 1 on any filter change
    const setFiltersPaged = useCallback((updater) => {
        setPage(1);
        setFilters(prev => (typeof updater === "function" ? updater(prev) : updater));
    }, []);
    // Реагируем на изменения ?matches_only в URL (без перезагрузки страницы)
    const searchParams = useSearchParams();
    useEffect(() => {
        const mo = searchParams?.get?.("matches_only");
        setFiltersPaged((prev) => {
            const next = { ...prev };
            if (mo && mo !== "0" && String(mo).toLowerCase() !== "false") next.matches_only = 1;
            else delete next.matches_only;
            return next;
        });
    }, [searchParams, setFiltersPaged]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(CARD_SIZE_STORAGE_KEY);
            if (saved === "compact" || saved === "large") {
                setCardSize(saved);
            }
        } catch { }
    }, []);

    useEffect(() => {
        try { localStorage.setItem(CARD_SIZE_STORAGE_KEY, cardSize); } catch { }
    }, [cardSize]);


    const ADR_CLASS_INFO = {
        "1": t("adr.1", "Взрывчатые вещества и изделия"),
        "2": t("adr.2", "Газы"),
        "3": t("adr.3", "Легковоспламеняющиеся жидкости"),
        "4": t("adr.4", "Легковоспламеняющиеся твёрдые вещества"),
        "5": t("adr.5", "Окисляющие вещества и органические перекиси"),
        "6": t("adr.6", "Ядовитые и инфекционные вещества"),
        "7": t("adr.7", "Радиоактивные материалы"),
        "8": t("adr.8", "Коррозионные вещества"),
        "9": t("adr.9", "Прочие опасные вещества")
    };

    const [loading, setLoading] = useState(false);
    // --- Pagination state ---
    const DEFAULT_PAGE_SIZE = 20;
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    const hasMoreMobile = useMemo(() => {
        if (total) return orders.length < total;
        if (!orders.length) return false;
        const expected = page * pageSize;
        return orders.length >= expected;
    }, [orders.length, page, pageSize, total]);
    const [activeTab, setActiveTab] = useState("list");
    const [expandedId, setExpandedId] = useState(null);
    const [visibleIds, setVisibleIds] = useState(null);
    // предотвращаем бесконечные перерисовки, когда карта шлёт те же id
    const setVisibleIdsStable = useCallback((ids) => {
        setVisibleIds((prev) => {
            if (Array.isArray(prev) && Array.isArray(ids) && prev.length === ids.length) {
                let same = true;
                for (let i = 0; i < prev.length; i++) {
                    if (prev[i] !== ids[i]) { same = false; break; }
                }
                if (same) return prev;
            }
            return ids;
        });
    }, []);

    const [openPay, setOpenPay] = useState(false);

    const [filterOpen, setFilterOpen] = useState(false);
    const [mapOpen, setMapOpen] = useState(false);


    const [showTop, setShowTop] = useState(false);
    const [footerVisible, setFooterVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setShowTop(window.scrollY > 600);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);


    useEffect(() => {
        const footerEl = document.querySelector("footer");
        if (!footerEl) return;
        const io = new IntersectionObserver(
            ([entry]) => setFooterVisible(entry.isIntersecting),
            { threshold: 0 }
        );
        io.observe(footerEl);
        return () => io.disconnect();
    }, []);

    const [commentOpenId, setCommentOpenId] = useState(null);
    const [commentText, setCommentText] = useState("");
    const [commentsMap, setCommentsMap] = useState({}); // { [orderId]: InternalCommentOut[] }
    // чтобы не дёргать один и тот же id много раз
    const prefetchedCommentsRef = useRef({});

    const { openMessenger } = useMessenger();
    const lastRequestId = useRef(0);
    const abortRef = useRef(null);
    const pageVisibleRef = useRef(true);
    const nextAllowedAtRef = useRef(0);
    const REQUEST_MIN_GAP_MS = 2000;
    const appendModeRef = useRef(false);
    // кеш валидаторов, чтобы получать 304 без тела
    const etagRef = useRef(null);
    const lastModifiedRef = useRef(null);

    useEffect(() => {
        const onVis = () => { pageVisibleRef.current = !document.hidden; };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, []);

    // есть ли активные фильтры
    const hasActiveFilter = Object.entries(filters).some(
        ([k, v]) => v !== "" && v !== undefined && !(typeof v === "boolean" && v === false),
    );

    const filteredOrders = Array.isArray(visibleIds)
        ? (Array.isArray(orders) ? orders : []).filter(o => visibleIds.includes(o.id))
        : (Array.isArray(orders) ? orders : []);

    const foundCount = visibleIds
        ? filteredOrders.length      // радиус/карта активны → показываем реальное количество в круге
        : (total || filteredOrders.length); // иначе число с бэка (или длину текущей выборки)

    const [initialLoaded, setInitialLoaded] = useState(false);


    // Подтягиваем лейблы для всех place_id
    useEffect(() => {
        const ids = new Set();
        (orders || []).forEach(o => {
            (o.from_place_ids || []).forEach(id => id && ids.add(id));
            (o.to_place_ids || []).forEach(id => id && ids.add(id));
        });
        if (!ids.size) { setPlaceLabels(null); return; }
        fetch(api(`/places/labels?ids=${[...ids].join(",")}&lang=${UI_LANG}`))
            .then(r => r.ok ? r.json() : {})
            .then(setPlaceLabels)
            .catch(() => { });
    }, [orders]);

    function renderCity(id, fallback) {
        const item = placeLabels?.[id];
        if (!item) return fallback || "";
        try {
            const cn = new Intl.DisplayNames([UI_LANG], { type: "region" }).of(item.country_iso2);
            return `${item.label}${cn ? `, ${cn}` : ""}`;
        } catch { return item.label; }
    }

    const isMobile = useIsMobile();

    const fetchOrders = useCallback(async (opts = {}) => {
        if (!pageVisibleRef.current && !opts.force) return;
        const now = Date.now();
        if (now < nextAllowedAtRef.current && !opts.force) return;
        // Если был предыдущий запрос — корректно его отменяем с причиной
        if (abortRef.current) {
            try { abortRef.current.abort("fetch-replaced"); } catch { }
            finally { abortRef.current = null; }
        }
        const controller = new AbortController();
        abortRef.current = controller;
        const signal = controller.signal;
        setLoading(true);
        const thisRequest = ++lastRequestId.current;
        try {
            // ВАЖНО: нормализуем даты в ISO перед сборкой query
            const norm = normalizeOrderFilters(filters);
            const query = Object.entries(norm)
                .filter(([_, v]) => v !== "" && v !== undefined && v !== null && !(typeof v === "boolean" && v === false))
                .map(([k, v]) =>
                    Array.isArray(v)
                        ? v.map((val) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`).join("&")
                        : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
                )
                .join("&");
            const pageQuery = `page=${page}&page_size=${pageSize}`;
            // 👇 ЭТОГО НЕ ХВАТАЛО
            const url = api(`/orders${query ? "?" + query + "&" + pageQuery : "?" + pageQuery}`);
            // условные заголовки, чтобы сервер мог вернуть 304
            const headers = {};
            if (etagRef.current) headers["If-None-Match"] = etagRef.current;
            if (lastModifiedRef.current) headers["If-Modified-Since"] = lastModifiedRef.current;
            // Гость → всегда обычный fetch без Authorization
            const token = (typeof window !== "undefined") ? localStorage.getItem("token") : null;
            const doFetch =
                (typeof authFetchWithRefresh === "function" && token)
                    ? authFetchWithRefresh
                    : fetch;
            const resp = await doFetch(url, { signal, headers, cache: "no-store" });
            const pollHdr = resp.headers.get("X-Poll-Interval") || resp.headers.get("x-poll-interval");
            const pollMs = Number.parseInt(pollHdr || `${REQUEST_MIN_GAP_MS}`, 10);
            nextAllowedAtRef.current = Date.now() + (Number.isFinite(pollMs) ? pollMs : REQUEST_MIN_GAP_MS);
            // сохраним валидаторы для следующего запроса
            const etag = resp.headers.get("ETag");
            if (etag) etagRef.current = etag;
            const lastMod = resp.headers.get("Last-Modified");
            if (lastMod) lastModifiedRef.current = lastMod;
            if (resp.status === 304) { return; }

            const data = await resp.json();

            // Read total count from header if provided (backend sets X-Total-Count when paginated)
            const totalHeader = resp.headers.get("X-Total-Count") || resp.headers.get("x-total-count");
            if (totalHeader) setTotal(parseInt(totalHeader, 10) || 0);

            // --- ФОЛБЭК ДЛЯ ГОСТЕЙ: подтянуть координаты из публичной ручки ---
            let items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);

            const hasCoords = (it) => {
                if (Array.isArray(it?.from_locations_coords) &&
                    it.from_locations_coords[0]?.lat != null &&
                    it.from_locations_coords[0]?.lng != null) return true;
                if (it?.from_location_coords?.lat != null && it?.from_location_coords?.lng != null) return true;
                if (it?.from_location_lat != null && it?.from_location_lng != null) return true;
                if (it?.from_lat != null && it?.from_lng != null) return true;
                return false;
            };

            if (!token && items.length) {
                const needPins = items.filter(i => !hasCoords(i)).map(i => i.id);
                if (needPins.length) {
                    try {
                        // Берём компактные пины для карты
                        const r2 = await fetch(api(`/public/orders_map?limit=${Math.max(needPins.length, 120)}`), { cache: "no-store", signal });
                        if (r2.ok) {
                            const j2 = await r2.json();
                            const pins = Array.isArray(j2?.items) ? j2.items : (Array.isArray(j2) ? j2 : []);
                            const byId = new Map(pins.map(p => [p.id, p]));
                            items = items.map(it => {
                                if (hasCoords(it)) return it;
                                const pin = byId.get(it.id);
                                if (!pin) return it;
                                // переносим любые доступные поля координат
                                return {
                                    ...it,
                                    from_locations_coords: pin.from_locations_coords ?? it.from_locations_coords,
                                    from_location_coords: pin.from_location_coords ?? it.from_location_coords,
                                    from_location_lat: pin.from_location_lat ?? it.from_location_lat ?? pin.from_lat,
                                    from_location_lng: pin.from_location_lng ?? it.from_location_lng ?? pin.from_lng,
                                };
                            });
                        }
                    } catch (_) {
                        // молча продолжаем без пинов, если публичная ручка недоступна
                    }
                }
            }

            // Если сервер вернул другой формат — аккуратно поправим items и total
            if (!Array.isArray(items) && data && Array.isArray(data.items)) {
                setTotal(parseInt(data.total || data.count || 0, 10) || 0);
                items = data.items;
            } else if (!totalHeader) {
                setTotal(Array.isArray(items) ? items.length : (Array.isArray(data) ? data.length : 0));
            }
            if (thisRequest === lastRequestId.current) {
                const incoming = Array.isArray(items) ? items : [];
                const shouldAppend = Boolean(isMobile && appendModeRef.current && page > 1);
                const merged = shouldAppend
                    ? (() => {
                        const prev = Array.isArray(ordersRef.current) ? ordersRef.current : [];
                        const seen = new Set(prev.map((it) => it?.id ?? it?.uid));
                        const withNew = [...prev];
                        for (const it of incoming) {
                            const key = it?.id ?? it?.uid;
                            if (key != null && seen.has(key)) continue;
                            if (key != null) seen.add(key);
                            withNew.push(it);
                        }
                        return withNew;
                    })()
                    : incoming;

                ordersRef.current = merged;
                setOrders(merged);
                setTimeout(() => {
                    const arr = Array.isArray(merged) ? merged : [];
                    const nextDisplayed = arr.filter(o => !isBlocked(o?.owner_id));
                    // обновляем только при реальном изменении списка
                    setDisplayedOrders(prev => {
                        if (Array.isArray(prev) && prev.length === nextDisplayed.length) {
                            let same = true;
                            for (let i = 0; i < prev.length; i++) {
                                if (prev[i]?.id !== nextDisplayed[i]?.id) { same = false; break; }
                            }
                            if (same) return prev;
                        }
                        return nextDisplayed;
                    });
                }, 100);
                setInitialLoaded(true);
            }
        }
        catch (e) {
            // Тихо игнорируем любые варианты прерванного запроса:
            //  - DOMException: name === "AbortError"
            //  - наша причина-строка ("component-unmount" / "fetch-replaced")
            //  - текст сообщения с "abort"
            //  - актуальный signal уже в состоянии aborted
            const isAborted =
                (e && e.name === "AbortError") ||
                (typeof e === "string" && (e === "component-unmount" || e === "fetch-replaced")) ||
                (e && typeof e.message === "string" && /abort/i.test(e.message)) ||
                (signal && signal.aborted === true);
            if (!isAborted) {
                console.error("[OrderList] fetch error", e);
                setOrders([]);
                setTimeout(() => setDisplayedOrders([]), 80);
            }
        } finally {
            // гасим лоадер и чистим abort только если это последний активный запрос
            if (thisRequest === lastRequestId.current) setLoading(false);
            if (abortRef.current === controller) abortRef.current = null;
            appendModeRef.current = false;
        }
    }, [filters, isMobile, page, pageSize]);

    async function loadInternalComments(orderId) {
        if (!isManagerAccount) return;
        const token = localStorage.getItem("token");
        const r = await fetch(api(`/internal_comments?order_id=${orderId}`), {
            headers: { Authorization: "Bearer " + token },
        });
        const data = await r.json();
        setCommentsMap((prev) => ({ ...prev, [orderId]: Array.isArray(data) ? data : [] }));
    }
    async function saveInternalComment(orderId) {
        const text = (commentText || "").trim();
        if (!text) return;
        const token = localStorage.getItem("token");
        await fetch(api(`/internal_comments`), {
            method: "POST",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ order_id: orderId, content: text }),
        });
        setCommentText("");
        await loadInternalComments(orderId);
    }

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]); // эффект будет вызываться только при смене filters/page/pageSize

    useEffect(() => {
        ordersRef.current = orders;
    }, [orders]);

    const loadMoreMobile = useCallback(() => {
        if (loading || !hasMoreMobile || appendModeRef.current) return;
        appendModeRef.current = true;
        setPage((p) => p + 1);
    }, [hasMoreMobile, loading]);


    // корректно отменяем фетч на размонтировании
    useEffect(() => () => {
        try { abortRef.current?.abort("component-unmount"); } catch { }
        finally { abortRef.current = null; }
    }, []);


    // Автоподгрузка комментариев для всех видимых карточек (бейдж всегда виден)
    useEffect(() => {
        if (!isManagerAccount) return;
        const list = (Array.isArray(displayedOrders) && displayedOrders.length)
            ? displayedOrders
            : (Array.isArray(orders) ? orders : []);
        for (const o of list) {
            if (!o?.id) continue;
            if (!prefetchedCommentsRef.current[o.id]) {
                prefetchedCommentsRef.current[o.id] = true;
                loadInternalComments(o.id);
            }
        }
    }, [isManagerAccount, displayedOrders, orders]);

    if (isMobile) {
        return (
            <OrderListMobile
                orders={orders}
                fetchOrders={fetchOrders}
                filters={filters}
                setFilters={setFiltersPaged}
                /* новое: карта/фильтр для мобилки */
                visibleIds={visibleIds}
                onFilteredIdsChange={setVisibleIdsStable}
                setFiltersFromMap={setFilters}
                estimatedCount={loading ? undefined : (Array.isArray(visibleIds) ? filteredOrders.length : (total || filteredOrders.length))}
                onLoadMore={loadMoreMobile}
                loading={loading}
                hasMore={hasMoreMobile}
            />
        );
    }

    function renderTabs() {
        const tabButtonStyle = (tab) => {
            const isActive = activeTab === tab;
            const base = {
                fontWeight: 700,
                fontSize: 16,
                padding: "8px 25px",
                borderRadius: 10,
                cursor: "pointer",
                transition: "all .14s",
                display: "flex",
                alignItems: "center",
                gap: 8,
            };

            if (isLight) {
                return {
                    ...base,
                    background: isActive ? "var(--bg-card)" : "var(--control-bg)",
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    border: `1px solid ${isActive ? "var(--border-strong)" : "var(--border-subtle)"}`,
                    boxShadow: isActive
                        ? "0 6px 18px rgba(15, 23, 42, 0.08)"
                        : "0 4px 12px rgba(15, 23, 42, 0.04)",
                };
            }

            return {
                ...base,
                background: isActive ? "#11284a" : "#19223a",
                color: isActive ? "#43c8ff" : "#8ecae6",
                border: "none",
            };
        };
        return (
            <div
                style={{
                    display: "flex",
                    gap: 7,
                    margin: "0 0 18px 0",
                    paddingLeft: 3,
                }}
            >
                <button
                    style={tabButtonStyle("list")}
                    onClick={() => setActiveTab("list")}
                    aria-label={t("common.list", "Список")}
                >
                    <IconLabel icon={ListIcon} label={t("common.list", "Список")} />
                </button>
                <button
                    style={tabButtonStyle("map")}
                    onClick={() => setActiveTab("map")}
                    aria-label={t("common.map", "Карта")}
                >
                    <IconLabel icon={MapIcon} label={t("common.map", "Карта")} />
                </button>
            </div>
        );
    }

    function renderCardSizeToggle() {
        const baseStyle = {
            fontWeight: 700,
            fontSize: 15,
            padding: "8px 16px",
            borderRadius: 10,
            cursor: "pointer",
            transition: "all .14s",
        };

        const getStyle = (active) => {
            if (isLight) {
                const lightBase = {
                    ...baseStyle,
                    background: "var(--control-bg)",
                    color: "var(--text-secondary)",
                    border: `1px solid var(--border-subtle)`,
                };

                if (active) {
                    return {
                        ...lightBase,
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                        border: `1px solid var(--border-strong)`,
                        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
                    };
                }

                return {
                    ...lightBase,
                    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
                };
            }

            return {
                ...baseStyle,
                background: active ? "#11284a" : "#19223a",
                color: active ? "#43c8ff" : "#8ecae6",
                border: "none",
                boxShadow: active ? "0 4px 14px #0b1a2f55" : undefined,
            };
        };
        return (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                    style={getStyle(cardSize === "large")}
                    onClick={() => setCardSize("large")}
                    aria-label={t("view.largeCards", "Крупные карточки")}
                >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <GridIcon size={18} aria-hidden />
                        <span>{t("view.largeCards", "Крупные")}</span>
                    </span>
                </button>
                <button
                    style={getStyle(cardSize === "compact")}
                    onClick={() => setCardSize("compact")}
                    aria-label={t("view.compactCards", "Компактные карточки")}
                >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <CompactIcon size={18} aria-hidden />
                        <span>{t("view.compactCards", "Компактные")}</span>
                    </span>
                </button>
            </div>
        );
    }

    const renderPagination = () => {
        if (totalPages <= 1) return null;
        const go = (p) => { if (p < 1 || p > totalPages || p === page) return; window.scrollTo({ top: 0, behavior: "smooth" }); setPage(p); };
        const numbers = [];
        const maxButtons = 7;
        let start = Math.max(1, page - 2);
        let end = Math.min(totalPages, start + maxButtons - 1);
        if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
        for (let i = start; i <= end; i++) numbers.push(i);

        const pagerBaseStyle = { borderRadius: 8, padding: "6px 10px", cursor: "pointer", transition: "all .18s ease" };
        const pagerBtnStyle = (active = false) => {
            if (isLight) {
                const base = {
                    ...pagerBaseStyle,
                    background: "var(--control-bg)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "0 3px 10px rgba(15, 23, 42, 0.05)",
                };

                if (active) {
                    return {
                        ...base,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-strong)",
                        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
                        fontWeight: 700,
                    };
                }

                return base;
            }

            return {
                ...pagerBaseStyle,
                background: "#162335",
                border: "1px solid #2b3d56",
                color: "#dbe8ff",
                fontWeight: active ? 800 : 600,
            };
        };

        const selectStyle = isLight
            ? {
                background: "var(--control-bg)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                borderRadius: 8,
                padding: "6px 10px",
                boxShadow: "0 3px 10px rgba(15, 23, 42, 0.05)",
            }
            : { background: "#162335", border: "1px solid #2b3d56", color: "#dbe8ff", borderRadius: 8, padding: "6px 10px" };

        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => go(1)} disabled={page === 1} style={pagerBtnStyle()}>«</button>
                    <button onClick={() => go(page - 1)} disabled={page === 1} style={pagerBtnStyle()}>‹</button>
                    {start > 1 && <span style={{ opacity: 0.6, padding: "6px 10px" }}>…</span>}
                    {numbers.map(n => (
                        <button key={n} onClick={() => go(n)} style={pagerBtnStyle(n === page)}>{n}</button>
                    ))}
                    {end < totalPages && <span style={{ opacity: 0.6, padding: "6px 10px" }}>…</span>}
                    <button onClick={() => go(page + 1)} disabled={page === totalPages} style={pagerBtnStyle()}>›</button>
                    <button onClick={() => go(totalPages)} disabled={page === totalPages} style={pagerBtnStyle()}>»</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ opacity: 0.7, fontSize: 14 }}>{t("pager.perPage", "На странице:")}</span>
                    <select value={pageSize} onChange={(e) => { setPage(1); setPageSize(parseInt(e.target.value, 10)); }} style={selectStyle}>
                        {[10, 20, 30, 40, 50].map(sz => <option key={sz} value={sz}>{sz}</option>)}
                    </select>
                    <span style={{ opacity: 0.7, fontSize: 14 }}>{t("pager.total", "Всего:")} {total}</span>
                </div>
            </div>
        );
    };

    function renderOrderCards(filtered) {
        const safeFiltered = Array.isArray(filtered) ? filtered : [];
        if (!initialLoaded && loading) {
            return (
                <>
                    {[...Array(4)].map((_, i) => (
                        <OrderSkeleton key={i} />
                    ))}
                </>
            );
        }
        if (loading && displayedOrders.length > 0) {
            return (
                <AnimatePresence initial={false}>
                    {displayedOrders.map((order) => (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 40, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.98 }}
                            transition={{ duration: 0.37, ease: [0.42, 1.3, 0.5, 1] }}
                            style={{ width: "100%" }}
                        >
                            {cardSize === "compact" ? (
                                <CargoCompactCard
                                    cargo={order}
                                    enableHoverLift={false}
                                    onClick={() => router.push(`/orders/${order.id}`)}
                                />
                            ) : (
                                <OrderCard
                                    order={order}
                                    expanded={expandedId === order.id}
                                    onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                                    isManagerAccount={isManagerAccount}
                                    commentOpenId={commentOpenId}
                                    setCommentOpenId={setCommentOpenId}
                                    loadInternalComments={loadInternalComments}
                                    commentsMap={commentsMap}
                                    commentText={commentText}
                                    setCommentText={setCommentText}
                                    saveInternalComment={saveInternalComment}
                                />
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            );
        }
        if (!loading && safeFiltered.length === 0) {
            return (
                <motion.div
                    key="no-orders"
                    initial={{ opacity: 0, scale: 0.97, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -12 }}
                    transition={{ duration: 0.35, ease: [0.44, 1.3, 0.55, 1] }}
                    style={{ textAlign: "center", color: "#aaa", marginTop: 32 }}
                >
                    {t("orders.none", "Нет заявок")} {filters?.map_center && filters?.map_radius ? t("orders.inThisRadius", "в этом радиусе") : t("orders.byFilters", "по выбранным фильтрам")}.
                </motion.div>
            );
        }
        return (
            <AnimatePresence initial={false}>
                {safeFiltered.map((order) => (
                    <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 40, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.98 }}
                        transition={{ duration: 0.37, ease: [0.42, 1.3, 0.5, 1] }}
                        style={{ width: "100%" }}
                    >
                        {cardSize === "compact" ? (
                            <CargoCompactCard
                                cargo={order}
                                enableHoverLift={false}
                                onClick={() => router.push(`/orders/${order.id}`)}
                            />
                        ) : (
                            <OrderCard
                                order={order}
                                expanded={expandedId === order.id}
                                onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                                isManagerAccount={isManagerAccount}
                                commentOpenId={commentOpenId}
                                setCommentOpenId={setCommentOpenId}
                                loadInternalComments={loadInternalComments}
                                commentsMap={commentsMap}
                                commentText={commentText}
                                setCommentText={setCommentText}
                                saveInternalComment={saveInternalComment}
                            />
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        );
    }

    return (
        <div style={{ width: "100%", flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <OrderFilter filters={filters} setFilters={setFiltersPaged} fetchOrders={fetchOrders} handleResetFilters={() => setFiltersPaged({})} />
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                    gap: 14,
                    flexWrap: "wrap",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {renderTabs()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginLeft: "auto" }}>
                    {renderCardSizeToggle()}
                    {hasActiveFilter && (
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 600,
                                color: orders.length ? "#43c8ff" : "#ff6868",
                                background: "rgba(22,35,53,0.97)",
                                borderRadius: 8,
                                padding: "4px 15px",
                                minWidth: 105,
                                textAlign: "right",
                            }}
                        >
                            {t("pager.found", "Найдено")}: {loading ? "." : foundCount}
                        </div>
                    )}
                </div>

            </div>
            {activeTab === "list" && <div key="orders-list">{renderOrderCards(filteredOrders)}</div>}
            {renderPagination()}
            {activeTab === "map" && (
                <div style={{ width: "100%", marginBottom: 24, paddingLeft: 0 }}>
                    <div
                        style={{
                            width: "100%",
                            height: 440,
                            borderRadius: 16,
                            overflow: "hidden",
                            boxShadow: "0 3px 24px #00184455",
                            marginBottom: 16,
                        }}
                    >
                        <SimpleMap
                            orders={orders}
                            setFilters={setFilters}
                            filters={filters}
                            onFilteredIdsChange={setVisibleIdsStable}
                        />
                    </div>
                    <div style={{ width: "100%" }}>{renderOrderCards(filteredOrders)}</div>
                </div>
            )}
            <AnimatePresence>
                {showTop && !footerVisible && (
                    <motion.button
                        key="scroll-top"
                        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                        initial={{ opacity: 0, y: 16, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.92 }}
                        transition={{ duration: 0.22 }}
                        title={t("common.up", "Наверх")}
                        style={{
                            position: "fixed",
                            left: "50%",
                            transform: "translateX(-50%)",
                            bottom: 28,
                            width: 46,
                            height: 46,
                            borderRadius: 999,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(32,53,88,0.35)",
                            border: "1px solid rgba(100,180,255,0.35)",
                            boxShadow: "0 8px 34px rgba(67,200,255,0.28)",
                            backdropFilter: "blur(6px)",
                            WebkitBackdropFilter: "blur(6px)",
                            cursor: "pointer",
                            zIndex: 1000
                        }}
                    >
                        <FaChevronUp style={{ fontSize: 20, color: "#bfe6ff" }} />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}

// --- КАРТОЧКА ЗАЯВКИ ---
function OrderCard({
    order,
    expanded,
    onToggle,
    isManagerAccount,
    commentOpenId,
    setCommentOpenId,
    loadInternalComments,
    commentsMap,
    commentText,
    setCommentText,
    saveInternalComment,
}) {
    const { t } = useLang?.() || { t: (k, f) => f || k };

    const { user } = useUser() || {};
    // Больше не ограничиваем авторизованных (даже без оплаты)
    const isLimited = false;
    const limitedCls = isLimited ? "pw-blur pw-overlay pw-noevents" : "";
    // гость: нет user → блюрим карточку и ловим клики
    const isGuest = !user;
    const requireAuth = () =>
        alert(t("auth.loginOrRegister", "Чтобы увидеть детали и контакты — войдите или зарегистрируйтесь."));
    // Больше никаких платёжных ограничений — только защита от клика у гостя на верхнем оверлее
    const guard = (cb) => (e) => {
        if (e?.stopPropagation) e.stopPropagation();
        cb?.();
    };

    // i18n витрины: label = перевод, value = канон (RU)
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const LOADING_TYPES_I18N = useMemo(() => getLoadingTypes(t), [t]);

    // Найти локализованный label по канон. value (тип кузова) — БЕЗ учёта регистра/пробелов
    const findBodyLabelByValue = useCallback((val) => {
        if (val === undefined || val === null) return "";
        const v = String(val).trim().toLowerCase();
        const flat = [];
        for (const opt of BODY_TYPES || []) {
            if (opt?.children) flat.push(...opt.children);
            else flat.push(opt);
        }
        const found = flat.find(o =>
            String(o?.value || "").trim().toLowerCase() === v
        );
        return found?.label || val;
    }, [BODY_TYPES]);

    // Локализовать массив видов загрузки (сопоставление без учёта регистра)
    const localizeLoadingTypes = useCallback((arr) => {
        const i18n = LOADING_TYPES_I18N || [];
        return (arr || []).map(v => {
            const idx = LOADING_TYPES.findIndex(
                x => String(x).toLowerCase() === String(v).toLowerCase()
            );
            return idx >= 0 ? (i18n[idx] || v) : v;
        });
    }, [LOADING_TYPES_I18N]);
    const ADR_LABELS = {
        "1": t("adr.1", "Взрывчатые вещества и изделия"),
        "2": t("adr.2", "Газы"),
        "3": t("adr.3", "Легковоспламеняющиеся жидкости"),
        "4": t("adr.4", "Легковоспламеняющиеся твёрдые вещества"),
        "5": t("adr.5", "Окисляющие вещества и органические перекиси"),
        "6": t("adr.6", "Ядовитые и инфекционные вещества"),
        "7": t("adr.7", "Радиоактивные материалы"),
        "8": t("adr.8", "Коррозионные вещества"),
        "9": t("adr.9", "Прочие опасные вещества")
    };
    const [showBidPanel, setShowBidPanel] = useState(false);

    // FIX: брать авторизованный фетч из контекста и внутри карточки тоже
    const { authFetchWithRefresh } = useUser();

    function safeFormatDate(dateStr, locale = "ru-RU", opts = {}) {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString(locale, opts);
    }

    const dateString = useMemo(
        () => safeFormatDate(order.created_at, "ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }),
        [order.created_at],
    );
    const timeString = useMemo(
        () => safeFormatDate(order.created_at, "ru-RU", { hour: "2-digit", minute: "2-digit" }),
        [order.created_at],
    );
    const titleString = useMemo(() => safeFormatDate(order.created_at, "ru-RU"), [order.created_at]);

    const cardColors = {
        bg: "var(--order-card-bg, rgba(23, 38, 60, 0.98))",
        text: "var(--order-card-text, #e3f2fd)",
        shadow: "var(--order-card-shadow, 0 2px 24px #001844cc)",
        shadowExpanded: "var(--order-card-shadow-expanded, 0 4px 32px #43c8ff55, 0 2px 24px #001844cc)",
        border: "var(--order-card-border, #1e88e5)",
        borderActive: "var(--order-card-border-active, #43c8ff)",
        sectionBg: "var(--order-card-section-bg, rgba(28, 37, 52, 0.92))",
        sectionBorder: "var(--order-card-section-border, #193158)",
        heading: "var(--order-card-heading, #43c8ff)",
        label: "var(--order-card-label, #8ecae6)",
        chipBg: "var(--order-card-chip-bg, #193158bb)",
        chipFg: "var(--order-card-chip-fg, #cfe9ff)",
        chipShadow: "var(--order-card-chip-shadow, 0 2px 8px #23416711)",
        routeBg: "var(--order-card-route-bg, linear-gradient(90deg, #183969 38%, #253759 100%))",
        routeFg: "var(--order-card-route-fg, #ffffff)",
        iconBg: "var(--order-card-icon-bg, #162239)",
        iconFg: "var(--order-card-icon-fg, #43c8ff)",
        iconShadow: "var(--order-card-icon-shadow, 0 1px 8px #43c8ff17)",
    };

    const commentPalette = isLight
        ? {
            popoverBg: "#ffffff",
            popoverBorder: "#d4e4ff",
            popoverShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
            threadBg: "#f4f7fd",
            threadBorder: "#d9e5f5",
            commentText: "#0f172a",
            meta: "#475569",
            textareaBg: "#ffffff",
            textareaBorder: "#cbd5e1",
            textareaColor: "#0f172a",
            badgeRing: "#e2e8f0",
        }
        : {
            popoverBg: "#0f1f3a",
            popoverBorder: "#203a63",
            popoverShadow: "0 10px 30px #00000055",
            threadBg: "#11213b",
            threadBorder: "#24446e",
            commentText: "#cfe8ff",
            meta: "#9ec3ff",
            textareaBg: "#132445",
            textareaBorder: "#24446e",
            textareaColor: "#eaf5ff",
            badgeRing: "#0e1b2c",
        };


    // На светлой теме фон панели остаётся тёмным, поэтому фиксируем светлые цвета
    // имени/контактного лица, чтобы текст не "пропадал" на фоне.
    const infoPrimaryColor = "#ffffff";
    const infoSecondaryColor = "#e5edff";


    const iconBtnStyle = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "45%",
        background: cardColors.iconBg,
        color: cardColors.iconFg,
        border: "none",
        fontSize: 15,
        cursor: "pointer",
        boxShadow: cardColors.iconShadow,
        transition: "background .16s, color .16s, box-shadow .16s",
    };

    function toLocationArray(val) {
        if (Array.isArray(val)) return val.filter(Boolean);
        if (typeof val === "string" && val.trim()) {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed.filter(Boolean);
            } catch {
                return [val.trim()];
            }
        }
        return [];
    }

    const { clickedItemId } = useMapHover();
    const ref = useRef();

    const [allBids, setAllBids] = useState([]);
    const [loadingBids, setLoadingBids] = useState(false);

    const bidPanelRef = useRef();

    // --- закрытие панели комментариев кликом вне ---
    const commentBtnRef = useRef(null);
    const commentPopoverRef = useRef(null);
    useEffect(() => {
        if (commentOpenId !== order.id) return;
        const handleDown = (e) => {
            const inBtn = commentBtnRef.current?.contains(e.target);
            const inPop = commentPopoverRef.current?.contains(e.target);
            if (!inBtn && !inPop) {
                setCommentOpenId(null);
            }
        };
        document.addEventListener("mousedown", handleDown);
        return () => document.removeEventListener("mousedown", handleDown);
    }, [commentOpenId, order.id, setCommentOpenId]);

    const reloadBids = useCallback(async () => {
        if (!order?.id) return;
        setLoadingBids(true);
        try {
            const res = await authFetchWithRefresh(`${API_URL}/orders/${order.id}/bids`);
            const data = res.ok ? await res.json() : [];
            setAllBids(Array.isArray(data) ? data : []);
        } finally {
            setLoadingBids(false);
        }
    }, [order?.id, authFetchWithRefresh]);

    useEffect(() => {
        if (!showBidPanel) return;
        function handleClickOutside(e) {
            if (bidPanelRef.current && !bidPanelRef.current.contains(e.target)) {
                setShowBidPanel(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showBidPanel]);

    useEffect(() => {
        if (showBidPanel) reloadBids();
    }, [showBidPanel, reloadBids]);

    useEffect(() => {
        if (clickedItemId === order.id && ref.current) {
            ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
            ref.current.classList.add("highlight");
            setTimeout(() => {
                ref.current?.classList.remove("highlight");
            }, 1100);
        }
    }, [clickedItemId, order.id]);

    const fromLocations = toLocationArray(order.from_locations).length
        ? toLocationArray(order.from_locations)
        : toLocationArray(order.from_location).length
            ? toLocationArray(order.from_location)
            : toLocationArray(order.from).length
                ? toLocationArray(order.from)
                : [];

    const toLocations = toLocationArray(order.to_locations).length
        ? toLocationArray(order.to_locations)
        : toLocationArray(order.to_location).length
            ? toLocationArray(order.to_location)
            : toLocationArray(order.to).length
                ? toLocationArray(order.to)
                : [];

    function pickValidDate(...dates) {
        for (const date of dates) {
            if (!date) continue;
            const d = new Date(date);
            if (!isNaN(d.getTime())) return date;
        }
        return null;
    }

    // иногда даты приходят под другими ключами
    const loadDateRaw = order.load_date || order.loading_date || order.pickup_date || order.date_from;
    const unloadDateRaw = order.unload_date || order.unloading_date || order.delivery_date || order.date_to;

    const loadDate = safeFormatDate(loadDateRaw, "ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const unloadDate = safeFormatDate(unloadDateRaw, "ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });

    const cargoItems =
        order.cargo_items || (order.cargo ? [{ name: order.cargo, tons: order.weight, volume: order.volume }] : []);
    const mainCargo = cargoItems.length ? cargoItems[0] : {};
    const loadingTypes = order.loading_types || order.load_types || [];
    const rateWithVat = order.rate_with_vat || order.rate_with_vat || "";
    const rateNoVat = order.rate_no_vat || order.rate_without_vat || "";
    const rateCash = order.rate_cash || "";
    const rateCurrency = order.rate_currency || order.currency || "";
    const router = useRouter();
    const isMobile = useIsMobile();
    const { openMessenger } = useMessenger();
    const [ownerProfile, setOwnerProfile] = useState(null);
    const [loadingOwner, setLoadingOwner] = useState(false);

    const [sending, setSending] = useState(false);
    const [yourBid, setYourBid] = useState(null);
    const [loadingBid, setLoadingBid] = useState(true);

    const [amount, setAmount] = useState("");
    const [comment, setComment] = useState("");
    const [bidCurrency, setBidCurrency] = useState(rateCurrency || "");

    useEffect(() => {
        updateYourBid();
        // eslint-disable-next-line
    }, [order?.id]);

    // Стабильная загрузка профиля владельца с защитой от зацикливания
    const ownerId = order?.owner_id ?? null;
    const ownerAbortRef = useRef(null);
    useEffect(() => {
        if (!ownerId) { setOwnerProfile(null); return; }

        // если уже загружали именно этого владельца — не дёргаем лишний раз
        if (ownerProfile && String(ownerProfile.id) === String(ownerId)) return;

        setLoadingOwner(true);
        // отменяем предыдущий незавершённый запрос
        ownerAbortRef.current?.abort();
        const ctrl = new AbortController();
        ownerAbortRef.current = ctrl;

        // используем авторизованный фетч и запрещаем кэш
        authFetchWithRefresh(`${API_URL}/users/${ownerId}`, { signal: ctrl.signal, cache: "no-store" })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data) return;
                // обновляем state только если действительно пришло новое содержание
                setOwnerProfile(prev =>
                    prev && String(prev.id) === String(data.id) ? prev : data
                );
            })
            .catch(err => {
                if (err?.name !== "AbortError") {
                    console.warn("[OrderCard] owner fetch failed:", err);
                }
            })
            .finally(() => setLoadingOwner(false));

        return () => ctrl.abort();
        // Важно: завязываемся ТОЛЬКО на ownerId, а не на весь объект order
    }, [ownerId]);

    async function updateYourBid() {
        const token = localStorage.getItem("token");
        if (!token || !order?.id) return;
        setLoadingBid(true);
        try {
            const res = await authFetchWithRefresh(api(`/orders/${order.id}/my_bid`));
            const data = res.ok ? await res.json() : null;
            if (data && data.id) setYourBid(data);
            else setYourBid(null);
        } finally {
            setLoadingBid(false);
        }
    }

    async function handleSendBid(amount, comment) {
        setSending(true);
        const token = localStorage.getItem("token");
        const resp = await authFetchWithRefresh(api(`/orders/${order.id}/bids`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount, currency: bidCurrency, comment }),
        });
        if (resp.ok) {
            await reloadBids(); // обновляем список ставок
            await updateYourBid(); // и свою ставку!
            setShowBidPanel(false);
        } else {
            alert(t("bids.sendError", "Ошибка при отправке ставки"));
        }
        setSending(false);
    }

    async function handleChatClick() {
        const userId = order.owner_id;
        if (!userId) return;
        const token = localStorage.getItem("token");
        if (!token) {
            alert(t("common.loginRequired", "Необходимо войти в систему"));
            return;
        }
        const resp = await fetch(api(`/chat/by_user/${userId}`), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        });
        if (resp.status === 401) {
            alert(t("common.sessionExpired", "Сессия истекла, войдите снова"));
            return;
        }
        const data = await resp.json();
        if (data?.chat_id) {
            openMessenger(data.chat_id, { order });
        }
    }

    const sectionRefs = [useRef(), useRef(), useRef(), useRef()];
    const [maxSectionHeight, setMaxSectionHeight] = useState(null);

    useEffect(() => {
        const heights = sectionRefs.map((ref) => ref.current?.offsetHeight || 0);
        const maxH = Math.max(...heights, 0); // FIX: распыление массива
        if (maxH > 0 && maxH !== maxSectionHeight) setMaxSectionHeight(maxH);
        // eslint-disable-next-line
    }, [order, expanded, cargoItems.length, loadingTypes.length, order.gps_monitoring, order.adr, order.temp_mode, order.temp_from, order.temp_to]);

    const sectionStyle = {
        background: cardColors.sectionBg,
        borderRadius: 12,
        border: `1.3px solid ${cardColors.sectionBorder}`,
        padding: "12px 12px 10px 12px",
        minWidth: 200,
        display: "flex",
        flexDirection: "column",
        gap: 7,
        minHeight: 95,
        boxSizing: "border-box",
        flex: 1,
        minHeight: maxSectionHeight ? maxSectionHeight : 95,
        transition: "min-height .15s",
    };

    const rowStyle = {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        fontSize: 14,
        alignItems: "center",
        minHeight: 0,
        marginBottom: 0,
    };

    return (
        <div
            ref={ref}
            style={{
                background: cardColors.bg,
                borderRadius: 17,
                padding: "18px 18px 64px 18px",
                color: cardColors.text,
                boxShadow: expanded ? cardColors.shadowExpanded : cardColors.shadow,
                borderLeft: expanded ? `6px solid ${cardColors.borderActive}` : `6px solid ${cardColors.border}`,
                display: "grid",
                // Гибкая сетка: красиво перестраивается от 1 до 4 колонок
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
                alignItems: "flex-start",
                minHeight: 165,
                marginBottom: 16,
                transition: "box-shadow .18s, border-color .18s",
                position: "relative",
                width: "100%",
            }}
        >
            {/* ВЕРХНИЙ ПРАВЫЙ БЛОК: дата + просмотры */}
            {(order.created_at || typeof order?.views === "number") && (
                <span
                    style={{
                        position: "absolute",
                        top: 11,
                        right: 16,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        zIndex: 2,
                        pointerEvents: "auto",
                        userSelect: "none",
                    }}
                >
                    {order.created_at && (
                        <span
                            style={{
                                fontSize: 12,
                                color: cardColors.label,
                                background: cardColors.chipBg,
                                padding: "2px 10px",
                                borderRadius: 11,
                                fontWeight: 500,
                                letterSpacing: 0.1,
                                boxShadow: cardColors.chipShadow,
                            }}
                            title={titleString}
                        >
                            {dateString} <span style={{ fontVariantNumeric: "tabular-nums" }}>{timeString}</span>
                        </span>
                    )}
                    {typeof order?.views === "number" && (
                        <span
                            title={t("views.title", "Просмотры")}
                            style={{
                                fontSize: 12,
                                color: cardColors.chipFg,
                                background: cardColors.chipBg,
                                padding: "2px 10px",
                                borderRadius: 11,
                                fontWeight: 700,
                                letterSpacing: 0.1,
                                boxShadow: cardColors.chipShadow,
                                display: "inline-flex",
                                alignItems: "center",
                            }}
                        >
                            <span style={{ marginRight: 6, display: "inline-block", transform: "translateY(1px)" }}>👁️</span>
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{order.views}</span>
                        </span>
                    )}
                </span>
            )}

            {/* 1. Маршрут */}
            <div
                ref={sectionRefs[0]}
                style={{
                    ...sectionStyle,
                    minHeight: maxSectionHeight || 95,
                    position: "relative",
                    ...(isGuest ? { zIndex: 31 } : {}),
                }}
            >
                <div style={{ fontSize: 14, fontWeight: 700, color: cardColors.heading, marginBottom: 3 }}>{t("order.route", "МАРШРУТ")}</div>
                <div
                    style={{
                        fontSize: 16,
                        fontWeight: 800,
                        background: cardColors.routeBg,
                        color: cardColors.routeFg,
                        borderRadius: 9,
                        padding: "7px 13px",
                        marginBottom: 2,
                        boxShadow: "0 2px 8px #43c8ff17",
                        letterSpacing: 0.02,
                        minHeight: 150,
                        maxHeight: 110,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: 9,
                        wordBreak: "break-word",
                    }}
                >
                    {/* ОТКУДА */}
                    <span
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                            whiteSpace: "pre-line",
                            fontWeight: 700,
                            color: cardColors.label,
                            fontSize: 16,
                            wordBreak: "break-word",
                        }}
                    >
                        <FlagIcon
                            country={
                                (order.from_place_ids?.[0] && placeLabels?.[order.from_place_ids[0]]?.country_iso2)
                                || getCountryCode(fromLocations[0])
                            }
                            size={19}
                        />
                        {(order.from_place_ids?.[0]
                            ? renderCity(order.from_place_ids[0], fromLocations[0])
                            : fromLocations[0]) || "-"}
                    </span>

                    {/* СТРЕЛКА и КУДА */}
                    {toLocations.length > 0 &&
                        toLocations.some((loc) => loc && loc !== "-") && (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 7,
                                    width: "100%",
                                    minWidth: 0,
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 19,
                                        color: cardColors.heading,
                                        fontWeight: 900,
                                        margin: "0 8px 0 0",
                                        flexShrink: 0,
                                    }}
                                >
                                    →
                                </span>
                                <span
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 5,
                                        minWidth: 0,
                                        maxWidth: "100%",
                                        flex: 1,
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {toLocations
                                        .filter((loc) => loc && loc !== "-")
                                        .map((loc, idx) => (
                                            <span
                                                key={loc + idx}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 7,
                                                    background: cardColors.chipBg,
                                                    borderRadius: 7,
                                                    padding: "3px 10px",
                                                    fontSize: 15,
                                                    color: cardColors.label,
                                                    fontWeight: 700,
                                                    boxShadow: cardColors.chipShadow,
                                                    wordBreak: "break-word",
                                                    lineHeight: 1.17,
                                                    whiteSpace: "pre-line",
                                                    maxWidth: "100%",
                                                }}
                                            >
                                                <FlagIcon
                                                    country={
                                                        (order.to_place_ids?.[idx]
                                                            && placeLabels?.[order.to_place_ids[idx]]?.country_iso2)
                                                        || getCountryCode(loc)
                                                    }
                                                    size={16}
                                                />
                                                <span
                                                    style={{
                                                        minWidth: 0,
                                                        overflowWrap: "anywhere",
                                                        wordBreak: "break-word",
                                                        flex: 1,
                                                        display: "block",
                                                        whiteSpace: "normal",
                                                    }}
                                                >
                                                    {order.to_place_ids?.[idx]
                                                        ? renderCity(order.to_place_ids[idx], loc)
                                                        : loc}
                                                </span>
                                            </span>
                                        ))}
                                </span>
                            </div>
                        )}
                </div>

                {/* Даты */}
                <div style={{ fontSize: 13, color: cardColors.label, fontWeight: 600, marginLeft: 1 }}>
                    {order.load_date && (
                        <div>
                            <b style={{ color: cardColors.text, fontWeight: 700 }}>{t("order.loadDate", "Дата погрузки:")}</b> {order.load_date}
                        </div>
                    )}
                    {order.unload_date && (
                        <div>
                            <b style={{ color: cardColors.text, fontWeight: 700 }}>{t("order.unloadDate", "Дата разгрузки:")}</b> {order.unload_date}
                        </div>
                    )}
                    {!order.load_date && !order.unload_date && (
                        <div>
                            <b style={{ color: cardColors.text, fontWeight: 700 }}>-</b>
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Параметры */}
            <div
                ref={sectionRefs[1]}
                className={isLimited ? "pw-blur pw-overlay pw-noevents" : ""}
                style={{ ...sectionStyle, minHeight: maxSectionHeight || 95 }}
            >
                <div style={{ fontSize: 14, fontWeight: 700, color: cardColors.heading, marginBottom: 1 }}>{t("order.params", "ПАРАМЕТРЫ")}</div>

                {/* Кол-во машин / Тип кузова */}
                {(order.truck_quantity || order.truck_type) && (
                    <div style={rowStyle}>
                        {[
                            order.truck_quantity ? (
                                <span key="quantity">
                                </span>
                            ) : null,
                            order.truck_type ? (
                                <span key="bodytype" style={isGuest ? { position: "relative", zIndex: 31 } : undefined}>
                                    <span style={{ color: isLimited ? "#fff" : cardColors.label }}>{t("order.truckType", "Тип кузова:")}</span> <b style={{ color: isLimited ? "#fff" : undefined }}>{findBodyLabelByValue(order.truck_type)}</b>
                                </span>
                            ) : null,
                        ].filter(Boolean)}
                    </div>
                )}

                {/* Вес и объем */}
                {(mainCargo.tons || mainCargo.volume) && (
                    <div style={rowStyle}>
                        {mainCargo.tons && (
                            <span>
                                <span style={{ color: cardColors.label }}>{t("order.weight", "Вес:")}</span> <b>{mainCargo.tons} {t("unit.t", "т")}</b>
                            </span>
                        )}
                        {mainCargo.volume && (
                            <span style={{ marginLeft: mainCargo.tons ? 18 : 0 }}>
                                <span style={{ color: cardColors.label }}>{t("order.volume", "Объём:")}</span> <b>{mainCargo.volume} {t("unit.m3", "м³")}</b>
                            </span>
                        )}
                    </div>
                )}

                {/* Груз */}
                {mainCargo.name && (
                    <div style={rowStyle}>
                        <span>
                            <span style={{ color: cardColors.label }}>{t("order.cargo", "Груз:")}</span> <b>{mainCargo.name}</b>
                        </span>
                    </div>
                )}

                {/* Паковка */}
                {mainCargo.packaging && mainCargo.packaging !== "не указано" && (
                    <div style={rowStyle}>
                        <span>
                            <span style={{ color: cardColors.label }}>{t("order.packaging", "Упаковка:")}</span> <b>{mainCargo.packaging}</b>
                        </span>
                    </div>
                )}

                {/* Мест */}
                {mainCargo.pieces && (
                    <div style={rowStyle}>
                        <span>
                            <span style={{ color: cardColors.label }}>{t("order.pieces", "Мест:")}</span> <b>{mainCargo.pieces}</b>
                        </span>
                    </div>
                )}

                {/* Габариты */}
                {(mainCargo.length || mainCargo.width || mainCargo.height || mainCargo.diameter) && (
                    <div style={rowStyle}>
                        {mainCargo.length && (
                            <span>
                                <span style={{ color: cardColors.label }}>{t("order.length", "Длина:")}</span> <b>{mainCargo.length} {t("unit.m", "м")}</b>
                            </span>
                        )}
                        {mainCargo.width && (
                            <span>
                                <span style={{ color: cardColors.label }}>{t("order.width", "Ширина:")}</span> <b>{mainCargo.width} {t("unit.m", "м")}</b>
                            </span>
                        )}
                        {mainCargo.height && (
                            <span>
                                <span style={{ color: cardColors.label }}>{t("order.height", "Высота:")}</span> <b>{mainCargo.height} {t("unit.m", "м")}</b>
                            </span>
                        )}
                        {mainCargo.diameter && (
                            <span>
                                <span style={{ color: cardColors.label }}>{t("order.diameter", "Диаметр:")}</span> <b>{mainCargo.diameter} {t("unit.m", "м")}</b>
                            </span>
                        )}
                    </div>
                )}

                {/* Описание */}
                {mainCargo.description && (
                    <div style={rowStyle}>
                        <span>
                            <span style={{ color: cardColors.label }}>{t("order.description", "Описание:")}</span> <b>{mainCargo.description}</b>
                        </span>
                    </div>
                )}
            </div>

            {/* 3. Особенности */}
            <div
                ref={sectionRefs[2]}
                className={isLimited ? "pw-blur pw-overlay pw-noevents" : ""}
                style={{ ...sectionStyle, minHeight: maxSectionHeight || 95 }}
            >
                <div style={{ fontSize: 14, fontWeight: 700, color: cardColors.heading, marginBottom: 1 }}>{t("order.features", "ОСОБЕННОСТИ")}</div>

                {/* --- Загрузка --- */}
                {Array.isArray(loadingTypes) && loadingTypes.length > 0 && (
                    <div style={rowStyle}>
                        <span>
                            <span style={{ color: cardColors.label }}>{t("order.loading", "Загрузка:")}</span>
                            <b>{localizeLoadingTypes(loadingTypes).join(", ")}</b>
                        </span>
                    </div>
                )}

                {/* --- GPS --- */}
                {order.gps_monitoring && (
                    <div style={rowStyle}>
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                fontWeight: 700,
                                background: cardColors.chipBg,
                                borderRadius: 6,
                                padding: "2px 10px",
                                color: cardColors.heading,
                                fontSize: 13,
                                boxShadow: cardColors.chipShadow,
                            }}
                        >
                            <svg width="14" height="14" fill={cardColors.heading} style={{ marginRight: 4 }} viewBox="0 0 20 20">
                                <path d="M10 2C7.243 2 5 4.243 5 7c0 2.948 4.46 9.018 4.651 9.286a1 1 0 0 0 1.698 0C10.54 16.018 15 9.948 15 7c0-2.757-2.243-5-5-5zm0 12.243C8.185 11.167 7 8.995 7 7a3 3 0 0 1 6 0c0 1.995-1.185 4.167-3 7.243zM10 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                            </svg>
                            {t("gps.monitoringLabel", "GPS мониторинг")}
                        </span>
                    </div>
                )}

                {/* --- ADR / Температура --- */}
                {(order.adr || (order.temp_mode && (order.temp_from || order.temp_to))) && (
                    <div style={rowStyle}>
                        {order.adr && (
                            <span style={{ color: "#e6aa00", fontWeight: 600, position: "relative", marginRight: 10 }}>
                                <span style={{ color: "#e6aa00", fontWeight: 600 }}>
                                    ADR
                                    {order.adr_class ? `: ${t("order.adrClass", "класс")} ${order.adr_class} (${ADR_LABELS[order.adr_class] || ""})` : ""}
                                </span>
                            </span>
                        )}
                        {order.temp_mode && (order.temp_from || order.temp_to) && (
                            <span style={{ color: cardColors.heading, fontWeight: 600 }}>
                                {t("order.tempShort", "Темп.")}: {order.temp_from ?? ""}
                                {order.temp_from && order.temp_to ? "…" : ""}
                                {order.temp_to ?? ""}°C
                            </span>
                        )}
                    </div>
                )}

                {/* --- Если пусто --- */}
                {!(Array.isArray(loadingTypes) && loadingTypes.length > 0) &&
                    !order.gps_monitoring &&
                    !(order.adr || (order.temp_mode && (order.temp_from || order.temp_to))) && (
                        <div
                            style={{
                                marginTop: 14,
                                textAlign: "center",
                                color: "#97cfff",
                                fontSize: 15,
                                fontWeight: 500,
                                borderRadius: 8,
                                background: "rgba(38, 62, 110, 0.15)",
                                padding: "18px 0 14px 0",
                                letterSpacing: 0.2,
                                boxShadow: "0 1.5px 10px #27416922",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                animation: "fadeIn 0.7s",
                            }}
                        >
                            <svg width="20" height="20" fill="#5fd8ff" style={{ marginRight: 9, marginTop: -1 }} viewBox="0 0 24 24">
                                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 17.5A7.5 7.5 0 1 1 12 4.5a7.5 7.5 0 0 1 0 15zm-.75-3h1.5v-1.5h-1.5V16.5zm0-3h1.5v-6h-1.5v6z" />
                            </svg>
                            {t("common.infoNotProvided", "Информация не указана")}
                            <style>
                                {`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: none; } }`}
                            </style>
                        </div>
                    )}
            </div>

            {/* 4. Ставка */}
            <div
                ref={sectionRefs[3]}
                className={isLimited ? "pw-blur pw-overlay pw-noevents" : ""}
                style={{ ...sectionStyle, minHeight: maxSectionHeight || 95, gap: 11, justifyContent: "flex-start", minWidth: 170 }}
            >
                <div style={{ fontSize: 14, fontWeight: 700, color: cardColors.heading, marginBottom: 1 }}>{t("order.bid", "СТАВКА")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {order.rate_type === "Запрос" && Array.isArray(order.requested_rate_options) && order.requested_rate_options.length > 0 ? (
                        <span style={{ color: "#ffd600", fontWeight: 700, fontSize: 15, letterSpacing: 0.03 }}>
                            {t("rate.request", "Запрос ставки:")}{" "}
                            {order.requested_rate_options.map((opt) => (
                                <span
                                    key={opt}
                                    style={{
                                        background: "#232c3a",
                                        borderRadius: 7,
                                        padding: "2px 9px",
                                        marginRight: 6,
                                        color: "#fff",
                                        fontWeight: 700,
                                        fontSize: 14,
                                        display: "inline-block",
                                        border: "1.5px solid #ffd60088",
                                        boxShadow: "0 1px 6px #ffd60022",
                                    }}
                                >
                                    {opt}
                                </span>
                            ))}
                        </span>
                    ) : (
                        <>
                            {rateWithVat && (
                                <span>
                                    <span style={{ color: cardColors.label }}>{t("rate.withVat", "С НДС:")}</span> <b>{`${rateWithVat} ${rateCurrency}`}</b>
                                </span>
                            )}
                            {rateNoVat && (
                                <span>
                                    <span style={{ color: cardColors.label }}>{t("rate.noVat", "Без НДС:")}</span> <b>{`${rateNoVat} ${rateCurrency}`}</b>
                                </span>
                            )}
                            {rateCash && (
                                <span>
                                    <span style={{ color: cardColors.label }}>{t("rate.cash", "Наличными:")}</span> <b>{`${rateCash} ${rateCurrency}`}</b>
                                </span>
                            )}
                            {order.payment_scenario && (
                                <div>
                                    <span style={{ color: cardColors.label }}>{t("payment.terms", "Условия оплаты:")}</span>{" "}
                                    <b>
                                        {order.payment_scenario === "unload" && t("payment.scenario.unload", "На выгрузке")}
                                        {order.payment_scenario === "after_x_days" &&
                                            `${t("payment.afterPrefix", "Через")} ${order.payment_days || "?"} ${t("payment.afterSuffix", "дней после выгрузки")}`}
                                        {order.payment_scenario === "prepay" &&
                                            `${t("payment.prepay", "Предоплата")} ${order.prepay_amount || ""}${order.prepay_amount ? ", " : ""}${t("payment.balanceAfter", "остаток через")} ${order.postpay_days || "?"} ${t("payment.days", "дней")}`}
                                        {order.payment_scenario === "contract" && (order.payment_comment || t("payment.contract", "По договору"))}
                                    </b>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* --- НИЖНЯЯ КОМПАКТНАЯ ПАНЕЛЬ: всегда видна; часть данных — опционально --- */}
            <div
                style={{
                    position: "absolute",
                    left: 17,
                    right: 17,
                    bottom: 12,
                    zIndex: 11,
                    background: "#0c5b86",
                    borderRadius: 11,
                    padding: "6px 15px",
                    minHeight: 44,
                    boxShadow: "0 2px 8px #23416722",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    justifyContent: "space-between",
                    fontSize: 15,
                    flexWrap: "wrap",
                }}
            >
                {/* ЛЕВЫЙ БЛОК: автор/организация (только информация) */}
                <div
                    style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, cursor: ownerProfile?.id ? "pointer" : "default", flex: "1 1 260px" }}
                    onClick={() => ownerProfile?.id && router.push(`/profile/${ownerProfile.id}`)}
                    title={ownerProfile?.id ? t("profile.open", "Перейти в профиль") : undefined}
                >
                    {ownerProfile ? (
                        <>
                            <UserAvatar
                                user={ownerProfile}
                                size={48}
                                style={{ border: "2px solid #233655", background: "#222d38", marginRight: 12 }}
                            />
                            <span style={{ fontWeight: 700, color: infoPrimaryColor, fontSize: 15, whiteSpace: "nowrap", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {ownerProfile.organization}
                            </span>
                            {ownerProfile.contact_person && (
                                <span style={{ color: infoSecondaryColor, fontSize: 14, maxWidth: 110, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {ownerProfile.contact_person}
                                </span>
                            )}
                            {ownerProfile.country && (
                                <span style={{ display: "flex", alignItems: "center", color: "#93c5fd", fontSize: 14 }}>
                                    <FlagIcon country={getCountryCode(ownerProfile.country)} size={17} />
                                    {ownerProfile.city ? ownerProfile.city + ", " : ""}
                                    {ownerProfile.country}
                                </span>
                            )}
                            <span style={{ color: "#7acbff", fontWeight: 600, fontSize: 14, marginLeft: 4 }}>ID: {ownerProfile.id}</span>
                            {ownerProfile.final_rating !== undefined && (
                                <span style={{ color: ratingToColor(ownerProfile.final_rating), fontWeight: 700, fontSize: 15, marginLeft: 10, display: "flex", alignItems: "center" }}>
                                    ★ {ownerProfile.final_rating?.toFixed(1) || "0.0"} / 10
                                </span>
                            )}
                        </>
                    ) : (
                        <span style={{ color: cardColors.label, fontSize: 14 }}>{t("profile.hiddenOrUnavailable", "Профиль недоступен")}</span>
                    )}
                </div>

                {/* ПРАВЫЙ БЛОК: ВСЕ КНОПКИ (прижаты вправо) */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        justifyContent: "flex-end",
                        flex: "1 1 360px",
                        minWidth: 260,
                    }}
                >
                    {/* внутренняя заметка — только для менеджер-аккаунта */}
                    {isManagerAccount && (
                        <div style={{ position: "relative" }}>
                            <button
                                title="Внутренний комментарий (виден только автору и участникам менеджер-аккаунта)"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const open = commentOpenId === order.id;
                                    setCommentOpenId(open ? null : order.id);
                                    if (!open) loadInternalComments(order.id);
                                }}
                                style={{ ...iconBtnStyle, position: "relative" }}
                                aria-label={t("comments.internalTooltip", "Внутренний комментарий")}
                                ref={commentBtnRef}
                            >
                                <FaRegCommentDots />
                                {(commentsMap[order.id]?.length || 0) > 0 && (
                                    <span
                                        style={{
                                            position: "absolute",
                                            top: -4,
                                            right: -4,
                                            minWidth: 18,
                                            height: 18,
                                            borderRadius: 9,
                                            background: "#43c8ff",
                                            color: "#0f1f2b",
                                            fontSize: 11,
                                            fontWeight: 800,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            boxShadow: `0 0 0 2px ${commentPalette.badgeRing}`,
                                        }}
                                    >
                                        {commentsMap[order.id].length}
                                    </span>
                                )}
                            </button>
                            {commentOpenId === order.id && (
                                <div
                                    ref={commentPopoverRef}
                                    style={{
                                        position: "absolute",
                                        right: 0,
                                        top: "110%",
                                        width: 520,
                                        maxWidth: "min(92vw, 520px)",
                                        background: commentPalette.popoverBg,
                                        border: `1px solid ${commentPalette.popoverBorder}`,
                                        borderRadius: 12,
                                        padding: 12,
                                        boxShadow: commentPalette.popoverShadow,
                                        zIndex: 20,
                                        color: commentPalette.commentText,
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >

                                    {/* Лента комментариев */}
                                    <div
                                        style={{
                                            maxHeight: 220,
                                            overflowY: "auto",
                                            background: commentPalette.threadBg,
                                            border: `1px solid ${commentPalette.threadBorder}`,
                                            borderRadius: 8,
                                            padding: 8,
                                            marginBottom: 8,
                                        }}
                                    >
                                        {(commentsMap[order.id]?.length || 0) === 0 ? (
                                            <div style={{ color: cardColors.label, fontSize: 14 }}>{t("comments.none", "Пока нет комментариев")}</div>
                                        ) : (
                                            commentsMap[order.id].map((c) => (
                                                <div
                                                    key={c.id}
                                                    style={{
                                                        display: "flex",
                                                        gap: 10,
                                                        padding: "6px 4px",
                                                        borderBottom: `1px solid ${commentPalette.threadBorder}`,
                                                    }}
                                                >
                                                    <img
                                                        src={c.author_avatar ? abs(c.author_avatar) : "/default-avatar.png"}
                                                        alt="av"
                                                        width={28}
                                                        height={28}
                                                        style={{ borderRadius: "50%", border: `1px solid ${commentPalette.threadBorder}`, objectFit: "cover" }}
                                                        onError={(e) => (e.currentTarget.src = "/default-avatar.png")}
                                                    />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center",
                                                                marginBottom: 3,
                                                                gap: 10,
                                                            }}
                                                        >
                                                            <b style={{ color: commentPalette.commentText, fontSize: 13 }}>{c.author_name || t("comments.member", "Участник")}</b>
                                                            <span style={{ color: commentPalette.meta, fontSize: 11 }}>
                                                                {(() => {
                                                                    const d = new Date(c.created_at);
                                                                    return isNaN(d.getTime())
                                                                        ? ""
                                                                        : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
                                                                })()}
                                                            </span>
                                                        </div>
                                                        <div style={{ color: commentPalette.commentText, whiteSpace: "pre-wrap", fontSize: 14 }}>{c.content}</div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <textarea
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        rows={3}
                                        placeholder={t("comments.placeholder.short", "Короткий комментарий…")}
                                        style={{
                                            width: "100%",
                                            borderRadius: 8,
                                            border: `1px solid ${commentPalette.textareaBorder}`,
                                            background: commentPalette.textareaBg,
                                            color: commentPalette.textareaColor,
                                            padding: 8,
                                        }}
                                    />
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            color: commentPalette.meta,
                                            fontSize: 12,
                                            marginTop: 6,
                                            marginBottom: 4,
                                        }}
                                    >
                                        <span
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                width: 16,
                                                height: 16,
                                                minWidth: 16,
                                                borderRadius: "50%",
                                                background: isLight ? "#e6f0ff" : "#193158",
                                                color: isLight ? "#0f172a" : "#9ec3ff",
                                                fontWeight: 900,
                                                fontSize: 11,
                                                border: `1px solid ${commentPalette.threadBorder}`,
                                            }}
                                        >
                                            i
                                        </span>
                                        <span>{t("comments.internalVisibilityNote", "Эту заметку увидят только автор заявки и участники аккаунта экспедитора.")}</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                                        <button
                                            onClick={() => saveInternalComment(order.id)}
                                            disabled={!commentText.trim()}
                                            style={{
                                                padding: "6px 12px",
                                                borderRadius: 8,
                                                border: "none",
                                                background: "#1e7ef7",
                                                color: "#fff",
                                                fontWeight: 700,
                                                cursor: "pointer",
                                            }}
                                        >
                                            {t("common.save", "Сохранить")}
                                        </button>
                                        <span style={{ fontSize: 12, opacity: 0.75 }}>
                                            {t("comments.savedCount", "Сохранено: {count}", { count: (commentsMap[order.id]?.length || 0) })}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* чат и контакты */}
                    <button onClick={handleChatClick} title={t("nav.chat", "Чат")} style={{ ...iconBtnStyle, color: "#43c8ff" }}>
                        <FaComments />
                    </button>
                    {ownerProfile?.phone && (
                        <a href={`tel:${ownerProfile.phone}`} title={t("chat.call", "Звонок")} style={iconBtnStyle}>
                            <FaPhone />
                        </a>
                    )}
                    {ownerProfile?.whatsapp && (
                        <a
                            href={`https://wa.me/${ownerProfile.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="WhatsApp"
                            style={{ ...iconBtnStyle, color: "#43d854" }}
                        >
                            <FaWhatsapp />
                        </a>
                    )}
                    {ownerProfile?.viber && (
                        <a
                            href={`viber://chat?number=${ownerProfile.viber.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Viber"
                            style={{ ...iconBtnStyle, color: "#7957d5" }}
                        >
                            <FaViber />
                        </a>
                    )}
                    {ownerProfile?.telegram && (
                        <a
                            href={`https://t.me/${ownerProfile.telegram.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Telegram"
                            style={{ ...iconBtnStyle, color: "#21a5dd" }}
                        >
                            <FaTelegram />
                        </a>
                    )}

                    <OrderShareButtons order={order} variant="compact" buttonStyle={iconBtnStyle} />

                    {/* сохранить (внизу, в одном ряду с остальными действиями) */}
                    <SaveToggleButton type="order" id={order.id} variant="bar" />

                    {/* ставки / ваша ставка / показать детали */}
                    {order.rate_type !== "Без торга" && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowBidPanel((v) => !v);
                            }}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 14px",
                                borderRadius: 999,
                                border: "1px solid #213759",
                                background: "#132642",
                                color: "#e0f1ff",
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: "pointer",
                                boxShadow: "none",
                                transition: "opacity .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease",
                            }}
                            title={t("bids.title", "Ставки")}
                            tabIndex={0}
                        >
                            <FaGavel style={{ fontSize: 15 }} />
                            {t("bids.title", "Ставки")}
                        </button>
                    )}
                    {!loadingBid && yourBid && (
                        <span
                            style={{
                                background: "#172b3f",
                                color: "#ffd600",
                                borderRadius: 7,
                                padding: "3px 10px",
                                fontWeight: 600,
                                fontSize: 14,
                                marginRight: 3,
                            }}
                        >
                            {t("bids.yourBid", "Ваша ставка")}: {formatPrice(yourBid.amount, yourBid.currency)}
                        </span>
                    )}
                    {/* «Показать детали» — ВСЕГДА видно */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isMobile) return;
                            guard(() => router.push("/orders/" + order.id))(e);
                        }}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "7px 14px",
                            borderRadius: 999,
                            border: "1px solid #213759",
                            background: "#132642",
                            color: "#e0f1ff",
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: "pointer",
                            boxShadow: "none",
                            transition: "opacity .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease",
                        }}
                        title={expanded ? t("common.hideDetails", "Скрыть детали") : t("common.showDetails", "Показать детали")}
                        tabIndex={0}
                    >
                        {isMobile ? (expanded ? t("common.hideDetails", "Скрыть детали") : t("common.showDetails", "Показать детали")) : t("common.showDetails", "Показать детали")}
                    </button>
                </div>
            </div>

            {/* --- ВЫПАДАЮЩАЯ ФОРМА СТАВКИ --- */}
            <AnimatePresence>
                {showBidPanel && order.rate_type !== "Без торга" && (
                    <motion.div
                        ref={bidPanelRef}
                        initial={{ opacity: 0, y: 25, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 25, scale: 0.97 }}
                        transition={{ duration: 0.32, ease: [0.48, 1.52, 0.44, 0.98] }}
                        style={{
                            position: "absolute",
                            right: 17,
                            bottom: 54,
                            zIndex: 13,
                            background: "#222e44",
                            borderRadius: 14,
                            boxShadow: "0 6px 32px #43c8ff33",
                            padding: "18px 22px 13px 22px",
                            minWidth: 265,
                            maxWidth: 410,
                            width: "90vw",
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div style={{ fontWeight: 700, color: "#43c8ff", marginBottom: 7, fontSize: 15 }}>
                            {
                                (() => {
                                    let bidsToShow = allBids ? [...allBids] : [];
                                    if (yourBid && !bidsToShow.some((b) => b.id === yourBid.id)) {
                                        bidsToShow = [yourBid, ...bidsToShow];
                                    }
                                    bidsToShow = bidsToShow.filter((bid, idx, arr) => arr.findIndex((b) => b.id === bid.id) === idx);
                                    return <>{t("bids.title", "Ставки")} ({loadingBids ? "..." : bidsToShow.length})</>;
                                })()
                            }
                        </div>
                        <div style={{ maxHeight: 150, overflowY: "auto", marginBottom: 9, borderRadius: 8, background: "#182234", padding: 6 }}>
                            {
                                (() => {
                                    let bidsToShow = allBids ? [...allBids] : [];
                                    bidsToShow.sort((a, b) => b.amount - a.amount);
                                    if (bidsToShow.length === 0) {
                                        return <div style={{ color: cardColors.label, fontSize: 14 }}>{t("bids.noneYet", "Пока нет ставок")}</div>;
                                    }
                                    return bidsToShow.map((bid) => (
                                        <div
                                            key={bid.id}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                fontSize: 14,
                                                background: yourBid?.id === bid.id ? "#213768" : "none",
                                                color: yourBid?.id === bid.id ? "#ffd600" : "#b3d5fa",
                                                borderRadius: 6,
                                                padding: "4px 9px",
                                                marginBottom: 3,
                                                fontWeight: yourBid?.id === bid.id ? 700 : 500,
                                            }}
                                        >
                                            <span>
                                                {formatPrice(bid.amount, bid.currency)}
                                                {yourBid?.id === bid.id && (
                                                    <span style={{ marginLeft: 8, fontSize: 12, color: "#ffd600" }}>{t("bids.yoursShort", "(Ваша)")}</span>
                                                )}
                                            </span>
                                            <span style={{ fontSize: 12, color: "#6ebcff" }}>
                                                {bid.created_at?.slice(0, 16).replace("T", " ")}
                                            </span>
                                        </div>
                                    ));
                                })()
                            }
                        </div>
                        {!yourBid && (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleSendBid(amount, comment);
                                }}
                            >
                                <div style={{ fontWeight: 700, color: "#43c8ff", marginBottom: 7, fontSize: 15 }}>{t("bids.make", "Сделать ставку")}</div>
                                <input
                                    type="number"
                                    placeholder={t("form.amount", "Сумма")}
                                    required
                                    min="1"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    style={{ width: "99%", padding: 8, borderRadius: 8, border: "1px solid #193158", marginBottom: 7, fontSize: 14 }}
                                />
                                <select
                                    value={bidCurrency}
                                    onChange={(e) => setBidCurrency(e.target.value)}
                                    style={{
                                        width: "99%",
                                        padding: 8,
                                        borderRadius: 8,
                                        border: "1px solid #193158",
                                        marginBottom: 7,
                                        fontSize: 14,
                                        background: "#1a253a",
                                        color: "#fff",
                                    }}
                                >
                                    {CURRENCIES.map((cur) => (
                                        <option key={cur} value={cur}>
                                            {cur}
                                        </option>
                                    ))}
                                </select>
                                <textarea
                                    placeholder={t("bid.commentOptional", "Комментарий (необязательно)")}
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    style={{
                                        width: "99%",
                                        padding: 8,
                                        borderRadius: 8,
                                        border: "1px solid #193158",
                                        minHeight: 35,
                                        marginBottom: 6,
                                        fontSize: 14,
                                        resize: "vertical",
                                    }}
                                />
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        type="submit"
                                        disabled={sending || !amount}
                                        style={{
                                            background: "#43c8ff",
                                            color: "#162239",
                                            border: "none",
                                            borderRadius: 8,
                                            fontWeight: 700,
                                            padding: "8px 20px",
                                            fontSize: 14,
                                            cursor: "pointer",
                                        }}
                                    >
                                        {sending ? "..." : t("common.send", "Отправить")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowBidPanel(false)}
                                        style={{
                                            background: "#192b42",
                                            color: "#b3d5fa",
                                            border: "none",
                                            borderRadius: 8,
                                            fontWeight: 700,
                                            padding: "8px 17px",
                                            fontSize: 14,
                                            cursor: "pointer",
                                        }}
                                    >
                                        {t("common.cancel", "Отмена")}
                                    </button>
                                </div>
                            </form>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
            {isGuest && (
                <>
                    {/* слой blur поверх всей карточки */}
                    <div
                        onClick={(e) => { e.stopPropagation(); requireAuth(); }}
                        style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 17,
                            zIndex: 30,
                            background: "rgba(10,20,34,0.45)",
                            backdropFilter: "blur(8px)",
                            WebkitBackdropFilter: "blur(8px)",
                        }}
                    />
                    {/* прозрачная «плёнка» — ловит любой клик */}
                    <div
                        onClick={(e) => { e.stopPropagation(); requireAuth(); }}
                        style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 17,
                            zIndex: 40,
                        }}
                    />
                </>
            )}
        </div>
    );
}

export { OrderCard };
