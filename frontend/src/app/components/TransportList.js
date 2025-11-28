"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import TransportFilter from "./TransportFilter";
// import TransportCardMobile from "./TransportCardMobile"; // не используется
import TransportListMobile from "./TransportListMobile";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useRouter, useSearchParams } from "next/navigation";
import {
    FaPhone,
    FaWhatsapp,
    FaTelegram,
    FaViber,
    FaComments,
    FaRegCopy,
    FaRegCommentDots,
    FaChevronUp,
} from "react-icons/fa";
import { useUser } from "../UserContext";
import { AnimatePresence, motion } from "framer-motion";
import { useMessenger } from "./MessengerContext";
import ReactCountryFlag from "react-country-flag";
import { formatPrice } from "../utils/currency";
import countries from "i18n-iso-countries";
import "i18n-iso-countries/langs/en.json";
import "i18n-iso-countries/langs/ru.json";
import "i18n-iso-countries/langs/tr.json";
import "i18n-iso-countries/langs/ka.json";
import { useMapHover } from "./MapHoverContext";
import UserAvatar from "./UserAvatar";
import SaveToggleButton from "./SaveToggleButton";
import TransportCompactCard from "./TransportCompactCard";
import MobileFilterSheet from "./mobile/MobileFilterSheet";
import MobileMapSheet from "./mobile/MobileMapSheet";
import { api, abs } from "@/config/env";
import IconLabel from "./ui/IconLabel";
import { FiMap as MapIcon, FiList as ListIcon } from "react-icons/fi";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";
import {
    LOADING_TYPES,
    getTruckBodyTypes,
    getLoadingTypes,
    localizeRegularity as mapRegularity,
} from "./truckOptions";
import TransportShareButtons from "./TransportShareButtons";

// Цвет рейтинга 0→красный, 10→зелёный
function ratingToColor(value) {
    const v = Math.max(0, Math.min(10, Number(value) || 0));
    const hue = (v / 10) * 120; // 0=red, 120=green
    return `hsl(${hue}, 90%, 45%)`;
}

countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ru.json"));
countries.registerLocale(require("i18n-iso-countries/langs/tr.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ka.json"));

// API_BASE теперь берём из @/config/env через api()/abs()
const UI_LANG =
    typeof navigator !== "undefined"
        ? (navigator.language || "ru").split("-")[0]
        : "ru";

// --- НОРМАЛИЗАЦИЯ ДАТ ДЛЯ ЗАПРОСОВ К БЭКЕНДУ ---
// Приводим всё к ISO YYYY-MM-DD. Принимаем 'дд.мм.гггг', 'дд/мм/гггг', ISO и Date-compatible строки.
function toISODate(v) {
    if (!v) return "";
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // уже ISO
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/); // дд.мм.гггг или дд/мм/гггг
    if (m) {
        const [, d, mo, y] = m;
        const pad = (x) => String(x).padStart(2, "0");
        return `${y}-${pad(mo)}-${pad(d)}`;
    }
    const dt = new Date(s);
    return isNaN(dt) ? "" : dt.toISOString().slice(0, 10);
}

function normalizeTransportFilters(f) {
    const out = { ...f };
    const isoFrom = toISODate(out.ready_date_from);
    const isoTo = toISODate(out.ready_date_to);
    if (isoFrom) out.ready_date_from = isoFrom;
    else delete out.ready_date_from;
    if (isoTo) out.ready_date_to = isoTo;
    else delete out.ready_date_to;
    return out;
}

const iconBtnStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--transport-card-icon-bg, #1e2d44)",
    color: "var(--transport-card-icon-fg, #43c8ff)",
    border: "none",
    borderRadius: "50%",
    width: 32,
    height: 32,
    fontSize: 16,
    cursor: "pointer",
    marginLeft: 3,
    boxShadow: "var(--transport-card-icon-shadow, 0 1px 8px #23416722)",
};

const SimpleMap = dynamic(() => import("./SimpleMap"), { ssr: false });

function parseDateDMY(str) {
    if (!str) return null;
    const parts = str.split(/[./-]/);
    if (parts.length !== 3) return null;
    if (str.includes("-")) return str;
    const [d, m, y] = parts;
    return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
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
                background: "var(--transport-card-chip-bg, #193158)",
                borderRadius: 5,
                border: "1.2px solid var(--transport-card-tag-border, #234167)",
                marginRight: 8,
                marginLeft: -2,
                boxShadow: "var(--transport-card-chip-shadow, 0 1px 6px #23416711)",
                overflow: "hidden",
                flexShrink: 0,
                flexGrow: 0,
                position: "relative",
            }}
        >
            <ReactCountryFlag
                countryCode={country}
                svg
                style={{
                    width: size - 3,
                    height: size - 3,
                    objectFit: "cover",
                    borderRadius: 4,
                    background: "#fff",
                    display: "block",
                }}
                title={country}
            />
        </span>
    );
}

const LANGS = ["en", "ru", "tr", "ka"];
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

// --- Skeleton loader ---
function TransportSkeleton() {
    return (
        <motion.div
            initial={{ opacity: 0.12, scale: 0.96 }}
            animate={{ opacity: 0.8, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, repeatType: "reverse" }}
            style={{
                width: "100%",
                height: 130,
                borderRadius: 16,
                background: "linear-gradient(90deg, #1a2743 60%, #263961 100%)",
                marginBottom: 0,
                marginTop: 12,
            }}
        />
    );
}

