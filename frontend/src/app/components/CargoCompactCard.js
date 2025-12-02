"use client";

import React, { useState, useEffect, useRef, forwardRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "../utils/currency";
import { AnimatePresence, motion } from "framer-motion";
import ReactDOM from "react-dom";
import {
    FaChevronRight,
    FaTruck,
    FaBox,
    FaMapMarkerAlt,
    FaEdit,
    FaTrash,
    FaGavel,
    FaComments,
    FaLink,
    FaShareAlt,
    FaEllipsisH,
    FaCheckCircle,
    FaTimesCircle,
    FaClock,
    FaThermometerHalf,
    FaRadiation,
    FaRulerCombined,
    FaCubes,
    FaBoxes,
    FaArrowUp,
    FaArrowsAltH,
    FaArrowLeft,
    FaEye
} from "react-icons/fa";
import { useMessenger } from "./MessengerContext";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import { LOADING_TYPES, getTruckBodyTypes, getLoadingTypes, getTransportKindOptions } from "./truckOptions";
import { api } from "@/config/env";
import dynamic from "next/dynamic";
const RequestGpsModal = dynamic(() => import("@/app/components/RequestGpsModal"), { ssr: false });


/* ---------- helpers ---------- */

// country name -> ISO2 для флажка; включил и англ., и распространённые локали
const COUNTRY_TO_ISO = {
    "georgia": "GE", "საქართველო": "GE", "gürcüstan": "GE",
    "russia": "RU", "россия": "RU", "рф": "RU",
    "belarus": "BY", "беларусь": "BY",
    "armenia": "AM", "армения": "AM",
    "azerbaijan": "AZ", "azərbaycan": "AZ", "азербайджан": "AZ",
    "turkey": "TR", "türkiye": "TR", "турция": "TR",
    "ukraine": "UA", "украина": "UA",
    "kazakhstan": "KZ", "казахстан": "KZ",
    "poland": "PL", "germany": "DE", "italy": "IT", "france": "FR", "spain": "ES",
    "portugal": "PT", "португалия": "PT"
};
// Вернёт ISO2 или null
const guessIsoFromText = (text = "") => {
    const tail = String(text).split(",").pop().trim().toLowerCase();
    let iso = COUNTRY_TO_ISO[tail];
    if (!iso) {
        for (const [k, v] of Object.entries(COUNTRY_TO_ISO)) {
            if (tail.includes(k)) { iso = v; break; }
        }
    }
    return iso || null;
};


// Универсальный компонент флага (SVG/PNG с CDN → одинаково на всех платформах)
const Flag = ({ place }) => {
    const iso = guessIsoFromText(place);
    if (!iso) return null;
    const cc = iso.toLowerCase();
    return (
        <img
            alt={iso}
            title={iso}
            src={`https://flagcdn.com/16x12/${cc}.png`}
            srcSet={`https://flagcdn.com/32x24/${cc}.png 2x, https://flagcdn.com/48x36/${cc}.png 3x`}
            style={{
                width: 18, height: 12, marginRight: 6, borderRadius: 2,
                display: "inline-block"
            }}
            loading="lazy"
        />
    );
};

function getCompactPrice(cargo, t) {
    if (cargo.rate_with_vat) {
        return { label: t("price.withVat", "С НДС"), value: formatPrice(cargo.rate_with_vat, cargo.rate_currency) };
    } else if (cargo.rate_no_vat || cargo.rate_without_vat) {
        const value = cargo.rate_no_vat || cargo.rate_without_vat;
        return { label: t("price.noVat", "Без НДС"), value: formatPrice(value, cargo.rate_currency) };
    } else if (cargo.rate_cash) {
        return { label: t("price.cash", "Наличными"), value: formatPrice(cargo.rate_cash, cargo.rate_currency) };
    }
    return null;
}

// безопасный портал для Next (монтируем после гидратации)
function Portal({ children }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    return ReactDOM.createPortal(children, document.body);
}

/* ---------- component ---------- */
const CargoCompactCard = forwardRef(function CargoCompactCard(
    {
        cargo,
        onClick,
        isMobile,
        onEdit,
        onDelete,
        onToggleActive,
        isFocused,
        isMyBid = false,
        ownerLabel,
        isMine,
        hoverKey,
        bidAmount,
        bidCurrency,
        bidStatus,
        bidRecipientLabel,
        matchesCount = 0,
        newMatchesCount = 0,
        inModal = false,
        isNew = false,
        onShowMatches = null,
        onMatchesViewed = null,
        hoveredItemId,
        setHoveredItemId,
        enableHoverScroll = false,
        disableAllHover = false,
        managerContext = false,
        routeStacked = false,
        showOwnerBadge = false,
        showOrderBadges = false,
        enableHoverLift = false,   // эффект "подъёма" при ховере
        limited = false,           // режим урезанного просмотра на мобильном
    },
    ref
) {
    const innerRef = ref || useRef();
    const router = useRouter();
    const { authFetchWithRefresh, user } = useUser();
    // Открыть карточку (учитываем защиту одного тапа)
    const handleOpenCard = () => {
        if (isMobile && isClickGuardActive()) return;
        if (typeof onClick === "function") onClick();
    };
    const role = String(user?.role || "").toUpperCase();
    const isManager = role === "MANAGER" || role === "ADMIN";
    const isEmployee = role === "EMPLOYEE";
    // Гейт включается только в менеджерском кабинете:

    const canRequestRole = ["MANAGER", "EMPLOYEE", "OWNER", "ADMIN"].includes(role);
    const [gpsReqOpen, setGpsReqOpen] = useState(false);
    const [showSoon, setShowSoon] = useState(false);
    // mobile actions sheet
    const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
    const { lang, t } = useLang();
    const dateLocale = lang === "ka" ? "ka-GE" : (lang === "ru" ? "ru-RU" : "en-US");


    // i18n-витрины: label = перевод, value = канон (RU)
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const LOADING_TYPES_I18N = useMemo(() => getLoadingTypes(t), [t]);

    // Найти локализованный label по канон. value (тип кузова), без учёта регистра/пробелов
    const findBodyLabelByValue = useCallback((val) => {
        if (val === undefined || val === null) return "";
        const v = String(val).trim().toLowerCase();
        const flat = [];
        for (const opt of BODY_TYPES || []) {
            if (opt?.children) flat.push(...opt.children);
            else flat.push(opt);
        }
        const found = flat.find(o => String(o?.value || "").trim().toLowerCase() === v);
        return found?.label || val;
    }, [BODY_TYPES]);

    // Локализуем список видов загрузки (в UI — перевод, для иконок используем канон)
    const localizeLoading = useCallback((arr) => {
        const i18n = LOADING_TYPES_I18N || [];
        return (arr || []).map(v => {
            const idx = LOADING_TYPES.findIndex(x => String(x).toLowerCase() === String(v).toLowerCase());
            return { value: v, label: idx >= 0 ? (i18n[idx] || v) : v };
        });
    }, [LOADING_TYPES_I18N]);

    // === Статус активности и модалка «нужно обновить дату» ===
    const [isActive, setIsActive] = useState(!!cargo?.is_active);
    const [toggleLoading, setToggleLoading] = useState(false);
    const [showOverdueModal, setShowOverdueModal] = useState(false);
    // Держим стейт в синхронизации с пропсами
    useEffect(() => {
        setIsActive(!!cargo?.is_active);
    }, [cargo?.is_active]);

    // ширина чипа «Актив/Архив» для выравнивания GPS/Ещё
    const activeChipRef = useRef(null);
    const [chipWidth, setChipWidth] = useState(null);
    useEffect(() => {
        const read = () => {
            const w = activeChipRef.current?.offsetWidth || null;
            setChipWidth(w);
        };
        read();
        window.addEventListener("resize", read);
        return () => window.removeEventListener("resize", read);
    }, [isActive, isMobile]);
    // Автоопределяем «свои» заявки/владельца — чтобы метки и экшены были и на мобиле
    const currentUserId = user?.id || user?._id || user?.user_id;
    const derivedIsMine = Boolean(
        isMine ||
        cargo?.is_mine ||
        cargo?.mine ||
        (cargo?.user_id && cargo.user_id === currentUserId) ||
        (cargo?.owner_id && cargo.owner_id === currentUserId)
    );
    const derivedOwnerLabel =
        ownerLabel ?? cargo?.owner_label ?? cargo?.owner_name ?? cargo?.owner?.name ?? cargo?.company_name;
    const canRequestGps = canRequestRole && (managerContext ? !!derivedIsMine : true);
    const allowActions = managerContext ? (isManager || (isEmployee && !!derivedIsMine)) : true;

    // --- ленивый фетч количества Соответствий для «Все» ---
    const [lazyMatchesCount, setLazyMatchesCount] = useState(null);

    useEffect(() => {
        let aborted = false;
        async function fetchCount() {
            if (!allowActions || !cargo?.id) return;
            try {
                const res = await authFetchWithRefresh(
                    api(`/orders/${cargo.id}/matching_transports`)
                );
                const data = await res.json();
                if (!aborted) {
                    const cnt = Array.isArray(data) ? data.length
                        : (typeof data?.count === "number" ? data.count : 0);
                    setLazyMatchesCount(cnt);
                }
            } catch { }
        }
        if (!(typeof matchesCount === "number" && matchesCount > 0)) fetchCount();
        return () => { aborted = true; };


    }, [cargo?.id, allowActions, managerContext, authFetchWithRefresh, matchesCount]);

    const { openMessenger, setChatId } = useMessenger();

    async function handleToggleActive() {
        if (!allowActions) return;
        setToggleLoading(true);
        try {
            const resp = await authFetchWithRefresh(
                api(`/orders/${cargo.id}/toggle_active`),
                { method: "PATCH" }
            );
            if (!resp.ok) {
                let data = {};
                try { data = await resp.json(); } catch { }
                if (resp.status === 409 && data.detail === "TOO_LATE_TO_ACTIVATE") {
                    setShowOverdueModal(true);
                    return;
                }
                alert(data.detail || t("error.toggleStatus", "Ошибка: не удалось изменить статус!"));
                return;
            }
            const data = await resp.json();
            if (typeof data?.is_active !== "undefined") {
                setIsActive(!!data.is_active);
            } else {
                setIsActive((prev) => !prev);
            }
            if (typeof onToggleActive === "function") onToggleActive();
        } catch {
            setShowOverdueModal(true);
        } finally {
            setToggleLoading(false);
        }
    }


    /* focus flash */
    const [focusFlash, setFocusFlash] = useState(false);
    useEffect(() => {
        if (isFocused) {
            setFocusFlash(true);
            innerRef?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            const t = setTimeout(() => setFocusFlash(false), 1400);
            return () => clearTimeout(t);
        }
    }, [isFocused]);

    /* new matches pulse (визуальная вспышка на кнопке Соответствия) */
    const prevNewMatches = useRef(newMatchesCount || 0);
    const [matchesPulse, setMatchesPulse] = useState(false);
    useEffect(() => {
        if (typeof newMatchesCount === "number" && newMatchesCount > prevNewMatches.current) {
            setMatchesPulse(true);
            const t = setTimeout(() => setMatchesPulse(false), 1500);
            prevNewMatches.current = newMatchesCount || 0;
            return () => clearTimeout(t);
        }
        prevNewMatches.current = newMatchesCount || 0;
    }, [newMatchesCount]);

    /* bids state */
    const bidsCount = cargo.bids_count || 0;
    const [showBids, setShowBids] = useState(false);
    const [bids, setBids] = useState([]);
    const [bidsLoading, setBidsLoading] = useState(false);
    const [newBidsCount, setNewBidsCount] = useState(0);

    /* positioning */
    const bidsBtnRef = useRef(null);
    const panelRef = useRef(null);
    const [panelPos, setPanelPos] = useState({ top: null, left: null });


    // --- CLICK GUARD: блокируем «сквозной» тап сразу после закрытия листа ---
    const clickGuardUntilRef = useRef(0);
    const armClickGuard = (ms = 400) => { clickGuardUntilRef.current = Date.now() + ms; };
    const isClickGuardActive = () => Date.now() < clickGuardUntilRef.current;


    // --- «Ещё» (mobile actions) — ref самого шита и глобальный click-away ---
    const actionsSheetRef = useRef(null);
    useEffect(() => {
        if (!mobileActionsOpen) return;
        const onDocDown = (e) => {
            // если тап вне шита — закрываем и ставим guard, блокируя всплытие к карточке
            const sheet = actionsSheetRef.current;
            if (!sheet || !sheet.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                armClickGuard(400);
                setMobileActionsOpen(false);
            }
        };
        document.addEventListener("pointerdown", onDocDown, true); // capture
        return () => document.removeEventListener("pointerdown", onDocDown, true);
    }, [mobileActionsOpen]);

    function updatePanelPos() {
        const btn = bidsBtnRef.current;
        const panel = panelRef.current;
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        const panelH = panel?.offsetHeight || 280;
        const panelW = panel?.offsetWidth || 360;

        // по умолчанию — ПОД кнопкой
        let top = Math.round(rect.bottom + 8);
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        if (spaceBelow < panelH + 12) {
            // если снизу не помещается — НАД кнопкой
            top = Math.max(8, Math.round(rect.top - panelH - 8));
        }

        // выравниваем правые края и зажимаем в пределах вьюпорта
        let left = Math.round(rect.right - panelW);
        left = Math.min(Math.max(8, left), window.innerWidth - panelW - 8);

        setPanelPos({ top, left });
    }

    // позиционирование десктоп-панели (для мобилки отключаем — там bottom-sheet)
    useEffect(() => {
        if (!showBids || isMobile) return;
        updatePanelPos();

        const onScroll = () => updatePanelPos();
        const onResize = () => updatePanelPos();
        const onKey = (e) => e.key === "Escape" && setShowBids(false);
        // click-away: клики вне панели/кнопки закрывают панель и НЕ передаются карточке
        const onDocDown = (e) => {
            const p = panelRef.current;
            const b = bidsBtnRef.current;
            if (p && !p.contains(e.target) && b && !b.contains(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                setShowBids(false);
            }
        };

        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        window.addEventListener("keydown", onKey);
        document.addEventListener("pointerdown", onDocDown, true); // capture=true

        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerdown", onDocDown, true);
        };
    }, [showBids, isMobile]);

    /* server calls */
    async function loadBids() {
        setBidsLoading(true);
        try {
            const res = await authFetchWithRefresh(
                api(`/orders/${cargo.id}/bids`),
                { headers: { "Content-Type": "application/json" } }
            );
            const data = await res.json();
            setBids(Array.isArray(data) ? data : []);
        } catch {
            setBids([]);
        }
        setBidsLoading(false);
    }

    useEffect(() => {
        let aborted = false;
        async function fetchUnread() {
            if (!cargo?.id) return;
            try {
                const res = await authFetchWithRefresh(
                    api(`/orders/${cargo.id}/bids/unread_count`)
                );
                const data = await res.json();
                if (!aborted) setNewBidsCount(data?.unread || 0);
            } catch {
                if (!aborted) setNewBidsCount(0);
            }
        }
        fetchUnread();
        return () => {
            aborted = true;
        };
    }, [cargo?.id, authFetchWithRefresh]);

    async function handleBidsClick(e) {
        e.stopPropagation();
        if (!allowActions) return;
        if (!showBids) {
            setShowBids(true);
            requestAnimationFrame(updatePanelPos);
            await loadBids();
            try {
                await authFetchWithRefresh(
                    api(`/orders/${cargo.id}/bids/mark_read`),
                    { method: "POST", headers: { "Content-Type": "application/json" } }
                );
                setNewBidsCount(0);
            } catch { }
        } else {
            setShowBids(false);
        }
    }

    // открыть панель «Ставки» из мобильного bottom-sheet
    async function openBidsFromSheet() {
        if (!allowActions) return;
        setMobileActionsOpen(false);
        if (!showBids) {
            setShowBids(true);
            requestAnimationFrame(updatePanelPos);
            await loadBids();
            try {
                await authFetchWithRefresh(
                    api(`/orders/${cargo.id}/bids/mark_read`),
                    { method: "POST", headers: { "Content-Type": "application/json" } }
                );
                setNewBidsCount(0);
            } catch { }
        }
    }


    // --- единая функция открытия чата по ставке ---
    async function openChatForBid(bid) {
        try {
            const chatResp = await authFetchWithRefresh(
                api(`/chat/by_user/${bid.user_id}`),
                { method: "POST", headers: { "Content-Type": "application/json" } }
            );
            const chatData = await chatResp.json();
            if (chatData?.chat_id) {
                setChatId(chatData.chat_id);
                openMessenger(chatData.chat_id, {
                    order: cargo,
                    bid: {
                        id: bid.id,
                        order_id: cargo.id,
                        amount: bid.amount,
                        comment: bid.comment,
                        user_name: bid.user_name,
                        currency: bid.currency
                    }
                });
            }
        } catch (e) {
            alert(t("error.openChat", "Ошибка при открытии чата") + ": " + e.message);
        }
    }

    /* matches click */
    function handleShowMatchesClick(e) {
        e.stopPropagation();
        if (isMobile) {
            // Мобильная версия: открываем экран соответствий,
            // отфильтрованный по текущей заявке груза
            if (cargo?.id) router.push(`/matches?orderId=${cargo.id}`);
        } else {
            // Десктоп: сохраняем прежнее поведение (модалка)
            onShowMatches && onShowMatches();
        }
        onMatchesViewed && onMatchesViewed();
        setMatchesPulse(false);
    }

    /* date helpers */
    const compactPrice = getCompactPrice(cargo, t);
    function safeFormatDate(dateStr, locale = "ru-RU", opts = {}) {
        if (!dateStr) return "-";
        let d = new Date(dateStr);
        if (isNaN(d.getTime()) && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split("/");
            d = new Date(`${year}-${month}-${day}`);
        }
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString(locale, opts);
    }
    const dateStr = safeFormatDate(cargo.load_date, dateLocale);

    const metaItems = useMemo(() => {
        const items = [];
        items.push({
            key: "weight",
            content: (
                <span className={limited ? "pw-blur pw-noevents" : ""} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <FaBox style={{ marginRight: 3, verticalAlign: -2 }} />
                    <span style={{ fontWeight: 700 }}>
                        {cargo.cargo_items?.[0]?.tons
                            ? `${cargo.cargo_items[0].tons} ${t("units.tonShort", "т")}`
                            : "—"}
                    </span>
                </span>
            ),
        });
        if (cargo.truck_type) {
            items.push({
                key: "truck",
                content: (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <FaTruck style={{ marginRight: 3, verticalAlign: -2 }} />
                        <span style={{ fontWeight: 700 }}>{findBodyLabelByValue(cargo.truck_type)}</span>
                    </span>
                ),
            });
        }
        items.push({
            key: "date",
            content: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <FaClock style={{ marginRight: 3, verticalAlign: -2 }} />
                    <span style={{ fontWeight: 700 }}>{dateStr}</span>
                </span>
            ),
        });
        return items;
    }, [cargo.cargo_items, cargo.truck_type, dateStr, findBodyLabelByValue, limited, t]);

    const createdAt = cargo?.created_at ? new Date(cargo.created_at) : null;
    const createdDate = createdAt
        ? createdAt.toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit", year: "2-digit" })
        : "";
    const createdTime = createdAt
        ? createdAt.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })
        : "";
    const createdTitle = createdAt ? createdAt.toLocaleString(dateLocale) : "";

    // строки маршрута
    const fromStr = cargo.from_locations?.[0] ?? cargo.from_location ?? cargo.from_city ?? "—";
    const toStr = cargo.to_locations?.[0] ?? cargo.to_location ?? cargo.to_city ?? "—";
    const hasBoth = !!fromStr && fromStr !== "—" && !!toStr && toStr !== "—";

    // --- Доп. атрибуты заказа (бейджи на моб. карточке заказов) ---
    const mainItem = cargo?.cargo_items?.[0] || {};
    const adr = !!(cargo?.adr || cargo?.ADR || cargo?.danger);
    const tempFrom = cargo?.temp_from ?? cargo?.temperature_from ?? mainItem?.temp_from ?? null;
    const tempTo = cargo?.temp_to ?? cargo?.temperature_to ?? mainItem?.temp_to ?? null;
    const tempMode = cargo?.temp_mode ?? cargo?.temperature_mode ?? null;
    // Показываем только если есть данные:
    // - одно или оба числовых значения (from/to)
    // - ИЛИ строковый режим (например, "реф", "охлаждение")
    let tempText = null;
    const hasFrom = tempFrom !== null && tempFrom !== undefined && `${tempFrom}`.trim() !== "";
    const hasTo = tempTo !== null && tempTo !== undefined && `${tempTo}`.trim() !== "";
    if (hasFrom || hasTo) {
        if (hasFrom && hasTo) {
            tempText = `${tempFrom}…${tempTo}°C`;
        } else {
            tempText = `${hasFrom ? tempFrom : tempTo}°C`;
        }
    } else if (typeof tempMode === "string" && tempMode.trim()) {
        tempText = tempMode.trim();
    }
    const loadTypes = []
        .concat(mainItem?.load_type || [], mainItem?.loading_types || [],
            cargo?.load_type || [], cargo?.loading_types || [])
        .flat()
        .filter(Boolean);
    const volume = mainItem?.volume ?? cargo?.volume ?? cargo?.cargo_volume ?? null;
    const pallets = mainItem?.pallets ?? cargo?.pallets ?? cargo?.pallet_count ?? null;
    const L = mainItem?.length ?? cargo?.length_m ?? cargo?.length;
    const W = mainItem?.width ?? cargo?.width_m ?? cargo?.width;
    const H = mainItem?.height ?? cargo?.height_m ?? cargo?.height;
    const dims = (L && W && H) ? `${L}×${W}×${H} ${t("units.meterShort", "м")}` : null;
    const pill = { display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 10, border: "1px solid var(--compact-card-pill-border)", background: "var(--compact-card-pill-bg)", color: "var(--compact-card-pill-text)", fontWeight: 800, fontSize: 12, lineHeight: 1 };
    const pillDanger = { ...pill, border: "1.5px solid var(--compact-card-pill-danger-border)", background: "var(--compact-card-pill-danger-bg)", color: "var(--compact-card-pill-danger-text)" };
    const iconS = { marginRight: 6, verticalAlign: -2 };
    const iconLoadType = (t = "") => {
        const s = String(t).toLowerCase();
        if (s.includes("верх")) return <FaArrowUp style={iconS} />;
        if (s.includes("бок")) return <FaArrowsAltH style={iconS} />;
        if (s.includes("зад")) return <FaArrowLeft style={iconS} />;
        return <FaTruck style={iconS} />;
    };

    useEffect(() => {
        if (!enableHoverScroll) return;
        if (!hoveredItemId || hoveredItemId !== (hoverKey ?? cargo.id)) return;
        innerRef?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [hoveredItemId, enableHoverScroll, hoverKey, cargo?.id]);

    const shownMatches =
        (typeof matchesCount === "number" && matchesCount > 0)
            ? matchesCount
            : (typeof lazyMatchesCount === "number" ? lazyMatchesCount : undefined);

    // Единый базовый стиль для компактных чипов (совпадает с «Актив/Архив»)
    const chipBase = {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: "none",
        fontWeight: 800,
        fontSize: 12
    };

    /* ---------- render ---------- */
    return (
        <div
            ref={innerRef}
            className={
                "cargo-mini-card" +
                (hoveredItemId === (hoverKey ?? cargo.id) ? " pin-hovered-card" : "") +
                (focusFlash ? " highlight-card" : "") +
                (isFocused ? " disable-hover" : "") +
                (disableAllHover ? " disable-all-hover" : "") +
                (enableHoverLift ? " compact-hover-lift" : "")
            }
            onClick={(e) => {
                if (isMobile && isClickGuardActive()) { e.stopPropagation(); return; }
                onClick && onClick();
            }}
            onMouseEnter={() => {
                if (!disableAllHover && !isFocused && !showBids && setHoveredItemId) {
                    setHoveredItemId(hoverKey ?? cargo.id);
                }
            }}
            onMouseLeave={() => {
                if (!disableAllHover && !isFocused && !showBids && setHoveredItemId) {
                    setHoveredItemId(null);
                }
            }}
            style={{
                background: "var(--compact-card-bg)",
                borderRadius: 14,
                boxSizing: "border-box",
                boxShadow:
                    hoveredItemId === (hoverKey ?? cargo.id) || focusFlash
                        ? "0 0 0 8px #41cfff33, 0 2px 8px #121e3844"
                        : "var(--compact-card-shadow)",
                border:
                    hoveredItemId === (hoverKey ?? cargo.id) || focusFlash
                        ? "2.5px solid var(--compact-card-border-strong)"
                        : "2px solid transparent",
                marginBottom: 17,
                padding: isMobile ? "18px 14px 22px 14px" : 18,
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "center",
                gap: isMobile ? 12 : 28,
                cursor: onClick ? "pointer" : "default",
                maxWidth: "100%",
                minWidth: 0, // позволяем гриду делать 2 колонки на десктопе
                width: "100%",
                position: "relative",
                zIndex: showBids ? 2000 : undefined, // ниже оверлея/панели
                transition: "box-shadow .23s, border-color .17s, transform .2s",
                // Desktop: одна карточка в ряд (занять всю строку родительского grid/flex)
                gridColumn: isMobile ? undefined : "1 / -1",
                flex: isMobile ? undefined : "1 1 100%",
            }}
        >
            {/* Просмотры — правый верхний угол */}
            {typeof cargo?.views === "number" && (
                <span
                    title={t?.("views.title", "Просмотры")}
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 12,
                        zIndex: 6,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "var(--compact-card-chip-bg)",
                        border: "1px solid var(--compact-card-chip-border)",
                        color: "var(--compact-card-chip-text)",
                        fontWeight: 700,
                        fontSize: 12
                    }}
                >
                    <FaEye />
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{cargo.views}</span>
                </span>
            )}
            {/* бейдж новых Соответствий (только в модалке) */}
            {inModal && (isNew || cargo?.is_new) && (
                <span
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 12,
                        background: "#14532d",
                        color: "#fff",
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 12,
                        fontWeight: 700,
                        zIndex: 5
                    }}
                >
                    {t("card.new", "новое")}
                </span>
            )}
            {/* дата/время публикации */}
            {cargo.created_at && (
                <span
                    title={createdTitle}
                    style={{
                        position: "absolute",
                        bottom: isMobile ? 8 : 11,
                        right: isMobile ? 10 : 16,
                        fontSize: 12,
                        color: "var(--compact-card-timestamp-text)",
                        background: "var(--compact-card-timestamp-bg)",
                        padding: "2px 10px",
                        borderRadius: 11,
                        fontWeight: 500,
                        letterSpacing: 0.1,
                        pointerEvents: "none",
                        userSelect: "none",
                        boxShadow: "0 2px 8px #23416711",
                    }}
                >
                    {createdDate} <span style={{ fontVariantNumeric: "tabular-nums" }}>{createdTime}</span>
                </span>
            )}


            {/* content left */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontWeight: 800,
                        fontSize: isMobile ? 15 : 18,
                        color: "var(--compact-card-title)",
                        marginBottom: isMobile ? 6 : 3,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        {isMobile && <FaBox style={{ verticalAlign: -2 }} />}
                        {/* Заголовок (приватная зона на мобилке) */}
                        <span
                            className={limited ? "pw-blur pw-noevents" : ""}
                            style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                            {cargo.title}
                        </span>
                    </span>
                </div>

                {showOwnerBadge && (derivedIsMine || derivedOwnerLabel) && (
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            margin: isMobile ? "6px 0 10px" : "2px 0 8px",
                            padding: "3px 8px",
                            borderRadius: 10,
                            background: isMine ? "var(--compact-card-owner-mine-bg)" : "var(--compact-card-owner-other-bg)",
                            border: isMine ? "1px solid var(--compact-card-owner-mine-border)" : "1px solid var(--compact-card-owner-other-border)",
                            color: isMine ? "var(--compact-card-owner-mine-strong)" : "var(--compact-card-owner-other-text)",
                            fontWeight: 800,
                            fontSize: 12,
                            letterSpacing: ".01em",
                        }}
                    >
                        {derivedIsMine ? t("card.yourOrder", "Ваша заявка") : (
                            <>{t("card.orderOf", "Заявка:")} <span style={{ color: "var(--compact-card-owner-other-strong)" }}>{derivedOwnerLabel}</span></>
                        )}
                    </div>
                )}

                {(routeStacked || isMobile) && hasBoth ? (
                    // Вертикальный вариант: «куда» на второй строке — экономим ширину
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr",
                            alignItems: "start",
                            gap: 9,
                            marginTop: isMobile ? 8 : 6
                        }}
                    >
                        <FaMapMarkerAlt color="var(--compact-card-accent)" style={{ marginTop: 2 }} />
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span
                                style={{
                                    fontWeight: 700,
                                    fontSize: isMobile ? 15 : 17,
                                    color: "var(--compact-card-text-primary)",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    overflow: "hidden"
                                }}
                            >
                                <Flag place={fromStr} />
                                {fromStr}
                            </span>
                            <span
                                style={{
                                    fontWeight: 700,
                                    fontSize: isMobile ? 15 : 17,
                                    color: "var(--compact-card-text-primary)",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    overflow: "hidden"
                                }}
                            >
                                <span style={{ color: "var(--compact-card-accent)", fontWeight: 400, marginRight: 4 }}>→</span>
                                <Flag place={toStr} />
                                {toStr}
                            </span>
                        </div>
                    </div>
                ) : (
                    // Обычный горизонтальный вариант
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: isMobile ? 8 : 6 }}>
                        <FaMapMarkerAlt color="var(--compact-card-accent)" />
                        <span style={{ fontWeight: 700, fontSize: isMobile ? 15 : 17, color: "var(--compact-card-text-primary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", flex: 1, minWidth: 0 }}>
                            <Flag place={fromStr} />
                            {fromStr}
                            <span style={{ color: "var(--compact-card-accent)", fontWeight: 400 }}>→</span>
                            <Flag place={toStr} />
                            {toStr}
                        </span>
                    </div>
                )}

                {/* Ключевые параметры: вес, кузов, дата */}
                <div
                    style={{
                        color: "var(--compact-card-text-secondary)",
                        fontSize: isMobile ? 12 : 15,
                        marginTop: isMobile ? 10 : 6,
                        display: isMobile ? "flex" : "grid",
                        gap: isMobile ? 12 : 8,
                        gridTemplateColumns: isMobile ? undefined : `repeat(${Math.max(1, metaItems.length)}, minmax(0, 1fr))`,
                        alignItems: "center",
                    }}
                >
                    {metaItems.map(({ key, content }) => (
                        <span
                            key={key}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, whiteSpace: "nowrap" }}
                        >
                            {content}
                        </span>
                    ))}
                </div>

                {/* Бейджи/температура/габариты и пр. — приватная зона */}
                {showOrderBadges && (
                    <div style={{ marginTop: isMobile ? 8 : 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {adr && (
                            <span style={pillDanger}>
                                <FaRadiation style={iconS} />
                                ADR
                            </span>
                        )}
                        {tempText && (
                            <span style={pill}>
                                <FaThermometerHalf style={iconS} />
                                {t("card.temp", "Темп:")} {tempText}
                            </span>
                        )}
                        {localizeLoading(loadTypes).map((it, i) => (
                            <span key={`${it.value}-${i}`} style={pill}>
                                {iconLoadType(it.value)} {it.label}
                            </span>
                        ))}
                        {volume && (
                            <span style={pill}>
                                <FaCubes style={iconS} />
                                {t("card.volume", "Объём:")} {volume}
                            </span>
                        )}
                        {dims && (
                            <span style={pill}>
                                <FaRulerCombined style={iconS} />
                                {t("card.dimensions", "Габариты:")} {dims}
                            </span>
                        )}
                        {pallets && (
                            <span style={pill}>
                                <FaBoxes style={iconS} />
                                {t("card.pallets", "Паллеты:")} {pallets}
                            </span>
                        )}
                    </div>
                )}
                {/* Цена — приватная зона */}
                {compactPrice && (
                    <div
                        className={limited ? "pw-blur pw-noevents" : ""}
                        style={{ color: "var(--compact-card-price)", fontWeight: 600, fontSize: isMobile ? 13 : 16, marginTop: isMobile ? 10 : 6 }}
                    >
                        {compactPrice.label}: {compactPrice.value}
                    </div>
                )}
            </div>

            {/* my bid block */}
            {isMyBid && (
                <div
                    style={{
                        minWidth: 120,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        gap: 6,
                    }}
                >
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#34c759", marginBottom: 3, marginTop: 4 }}>
                        {bidAmount
                            ? `${t("bids.myBid", "Ставка")}: ${formatPrice(bidAmount, bidCurrency)}`
                            : "—"}
                    </div>
                    <div
                        style={{
                            fontWeight: 700,
                            fontSize: 15,
                            color: bidStatus === "accepted" ? "#53ee5c" : bidStatus === "rejected" ? "#fe6686" : "#ffd600",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        {bidStatus === "accepted" && (<><FaCheckCircle style={{ verticalAlign: -2 }} /> {t("bids.accepted", "Принято")}</>)}
                        {bidStatus === "rejected" && (<><FaTimesCircle style={{ verticalAlign: -2 }} /> {t("bids.rejected", "Отклонено")}</>)}
                        {bidStatus !== "accepted" && bidStatus !== "rejected" && (
                            <><FaClock style={{ verticalAlign: -2 }} /> {t("bids.pending", "Ожидание")}</>
                        )}
                    </div>
                    {bidRecipientLabel && (
                        <div
                            style={{
                                fontSize: 13,
                                color: "var(--compact-card-info-text)",
                                textAlign: "right",
                                maxWidth: isMobile ? 280 : 340,     // больше места под текст
                                paddingRight: isMobile ? 70 : 96,   // зазор от бейджа даты
                                marginTop: 2,                       // чуть ниже статуса
                                marginBottom: 6,                    // чуть выше даты
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                            }}
                        >
                            <span style={{ opacity: 0.85, whiteSpace: "nowrap" }}>
                                {t("bids.sentTo", "отправлено к")}
                            </span>&nbsp;
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {bidRecipientLabel}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* actions */}
            {/* Правая колонка с действиями — приватная зона: блюрим/гасим клики */}
            {!isMyBid && allowActions && (onEdit || onDelete || onToggleActive || onShowMatches) && (
                <div
                    className={limited ? "pw-blur pw-noevents" : ""}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        marginLeft: 14,
                        // резерв справа под метку даты в правом-нижнем углу карточки,
                        // чтобы кнопки её не перекрывали (на мобиле не нужен)
                        marginRight: isMobile ? 36 : 84,   // ← добавили отступ справа на мобиле под стрелку
                        /* важно: на мобиле не фиксируем ширину — иначе карточка «уезжает» */
                        minWidth: isMobile ? 0 : 186,
                        // при Grid на мобиле прижимаем блок действий вправо
                        justifySelf: isMobile ? "end" : undefined,
                        position: "relative",
                        // зазор снизу, чтобы столбик чипов не касался бейджа даты
                        paddingBottom: isMobile ? 34 : 0,
                    }}
                >
                    {allowActions && onShowMatches && (
                        <button
                            onClick={handleShowMatchesClick}
                            style={{
                                padding: "7px 16px",
                                background: newMatchesCount > 0 ? "var(--compact-card-matches-new-bg)" : "var(--compact-card-matches-bg)",
                                color: "var(--compact-card-matches-text)",
                                border: "none",
                                borderRadius: 11,
                                fontWeight: 600,
                                fontSize: 14,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 5,
                                boxShadow: newMatchesCount > 0 ? "var(--compact-card-matches-shadow)" : undefined,
                                position: "relative",
                                whiteSpace: "nowrap",
                                marginBottom: isMobile ? 6 : 8,
                                transition: "background .18s",
                            }}
                            title={
                                newMatchesCount > 0
                                    ? `${t("matches.newCount", "Новых соответствий: {count}").replace("{count}", String(newMatchesCount))}` +
                                    (typeof shownMatches === "number" ? ` / ${t("matches.totalCount", "Суммарно: {count}").replace("{count}", String(shownMatches))}` : "")
                                    : (typeof shownMatches === "number"
                                        ? t("matches.totalCount", "Суммарно: {count}").replace("{count}", String(shownMatches))
                                        : t("matches.show", "Показать совпадения"))
                            }
                        >
                            <FaLink size={17} color="var(--compact-card-matches-text)" style={{ marginRight: 5, flexShrink: 0 }} />
                            {newMatchesCount > 0 && (
                                <span style={{
                                    marginLeft: 6,
                                    fontWeight: 800,
                                    fontSize: 13,
                                    padding: "1px 8px",
                                    borderRadius: 999,
                                    background: "#14532d",
                                    color: "var(--text-on-brand, #fff)"
                                }}>{newMatchesCount}</span>
                            )}
                            {matchesPulse && <span className="matches-flash-ring" />}
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                                {typeof shownMatches === "number" ? `${shownMatches} ${t("matches.label", "Соответствий")}` : t("matches.label", "Соответствия")}
                            </span>
                            <style jsx>{`
                                  .matches-flash-ring{
                                    position:absolute;
                                    top:-6px; left:-6px; right:-6px; bottom:-6px;
                                    border-radius:12px;
                                    border:2px solid #41cfff;
                                    animation: matchFlash 1.3s cubic-bezier(0.22,0.7,0.42,1.02);
                                    pointer-events:none;
                                  }
                                  @keyframes matchFlash{
                                    0%   { opacity:.8; transform:scale(0.96); }
                                    70%  { opacity:0;  transform:scale(1.06); }
                                    100% { opacity:0;  transform:scale(1.06); }
                                  }
                                `}</style>
                        </button>
                    )}
                    {/* --- Desktop сетка (скрыта на мобиле) --- */}
                    <div style={{ display: isMobile ? "none" : "flex", flexDirection: "row", alignItems: "center", gap: 7, position: "relative" }}>
                        {/* toggle active */}
                        {onToggleActive && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!toggleLoading) handleToggleActive();
                                }}
                                style={{
                                    background: isActive ? "#33de7b" : "#8e9cb6",
                                    border: "none",
                                    borderRadius: 7,
                                    width: 44,
                                    height: 44,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    boxShadow: isActive ? "0 1px 5px #33de7b55" : undefined,
                                    transition: ".13s",
                                }}
                                title={
                                    isActive
                                        ? t("card.deactivateHint", "Скрыть заявку для всех (перевести в неактивные)")
                                        : t("card.activateHint", "Сделать заявку снова активной (видимой для поиска)")
                                }
                            >
                                <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 2 }}>
                                    {isActive ? "✓" : "—"}
                                </span>
                                <span style={{ fontSize: 11, color: "#fff", fontWeight: 600, lineHeight: 1, opacity: 0.93 }}>
                                    {isActive ? t("card.active", "Актив") : t("card.archive", "Архив")}
                                </span>
                            </button>
                        )}

                        {/* bids button */}
                        <div style={{ position: "relative" }}>
                            <button
                                ref={bidsBtnRef}
                                onClick={handleBidsClick}
                                style={{
                                    background: bidsCount > 0 ? "var(--compact-card-action-bg-strong)" : "var(--compact-card-action-bg)",
                                    border: "none",
                                    borderRadius: 7,
                                    width: 44,
                                    height: 44,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    boxShadow: bidsCount > 0 ? "var(--compact-card-action-shadow)" : "var(--compact-card-action-shadow)",
                                    position: "relative",
                                    transition: "background .14s",
                                }}
                                title={t("bids.titleTooltip", "Ставки/предложения")}
                            >
                                <FaGavel
                                    size={17}
                                    color={bidsCount > 0 ? "var(--compact-card-accent)" : "var(--compact-card-action-icon)"}
                                    style={{
                                        filter: bidsCount > 0 ? "drop-shadow(0 0 3px #43c8ff77)" : undefined,
                                        marginBottom: 2,
                                    }}
                                />
                                <span style={{ fontSize: 11, color: "var(--compact-card-action-icon)", fontWeight: 600, lineHeight: 1 }}>
                                    {t("bids.label", "Ставки")}
                                </span>

                                {newBidsCount > 0 && (
                                    <span
                                        style={{
                                            position: "absolute",
                                            top: -6,
                                            right: -6,
                                            minWidth: 18,
                                            height: 18,
                                            padding: "0 6px",
                                            borderRadius: 999,
                                            background: "#ff3b30",
                                            color: "white",
                                            fontSize: 11,
                                            fontWeight: 700,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            boxShadow: `0 0 0 2px var(--compact-card-badge-outline)`,
                                        }}
                                        title={t("bids.newCount", "Новые ставки: {count}").replace("{count}", String(newBidsCount))}
                                    >
                                        {newBidsCount}
                                    </span>
                                )}
                            </button>

                            {/* bids panel (portal) — ДЕСктоп */}
                            <AnimatePresence initial={false}>
                                {showBids && !isMobile && (
                                    <Portal>
                                        <motion.div
                                            ref={panelRef}
                                            initial={{ opacity: 0, y: 18, scale: 0.97 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 18, scale: 0.97 }}
                                            transition={{ duration: 0.28, ease: [0.48, 1.52, 0.44, 0.98] }}
                                            style={{
                                                position: "fixed",
                                                top: panelPos.top ?? "50%",
                                                left: panelPos.left ?? "50%",
                                                transform: panelPos.top != null && panelPos.left != null ? undefined : "translate(-50%, -50%)",
                                                zIndex: 100001, // поверх оверлея
                                                background: "#22304b",
                                                borderRadius: 15,
                                                boxShadow: "0 10px 40px #001844cc, 0 0 0 2px #193158",
                                                minWidth: 300,
                                                maxWidth: 460,
                                                padding: 16,
                                                pointerEvents: "auto",
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div style={{ fontWeight: 700, color: "#43c8ff", fontSize: 17, marginBottom: 10 }}>
                                                {t("bids.title", "Полученные предложения")}
                                            </div>

                                            {bidsLoading && <div style={{ color: "#9cc4e7", fontSize: 15 }}>{t("bids.loading", "Загрузка...")}</div>}
                                            {!bidsLoading && bids.length === 0 && (
                                                <div style={{ color: "#9cc4e7", fontSize: 15 }}>{t("bids.empty", "Нет предложений")}</div>
                                            )}

                                            <div style={{ maxHeight: 220, overflowY: "auto" }}>
                                                {bids.map((bid) => (
                                                    <div
                                                        key={bid.id}
                                                        style={{
                                                            background: bid.status === "accepted" ? "#183f26" : "#182740",
                                                            border: bid.status === "accepted" ? "2px solid #53ee5c" : "none",
                                                            borderRadius: 11,
                                                            padding: "7px 10px",
                                                            marginBottom: 7,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 7,
                                                            opacity: bid.status === "rejected" ? 0.5 : 1,
                                                        }}
                                                    >
                                                        <b
                                                            style={{
                                                                color: bid.status === "accepted" ? "#53ee5c" : "#ffd600",
                                                                fontSize: 16,
                                                            }}
                                                        >
                                                            {formatPrice(bid.amount, bid.currency)}
                                                        </b>
                                                        <span style={{ color: "#b3d5fa", flex: 1 }}>{bid.comment}</span>
                                                        <span style={{ color: "#43c8ff", fontSize: 15 }}>{bid.user_name}</span>

                                                        {/* чат */}
                                                        <button
                                                            title={t("bids.chat.go", "Перейти в чат")}
                                                            onClick={(e) => { e.stopPropagation(); openChatForBid(bid); }}
                                                            style={{
                                                                background: "none",
                                                                color: "#43c8ff",
                                                                border: "none",
                                                                borderRadius: "50%",
                                                                padding: "5px 7px",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                cursor: "pointer",
                                                                transition: ".15s",
                                                                marginLeft: 2,
                                                            }}
                                                        >
                                                            <FaComments
                                                                style={{
                                                                    fontSize: 19,
                                                                    color: "#43c8ff",
                                                                    filter: "drop-shadow(0 1px 4px #43c8ff55)",
                                                                }}
                                                            />
                                                        </button>

                                                        {/* accept/reject */}
                                                        {bid.status !== "accepted" && bid.status !== "rejected" && (
                                                            <>
                                                                <button
                                                                    onClick={async () => {
                                                                        try {
                                                                            const resp = await authFetchWithRefresh(
                                                                                api(`/orders/${cargo.id}/bids/${bid.id}/accept`),
                                                                                { method: "POST", headers: { "Content-Type": "application/json" } }
                                                                            );
                                                                            if (resp.ok) {
                                                                                loadBids();
                                                                                setShowBids(false);
                                                                                return;
                                                                            }
                                                                            alert(t("error.acceptBid", "Ошибка при принятии предложения!"));
                                                                        } catch (e) {
                                                                            alert(t("error.js", "JS ошибка") + ": " + e.message);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        background: "#33de7b",
                                                                        color: "#192b42",
                                                                        border: "none",
                                                                        borderRadius: 8,
                                                                        padding: "5px 9px",
                                                                        fontWeight: 700,
                                                                        marginRight: 4,
                                                                        cursor: "pointer",
                                                                    }}
                                                                    title={t("bids.accept", "Принять предложение")}
                                                                >
                                                                    ✔
                                                                </button>
                                                                <button
                                                                    onClick={async () => {
                                                                        await authFetchWithRefresh(
                                                                            api(`/orders/${cargo.id}/bids/${bid.id}/reject`),
                                                                            { method: "POST" }
                                                                        );
                                                                        loadBids();
                                                                    }}
                                                                    style={{
                                                                        background: "#fe6686",
                                                                        color: "#fff",
                                                                        border: "none",
                                                                        borderRadius: 8,
                                                                        padding: "5px 9px",
                                                                        fontWeight: 700,
                                                                        cursor: "pointer",
                                                                    }}
                                                                    title={t("bids.reject", "Отклонить")}
                                                                >
                                                                    ✖
                                                                </button>
                                                            </>
                                                        )}
                                                        {bid.status === "accepted" && (
                                                            <span style={{ color: "#53ee5c", fontWeight: 700, marginLeft: 7, fontSize: 15 }}>
                                                                {t("bids.accepted", "Принято")}
                                                            </span>
                                                        )}
                                                        {bid.status === "rejected" && (
                                                            <span style={{ color: "#fe6686", fontWeight: 700, marginLeft: 7, fontSize: 15 }}>
                                                                {t("bids.rejected", "Отклонено")}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowBids(false);
                                                }}
                                                style={{
                                                    background: "#182740",
                                                    color: "#43c8ff",
                                                    border: "none",
                                                    borderRadius: 8,
                                                    fontWeight: 700,
                                                    padding: "8px 20px",
                                                    marginTop: 9,
                                                    cursor: "pointer",
                                                    fontSize: 15,
                                                }}
                                            >
                                                {t("bids.close", "Закрыть")}
                                            </button>
                                        </motion.div>
                                    </Portal>
                                )}
                            </AnimatePresence>

                            {/* bids bottom-sheet — МОБИЛЬНЫЙ */}
                            <AnimatePresence initial={false}>
                                {showBids && isMobile && (
                                    <Portal>
                                        {/* Подложка */}
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            onPointerDown={(e) => { e.stopPropagation(); armClickGuard(400); }}
                                            onClick={(e) => { e.stopPropagation(); setShowBids(false); }}
                                            style={{
                                                position: "fixed",
                                                inset: 0,
                                                background: "#001a",
                                                zIndex: 100001
                                            }}
                                        >
                                            {/* Сам лист */}
                                            <motion.div
                                                onClick={(e) => e.stopPropagation()}
                                                initial={{ y: "100%" }}
                                                animate={{ y: 0 }}
                                                exit={{ y: "100%" }}
                                                transition={{ duration: 0.28, ease: [0.22, 0.8, 0.36, 1] }}
                                                style={{
                                                    position: "absolute",
                                                    left: 0,
                                                    right: 0,
                                                    bottom: 0,
                                                    background: "#22304b",
                                                    borderTopLeftRadius: 16,
                                                    borderTopRightRadius: 16,
                                                    boxShadow: "0 -10px 30px #001844cc, 0 0 0 2px #193158",
                                                    maxHeight: "76vh",
                                                    minHeight: "44vh",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    padding: 14,
                                                    zIndex: 100002
                                                }}
                                            >
                                                {/* хэндл */}
                                                <div style={{ width: 44, height: 4, background: "var(--compact-card-pill-border)", borderRadius: 999, margin: "4px auto 12px" }} />
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                                    <div style={{ fontWeight: 800, color: "#43c8ff", fontSize: 16 }}>
                                                        {t("bids.title", "Полученные предложения")}
                                                    </div>
                                                    <button
                                                        onClick={() => { armClickGuard(400); setShowBids(false); }}
                                                        style={{ background: "transparent", border: "none", color: "#9cc4e7", fontWeight: 800, fontSize: 16, cursor: "pointer" }}
                                                        aria-label={t("bids.close", "Закрыть")}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                                {bidsLoading && (
                                                    <div style={{ color: "#9cc4e7", fontSize: 15, padding: "8px 2px" }}>{t("bids.loading", "Загрузка...")}</div>
                                                )}
                                                {!bidsLoading && bids.length === 0 && (
                                                    <div style={{ color: "#9cc4e7", fontSize: 15, padding: "8px 2px" }}>{t("bids.empty", "Нет предложений")}</div>
                                                )}

                                                <div style={{ overflowY: "auto", padding: "2px 2px 8px", gap: 8, display: "flex", flexDirection: "column" }}>
                                                    {bids.map((bid) => (
                                                        <div
                                                            key={bid.id}
                                                            onClick={() => openChatForBid(bid)}
                                                            role="button"
                                                            tabIndex={0}
                                                            style={{
                                                                background: bid.status === "accepted" ? "#183f26" : "#182740",
                                                                border: bid.status === "accepted" ? "2px solid #53ee5c" : "1px solid #203554",
                                                                borderRadius: 12,
                                                                padding: "12px 12px",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 8,
                                                                opacity: bid.status === "rejected" ? 0.5 : 1,
                                                                cursor: "pointer",
                                                                minHeight: 56
                                                            }}
                                                        >
                                                            <b style={{ color: bid.status === "accepted" ? "#53ee5c" : "#ffd600", fontSize: 16 }}>
                                                                {formatPrice(bid.amount, bid.currency)}
                                                            </b>
                                                            <span style={{ color: "#b3d5fa", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                {bid.comment}
                                                            </span>
                                                            <span style={{ color: "#43c8ff", fontSize: 14 }}>
                                                                {bid.user_name}
                                                            </span>
                                                            {/* чат */}
                                                            <button
                                                                title={t("bids.chat.go", "Перейти в чат")}
                                                                onClick={(e) => { e.stopPropagation(); openChatForBid(bid); }}
                                                                style={{
                                                                    background: "none",
                                                                    color: "#43c8ff",
                                                                    border: "none",
                                                                    borderRadius: "9999px",
                                                                    width: 44,
                                                                    height: 44,
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    cursor: "pointer",
                                                                    marginLeft: 2,
                                                                    touchAction: "manipulation"
                                                                }}
                                                            >
                                                                <FaComments style={{ fontSize: 22, color: "#43c8ff", filter: "drop-shadow(0 1px 4px #43c8ff55)" }} />
                                                            </button>
                                                            {/* accept / reject */}
                                                            {bid.status !== "accepted" && bid.status !== "rejected" && (
                                                                <>
                                                                    <button
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            try {
                                                                                const resp = await authFetchWithRefresh(
                                                                                    api(`/orders/${cargo.id}/bids/${bid.id}/accept`),
                                                                                    { method: "POST", headers: { "Content-Type": "application/json" } }
                                                                                );
                                                                                if (resp.ok) {
                                                                                    await loadBids();
                                                                                    armClickGuard(400);
                                                                                    setShowBids(false);
                                                                                    return;
                                                                                }
                                                                                alert(t("error.acceptBid", "Ошибка при принятии предложения!"));
                                                                            } catch (e) {
                                                                                alert("JS ошибка: " + e.message);
                                                                            }
                                                                        }}
                                                                        style={{ background: "#33de7b", color: "#192b42", border: "none", borderRadius: 12, padding: "8px 12px", fontWeight: 800, marginLeft: 4, cursor: "pointer", minWidth: 44 }}
                                                                        title={t("bids.accept", "Принять предложение")}
                                                                    >
                                                                        ✔
                                                                    </button>
                                                                    <button
                                                                        onClick={async (e) => {
                                                                            e.stopPropagation();
                                                                            await authFetchWithRefresh(
                                                                                api(`/orders/${cargo.id}/bids/${bid.id}/reject`),
                                                                                { method: "POST" }
                                                                            );
                                                                            loadBids();
                                                                            armClickGuard(400); // если решишь закрывать лист — armClickGuard тоже пригодится
                                                                        }}
                                                                        style={{ background: "#fe6686", color: "#fff", border: "none", borderRadius: 12, padding: "8px 12px", fontWeight: 800, marginLeft: 4, cursor: "pointer", minWidth: 44 }}
                                                                        title={t("bids.reject", "Отклонить")}
                                                                    >
                                                                        ✖
                                                                    </button>
                                                                </>
                                                            )}
                                                            {bid.status === "accepted" && (
                                                                <span style={{ color: "#53ee5c", fontWeight: 800, marginLeft: 6, fontSize: 14 }}>{t("bids.accepted", "Принято")}</span>
                                                            )}
                                                            {bid.status === "rejected" && (
                                                                <span style={{ color: "#fe6686", fontWeight: 800, marginLeft: 6, fontSize: 14 }}>{t("bids.rejected", "Отклонено")}</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                <button
                                                    onClick={() => { armClickGuard(400); setShowBids(false); }}
                                                    style={{
                                                        background: "#182740",
                                                        color: "#43c8ff",
                                                        border: "none",
                                                        borderRadius: 10,
                                                        fontWeight: 800,
                                                        padding: "10px 20px",
                                                        marginTop: 10,
                                                        alignSelf: "center",
                                                        cursor: "pointer",
                                                        fontSize: 15
                                                    }}
                                                >
                                                    {t("bids.close", "Закрыть")}
                                                </button>
                                            </motion.div>
                                        </motion.div>
                                    </Portal>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* request GPS (только для ролей, кто может выкладывать груз) */}
                        {canRequestGps && (
                            <div style={{ marginLeft: 8 }}>
                                <button
                                    title={t("gps.request", "Запросить локацию")}
                                    onClick={(e) => { e.stopPropagation(); setShowSoon(true); }}
                                    style={{
                                        background: "var(--compact-card-gps-bg)",
                                        border: "none",
                                        borderRadius: 7,
                                        width: 44,
                                        height: 44,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        transition: ".13s",
                                        boxShadow: "var(--compact-card-gps-shadow)",
                                        position: "relative",
                                    }}
                                >
                                    <FaShareAlt color="var(--compact-card-accent)" size={17} style={{ marginBottom: 2 }} />
                                    <span style={{
                                        fontSize: 11,
                                        color: "var(--compact-card-gps-text)",
                                        fontWeight: 600,
                                        lineHeight: 1
                                    }}>
                                        {t("gps.short", "GPS")}
                                    </span>
                                </button>
                            </div>
                        )}

                        {/* edit */}
                        {onEdit && (
                            <button
                                title={t("common.edit", "Редактировать")}
                                style={{
                                    background: "var(--compact-card-edit-bg)",
                                    border: "none",
                                    borderRadius: 7,
                                    width: 44,
                                    height: 44,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit();
                                }}
                            >
                                <FaEdit color="#fff" size={17} style={{ marginBottom: 2 }} />
                                <span style={{ fontSize: 11, color: "var(--compact-card-edit-text)", fontWeight: 600, lineHeight: 1 }}>
                                    {t("common.editShort", "Ред.")}
                                </span>
                            </button>
                        )}

                        {/* delete */}
                        {onDelete && (
                            <button
                                title={t("common.delete", "Удалить")}
                                style={{
                                    background: "var(--compact-card-delete-bg)",
                                    border: "none",
                                    borderRadius: 7,
                                    width: 44,
                                    height: 44,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                            >
                                <FaTrash color="#fff" size={17} style={{ marginBottom: 2 }} />
                                <span style={{ fontSize: 11, color: "var(--compact-card-delete-text)", fontWeight: 600, lineHeight: 1 }}>
                                    {t("common.delete", "Удалить")}
                                </span>
                            </button>
                        )}
                    </div>
                    {/* --- Mobile: компактные чипы + Ещё --- */}
                    {isMobile && (
                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 6,
                            marginTop: 6,
                            paddingRight: 36 // запас под правый chevron, можно увеличить до 40–44 при необходимости
                        }}>
                            {/* Чип Актив/Архив — как на десктопе, но компактный */}
                            {allowActions && (
                                <button
                                    ref={activeChipRef}
                                    onClick={(e) => { e.stopPropagation(); if (!toggleLoading) handleToggleActive(); }}
                                    title={isActive ? t("card.toArchive", "Перевести в архив")
                                        : t("card.makeActive", "Сделать активной")}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 8,
                                        height: 32,
                                        padding: "0 12px",
                                        border: "none",
                                        borderRadius: 999,
                                        background: isActive ? "#2b854c" : "#6f7f9c",
                                        color: "#fff",
                                        fontWeight: 800,
                                        fontSize: 12,
                                        whiteSpace: "nowrap",
                                        cursor: "pointer",
                                        boxShadow: isActive ? "0 1px 5px #33de7b55" : "0 0 0 1px var(--compact-card-pill-border)"
                                    }}
                                >
                                    <span style={{ fontSize: 14 }}>{isActive ? "✓" : "—"}</span>
                                    <span>{isActive ? t("card.active", "Актив") : t("card.archive", "Архив")}</span>
                                </button>
                            )}

                            {/* Чип GPS (запрос координат) */}
                            {canRequestGps && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowSoon(true); }}
                                    title={t("gps.request", "Запросить GPS")}
                                    style={{
                                        ...chipBase,
                                        width: chipWidth || undefined,
                                        justifyContent: "space-between",
                                        background: "var(--compact-card-pill-bg)",
                                        color: "var(--compact-card-pill-text)",
                                        cursor: "pointer",
                                        boxShadow: "0 0 0 1px var(--compact-card-pill-border)"
                                    }}
                                >
                                    <FaShareAlt size={14} />
                                    <span>{t("gps.short", "GPS")}</span>
                                </button>
                            )}

                            {/* Ещё — открывает bottom-sheet со всеми действиями */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setMobileActionsOpen(true); }}
                                title={t("common.more", "Ещё")}
                                style={{
                                    ...chipBase,
                                    width: chipWidth || undefined,
                                    justifyContent: "space-between",
                                    background: "var(--compact-card-pill-bg)",
                                    color: "var(--compact-card-pill-text)",
                                    cursor: "pointer",
                                    boxShadow: "0 0 0 1px var(--compact-card-pill-border)"
                                }}
                            >
                                <FaEllipsisH size={14} />
                                <span>{t("common.more", "Ещё")}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {!isMyBid && (
                isMobile
                    ? <FaChevronRight
                        color="#43c8ff"
                        style={{
                            position: "absolute",
                            right: 10,
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: 22,
                            pointerEvents: "none"
                        }}
                    />
                    : <FaChevronRight color="var(--compact-card-accent)" style={{ marginLeft: 14, fontSize: 22 }} />
            )}
            {/* Mobile actions bottom-sheet */}
            {isMobile && mobileActionsOpen && ReactDOM.createPortal(
                <div
                    onPointerDown={(e) => { e.stopPropagation(); armClickGuard(400); }}
                    onClick={() => setMobileActionsOpen(false)}
                    style={{ position: "fixed", inset: 0, background: "#001a", zIndex: 9998 }}
                >
                    <div
                        ref={actionsSheetRef}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: "absolute", left: 0, right: 0, bottom: 0,
                            background: "var(--compact-card-bg)",
                            borderTopLeftRadius: 16, borderTopRightRadius: 16,
                            boxShadow: "0 -10px 30px #00184577",
                            padding: "12px 14px 20px",
                            zIndex: 9999
                        }}
                    >
                        <div style={{ width: 38, height: 4, background: "var(--compact-card-pill-border)", borderRadius: 999, margin: "6px auto 12px" }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <button
                                onClick={() => { setMobileActionsOpen(false); handleOpenCard(); }}
                                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--compact-card-pill-border)", background: "var(--compact-card-bg)", color: "var(--compact-card-text-primary)", fontWeight: 800, textAlign: "left" }}
                            >{t("card.open", "Открыть карточку")}</button>


                            {allowActions && typeof cargo?.is_active !== "undefined" && (
                                <button
                                    onClick={() => {
                                        setMobileActionsOpen(false);
                                        if (!toggleLoading) handleToggleActive();
                                    }}
                                    style={{
                                        padding: "12px 14px",
                                        borderRadius: 12,
                                        border: "1px solid var(--compact-card-pill-border)",
                                        background: "var(--compact-card-bg)",
                                        color: "var(--compact-card-text-primary)",
                                        fontWeight: 800,
                                        textAlign: "left"
                                    }}
                                >
                                    {isActive ? t("card.toArchive", "Перевести в архив")
                                        : t("card.makeActive", "Сделать активной")}
                                </button>
                            )}

                            {/* Ставки оставляем в листе, «Соответствия» вынесены наружу */}
                            <button
                                onClick={openBidsFromSheet}
                                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--compact-card-pill-border)", background: "var(--compact-card-bg)", color: "var(--compact-card-text-primary)", fontWeight: 800, textAlign: "left" }}
                            >{t("bids.label", "Ставки")}</button>

                            {typeof onEdit === "function" && allowActions && (
                                <button
                                    onClick={() => { setMobileActionsOpen(false); onEdit && onEdit(); }}
                                    style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--compact-card-pill-border)", background: "var(--compact-card-bg)", color: "var(--compact-card-text-primary)", fontWeight: 800, textAlign: "left" }}
                                >{t("common.edit", "Редактировать")}</button>
                            )}

                            {typeof onDelete === "function" && allowActions && (
                                <button
                                    onClick={() => { setMobileActionsOpen(false); onDelete && onDelete(); }}
                                    style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--compact-card-pill-border)", background: "var(--compact-card-bg)", color: "var(--compact-card-text-primary)", fontWeight: 800, textAlign: "left" }}
                                >{t("common.delete", "Удалить")}</button>
                            )}

                            <button
                                onClick={() => { armClickGuard(400); setMobileActionsOpen(false); }}
                                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #2a4872", background: "#0f1a2b", color: "#9ec8ff", fontWeight: 800, textAlign: "left" }}
                            >{t("common.cancel", "Отмена")}</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Модалка: заявка просрочена, нужно обновить дату */}
            {showOverdueModal && (
                <Portal>
                    <div
                        onClick={() => setShowOverdueModal(false)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "#001a",
                            backdropFilter: "blur(2px)",
                            zIndex: 100002,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: "min(92vw, 520px)",
                                background: "#0f1b2e",
                                border: "1px solid #1f3355",
                                borderRadius: 14,
                                padding: 22,
                                color: "#cde2ff",
                                boxShadow: "0 10px 40px #0008",
                            }}
                        >
                            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                                {t("order.overdue.title", "Нужно обновить дату")}
                            </div>
                            <div style={{ fontSize: 14, lineHeight: 1.5, color: "#9ec8ff" }}>
                                {t("order.overdue.body1",
                                    "Заявка автоматически была переведена в архив, потому что дата погрузки в прошлом более 7 дней. Для повторной активации ")}
                                <b>{t("order.overdue.bodyBold", "обновите дату")}</b>
                                {t("order.overdue.body2", ".")}
                            </div>
                            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
                                <button
                                    onClick={() => setShowOverdueModal(false)}
                                    style={{ background: "transparent", color: "#9ec8ff", border: "1px solid #385a86", borderRadius: 9, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}
                                >
                                    {t("order.overdue.later", "Позже")}
                                </button>
                                <button
                                    onClick={() => { setShowOverdueModal(false); onEdit && onEdit(); }}
                                    style={{ background: "#43c8ff", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}
                                >
                                    {t("order.overdue.updateBtn", "Обновить дату")}
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
            {/* Заглушка: единая модалка "Скоро доступно" */}
            {showSoon && (
                <Portal>
                    <div
                        onClick={() => setShowSoon(false)}
                        style={{ position: "fixed", inset: 0, background: "#001a", zIndex: 100002, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: "min(92vw, 520px)",
                                background: "#0f1b2e",
                                border: "1px solid #1f3355",
                                borderRadius: 14,
                                padding: 22,
                                color: "#cde2ff",
                                boxShadow: "0 10px 40px #0008"
                            }}
                        >
                            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                                {t("gps.soon.title", "Скоро доступно")}
                            </div>
                            <div style={{ fontSize: 14, lineHeight: 1.5, color: "#9ec8ff" }}>
                                {t("gps.soon.body", "GPS-мониторинг находится в разработке и появится в ближайших обновлениях.")}
                            </div>
                            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
                                <button
                                    onClick={() => setShowSoon(false)}
                                    style={{ background: "#43c8ff", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}
                                >
                                    {t("common.ok", "Понятно")}
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
});

export default CargoCompactCard;