export default function TransportList({ transports: propTransports }) {
    const { t } = useLang(); // <-- вызывать хук без optional chaining
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";
    const ADR_CLASS_INFO = {
        1: t("adr.info.1", "Класс 1: Взрывчатые вещества и изделия"),
        2: t("adr.info.2", "Класс 2: Газы"),
        3: t("adr.info.3", "Класс 3: Легковоспламеняющиеся жидкости"),
        4: t("adr.info.4", "Класс 4: Легковоспламеняющиеся твёрдые вещества"),
        5: t("adr.info.5", "Класс 5: Окисляющие вещества и органические перекиси"),
        6: t("adr.info.6", "Класс 6: Ядовитые и инфекционные вещества"),
        7: t("adr.info.7", "Класс 7: Радиоактивные материалы"),
        8: t("adr.info.8", "Класс 8: Коррозионные вещества"),
        9: t("adr.info.9", "Класс 9: Прочие опасные вещества"),
    };
    const { user: me, isBlocked } = useUser();
    const isManagerAccount = ["manager", "employee"].includes(
        (me?.role || "").toLowerCase()
    );

    const [transports, setTransports] = useState(propTransports || []);
    const transportsRef = useRef(propTransports || []);
    const [placeLabels, setPlaceLabels] = useState(null);
    const [displayedTransports, setDisplayedTransports] = useState(
        propTransports || []
    );
    const [filters, setFilters] = useState({});
    const CARD_SIZE_STORAGE_KEY = "ordersCardSize";
    const [cardSize, setCardSize] = useState("large");
    const setFiltersPaged = useCallback((updater) => {
        setPage(1);
        setFilters((prev) =>
            typeof updater === "function" ? updater(prev) : updater
        );
    }, []);

    // Реагируем на изменения ?matches_only в URL (без перезагрузки страницы)
    const searchParams = useSearchParams();
    useEffect(() => {
        const mo = searchParams?.get?.("matches_only");
        setFiltersPaged((prev) => {
            const next = { ...prev };
            if (mo && mo !== "0" && String(mo).toLowerCase() !== "false")
                next.matches_only = 1;
            else delete next.matches_only;
            return next;
        });
    }, [searchParams, setFiltersPaged]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(CARD_SIZE_STORAGE_KEY);
            if (saved === "compact" || saved === "large") setCardSize(saved);
        } catch { }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(CARD_SIZE_STORAGE_KEY, cardSize);
        } catch { }
    }, [cardSize]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    // --- Pagination state ---
    const DEFAULT_PAGE_SIZE = 20;
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    const hasMoreMobile = useMemo(() => {
        if (total) return transports.length < total;
        if (!transports.length) return false;
        const expected = page * pageSize;
        return transports.length >= expected;
    }, [page, pageSize, total, transports.length]);
    const [expandedId, setExpandedId] = useState(null);
    const [activeTab, setActiveTab] = useState("list");
    const [visibleIds, setVisibleIds] = useState(null);

    const [filterOpen, setFilterOpen] = useState(false);
    const [mapOpen, setMapOpen] = useState(false);

    // Подтягиваем лейблы для всех place_id
    useEffect(() => {
        const ids = new Set();
        (transports || []).forEach((t) => {
            if (t.from_place_id) ids.add(t.from_place_id);
            (t.to_place_ids || []).forEach((id) => id && ids.add(id));
        });
        if (!ids.size) {
            setPlaceLabels(null);
            return;
        }
        fetch(api(`/places/labels?ids=${[...ids].join(",")}&lang=${UI_LANG}`))
            .then((r) => (r.ok ? r.json() : {}))
            .then(setPlaceLabels)
            .catch(() => { });
    }, [transports]);

    function renderCity(id, fallback) {
        const item = placeLabels?.[id];
        if (!item) return fallback || "";
        try {
            const cn = new Intl.DisplayNames([UI_LANG], { type: "region" }).of(
                item.country_iso2
            );
            return `${item.label}${cn ? `, ${cn}` : ""}`;
        } catch {
            return item.label;
        }
    }

    // Обновлять visibleIds только если список действительно изменился
    const setVisibleIdsStable = useCallback((next) => {
        setVisibleIds((prev) => {
            const target = typeof next === "function" ? next(prev) : next;
            if (
                Array.isArray(prev) &&
                Array.isArray(target) &&
                prev.length === target.length
            ) {
                let same = true;
                for (let i = 0; i < prev.length; i++) {
                    if (prev[i] !== target[i]) {
                        same = false;
                        break;
                    }
                }
                if (same) return prev; // не триггерим ререндер
            } else if (prev === target) {
                return prev;
            }
            return target;
        });
    }, []);

    // Обновлять фильтры с карты; зеркалим map_* -> from_* (для серверной фильтрации)
    const setFiltersFromMap = useCallback((patch) => {
        setFilters((prev) => {
            const raw =
                typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
            const next = { ...raw };
            if (Array.isArray(next.map_center) && next.map_center.length === 2) {
                next.from_location_lat = next.map_center[0];
                next.from_location_lng = next.map_center[1];
            }
            if (Number.isFinite(next.map_radius)) next.from_radius = next.map_radius;
            const keys = [
                "map_center",
                "map_radius",
                "from_location_lat",
                "from_location_lng",
                "from_radius",
            ];
            let changed = false;
            for (const k of keys) {
                const a = prev?.[k];
                const b = next?.[k];
                const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
                const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
                if (sa !== sb) {
                    changed = true;
                    break;
                }
            }
            return changed ? next : prev;
        });
    }, []);

    const [showTop, setShowTop] = useState(false);
    const [footerVisible, setFooterVisible] = useState(false);
    useEffect(() => {
        const onScroll = () => setShowTop(window.scrollY > 600);
        onScroll(); // первичная инициализация
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Скрывать кнопку, когда футер «касается» экрана
    useEffect(() => {
        const footerEl = document.querySelector("footer");
        if (!footerEl) return;
        const io = new IntersectionObserver(
            ([entry]) => setFooterVisible(entry.isIntersecting),
            { threshold: 0 } // появится хотя бы 1px футера — считаем «коснулся»
        );
        io.observe(footerEl);
        return () => io.disconnect();
    }, []);

    const prevVisibleIdsRef = useRef(null);
    const { openMessenger, setChatId, setPendingAttachment } = useMessenger();
    const isMobile = useIsMobile();

    // Защита от race condition
    const lastRequestId = useRef(0);
    const appendModeRef = useRef(false);

    const hasActiveFilter = Object.entries(filters).some(
        ([, v]) =>
            v !== "" && v !== undefined && !(typeof v === "boolean" && v === false)
    );

    // --- Флаг первой загрузки ---
    const [initialLoaded, setInitialLoaded] = useState(!!propTransports);

    // --- Получение транспорта с фильтрацией (только если нет пропса)
    const lastQueryKeyRef = useRef("");

    const fetchTransports = useCallback(async () => {
        if (propTransports) return;
        const thisRequest = ++lastRequestId.current;
        const isAppend = Boolean(isMobile && appendModeRef.current && page > 1);
        try {
            // ВАЖНО: нормализуем даты в ISO перед сборкой query
            const normFilters = normalizeTransportFilters(filters);
            const query = Object.entries(normFilters)
                .filter(([k, v]) => {
                    if (v === "" || v === undefined || v === null) return false;
                    if (typeof v === "boolean" && v === false) return false;
                    // не отправляем нулевой/отрицательный радиус
                    if (k === "from_radius" && Number(v) <= 0) return false;
                    // не отправляем lat/lng если нет положительного радиуса
                    if (
                        (k === "from_location_lat" || k === "from_location_lng") &&
                        Number(normFilters?.from_radius) <= 0
                    )
                        return false;
                    return true;
                })
                .map(([k, v]) =>
                    Array.isArray(v)
                        ? v
                            .map(
                                (val) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`
                            )
                            .join("&")
                        : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
                )
                .join("&");

            const pageQuery = `page=${page}&page_size=${pageSize}`;
            const queryKey = `${query}|${pageQuery}`;
            if (!appendModeRef.current && lastQueryKeyRef.current === queryKey) {
                return;
            }
            lastQueryKeyRef.current = queryKey;
            setLoading(!isAppend);
            if (isAppend) setLoadingMore(true);
            const t =
                (typeof window !== "undefined" && localStorage.getItem("token")) ||
                null;
            const resp = await fetch(
                `/api/transports${query ? "?" + query + "&" + pageQuery : "?" + pageQuery
                }`,
                {
                    credentials: "include", // чтобы кука тоже пришла в API-роут
                    headers: t ? { Authorization: `Bearer ${t}` } : undefined,
                }
            );

            const rawText = await resp.text();
            let data = null;
            try {
                data = rawText ? JSON.parse(rawText) : null;
            } catch (err) {
                console.warn(
                    "[transport] Failed to parse transports response",
                    err,
                    rawText?.slice?.(0, 200)
                );
                data = null;
            }

            if (!resp.ok) {
                console.warn(
                    "[transport] Transport fetch failed",
                    resp.status,
                    rawText?.slice?.(0, 200)
                );
                throw new Error(`Failed to load transports: ${resp.status}`);
            }
            const totalHeader =
                resp.headers.get("X-Total-Count") || resp.headers.get("x-total-count");
            if (totalHeader) setTotal(parseInt(totalHeader, 10) || 0);
            let items = data;
            if (!Array.isArray(items) && data && Array.isArray(data.items)) {
                setTotal(parseInt(data.total || data.count || 0, 10) || 0);
                items = data.items;
            } else if (!Array.isArray(items)) {
                console.warn("[transport] Unexpected transports payload", data);
                items = [];
                if (!totalHeader) setTotal(0);
            } else if (!totalHeader) {
                setTotal(Array.isArray(data) ? data.length : 0);
            }
            if (thisRequest === lastRequestId.current) {
                const incoming = Array.isArray(items) ? items : [];
                const shouldAppend = isAppend;
                const merged = shouldAppend
                    ? (() => {
                        const prev = Array.isArray(transportsRef.current)
                            ? transportsRef.current
                            : [];
                        const seen = new Set(prev.map((it) => it?.id ?? it?.uid));
                        const next = [...prev];
                        for (const it of incoming) {
                            const key = it?.id ?? it?.uid;
                            if (key != null && seen.has(key)) continue;
                            if (key != null) seen.add(key);
                            next.push(it);
                        }
                        return next;
                    })()
                    : incoming;
                transportsRef.current = merged;
                setTransports(merged);
                setTimeout(() => {
                    const arr = Array.isArray(merged) ? merged : [];
                    setDisplayedTransports(
                        arr.filter((t) => !isBlocked(t?.owner_id || t?.user_id))
                    );
                }, 100);
                setInitialLoaded(true);
            }
        } catch (e) {
            setTransports([]);
            setTimeout(() => setDisplayedTransports([]), 80);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            appendModeRef.current = false;
        }
    }, [filters, isMobile, page, pageSize, propTransports]);

    const handleResetFilters = () => setFilters({});

    useEffect(() => {
        if (propTransports) {
            const arr = Array.isArray(propTransports) ? propTransports : [];
            setTransports(arr);
            transportsRef.current = arr;
            setDisplayedTransports(
                arr.filter((t) => !isBlocked(t?.owner_id || t?.user_id))
            );
        } else {
            fetchTransports();
        }
    }, [fetchTransports, propTransports]);

    useEffect(() => {
        transportsRef.current = transports;
    }, [transports]);

    const loadMoreMobile = useCallback(() => {
        if (loading || loadingMore || !hasMoreMobile || appendModeRef.current)
            return;
        appendModeRef.current = true;
        setLoadingMore(true);
        setPage((p) => p + 1);
    }, [hasMoreMobile, loading, loadingMore]);
    // --- Фильтрация транспорта по радиусу и дате ---
    function intervalsIntersect(a_from, a_to, b_from, b_to) {
        if (!a_from || !a_to || !b_from || !b_to) return true;
        const aStart = new Date(parseDateDMY(a_from));
        const aEnd = new Date(parseDateDMY(a_to));
        const bStart = new Date(parseDateDMY(b_from));
        const bEnd = new Date(parseDateDMY(b_to));
        return aStart <= bEnd && aEnd >= bStart;
    }

    // 1) сначала применяем локальные (датные) фильтры
    // гарантируем, что transports — это массив
    const safeTransports = Array.isArray(transports) ? transports : [];
    const hasDateFilter = !!(filters.ready_date_from || filters.ready_date_to);
    const baseTransports = safeTransports.filter((t) => {
        // «Постоянно» всегда подходит при любом датном фильтре
        const isPermanent =
            (t?.mode && String(t.mode).toLowerCase() === "постоянно") ||
            (t?.regularity && String(t.regularity).toLowerCase().includes("постоян"));
        if (hasDateFilter && isPermanent) return true;

        if (filters.ready_date_from && filters.ready_date_to) {
            if (
                !intervalsIntersect(
                    t.ready_date_from,
                    t.ready_date_to,
                    filters.ready_date_from,
                    filters.ready_date_to
                )
            ) {
                return false;
            }
        } else if (filters.ready_date_from) {
            if (
                !t.ready_date_to ||
                new Date(parseDateDMY(t.ready_date_to)) <
                new Date(parseDateDMY(filters.ready_date_from))
            ) {
                return false;
            }
        } else if (filters.ready_date_to) {
            if (
                !t.ready_date_from ||
                new Date(parseDateDMY(t.ready_date_from)) >
                new Date(parseDateDMY(filters.ready_date_to))
            ) {
                return false;
            }
        }
        return true;
    });

    // 2) затем режем списком id, пришедшим с карты (они уже учитывают: пин в круге ИЛИ пересечение кругов)
    const mapFilterActive =
        Number(filters?.map_radius) > 0 &&
        Array.isArray(filters?.map_center) &&
        filters.map_center.length === 2;

    const filteredTransports =
        mapFilterActive && Array.isArray(visibleIds)
            ? baseTransports.filter((t) => visibleIds.includes(t.id))
            : baseTransports;

    const foundCount =
        mapFilterActive && Array.isArray(visibleIds)
            ? filteredTransports.length
            : total || filteredTransports.length;
    // --- Локализация regularity (рус. → i18n) ---
    // Единый локализатор регулярности
    const localizeRegularity = useCallback((reg) => mapRegularity(t, reg), [t]);

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

    function renderTabs() {
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
                    style={{
                        fontWeight: 700,
                        fontSize: 16,
                        padding: "8px 25px",
                        background: activeTab === "map" ? "#11284a" : "#19223a",
                        color: activeTab === "map" ? "#43c8ff" : "#8ecae6",
                        borderRadius: 10,
                        border: "none",
                        cursor: "pointer",
                        transition: "all .14s",
                    }}
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
                    {t("view.largeCards", "Крупные")}
                </button>
                <button
                    style={getStyle(cardSize === "compact")}
                    onClick={() => setCardSize("compact")}
                    aria-label={t("view.compactCards", "Компактные карточки")}
                >
                    {t("view.compactCards", "Компактные")}
                </button>
            </div>
        );
    }

    const renderPagination = () => {
        if (totalPages <= 1) return null;
        const go = (p) => {
            if (p < 1 || p > totalPages || p === page) return;
            window.scrollTo({ top: 0, behavior: "smooth" });
            setPage(p);
        };
        const numbers = [];
        const maxButtons = 7;
        let start = Math.max(1, page - 2);
        let end = Math.min(totalPages, start + maxButtons - 1);
        if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
        for (let i = start; i <= end; i++) numbers.push(i);

        const pagerBtnStyle = {
            background: "#162335",
            border: "1px solid #2b3d56",
            color: "#dbe8ff",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
        };

        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginTop: 18,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        onClick={() => go(1)}
                        disabled={page === 1}
                        style={pagerBtnStyle}
                    >
                        «
                    </button>
                    <button
                        onClick={() => go(page - 1)}
                        disabled={page === 1}
                        style={pagerBtnStyle}
                    >
                        ‹
                    </button>
                    {start > 1 && (
                        <span style={{ opacity: 0.6, padding: "6px 10px" }}>…</span>
                    )}
                    {numbers.map((n) => (
                        <button
                            key={n}
                            onClick={() => go(n)}
                            style={{
                                ...pagerBtnStyle,
                                fontWeight: n === page ? 800 : 600,
                                borderColor: n === page ? "#43c8ff" : "#2b3d56",
                            }}
                        >
                            {n}
                        </button>
                    ))}
                    {end < totalPages && (
                        <span style={{ opacity: 0.6, padding: "6px 10px" }}>…</span>
                    )}
                    <button
                        onClick={() => go(page + 1)}
                        disabled={page === totalPages}
                        style={pagerBtnStyle}
                    >
                        ›
                    </button>
                    <button
                        onClick={() => go(totalPages)}
                        disabled={page === totalPages}
                        style={pagerBtnStyle}
                    >
                        »
                    </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ opacity: 0.7, fontSize: 14 }}>
                        {t("pagination.perPage", "На странице:")}
                    </span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPage(1);
                            setPageSize(parseInt(e.target.value, 10));
                        }}
                        style={{
                            background: "#162335",
                            border: "1px solid #2b3d56",
                            color: "#dbe8ff",
                            borderRadius: 8,
                            padding: "6px 10px",
                        }}
                    >
                        {[10, 20, 30, 40, 50].map((sz) => (
                            <option key={sz} value={sz}>
                                {sz}
                            </option>
                        ))}
                    </select>
                    <span style={{ opacity: 0.7, fontSize: 14 }}>
                        {t("pagination.total", "Всего:")} {total}
                    </span>
                </div>
            </div>
        );
    };

    // Показываем фильтр только если нет propTransports
    const showFilter = !propTransports;

    useEffect(() => {
        if (!mapFilterActive || !Array.isArray(visibleIds)) return;
        const visibleStr = JSON.stringify(visibleIds);
        if (prevVisibleIdsRef.current !== visibleStr) {
            prevVisibleIdsRef.current = visibleStr;
            const arr = Array.isArray(transports) ? transports : [];
            setDisplayedTransports(arr.filter((t) => visibleIds.includes(t.id)));
        }
    }, [mapFilterActive, transports, visibleIds]);

    // --- Плавный список транспортов ---
    function renderTransportCards(filtered) {
        const safeFiltered = Array.isArray(filtered) ? filtered : [];
        if (!initialLoaded && loading) {
            return (
                <>
                    {[...Array(4)].map((_, i) => (
                        <TransportSkeleton key={i} />
                    ))}
                </>
            );
        }
        if (
            loading &&
            Array.isArray(displayedTransports) &&
            displayedTransports.length > 0
        ) {
            return (
                <AnimatePresence initial={false}>
                    {displayedTransports.map((transport) => (
                        <motion.div
                            key={transport.id}
                            initial={{ opacity: 0, y: 36, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.98 }}
                            transition={{ duration: 0.34, ease: [0.42, 1.3, 0.5, 1] }}
                            style={{ width: "100%" }}
                        >
                            {cardSize === "compact" ? (
                                <TransportCompactCard
                                    transport={transport}
                                    isMobile={isMobile}
                                    hideStatus={!isMobile}
                                    hideLive={!isMobile}
                                    enableHoverLift={!isMobile}
                                />
                            ) : (
                                <TransportCard
                                    transport={transport}
                                    expanded={expandedId === transport.id}
                                    onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
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
                    key="no-transports"
                    initial={{ opacity: 0, scale: 0.97, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -12 }}
                    transition={{ duration: 0.35, ease: [0.44, 1.3, 0.55, 1] }}
                    style={{ textAlign: "center", color: "#aaa", marginTop: 32 }}
                >
                    {filters?.map_center && filters?.map_radius
                        ? t("transport.noneInRadius", "Нет транспорта в этом радиусе")
                        : showFilter
                            ? t(
                                "transport.noneByFilters",
                                "Нет транспорта по выбранным фильтрам"
                            )
                            : t("transport.notFound", "Транспорт не найден")}
                </motion.div>
            );
        }
        return (
            <AnimatePresence initial={false}>
                {safeFiltered.map((transport) => (
                    <motion.div
                        key={transport.id}
                        initial={{ opacity: 0, y: 36, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.98 }}
                        transition={{ duration: 0.34, ease: [0.42, 1.3, 0.5, 1] }}
                        style={{ width: "100%" }}
                    >
                        {cardSize === "compact" ? (
                            <TransportCompactCard
                                transport={transport}
                                isMobile={isMobile}
                                hideStatus={!isMobile}
                                hideLive={!isMobile}
                                enableHoverLift={!isMobile}
                            />
                        ) : (
                            <TransportCard
                                transport={transport}
                                expanded={expandedId === transport.id}
                                onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                            />
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        );
    }

    return (
        <div>
            {/* ФИЛЬТРЫ И ВЕРХНЯЯ ПАНЕЛЬ — ТОЛЬКО ДЕСКТОП */}
            {!isMobile && showFilter && (
                <TransportFilter
                    filters={filters}
                    setFilters={setFiltersPaged}
                    fetchTransports={fetchTransports}
                    handleResetFilters={handleResetFilters}
                />
            )}
            {!isMobile && showFilter && (
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
                                    color: filteredTransports.length ? "#43c8ff" : "#ff6868",
                                    background: "rgba(22,35,53,0.97)",
                                    borderRadius: 8,
                                    padding: "4px 15px",
                                    minWidth: 105,
                                    textAlign: "right",
                                }}
                            >
                                {t("search.found", "Найдено:")}{" "}
                                {loading
                                    ? "..."
                                    : mapFilterActive && Array.isArray(visibleIds)
                                        ? filteredTransports.length
                                        : total || filteredTransports.length}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* КОНТЕНТ: МОБИЛКА ИЛИ ДЕСКТОП */}
            {isMobile ? (
                <TransportListMobile
                    transports={Array.isArray(transports) ? transports : []}
                    filters={filters}
                    setFilters={setFiltersPaged}
                    loading={loading || loadingMore}
                    fetchTransports={fetchTransports}
                    handleResetFilters={handleResetFilters}
                    /* карта/фильтр для мобилки */
                    visibleIds={visibleIds}
                    setFiltersFromMap={setFiltersFromMap}
                    onFilteredIdsChange={setVisibleIdsStable}
                    estimatedCount={
                        loading
                            ? undefined
                            : mapFilterActive && Array.isArray(visibleIds)
                                ? filteredTransports.length
                                : total || filteredTransports.length
                    }
                    onLoadMore={loadMoreMobile}
                    hasMore={hasMoreMobile}
                />
            ) : activeTab === "list" ? (
                <>
                    <div>{renderTransportCards(filteredTransports)}</div>
                    {renderPagination()}
                </>
            ) : (
                <div style={{ width: "100%", marginBottom: 24 }}>
                    <div
                        style={{
                            width: "100%",
                            height: 460,
                            maxWidth: 1440,
                            margin: "0 auto",
                            borderRadius: 16,
                            overflow: "hidden",
                            boxShadow: "0 3px 24px #00184455",
                            marginBottom: 18,
                        }}
                    >
                        <SimpleMap
                            transports={Array.isArray(transports) ? transports : []}
                            setFilters={setFiltersFromMap}
                            filters={filters}
                            onFilteredIdsChange={setVisibleIdsStable}
                        />
                    </div>
                    <div style={{ width: "100%", maxWidth: 1440, margin: "0 auto" }}>
                        {renderTransportCards(
                            Array.isArray(visibleIds)
                                ? displayedTransports
                                : filteredTransports
                        )}
                    </div>
                    {renderPagination()}
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
                        title={t("common.toTop", "Наверх")}
                        style={{
                            position: "fixed",
                            left: "50%",
                            transform: "translateX(-50%)",
                            bottom: isMobile ? 88 : 28,
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
                            zIndex: 1000,
                        }}
                    >
                        <FaChevronUp style={{ fontSize: 20, color: "#bfe6ff" }} />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}

// --- КАРТОЧКА --- //
function TransportCard({ transport, expanded, onToggle }) {
    const { t } = useLang();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";
    const { user: me } = useUser();
    // Больше не ограничиваем авторизованных: блар остаётся только для гостей
    const isLimited = false;
    // Витрины: label = перевод, value = канон (RU)
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const LOADING_TYPES_I18N = useMemo(() => getLoadingTypes(t), [t]);

    // Найти локализованный label по канон. value (тип кузова), без учёта регистра/пробелов
    const findBodyLabelByValue = useCallback(
        (val) => {
            if (val === undefined || val === null) return "";
            const v = String(val).trim().toLowerCase();
            const flat = [];
            for (const opt of BODY_TYPES || []) {
                if (opt?.children) flat.push(...opt.children);
                else flat.push(opt);
            }
            const found = flat.find(
                (o) =>
                    String(o?.value || "")
                        .trim()
                        .toLowerCase() === v
            );
            if (found?.label) return found.label;
            // fallback: если бэк пришлёт синонимы
            if (v.includes("тент")) return t("truck.body.tent", "Тентированный");
            if (v.includes("реф") || v.includes("рефриж"))
                return t("truck.body.refrigerator", "Рефрижератор");
            if (v.includes("изотерм")) return t("truck.body.isotherm", "Изотерм");
            return val;
        },
        [BODY_TYPES, t]
    );

    // RU → i18n для вида транспорта
    const localizeTransportKind = useCallback(
        (val) => {
            const s = String(val || "")
                .trim()
                .toLowerCase();
            if (s === "полуприцеп")
                return t("transport.kind.semitrailer", "Полуприцеп");
            if (s === "грузовик") return t("transport.kind.truck", "Грузовик");
            if (s === "сцепка" || s === "автопоезд")
                return t("transport.kind.roadTrain", "Сцепка");
            return val;
        },
        [t]
    );

    // Локализуем массив видов загрузки, сопоставляя по индексу канона
    const localizeLoadingTypes = useCallback(
        (arr) => {
            const i18n = LOADING_TYPES_I18N || [];
            return (arr || []).map((v) => {
                const idx = LOADING_TYPES.findIndex(
                    (x) => String(x).toLowerCase() === String(v).toLowerCase()
                );
                return idx >= 0 ? i18n[idx] || v : v;
            });
        },
        [LOADING_TYPES_I18N]
    );

    // Локализация regularity (рус. → i18n) — локально для карточки
    const localizeRegularity = useCallback(
        (reg) => {
            if (!reg) return "";
            const s = String(reg).trim().toLowerCase();
            // Частые случаи
            if (s.includes("ежеднев"))
                return t("transport.regularity.daily", "ежедневно");
            if (s.includes("еженедел"))
                return t("transport.regularity.weekly", "еженедельно");
            if (s.includes("ежемесяч"))
                return t("transport.regularity.monthly", "ежемесячно");
            // Доп. случаи из бэка
            if (s.includes("по рабочим дням") || s.includes("по будням"))
                return t("transport.regularity.weekdays", "по рабочим дням");
            if (s.includes("по выходным"))
                return t("transport.regularity.weekends", "по выходным");
            // Шаблон: "<n> раз(а) в <день|неделю|месяц|год>"
            const m = s.match(/(\d+)\s*раз[а]?\s*в\s*(день|неделю|месяц|год)/i);
            if (m) {
                const n = m[1];
                const unit = m[2];
                const unitI18n =
                    unit === "день"
                        ? t("units.perDay", "в день")
                        : unit === "неделю"
                            ? t("units.perWeek", "в неделю")
                            : unit === "месяц"
                                ? t("units.perMonth", "в месяц")
                                : t("units.perYear", "в год");
                return `${unitI18n} ${n} ${t("regularity.times", "раз(а)")}`;
            }
            return reg;
        },
        [t]
    );
    const [adrDropdownOpen, setAdrDropdownOpen] = useState(false);
    const router = useRouter();
    const isMobile = useIsMobile();
    const [ownerProfile, setOwnerProfile] = useState(null);

    // --- Internal comments (только для аккаунта менеджера)
    const isManagerAccount = ["manager", "employee"].includes(
        (me?.role || "").toLowerCase()
    );
    // --- гостевой режим ---
    const isGuest = !me;
    const requireAuth = useCallback(() => {
        alert(
            t(
                "auth.loginOrRegister",
                "Чтобы увидеть детали и контакты — войдите или зарегистрируйтесь."
            )
        );
    }, [t]);
    const [intCommentOpen, setIntCommentOpen] = useState(false);
    const [intCommentText, setIntCommentText] = useState("");
    const [intComments, setIntComments] = useState([]);
    const intCommentBtnRef = useRef(null);
    const intCommentPopoverRef = useRef(null);

    async function loadInternalCommentsLocal() {
        if (!isManagerAccount) return;
        const token = localStorage.getItem("token");
        const r = await fetch(
            api(`/internal_comments?transport_id=${transport.id}`),
            {
                headers: token ? { Authorization: "Bearer " + token } : {},
            }
        );
        const data = await r.json();
        setIntComments(Array.isArray(data) ? data : []);
    }
    async function saveInternalCommentLocal() {
        const text = (intCommentText || "").trim();
        if (!text) return;
        const token = localStorage.getItem("token");
        await fetch(api(`/internal_comments`), {
            method: "POST",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ transport_id: transport.id, content: text }),
        });
        setIntCommentText("");
        await loadInternalCommentsLocal();
    }

    // Бейдж должен быть виден всегда — подгружаем при монтировании/смене карточки
    useEffect(() => {
        if (!isManagerAccount) return;
        if ((intComments?.length || 0) === 0) {
            loadInternalCommentsLocal();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport?.id, isManagerAccount]);

    // закрытие панели комментариев кликом вне
    useEffect(() => {
        if (!intCommentOpen) return;
        const handleDown = (e) => {
            const inBtn = intCommentBtnRef.current?.contains(e.target);
            const inPop = intCommentPopoverRef.current?.contains(e.target);
            if (!inBtn && !inPop) setIntCommentOpen(false);
        };
        document.addEventListener("mousedown", handleDown);
        return () => document.removeEventListener("mousedown", handleDown);
    }, [intCommentOpen]);

    const ownerId = transport.owner_id || transport.user_id;
    const [creatingChat, setCreatingChat] = useState(false);

    const adrClasses = Array.isArray(transport.adr_class)
        ? transport.adr_class.filter(Boolean)
        : typeof transport.adr_class === "string" && transport.adr_class
            ? transport.adr_class
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : [];
    const toLocations = Array.isArray(transport.to_locations)
        ? transport.to_locations
        : [];
    const { openMessenger } = useMessenger();

    const { clickedItemId } = useMapHover();
    const ref = useRef();

    useEffect(() => {
        if (clickedItemId === transport.id && ref.current) {
            ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
            ref.current.classList.add("highlight");
            setTimeout(() => {
                ref.current?.classList.remove("highlight");
            }, 1100);
        }
    }, [clickedItemId, transport.id]);

    const cardColors = {
        bg: "var(--transport-card-bg, rgba(23, 38, 60, 0.97))",
        text: "var(--transport-card-text, #e3f2fd)",
        shadow: "var(--transport-card-shadow, 0 2px 24px #001844cc)",
        shadowExpanded:
            "var(--transport-card-shadow-expanded, 0 4px 32px #43c8ff55, 0 2px 24px #001844cc)",
        border: "var(--transport-card-border, #1e88e5)",
        borderActive: "var(--transport-card-border-active, #43c8ff)",
        sectionBg: "var(--transport-card-section-bg, rgba(28, 37, 52, 0.95))",
        sectionBorder: "var(--transport-card-section-border, #193158)",
        heading: "var(--transport-card-heading, #43c8ff)",
        label: "var(--transport-card-label, #8ecae6)",
        chipBg: "var(--transport-card-chip-bg, #1a273f)",
        chipFg: "var(--transport-card-chip-fg, #cfe9ff)",
        chipShadow: "var(--transport-card-chip-shadow, 0 2px 8px #23416711)",
        routeBg:
            "var(--transport-card-route-bg, linear-gradient(90deg, #183969 38%, #253759 100%))",
        routeFg: "var(--transport-card-route-fg, #ffffff)",
        iconBg: "var(--transport-card-icon-bg, #162239)",
        iconFg: "var(--transport-card-icon-fg, #43c8ff)",
        iconShadow: "var(--transport-card-icon-shadow, 0 1px 8px #43c8ff17)",
        metaBg: "var(--transport-card-meta-bg, #193158cc)",
        metaFg: "var(--transport-card-meta-fg, #cfe9ff)",
        metaShadow: "var(--transport-card-meta-shadow, 0 2px 8px #23416711)",
        buttonBg: "var(--transport-card-button-bg, #192b42)",
        buttonFg: "var(--transport-card-button-fg, #43c8ff)",
        buttonShadow: "var(--transport-card-button-shadow, 0 1px 6px #43c8ff10)",
        tooltipBg: "var(--transport-card-tooltip-bg, #222e43)",
        tooltipFg: "var(--transport-card-tooltip-fg, #53ee5c)",
    };

    const infoPrimaryColor = isLight ? "#ffffff" : cardColors.text;
    const infoSecondaryColor = isLight ? "#e5edff" : cardColors.label;

    async function handleChatClick() {
        const userId = ownerId;
        if (!userId) return;
        const token = localStorage.getItem("token");
        if (!token) {
            alert(t("auth.loginRequired", "Необходимо войти в систему"));
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
            alert(t("auth.sessionExpired", "Сессия истекла, войдите снова"));
            return;
        }
        const data = await resp.json();
        if (data?.chat_id) {
            openMessenger(data.chat_id, { transport });
        }
    }

    const sectionRefs = [useRef(), useRef(), useRef(), useRef()];
    const [maxSectionHeight, setMaxSectionHeight] = useState(null);

    useEffect(() => {
        const heights = sectionRefs.map((ref) => ref.current?.offsetHeight || 0);
        const max = Math.max(...heights, 120);
        setMaxSectionHeight(max);
    }, [transport, expanded]);

    function renderList(arr, maxCount = 2, joiner = ", ") {
        if (!Array.isArray(arr) || arr.length === 0) return "-";
        const visible = arr.filter(Boolean).slice(0, maxCount);
        const hidden = arr.length - maxCount;
        return (
            <>
                {visible.join(joiner)}
                {hidden > 0 && (
                    <span
                        style={{
                            color: cardColors.heading,
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                        title={arr.join(joiner)}
                    >{` …+${hidden}`}</span>
                )}
            </>
        );
    }

    function CopyPhoneButton({ phone }) {
        const [copied, setCopied] = useState(false);
        if (!phone) return null;
        return (
            <button
                onClick={() => {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(phone);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1100);
                    }
                }}
                title={t("common.copyNumber", "Скопировать номер")}
                style={{
                    marginLeft: 7,
                    background: cardColors.buttonBg,
                    color: cardColors.buttonFg,
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 11px",
                    cursor: "pointer",
                    fontSize: 16,
                    display: "flex",
                    alignItems: "center",
                    position: "relative",
                    boxShadow: cardColors.buttonShadow,
                }}
            >
                <FaRegCopy style={{ marginRight: 2, fontSize: 16 }} />
                {copied && (
                    <span
                        style={{
                            position: "absolute",
                            top: -28,
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: cardColors.tooltipBg,
                            color: cardColors.tooltipFg,
                            fontSize: 12,
                            padding: "4px 10px",
                            borderRadius: 7,
                            whiteSpace: "nowrap",
                            boxShadow: cardColors.metaShadow,
                        }}
                    >
                        {t("common.copied", "Скопировано!")}
                    </span>
                )}
            </button>
        );
    }

    // --- Общий стиль секций
    const sectionStyle = {
        background: cardColors.sectionBg,
        borderRadius: 13,
        border: `1.3px solid ${cardColors.sectionBorder}`,
        padding: "17px 18px 16px 18px",
        minWidth: 220,
        display: "flex",
        flexDirection: "column",
        gap: 9,
        minHeight: 120,
        boxSizing: "border-box",
        flex: 1,
    };

    const rowStyle = {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        fontSize: 15,
        alignItems: "center",
        minHeight: 0,
        marginBottom: 1,
    };

    useEffect(() => {
        const ownerId = transport.owner_id || transport.user_id;
        if (ownerId) {
            fetch(api(`/users/${ownerId}`))
                .then((res) => res.json())
                .then(setOwnerProfile)
                .catch(() => setOwnerProfile(null));
        }
    }, [transport.owner_id, transport.user_id]);

    useEffect(() => {
        if (!adrDropdownOpen) return;
        function handleClick() {
            setAdrDropdownOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [adrDropdownOpen]);

    // --- Карточка: FLEX как у грузов
    return (
        <div
            ref={ref}
            data-transport-id={transport.id}
            style={{
                background: cardColors.bg,
                borderRadius: 20,
                /* паддинг снизу больше не нужен — панель кнопок внутри сетки */
                padding: "18px",
                color: cardColors.text,
                boxShadow: expanded ? cardColors.shadowExpanded : cardColors.shadow,
                borderLeft: expanded
                    ? `8px solid ${cardColors.borderActive}`
                    : `8px solid ${cardColors.border}`,
                display: "grid",
                gridTemplateColumns: "1fr", // одна колонка у карточки
                rowGap: 14, // вертикальный зазор между секциями и нижней панелью
                alignItems: "stretch",
                minHeight: 120,
                marginBottom: 16,
                transition: "box-shadow .18s, border-color .18s",
                position: "relative",
                width: "100%",
                boxSizing: "border-box",
            }}
        >
            {/* ВЕРХНИЙ ПРАВЫЙ БЛОК: дата + просмотры */}
            {(transport.created_at || typeof transport?.views === "number") && (
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
                    {transport.created_at && (
                        <span
                            style={{
                                fontSize: 12,
                                color: cardColors.metaFg,
                                background: cardColors.metaBg,
                                padding: "2px 10px",
                                borderRadius: 11,
                                fontWeight: 500,
                                letterSpacing: 0.1,
                                boxShadow: cardColors.metaShadow,
                            }}
                            title={new Date(transport.created_at).toLocaleString("ru-RU")}
                        >
                            {new Date(transport.created_at).toLocaleDateString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                            })}{" "}
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>
                                {new Date(transport.created_at).toLocaleTimeString("ru-RU", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </span>
                        </span>
                    )}
                    {typeof transport?.views === "number" && (
                        <span
                            title={t("views.title", "Просмотры")}
                            style={{
                                fontSize: 12,
                                color: cardColors.metaFg,
                                background: cardColors.metaBg,
                                padding: "2px 10px",
                                borderRadius: 11,
                                fontWeight: 700,
                                letterSpacing: 0.1,
                                boxShadow: cardColors.metaShadow,
                                display: "inline-flex",
                                alignItems: "center",
                            }}
                        >
                            <span
                                style={{
                                    marginRight: 6,
                                    display: "inline-block",
                                    transform: "translateY(1px)",
                                }}
                            >
                                👁️
                            </span>
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>
                                {transport.views}
                            </span>
                        </span>
                    )}
                </span>
            )}
            {/* ===== ВНУТРЕННЯЯ СЕТКА С 4 СЕКЦИЯМИ ===== */}
            <div className="transport-card-grid">
                {/* --- 1. Маршрут --- */}
                <div
                    ref={sectionRefs[0]}
                    style={{
                        ...sectionStyle,
                        borderRadius: 16,
                        boxShadow: cardColors.chipShadow,
                        padding: "18px 18px 15px 18px",
                        color: cardColors.text,
                        minWidth: 220,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        position: "relative",
                        minHeight: maxSectionHeight || 120,
                        maxHeight: 240,
                        overflow: "auto",
                        boxSizing: "border-box",
                        ...(isGuest ? { zIndex: 31, pointerEvents: "none" } : {}),
                    }}
                >
                    <div
                        style={{
                            fontSize: 19,
                            fontWeight: 700,
                            color: cardColors.heading,
                            marginBottom: 10,
                            display: "flex",
                            alignItems: "center",
                            letterSpacing: 0.01,
                        }}
                    >
                        <span style={{ marginLeft: 4 }}>
                            {t(
                                "transport.locationAvailability",
                                "Местоположение и доступность"
                            )}
                        </span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            fontSize: 17,
                            fontWeight: 800,
                            background: cardColors.routeBg,
                            color: cardColors.routeFg,
                            borderRadius: 9,
                            padding: "7px 13px",
                            marginBottom: 2,
                            boxShadow: cardColors.chipShadow,
                            letterSpacing: 0.02,
                            gap: 9,
                            flexWrap: "wrap",
                            lineHeight: 1.18,
                            wordBreak: "break-word",
                        }}
                    >
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                background: cardColors.chipBg,
                                borderRadius: 7,
                                padding: "3px 10px",
                                fontSize: 15,
                                color: cardColors.label,
                                fontWeight: 700,
                                boxShadow: cardColors.chipShadow,
                                minWidth: 0,
                                lineHeight: 1.17,
                                whiteSpace: "normal",
                                wordBreak: "break-word",
                                width: "auto",
                                maxWidth: "100%",
                                overflowWrap: "anywhere",
                            }}
                        >
                            <FlagIcon
                                country={
                                    (transport.from_place_id &&
                                        placeLabels?.[transport.from_place_id]?.country_iso2) ||
                                    getCountryCode(transport.from_location)
                                }
                                size={18}
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
                                {transport.from_place_id
                                    ? renderCity(transport.from_place_id, transport.from_location)
                                    : transport.from_location || "-"}
                            </span>
                        </span>
                        {Array.isArray(transport.to_locations) &&
                            transport.to_locations.length > 0 &&
                            transport.to_locations.some(
                                (item) => item.location && item.location !== "-"
                            ) && (
                                <>
                                    <span
                                        style={{
                                            fontSize: 19,
                                            margin: "0 7px",
                                            color: cardColors.heading,
                                            fontWeight: 900,
                                            flexShrink: 0,
                                        }}
                                    >
                                        →
                                    </span>
                                    <span
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 4,
                                            maxHeight: 80,
                                            overflowY:
                                                transport.to_locations.length > 3 ? "auto" : "visible",
                                            minWidth: 0,
                                        }}
                                    >
                                        {transport.to_locations
                                            .filter((item) => item.location && item.location !== "-")
                                            .map((item, idx, arr) => {
                                                const loc = item.location;
                                                const radius = item.radius;
                                                const key = `${loc}-${radius || ""}-${idx}`;
                                                return (
                                                    <span
                                                        key={key}
                                                        style={{
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            gap: 6,
                                                            background: cardColors.chipBg,
                                                            borderRadius: 7,
                                                            padding: "3px 10px",
                                                            fontSize: 15,
                                                            marginBottom: idx !== arr.length - 1 ? 3 : 0,
                                                            color: cardColors.label,
                                                            fontWeight: 700,
                                                            boxShadow: cardColors.chipShadow,
                                                            minWidth: 0,
                                                            lineHeight: 1.17,
                                                            whiteSpace: "normal",
                                                            wordBreak: "break-word",
                                                            width: "auto",
                                                            maxWidth: "100%",
                                                            overflowWrap: "anywhere",
                                                        }}
                                                    >
                                                        <FlagIcon
                                                            country={
                                                                (transport.to_place_ids?.[idx] &&
                                                                    placeLabels?.[transport.to_place_ids[idx]]
                                                                        ?.country_iso2) ||
                                                                getCountryCode(loc)
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
                                                            {transport.to_place_ids?.[idx]
                                                                ? renderCity(transport.to_place_ids[idx], loc)
                                                                : loc}
                                                        </span>
                                                        {radius && (
                                                            <span
                                                                style={{
                                                                    background: cardColors.sectionBorder,
                                                                    color: cardColors.label,
                                                                    fontWeight: 500,
                                                                    fontSize: 13,
                                                                    borderRadius: 6,
                                                                    padding: "2px 7px",
                                                                    marginLeft: 6,
                                                                }}
                                                            >
                                                                +{radius} {t("units.km", "км")}
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                    </span>
                                </>
                            )}
                    </div>
                    <div style={{ color: cardColors.text, fontSize: 15 }}>
                        <b>{t("transport.available", "Доступен:")}</b>{" "}
                        {transport?.mode === "постоянно"
                            ? transport?.regularity
                                ? `${t(
                                    "availability.constant",
                                    "постоянно"
                                )} — ${localizeRegularity(transport.regularity)}`
                                : t("availability.constant", "постоянно")
                            : transport.ready_date_from &&
                                transport.ready_date_to &&
                                transport.ready_date_from !== transport.ready_date_to
                                ? `${new Date(
                                    parseDateDMY(transport.ready_date_from)
                                ).toLocaleDateString("ru-RU", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "2-digit",
                                })} — ${new Date(
                                    parseDateDMY(transport.ready_date_to)
                                ).toLocaleDateString("ru-RU", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "2-digit",
                                })}`
                                : transport.ready_date_from
                                    ? new Date(
                                        parseDateDMY(transport.ready_date_from)
                                    ).toLocaleDateString("ru-RU", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "2-digit",
                                    })
                                    : "—"}
                    </div>
                </div>

                {/* --- 2. Параметры транспорта --- */}
                <div
                    ref={sectionRefs[1]}
                    className={isLimited ? "pw-blur pw-overlay pw-noevents" : ""}
                    style={{ ...sectionStyle, minHeight: maxSectionHeight || 120 }}
                >
                    <div
                        style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: cardColors.heading,
                            marginBottom: 3,
                        }}
                    >
                        {t("transport.params", "ПАРАМЕТРЫ")}
                    </div>
                    {!!transport.truck_type && (
                        <div
                            style={{
                                ...rowStyle,
                                ...(isGuest
                                    ? { position: "relative", zIndex: 31, pointerEvents: "none" }
                                    : {}),
                            }}
                        >
                            <span>
                                <span style={{ color: isLimited ? "#fff" : cardColors.label }}>
                                    {t("truck.bodyType", "Тип кузова")}:
                                </span>{" "}
                                <b style={{ color: isLimited ? "#fff" : undefined }}>
                                    {findBodyLabelByValue(transport.truck_type)}
                                </b>
                            </span>
                        </div>
                    )}
                    {!!transport.transport_kind && (
                        <div style={rowStyle}>
                            <span>
                                <span style={{ color: cardColors.label }}>
                                    {t("transport.kind", "Тип транспорта")}:
                                </span>{" "}
                                <b>{localizeTransportKind(transport.transport_kind)}</b>
                            </span>
                        </div>
                    )}
                    {(!!transport.weight || !!transport.volume) && (
                        <div style={rowStyle}>
                            {!!transport.weight && (
                                <span>
                                    <span style={{ color: cardColors.label }}>
                                        {t("transport.payloadShort", "Г/п")}:
                                    </span>{" "}
                                    <b>{transport.weight} т</b>
                                </span>
                            )}
                            {!!transport.volume && (
                                <span>
                                    <span style={{ color: cardColors.label }}>
                                        {t("transport.volume", "Объём")}:
                                    </span>{" "}
                                    <b>{transport.volume} м³</b>
                                </span>
                            )}
                        </div>
                    )}
                    {!!(
                        transport.body_length &&
                        transport.body_width &&
                        transport.body_height
                    ) && (
                            <div style={rowStyle}>
                                <span>
                                    <span style={{ color: cardColors.label }}>
                                        {t("transport.bodyDims", "Кузов")}:
                                    </span>{" "}
                                    <b>
                                        {transport.body_length}×{transport.body_width}×
                                        {transport.body_height} м
                                    </b>
                                </span>
                            </div>
                        )}
                    {!!(
                        transport.trailer_length &&
                        transport.trailer_width &&
                        transport.trailer_height
                    ) && (
                            <div style={rowStyle}>
                                <span>
                                    <span style={{ color: cardColors.label }}>
                                        {t("transport.trailerDims", "Прицеп")}:
                                    </span>{" "}
                                    <b>
                                        {transport.trailer_length}×{transport.trailer_width}×
                                        {transport.trailer_height} м
                                    </b>
                                </span>
                            </div>
                        )}
                    {!transport.truck_type &&
                        !transport.transport_kind &&
                        !transport.weight &&
                        !transport.volume &&
                        !(
                            transport.body_length &&
                            transport.body_width &&
                            transport.body_height
                        ) &&
                        !(
                            transport.trailer_length &&
                            transport.trailer_width &&
                            transport.trailer_height
                        ) && (
                            <div
                                style={{
                                    color: "#6ec6ff",
                                    fontWeight: 500,
                                    fontSize: 16,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 13,
                                    opacity: 0.67,
                                }}
                            >
                                <span
                                    style={{
                                        width: 23,
                                        height: 23,
                                        borderRadius: "50%",
                                        background: "#172a47",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="8" cy="8" r="8" fill="#21395d" />
                                        <text
                                            x="8"
                                            y="12"
                                            textAnchor="middle"
                                            fill="#6ec6ff"
                                            fontSize="13"
                                            fontWeight="bold"
                                        >
                                            i
                                        </text>
                                    </svg>
                                </span>
                                {t("common.noInfo", "Информация не указана")}
                            </div>
                        )}
                </div>

                {/* --- 3. Особенности --- */}
                <div
                    ref={sectionRefs[2]}
                    className={isLimited ? "pw-blur pw-overlay pw-noevents" : ""}
                    style={{ ...sectionStyle, minHeight: maxSectionHeight || 120 }}
                >
                    <div
                        style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: cardColors.heading,
                            marginBottom: 3,
                        }}
                    >
                        {t("transport.features", "ОСОБЕННОСТИ")}
                    </div>
                    {Array.isArray(transport.load_types) &&
                        transport.load_types.length > 0 && (
                            <div style={rowStyle}>
                                <span>
                                    <span style={{ color: cardColors.label }}>
                                        {t("order.loading", "Загрузка:")}
                                    </span>
                                    <b>{localizeLoadingTypes(transport.load_types).join(", ")}</b>
                                </span>
                            </div>
                        )}
                    {transport.adr && (
                        <div style={rowStyle}>
                            <span
                                style={{
                                    color: "#43c8ff",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                }}
                            >
                                ADR:&nbsp;
                                <span style={{ position: "relative", display: "inline-block" }}>
                                    <span
                                        style={{
                                            background: "#232f45",
                                            color: "#FFD600",
                                            fontWeight: 700,
                                            borderRadius: 6,
                                            padding: "2px 13px",
                                            fontSize: 16,
                                            cursor: "pointer",
                                            boxShadow: "0 2px 16px #ffe60018",
                                            border: adrDropdownOpen
                                                ? "2px solid #FFD600"
                                                : "2px solid #232f45",
                                            transition: "border .15s",
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAdrDropdownOpen((v) => !v);
                                        }}
                                    >
                                        {adrClasses.join(", ") || "-"}
                                    </span>
                                    {adrDropdownOpen && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                left: "0",
                                                top: "110%",
                                                background: "#212d3d",
                                                color: "#FFD600",
                                                borderRadius: 10,
                                                padding: "13px 19px 13px 19px",
                                                boxShadow: "0 4px 24px #ffe60022",
                                                zIndex: 24,
                                                minWidth: 220,
                                                fontSize: 15,
                                                whiteSpace: "pre-line",
                                            }}
                                        >
                                            {adrClasses.map((num) => (
                                                <div
                                                    key={num}
                                                    style={{
                                                        marginBottom: 8,
                                                        color: "#FFD600",
                                                        fontWeight: 600,
                                                        letterSpacing: 0.04,
                                                        lineHeight: 1.4,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            color: cardColors.text,
                                                            fontWeight: 900,
                                                            marginRight: 7,
                                                        }}
                                                    >
                                                        {num}
                                                    </span>
                                                    {ADR_CLASS_INFO[num] || ""}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </span>
                            </span>
                        </div>
                    )}
                    {transport.gps_monitor && (
                        <div style={rowStyle}>
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    fontWeight: 700,
                                    background: cardColors.metaBg,
                                    borderRadius: 6,
                                    padding: "2px 11px",
                                    color: cardColors.heading,
                                    fontSize: 14,
                                    boxShadow: cardColors.metaShadow,
                                }}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    fill={cardColors.heading}
                                    style={{ marginRight: 4 }}
                                    viewBox="0 0 20 20"
                                >
                                    <path d="M10 2C7.243 2 5 4.243 5 7c0 2.948 4.46 9.018 4.651 9.286a1 1 0 0 0 1.698 0C10.54 16.018 15 9.948 15 7c0-2.757-2.243-5-5-5zm0 12.243C8.185 11.167 7 8.995 7 7a3 3 0 0 1 6 0c0 1.995-1.185 4.167-3 7.243zM10 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                                </svg>
                                {t("transport.gps", "GPS мониторинг")}
                            </span>
                        </div>
                    )}
                    {Array.isArray(transport.special) &&
                        transport.special.includes("Экипаж") && (
                            <div style={rowStyle}>
                                <span
                                    style={{
                                        background: cardColors.metaBg,
                                        color: cardColors.metaFg,
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        padding: "2px 9px",
                                        fontSize: 14,
                                    }}
                                >
                                    {t("transport.twoDrivers", "2 водителя")}
                                </span>
                            </div>
                        )}
                    {!(
                        (Array.isArray(transport.load_types) &&
                            transport.load_types.length > 0) ||
                        transport.adr ||
                        transport.gps_monitor ||
                        (Array.isArray(transport.special) &&
                            transport.special.includes("Экипаж"))
                    ) && (
                            <div
                                style={{
                                    color: cardColors.heading,
                                    fontWeight: 500,
                                    fontSize: 16,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 13,
                                    opacity: 0.67,
                                }}
                            >
                                <span
                                    style={{
                                        width: 23,
                                        height: 23,
                                        borderRadius: "50%",
                                        background: cardColors.sectionBorder,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="8" cy="8" r="8" fill={cardColors.sectionBorder} />
                                        <text
                                            x="8"
                                            y="12"
                                            textAnchor="middle"
                                            fill={cardColors.heading}
                                            fontSize="13"
                                            fontWeight="bold"
                                        >
                                            i
                                        </text>
                                    </svg>
                                </span>
                                {t("common.noInfo", "Информация не указана")}
                            </div>
                        )}
                </div>

                {/* --- 4. Ставка --- */}
                <div
                    ref={sectionRefs[3]}
                    className={isLimited ? "pw-blur pw-overlay pw-noevents" : ""}
                    style={{
                        ...sectionStyle,
                        minHeight: maxSectionHeight || 120,
                        gap: 15,
                        justifyContent: "flex-start",
                        minWidth: 220,
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "#43c8ff",
                                marginBottom: 3,
                            }}
                        >
                            {t("transport.rate", "СТАВКА")}
                        </div>
                        {!transport.rate_with_vat &&
                            !transport.rate_without_vat &&
                            !transport.rate_cash ? (
                            <span style={{ color: "#888" }}>
                                {t("transport.rateRequest", "Запрос ставки")}
                            </span>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {transport.rate_with_vat && (
                                    <span>
                                        <span style={{ color: "#8ecae6" }}>
                                            {t("transport.withVat", "С НДС:")}
                                        </span>{" "}
                                        <b>
                                            {formatPrice(transport.rate_with_vat, transport.currency)}
                                        </b>
                                    </span>
                                )}
                                {transport.rate_without_vat && (
                                    <span>
                                        <span style={{ color: "#8ecae6" }}>
                                            {t("transport.withoutVat", "Без НДС:")}
                                        </span>{" "}
                                        <b>
                                            {formatPrice(
                                                transport.rate_without_vat,
                                                transport.currency
                                            )}
                                        </b>
                                    </span>
                                )}
                                {transport.rate_cash && (
                                    <span>
                                        <span style={{ color: "#8ecae6" }}>
                                            {t("transport.cash", "Наличными:")}
                                        </span>{" "}
                                        <b>
                                            {formatPrice(transport.rate_cash, transport.currency)}
                                        </b>
                                    </span>
                                )}
                                {transport.bargain && (
                                    <span
                                        style={{
                                            background: "#43c8ff",
                                            color: "#1c2534",
                                            fontWeight: 700,
                                            borderRadius: 6,
                                            padding: "2px 9px",
                                            fontSize: 14,
                                            marginTop: 4,
                                            display: "inline-block",
                                        }}
                                    >
                                        {t("transport.noBargain", "Без торга")}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>{" "}
            {/* /transport-card-grid */}
            {/* --- НИЖНЯЯ ПАНЕЛЬ: ЛЕВО — инфо, ПРАВО — ВСЕ кнопки (включая «заметку») --- */}
            {ownerProfile && (
                <div
                    className={isLimited ? "pw-blur pw-overlay pw-noevents" : ""}
                    style={{
                        gridColumn: "1 / -1",
                        background: "rgba(25,40,72,0.96)",
                        borderRadius: 11,
                        padding: "6px 15px",
                        /* небольшой отступ, чтобы панель визуально “дышала” от секций */
                        marginTop: 4,
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
                    {/* ЛЕВЫЙ блок (автор/орг) */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            minWidth: 0,
                            cursor: "pointer",
                            flex: "1 1 260px",
                        }}
                        onClick={() => router.push(`/profile/${ownerProfile.id}`)}
                        title={t("profile.open", "Перейти в профиль")}
                    >
                        <UserAvatar
                            user={ownerProfile}
                            size={40}
                            style={{
                                border: `2px solid ${cardColors.sectionBorder}`,
                                background: cardColors.sectionBg,
                                marginRight: 12,
                            }}
                        />
                        <span
                            style={{
                                fontWeight: 700,
                                color: infoPrimaryColor,
                                fontSize: 15,
                                whiteSpace: "nowrap",
                                maxWidth: 130,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {ownerProfile.organization}
                        </span>
                        {ownerProfile.contact_person && (
                            <span
                                style={{
                                    color: infoSecondaryColor,
                                    fontSize: 14,
                                    maxWidth: 110,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {ownerProfile.contact_person}
                            </span>
                        )}
                        {ownerProfile.country && (
                            <span
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    color: "#93c5fd",
                                    fontSize: 14,
                                }}
                            >
                                <FlagIcon
                                    country={getCountryCode(ownerProfile.country)}
                                    size={17}
                                />
                                {ownerProfile.city ? ownerProfile.city + ", " : ""}
                                {ownerProfile.country}
                            </span>
                        )}
                        <span
                            style={{
                                color: "#7acbff",
                                fontWeight: 600,
                                fontSize: 14,
                                marginLeft: 4,
                            }}
                        >
                            {t("profile.id", "ID:")} {ownerProfile.id}
                        </span>
                        {ownerProfile.final_rating !== undefined && (
                            <span
                                style={{
                                    color: ratingToColor(ownerProfile.final_rating),
                                    fontWeight: 700,
                                    fontSize: 15,
                                    marginLeft: 10,
                                    display: "flex",
                                    alignItems: "center",
                                }}
                            >
                                ★ {ownerProfile.final_rating?.toFixed(1) || "0.0"} / 10
                            </span>
                        )}
                    </div>

                    {/* ПРАВЫЙ блок: ВСЕ кнопки справа (заметка + чат/тел/мессенджеры + «Показать детали») */}
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
                        {/* внутренняя заметка — только для MANAGER/EMPLOYEE */}
                        {isManagerAccount && (
                            <div style={{ position: "relative" }}>
                                <button
                                    title={t(
                                        "comments.internalTooltip",
                                        "Внутренний комментарий (виден только автору и участникам менеджер-аккаунта)"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const next = !intCommentOpen;
                                        setIntCommentOpen(next);
                                        if (next && intComments.length === 0)
                                            loadInternalCommentsLocal();
                                    }}
                                    style={{ ...iconBtnStyle, position: "relative" }}
                                    ref={intCommentBtnRef}
                                    aria-label={t(
                                        "comments.internalTooltip",
                                        "Внутренний комментарий"
                                    )}
                                >
                                    <FaRegCommentDots />
                                    {(intComments?.length || 0) > 0 && (
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
                                                boxShadow: "0 0 0 2px #0e1b2c",
                                            }}
                                        >
                                            {intComments.length}
                                        </span>
                                    )}
                                </button>
                                {intCommentOpen && (
                                    <div
                                        ref={intCommentPopoverRef}
                                        style={{
                                            position: "absolute",
                                            right: 0,
                                            top: "110%",
                                            width: 520,
                                            maxWidth: "min(92vw, 520px)",
                                            background: "#0f1f3a",
                                            border: "1px solid #203a63",
                                            borderRadius: 12,
                                            padding: 12,
                                            boxShadow: "0 10px 30px #00000055",
                                            zIndex: 20,
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        {/* Лента комментариев */}
                                        <div
                                            style={{
                                                maxHeight: 220,
                                                overflowY: "auto",
                                                background: "#11213b",
                                                border: "1px solid #24446e",
                                                borderRadius: 8,
                                                padding: 8,
                                                marginBottom: 8,
                                            }}
                                        >
                                            {(intComments?.length || 0) === 0 ? (
                                                <div style={{ color: "#8ecae6", fontSize: 14 }}>
                                                    {t("comments.none", "Пока нет комментариев")}
                                                </div>
                                            ) : (
                                                intComments.map((c) => (
                                                    <div
                                                        key={c.id}
                                                        style={{
                                                            display: "flex",
                                                            gap: 10,
                                                            padding: "6px 4px",
                                                            borderBottom: "1px solid #1c2f4f",
                                                        }}
                                                    >
                                                        <img
                                                            src={
                                                                c.author_avatar
                                                                    ? abs(c.author_avatar)
                                                                    : "/default-avatar.png"
                                                            }
                                                            alt="av"
                                                            width={28}
                                                            height={28}
                                                            style={{
                                                                borderRadius: "50%",
                                                                border: "1px solid #203a63",
                                                                objectFit: "cover",
                                                            }}
                                                            onError={(e) =>
                                                                (e.currentTarget.src = "/default-avatar.png")
                                                            }
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
                                                                <b
                                                                    style={{
                                                                        color: cardColors.text,
                                                                        fontSize: 13,
                                                                    }}
                                                                >
                                                                    {c.author_name ||
                                                                        t("comments.member", "Участник")}
                                                                </b>
                                                                <span
                                                                    style={{
                                                                        color: cardColors.label,
                                                                        fontSize: 11,
                                                                    }}
                                                                >
                                                                    {(() => {
                                                                        const d = new Date(c.created_at);
                                                                        return isNaN(d.getTime())
                                                                            ? ""
                                                                            : d.toLocaleString("ru-RU", {
                                                                                day: "2-digit",
                                                                                month: "2-digit",
                                                                                year: "2-digit",
                                                                                hour: "2-digit",
                                                                                minute: "2-digit",
                                                                            });
                                                                    })()}
                                                                </span>
                                                            </div>
                                                            <div
                                                                style={{
                                                                    color: "#cfe8ff",
                                                                    whiteSpace: "pre-wrap",
                                                                    fontSize: 14,
                                                                }}
                                                            >
                                                                {c.content}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Поле ввода */}
                                        <textarea
                                            rows={3}
                                            value={intCommentText}
                                            onChange={(e) => setIntCommentText(e.target.value)}
                                            placeholder={t(
                                                "comments.placeholder.short",
                                                "Короткий комментарий…"
                                            )}
                                            style={{
                                                width: "100%",
                                                borderRadius: 8,
                                                border: "1px solid #24446e",
                                                background: "#132445",
                                                color: "#eaf5ff",
                                                padding: 8,
                                            }}
                                        />
                                        {/* Инфо под полем (с иконкой i) */}
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                                color: "#9ec3ff",
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
                                                    background: cardColors.sectionBorder,
                                                    color: cardColors.label,
                                                    fontWeight: 900,
                                                    fontSize: 11,
                                                    border: "1px solid #2b4a77",
                                                }}
                                            >
                                                i
                                            </span>
                                            <span>
                                                {t(
                                                    "comments.internalVisibilityNote",
                                                    "Эту заметку увидят только автор заявки и участники аккаунта экспедитора."
                                                )}
                                            </span>
                                        </div>

                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 8,
                                                alignItems: "center",
                                                marginTop: 8,
                                            }}
                                        >
                                            <button
                                                onClick={saveInternalCommentLocal}
                                                disabled={!intCommentText.trim()}
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
                                                {t("comments.savedCount", "Сохранено: {count}", {
                                                    count: intComments?.length || 0,
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* чат и контакты */}
                        <button
                            onClick={handleChatClick}
                            title={t("nav.chat", "Чат")}
                            style={{ ...iconBtnStyle, color: "#43c8ff" }}
                        >
                            <FaComments />
                        </button>
                        {ownerProfile?.phone && (
                            <a
                                href={`tel:${ownerProfile.phone}`}
                                title={t("chat.call", "Позвонить")}
                                style={iconBtnStyle}
                            >
                                <FaPhone />
                            </a>
                        )}
                        {ownerProfile?.whatsapp && (
                            <a
                                href={`https://wa.me/${ownerProfile.whatsapp.replace(
                                    /\D/g,
                                    ""
                                )}`}
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
                                href={`viber://chat?number=${ownerProfile.viber.replace(
                                    /\D/g,
                                    ""
                                )}`}
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

                        <TransportShareButtons
                            transport={transport}
                            variant="compact"
                            buttonStyle={iconBtnStyle}
                        />

                        {/* сохранить (рядом с действиями внизу) */}
                        <SaveToggleButton
                            type="transport"
                            id={transport.id}
                            variant="bar"
                        />

                        {/* Показать детали */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push("/transport/" + transport.id);
                            }}
                            style={{
                                marginLeft: 16,
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
                                transition:
                                    "opacity .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease",
                                zIndex: 24,
                            }}
                            title={t("common.showDetails", "Показать детали")}
                            tabIndex={0}
                        >
                            {t("common.showDetails", "Показать детали")}
                        </button>
                    </div>
                </div>
            )}
            {ownerProfile && (
                <div
                    style={{
                        gridColumn: "1 / -1",
                        background: "rgba(25,40,72,0.96)",
                        borderRadius: 11,
                        padding: "6px 15px",
                        /* ...ваш существующий код панели... */
                    }}
                >
                    {/* ...содержимое панели... */}
                </div>
            )}
            {/* === Гостевой оверлей: блюр + перехват кликов === */}
            {isGuest && (
                <>
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: "rgba(8,15,28,0.30)",
                            backdropFilter: "blur(7px)",
                            WebkitBackdropFilter: "blur(7px)",
                            borderRadius: 20,
                            zIndex: 30,
                        }}
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            requireAuth();
                        }}
                        aria-label={t(
                            "auth.loginOrRegister",
                            "Войдите или зарегистрируйтесь"
                        )}
                        style={{
                            position: "absolute",
                            inset: 0,
                            border: 0,
                            background: "transparent",
                            cursor: "pointer",
                            zIndex: 40,
                        }}
                    />
                </>
            )}
        </div>
    );
}
