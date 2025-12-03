import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FaTruck, FaEdit, FaTrash, FaChevronRight, FaEllipsisH, FaClock, FaThermometerHalf, FaRadiation, FaRulerCombined, FaCubes, FaBoxes, FaEye } from "react-icons/fa";
import ReactDOM from "react-dom";
import { useUser } from "../UserContext";
import { FaLink } from "react-icons/fa";
import dynamic from "next/dynamic";
import { FaShareAlt } from "react-icons/fa";
import { useRouter } from "next/navigation";
const ShareLocationModal = dynamic(() => import("@/app/components/ShareLocationModal"), { ssr: false });
import { useLang } from "../i18n/LangProvider";
import { api, ws as makeWsUrl } from "@/config/env";
import { LOADING_TYPES, getTruckBodyTypes, getLoadingTypes, getTransportKindOptions, localizeRegularity as mapRegularity } from "./truckOptions";

// Добавить глобально или прямо в компоненте через <style>
if (typeof window !== "undefined" && !document.getElementById("flash-highlight-style")) {
    const style = document.createElement("style");
    style.id = "flash-highlight-style";
    style.innerHTML = `
    .flash-highlight {
        animation: flashHighlightAnim 1.3s cubic-bezier(0.22, 0.7, 0.42, 1.02);
    }
    @keyframes flashHighlightAnim {
        0%   { box-shadow: 0 0 0 12px #41cfff50, 0 2px 8px #121e3844; }
        70%  { box-shadow: 0 0 0 0 #41cfff00,   0 2px 8px #121e3844; }
        100% { box-shadow: 0 0 0 0 #41cfff00,   0 2px 8px #121e3844; }
    }
    `;
    document.head.appendChild(style);
}

// Компонент компактной карточки транспорта с индикатором новых Соответствий
export default function TransportCompactCard({
    transport,
    onClick,
    onEdit,
    onDelete,
    isMobile,
    routeStacked = false,
    onToggleActive,
    matchesCount,
    newMatchesCount = 0,
    onShowMatches,
    onMatchesViewed,
    hideStatus,
    hoveredItemId,
    setHoveredItemId,
    enableHoverScroll = false,
    enableHoverLift = false,
    isFocused, // для внешней подсветки
    inModal = false,
    disableAllHover = false,
    ownerLabel,                  // ← НОВОЕ
    isMine,
    managerContext = false,
    showOwnerBadge = false,
    showTransportBadges = false,
    hideActions = false,
    isNew = false,
    hideLive = false,
    limited = false, // ← НОВОЕ
    ...rest
}) {
    const [isActive, setIsActive] = useState(transport.is_active !== false);
    const [toggleLoading, setToggleLoading] = useState(false);
    const [showOverdueModal, setShowOverdueModal] = useState(false);

    // Синхронизируем флаг активности при смене пропсов
    useEffect(() => {
        setIsActive(transport.is_active !== false);
    }, [transport.is_active]);

    const { authFetchWithRefresh, user } = useUser();
    const router = useRouter();
    // Клик по карточке (уважаем защиту одного тапа на мобилке)
    const handleCardClick = () => {
        if (isMobile && isClickGuardActive()) return;
        if (typeof onClick === "function") {
            onClick();
            return;
        }
        if (transport?.id && !inModal) {
            router.push(`/transport/${transport.id}`);
        }
    };
    const role = String(user?.role || "").toUpperCase();

    const isManager = role === "MANAGER" || role === "ADMIN";
    const isEmployee = role === "EMPLOYEE";
    // Автоопределяем «свои» карточки/владельца (чтобы на мобиле всё работало без доп. пропсов)
    const currentUserId = user?.id || user?._id || user?.user_id;
    const derivedIsMine = Boolean(
        isMine ||
        transport?.is_mine ||
        transport?.mine ||
        (transport?.user_id && transport.user_id === currentUserId) ||
        (transport?.owner_id && transport.owner_id === currentUserId)
    );
    const derivedOwnerLabel =
        ownerLabel ?? transport?.owner_label ?? transport?.owner_name ?? transport?.owner?.name ?? transport?.company_name;
    // Приводим к той же логике, что в CargoCompactCard:
    // менеджер всегда может действия; сотрудник — только по «своим» карточкам
    const allowActions = managerContext ? (isManager || (isEmployee && !!derivedIsMine)) : true;
    // LIVE-индикатор в менеджерском — только на своих
    const canSeeLive = managerContext ? !!derivedIsMine : true;

    // --- ленивый фетч количества Соответствий для «Все» ---
    const [lazyMatchesCount, setLazyMatchesCount] = useState(null);



    // Универсальный парсер количества  (как в Cargo*)
    function extractCount(res, data) {
        const hdr = res.headers?.get?.("x-total-count");
        if (hdr && !Number.isNaN(parseInt(hdr, 10))) return parseInt(hdr, 10);
        if (Array.isArray(data)) return data.length;
        if (data && typeof data.count === "number") return data.count;
        if (data && Array.isArray(data.items)) return data.items.length;
        return 0;
    }

    useEffect(() => {
        if (!allowActions || !transport?.id) return;
        let aborted = false;
        (async () => {
            try {
                // cache-busting, чтобы не словить 0 из кеша
                const url = api(`/transports/${transport.id}/matching_orders?__ts=${Date.now()}`);
                const res = await authFetchWithRefresh(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const ct = res.headers.get("content-type") || "";
                const data = ct.includes("application/json") ? await res.json() : null;
                if (aborted) return;
                setLazyMatchesCount(extractCount(res, data));
            } catch {
                if (!aborted) setLazyMatchesCount(0);
            }
        })();
        return () => { aborted = true; };
        // запускать при изменении id/allowActions, без matchesCount/managerContext (иначе дергается лишний раз)
    }, [transport?.id, allowActions, authFetchWithRefresh]);

    // --- Анимация новых Соответствий ---
    const [localNewMatchesCount, setLocalNewMatchesCount] = useState(newMatchesCount || 0);
    const prevMatchesCount = useRef(newMatchesCount || 0);
    const [flashCount, setFlashCount] = useState(0);
    const [shareOpen, setShareOpen] = useState(false);
    const [showSoon, setShowSoon] = useState(false);
    const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
    const { t, lang } = useLang();
    const intl = lang === "ka" ? "ka-GE" : "ru-RU";

    // Локализация "ежедневно" / "N раз(а) в неделю|месяц" и пр.
    // Единый локализатор регулярности
    const localizeRegularity = useCallback((raw) => mapRegularity(t, raw), [t]);
    // Витрины: label = перевод, value = канон (RU)
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);          // [{value: "Полуприцеп", label: "…" KA}, ...]
    const TRANSPORT_KIND_OPTS = useMemo(() => getTransportKindOptions(t), [t]); // [{value: "Грузовик", label: "…" KA}, ...]
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
    // Локализуем вид ТС (Грузовик / Полуприцеп / Сцепка)
    const findKindLabelByValue = useCallback((val) => {
        if (val === undefined || val === null) return "";
        const v = String(val).trim().toLowerCase();
        const flat = [];
        for (const opt of TRANSPORT_KIND_OPTS || []) {
            if (opt?.children) flat.push(...opt.children);
            else flat.push(opt);
        }
        const found = flat.find(o => String(o?.value || "").trim().toLowerCase() === v);
        return found?.label || val;
    }, [TRANSPORT_KIND_OPTS]);
    // Локализуем массив видов загрузки (в UI — перевод; данные остаются каноном)
    const localizeLoadingTypes = useCallback((arr) => {
        const i18n = LOADING_TYPES_I18N || [];
        return (arr || []).map(v => {
            const idx = LOADING_TYPES.findIndex(x => String(x).toLowerCase() === String(v).toLowerCase());
            return idx >= 0 ? (i18n[idx] || v) : v;
        });
    }, [LOADING_TYPES_I18N]);
    // --- «Ещё» (mobile actions) — ref шита и глобальный click-away с гардом ---
    const actionsSheetRef = useRef(null);
    useEffect(() => {
        if (!mobileActionsOpen) return;
        const onDocDown = (e) => {
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
    // --- CLICK GUARD: защита от «сквозного» тапа после закрытия меню/шитов ---
    const clickGuardUntilRef = useRef(0);
    const armClickGuard = (ms = 400) => { clickGuardUntilRef.current = Date.now() + ms; };
    const isClickGuardActive = () => Date.now() < clickGuardUntilRef.current;
    // Ширина чипа «Актив/Архив» для выравнивания GPS/Ещё
    const activeChipRef = useRef(null);
    const [chipWidth, setChipWidth] = useState(null);
    useEffect(() => {
        const read = () => {
            const w = activeChipRef.current?.offsetWidth || null;
            setChipWidth(w);
        };
        read();
        if (typeof window !== "undefined") {
            window.addEventListener("resize", read);
            return () => window.removeEventListener("resize", read);
        }
    }, [isActive, isMobile]);
    const [hasLive, setHasLive] = useState(false);
    const [liveSessionId, setLiveSessionId] = useState(null);

    useEffect(() => {
        if (typeof newMatchesCount === "number") {
            if (newMatchesCount > prevMatchesCount.current) {
                setFlashCount(newMatchesCount - prevMatchesCount.current);
                setTimeout(() => setFlashCount(0), 1800);
            }
            prevMatchesCount.current = newMatchesCount || 0;
            setLocalNewMatchesCount(newMatchesCount || 0);
        }
    }, [newMatchesCount]);

    // === LIVE индикатор: опрос активной сессии раз в 20 сек ===
    useEffect(() => {
        let timer;
        let aborted = false;
        async function checkLive() {
            if (!transport?.id) return;
            try {
                const res = await authFetchWithRefresh(api(`/track/transport_live_state/${transport.id}`));
                if (!res.ok) { if (!aborted) { setHasLive(false); setLiveSessionId(null); } return; }
                const data = await res.json();
                if (!aborted) {
                    const live = !!data?.live;
                    setHasLive(live);
                    setLiveSessionId(data?.session_id || null);
                }
            } catch (_e) {
                if (!aborted) { setHasLive(false); setLiveSessionId(null); }
            }
        }
        checkLive();
        timer = setInterval(checkLive, 20000);
        return () => { aborted = true; if (timer) clearInterval(timer); };
    }, [transport?.id, authFetchWithRefresh]);

    // === LIVE индикатор: WebSocket-события для транспорта ===
    useEffect(() => {
        if (!transport?.id) return;
        const token = (typeof window !== "undefined" && localStorage.getItem("token")) || "";
        const qs = new URLSearchParams({ transport_id: transport.id, token }).toString();
        const socket = new WebSocket(makeWsUrl(`/ws/track/transport_live?${qs}`));
        socket.onmessage = (e) => {
            try {
                const m = JSON.parse(e.data);
                if (m.type === "snapshot") {
                    setHasLive(!!m.live);
                    setLiveSessionId(m.session_id || null);
                } else if (m.type === "live_start") {
                    setHasLive(true);
                    if (m.session_id) setLiveSessionId(m.session_id);
                } else if (m.type === "live_end") {
                    setHasLive(false);
                    setLiveSessionId(null);
                }
            } catch { }
        };
        socket.onerror = () => { };
        return () => { try { socket.close(); } catch { } };
    }, [transport?.id]);


    async function handleToggleActive() {
        if (!allowActions) return;
        setToggleLoading(true);
        try {
            const resp = await authFetchWithRefresh(
                api(`/transports/${transport.id}/active`),
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: !isActive }),
                }
            );
            if (!resp.ok) {
                let data = {};
                try { data = await resp.json(); } catch { }
                const code = typeof data?.detail === "string" ? data.detail : "";

                if (
                    resp.status === 409 &&
                    (
                        code === "TOO_LATE_TO_ACTIVATE" ||
                        code === "error.order.tooLateToActivate" ||
                        code === "error.transport.tooLateToActivate" ||
                        code.toLowerCase().includes("toolatetoactivate")
                    )
                ) {
                    setShowOverdueModal(true);
                    return;
                }
                alert(code || t("errors.changeStatus", "Ошибка: не удалось изменить статус!"));
                return;
            }
            setIsActive(!isActive);
            if (onToggleActive) onToggleActive();
        } catch {
            setShowOverdueModal(true);
        } finally {
            setToggleLoading(false);
        }
    }

    const cardRef = useRef(null);

    // Автоскролл только по внешнему фокусу (isFocused)
    useEffect(() => {
        if (isFocused && cardRef && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [isFocused]);

    // Красивая анимация подсветки при фокусе (isFocused)
    useEffect(() => {
        if (!isFocused || !cardRef.current) return;
        const node = cardRef.current;
        node.classList.add("flash-highlight");
        setTimeout(() => {
            node.classList.remove("flash-highlight");
        }, 1400);
    }, [isFocused]);

    // Автоскролл по ховеру (хук должен быть на верхнем уровне, а не в JSX)
    useEffect(() => {
        if (!enableHoverScroll) return;
        if (!hoveredItemId || hoveredItemId !== transport?.id) return;
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [hoveredItemId, enableHoverScroll, transport?.id]);

    // --- Компактный текст доступности ---
    function parseDateDMY(str) {
        if (!str) return null;
        const s = String(str).trim();

        // 1) Попробуем нативный парсер, он корректно понимает "MM/DD/YYYY" → Dec 3, 2025
        const direct = new Date(s);
        if (!isNaN(direct)) return direct;

        // 2) ISO YYYY-MM-DD (с optional временем)
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
        if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`);

        // 3) dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy
        const parts = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
        if (parts) {
            const [, d, m, y] = parts;
            return new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        }

        return null;
    }
    function formatAvail(from, to) {
        const render = (v) => {
            const d = parseDateDMY(v);
            return d ? d.toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
        };

        if (from && to && from !== to) {
            return `${render(from)} — ${render(to)}`;
        }
        if (from) return render(from);
        return "—";
    }
    const availText =
        transport?.mode === "постоянно"
            ? (transport?.regularity
                ? `${t("availability.constant", "постоянно")} — ${localizeRegularity(transport.regularity)}`
                : t("availability.constant", "постоянно"))
            : formatAvail(transport.ready_date_from, transport.ready_date_to);

    const metaItems = useMemo(() => {
        const items = [];
        if (transport.transport_kind) {
            items.push({
                key: "kind",
                content: (
                    <span
                        className={limited ? "pw-blur pw-noevents" : ""}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--compact-card-meta-accent)" }}
                    >
                        <FaTruck style={{ marginRight: 3, verticalAlign: -2 }} />
                        <span style={{ fontWeight: 700 }}>{findKindLabelByValue(transport.transport_kind)}</span>
                    </span>
                ),
            });
        }
        items.push({
            key: "avail",
            content: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--compact-card-text-primary)" }}>
                    <FaClock style={{ marginRight: 3, verticalAlign: -2 }} />
                    <span style={{ fontWeight: 700 }}>{availText}</span>
                </span>
            ),
        });
        if (Array.isArray(transport.load_types) && transport.load_types.length > 0) {
            items.push({
                key: "load",
                content: (
                    <span
                        className={limited ? "pw-blur pw-noevents" : ""}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--compact-card-meta-accent)" }}
                    >
                        <span style={{ color: "var(--compact-card-meta-label)" }}>{t("load.label", "Загрузка:")}</span>{" "}
                        <b>{localizeLoadingTypes(transport.load_types).join(", ")}</b>
                    </span>
                ),
            });
        }
        return items;
    }, [findKindLabelByValue, limited, localizeLoadingTypes, t, transport.load_types, transport.transport_kind, availText]);

    // --- Время публикации транспорта (дата/время выставления) ---
    const createdAt = transport?.created_at ? new Date(transport.created_at) : null;
    const createdDateRu = createdAt
        ? createdAt.toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "2-digit" })

        : "";
    const createdTimeRu = createdAt
        ? createdAt.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" })
        : "";
    const createdTitleRu = createdAt ? createdAt.toLocaleString(intl) : "";

    // Направление: готовим текст и флаги наличия частей
    // fromStr не был объявлен → рантайм. Объявляем и нормализуем обе стороны.
    const fromStr =
        (Array.isArray(transport.from_locations) && transport.from_locations.length
            ? (typeof transport.from_locations[0] === "string"
                ? transport.from_locations[0]
                : (transport.from_locations[0]?.location || ""))
            : (transport.from_location || transport.from_city || transport.from || "")) || "";
    const toText = Array.isArray(transport.to_locations) && transport.to_locations.length
        ? transport.to_locations
            .map(tl => (typeof tl === "string" ? tl : (tl?.location || "")))
            .filter(Boolean)
            .join(", ")
        : "";
    const hasFrom = !!(fromStr && String(fromStr).trim());
    const hasTo = !!(toText && String(toText).trim());

    const hasBoth = hasFrom && hasTo;

    // --- Флажки стран (SVG/PNG через CDN)
    const COUNTRY_TO_ISO = {
        "georgia": "GE", "საქართველო": "GE", "gürcüstan": "GE",
        "russia": "RU", "россия": "RU", "рф": "RU",
        "belarus": "BY", "беларусь": "BY",
        "armenia": "AM", "армения": "AM",
        "azerbaijan": "AZ", "azərbaycan": "AZ", "азербайджан": "AZ",
        "turkey": "TR", "türkiye": "TR", "турция": "TR",
        "ukraine": "UA", "украина": "UA",
        "kazakhstan": "KZ", "казахстан": "KZ",
        "poland": "PL", "germany": "DE", "italy": "IT", "france": "FR", "spain": "ES", "portugal": "PT"
    };
    const guessIsoFromText = (text = "") => {
        const tail = String(text).split(",").pop().trim().toLowerCase();
        if (COUNTRY_TO_ISO[tail]) return COUNTRY_TO_ISO[tail];
        for (const [k, v] of Object.entries(COUNTRY_TO_ISO)) { if (tail.includes(k)) return v; }
        return null;
    };
    const Flag = ({ place }) => {
        const iso = guessIsoFromText(place);
        if (!iso) return null;
        const cc = iso.toLowerCase();
        return (
            <img
                alt={iso}
                src={`https://flagcdn.com/16x12/${cc}.png`}
                srcSet={`https://flagcdn.com/32x24/${cc}.png 2x, https://flagcdn.com/48x36/${cc}.png 3x`}
                style={{ width: 18, height: 12, marginRight: 6, borderRadius: 2, display: "inline-block" }}
                loading="lazy"
            />
        );
    };

    const cardStyle = inModal ? {
        background: "var(--compact-card-bg)",
        borderRadius: 14,
        boxShadow: (isFocused || hoveredItemId === transport.id)
            ? "0 0 0 8px #41cfff22"
            : "var(--compact-card-shadow)",
        border: (isFocused || hoveredItemId === transport.id)
            ? "2.5px solid var(--compact-card-border-strong)"
            : "2px solid transparent",
        marginBottom: 17,
        padding: isMobile ? "18px 14px 22px 14px" : 18,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 12 : 20,
        cursor: onClick ? "pointer" : "default",
        cursor: "pointer",
        maxWidth: "100%",
        minWidth: 0,
        width: "100%",
        transform: enableHoverLift && hoveredItemId === transport.id ? "scale(1.012)" : undefined,
        zIndex: (hoveredItemId === transport.id) ? 20 : 1,
        opacity: isActive ? 1 : 0.72,
        transition: "box-shadow .23s, border-color .17s, transform .19s"
    } : {
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        background: "var(--compact-card-bg)",
        borderRadius: 14,
        boxShadow: (isFocused || hoveredItemId === transport.id)
            ? "0 0 0 8px #41cfff22"
            : "var(--compact-card-shadow)",
        border: (isFocused || hoveredItemId === transport.id)
            ? "2.5px solid var(--compact-card-border-strong)"
            : "2px solid transparent",
        // На десктопе убираем ограничение ширины — карточка должна заполнять всю строку
        maxWidth: isMobile ? 960 : "none", // было: 960
        width: "100%",
        marginLeft: "auto",
        marginRight: "auto",
        boxSizing: "border-box",
        // Разрешаем карточке реально сжиматься внутри флекса/грида␊
        minWidth: 0,
        gap: isMobile ? 12 : 20,
        marginBottom: 17,
        padding: isMobile ? "18px 14px 22px 14px" : 18,
        cursor: onClick ? "pointer" : "default",
        cursor: "pointer",
        transform: enableHoverLift && hoveredItemId === transport.id ? "scale(1.012)" : undefined,
        zIndex: (hoveredItemId === transport.id) ? 20 : 1,
        opacity: isActive ? 1 : 0.72,
        transition: "box-shadow .23s, border-color .17s, transform .19s, opacity 0.14s"
    };

    const shownMatches =
        (typeof matchesCount === "number" && matchesCount > 0)
            ? matchesCount
            : (typeof lazyMatchesCount === "number" ? lazyMatchesCount : undefined);

    const chipBase = {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: "0 12px",
        borderRadius: 999,
        border: "none",
        fontWeight: 800,
        fontSize: 12,
    };

    return (
        <div
            className={
                "transport-compact-card" +
                (hoveredItemId === transport.id ? " pin-hovered-card" : "") +
                (isFocused ? " highlight-card disable-hover" : "") +
                (disableAllHover ? " disable-all-hover" : "") +
                (enableHoverLift ? " compact-hover-lift" : "")
            }
            style={{
                ...cardStyle,
                zIndex: (hoveredItemId === transport.id || isFocused) ? 100 : 1,
                position: "relative",
                boxShadow: (hoveredItemId === transport.id || isFocused)
                    ? "0 0 0 8px #41cfff33, 0 2px 8px #121e3844"
                    : cardStyle.boxShadow,
                border: (hoveredItemId === transport.id || isFocused)
                    ? "2.5px solid var(--compact-card-border-strong)"
                    : "2px solid transparent",
                transition: "box-shadow .23s, border-color .17s",
                // Одна карточка в ряд: занимаем всю строку родительского grid/flex
                gridColumn: isMobile ? undefined : "1 / -1",
                flex: isMobile ? undefined : "1 1 100%",
            }}
            onClick={handleCardClick}
            onMouseEnter={() => {
                if (!disableAllHover && !isFocused && setHoveredItemId) setHoveredItemId(transport.id);
            }}
            onMouseLeave={() => {
                if (!disableAllHover && !isFocused && setHoveredItemId) setHoveredItemId(null);
            }}
            ref={cardRef}
            {...rest}
        >
            {/* Просмотры — правый верхний угол */}
            {typeof transport?.views === "number" && (
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
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{transport.views}</span>
                </span>
            )}
            {/* бейдж новых Соответствий (только в модалке) */}
            {inModal && (isNew || transport?.is_new) && (
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
                    {t("common.new", "новое")}
                </span>
            )}
            {/* Метка времени публикации */}
            {transport.created_at && (
                <span
                    title={createdTitleRu}
                    style={{
                        position: "absolute",
                        bottom: 11,
                        right: 16,
                        fontSize: 12,
                        color: "var(--compact-card-timestamp-text)",
                        background: "var(--compact-card-timestamp-bg)",
                        padding: "2px 10px",
                        borderRadius: 11,
                        fontWeight: 500,
                        letterSpacing: 0.1,
                        pointerEvents: "none",
                        userSelect: "none",
                        boxShadow: "0 2px 8px #23416711"
                    }}
                >
                    {createdDateRu}{" "}
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{createdTimeRu}</span>
                </span>
            )}

            {/* автоскролл по ховеру перенесён в верхний useEffect */}

            {/* Левая иконка: скрываем на мобилке, чтобы освободить место */}
            {!isMobile && (
                <div style={{
                    background: "#243356",
                    borderRadius: 8,
                    width: 48, height: 48,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <FaTruck size={26} color="#49b1ff" />
                </div>
            )}

            {/* Центр - основное описание */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {showOwnerBadge && (derivedIsMine || derivedOwnerLabel) && (
                    <div
                        style={{
                            display: "inline-flex",
                            alignSelf: "flex-start",   // ⬅️ не растягивать на всю ширину колонки
                            maxWidth: "max-content",   // ⬅️ ширина по содержимому (поддержка Safari/Firefox)
                            alignItems: "center",
                            gap: 6,
                            margin: "0 0 6px",
                            padding: "3px 8px",
                            borderRadius: 10,
                            background: isMine ? "var(--compact-card-owner-mine-bg)" : "var(--compact-card-owner-other-bg)",
                            border: isMine ? "1px solid var(--compact-card-owner-mine-border)" : "1px solid var(--compact-card-owner-other-border)",
                            color: isMine ? "var(--compact-card-owner-mine-strong)" : "var(--compact-card-owner-other-text)",
                            fontWeight: 800,
                            fontSize: 12,
                            letterSpacing: ".01em"
                        }}
                    >
                        {derivedIsMine
                            ? t("transport.mine", "Ваш транспорт")
                            : <>{t("transport.ownerPrefix", "Транспорт")}: <span style={{ color: "var(--compact-card-owner-other-strong)" }}>{derivedOwnerLabel}</span></>}
                    </div>
                )}
                {/* Заголовок (тип кузова) — ОСТАЁТСЯ видимым */}
                <div style={{
                    fontWeight: 800,
                    fontSize: isMobile ? 15 : 18,
                    color: "var(--compact-card-accent)",
                    marginBottom: 3,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textTransform: "uppercase",
                    letterSpacing: ".01em"
                }}>
                    <span style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        /* на мобилке разрешаем перенос, чтобы не резалось зря */
                        whiteSpace: isMobile ? "normal" : "nowrap"
                    }}>
                        {/* Маленькая иконка перед типом кузова — только на мобилке */}
                        {isMobile && <FaTruck size={14} style={{ marginRight: 6, verticalAlign: -2 }} />}
                        {findBodyLabelByValue(transport.truck_type) || "—"}
                    </span>
                    {!hideLive && hasLive && canSeeLive && (
                        <span
                            title={t("gps.liveMonitoring", "Идёт GPS-мониторинг")}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                marginLeft: "auto",
                                background: "#123524",
                                border: "1px solid #29d17d",
                                color: "#a9f5cd",
                                fontWeight: 800,
                                fontSize: 11.5,
                                padding: "3px 8px",
                                borderRadius: 999
                            }}
                            onClick={(e) => { e.stopPropagation(); }}
                        >
                            <span style={{
                                width: 8, height: 8, borderRadius: 999,
                                background: "#33de7b",
                                boxShadow: "0 0 10px #33de7b, 0 0 18px #33de7b55"
                            }} />
                            {t("gps.live", "LIVE")}
                        </span>
                    )}
                </div>

                {/* Ряд «Актив/GPS/Ещё» — полностью скрываем в списке, если hideActions */}
                {!hideActions && (
                    <>
                        {/* тут остаётся ваш существующий блок со статусом/кнопками, без изменений */}
                    </>
                )}

                {/* Направление — ОСТАЁТСЯ видимым */}
                {routeStacked && hasBoth ? (
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "start", gap: 9, marginTop: 4 }}>
                        <div style={{ width: 16 }} />
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: isMobile ? 15 : 17, color: "var(--compact-card-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                <Flag place={fromStr} />{fromStr}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: isMobile ? 15 : 17, color: "var(--compact-card-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                <span style={{ color: "var(--compact-card-accent)", fontWeight: 400, marginRight: 4 }}>→</span>
                                <Flag place={toText} />{toText}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: 13, color: "var(--compact-card-text-secondary)", fontWeight: 400, overflow: "visible", whiteSpace: "normal", textOverflow: "clip", lineHeight: 1.25, marginTop: 2, minWidth: 0 }}>
                        {hasFrom && <><Flag place={fromStr} />{fromStr}</>}
                        {hasFrom && hasTo && " → "}
                        {hasTo && <><Flag place={toText} />{toText}</>}
                    </div>
                )}
                {/* Ключевые параметры: вид ТС, доступность, загрузка */}
                {metaItems.length > 0 && (
                    <div
                        style={{
                            color: "var(--compact-card-text-secondary)",
                            fontSize: isMobile ? 12 : 15,
                            marginTop: isMobile ? 10 : 6,
                            display: isMobile ? "flex" : "grid",
                            gap: isMobile ? 12 : 8,
                            gridTemplateColumns: isMobile ? undefined : "repeat(auto-fit, minmax(180px, 1fr))",
                            alignItems: "center",
                            minWidth: 0,
                            flexWrap: isMobile ? "wrap" : undefined,
                        }}
                    >
                        {metaItems.map(({ key, content }) => (
                            <span
                                key={key}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    minWidth: 0,
                                    whiteSpace: "normal",
                                    wordBreak: "break-word",
                                }}
                            >
                                {content}
                            </span>
                        ))}
                    </div>
                )}

                {/* Бейджи транспорта (как в грузах), без видов загрузки */}
                {showTransportBadges && (
                    <div className={limited ? "pw-blur pw-overlay pw-noevents" : ""} style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(() => {
                            const pill = { display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 10, border: "1px solid var(--compact-card-pill-border)", background: "var(--compact-card-pill-bg)", color: "var(--compact-card-pill-text)", fontWeight: 800, fontSize: 12, lineHeight: 1 };
                            const pillDanger = { ...pill, border: "1.5px solid var(--compact-card-pill-danger-border)", background: "var(--compact-card-pill-danger-bg)", color: "var(--compact-card-pill-danger-text)" };
                            const adr = !!(transport.adr || transport.ADR || transport.hazmat);
                            const tFrom = transport.temp_from ?? transport.temperature_from ?? null;
                            const tTo = transport.temp_to ?? transport.temperature_to ?? null;
                            const tMode = transport.temp_mode ?? transport.temperature_mode ?? null;
                            let tempText = null;
                            const hasFromT = tFrom !== undefined && tFrom !== null && `${tFrom}`.trim() !== "";
                            const hasToT = tTo !== undefined && tTo !== null && `${tTo}`.trim() !== "";
                            if (hasFromT || hasToT) tempText = hasFromT && hasToT ? `${tFrom}…${tTo}°C` : `${hasFromT ? tFrom : tTo}°C`;
                            else if (typeof tMode === "string" && tMode.trim()) tempText = tMode.trim();
                            const volume = transport.body_volume ?? transport.volume ?? null;
                            const L = transport.length_m ?? transport.length, W = transport.width_m ?? transport.width, H = transport.height_m ?? transport.height;
                            const dims = (L && W && H) ? `${L}×${W}×${H} ${t("units.meterShort", "м")}` : null;
                            const pallets = transport.pallets ?? transport.pallet_places ?? null;
                            return (
                                <>
                                    {adr && <span style={pillDanger}><FaRadiation style={{ marginRight: 6, verticalAlign: -2 }} />ADR</span>}
                                    {tempText && <span style={pill}><FaThermometerHalf style={{ marginRight: 6, verticalAlign: -2 }} />{t("badge.temp", "Темп")}: {tempText}</span>}
                                    {volume && <span style={pill}><FaCubes style={{ marginRight: 6, verticalAlign: -2 }} />{t("badge.volume", "Объём")}: {volume}</span>}
                                    {dims && <span style={pill}><FaRulerCombined style={{ marginRight: 6, verticalAlign: -2 }} />{t("badge.dimensions", "Габариты")}: {dims}</span>}
                                    {pallets && <span style={pill}><FaBoxes style={{ marginRight: 6, verticalAlign: -2 }} />{t("badge.pallets", "Паллеты")}: {pallets}</span>}
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>



            {/* Правая часть: Соответствия + кнопки */}
            {!hideActions && (
                <div className={limited ? "pw-blur pw-noevents" : ""} style={{
                    // показываем колонку, если есть onShowMatches ИЛИ разрешены действия
                    display: (onShowMatches || allowActions) ? "flex" : "none",
                    flexDirection: isMobile ? "row" : "column",
                    flexWrap: isMobile ? "wrap" : "nowrap",
                    alignItems: isMobile ? "stretch" : "center",
                    justifyContent: isMobile ? "flex-start" : "center",
                    marginLeft: isMobile ? 0 : 12,
                    marginRight: isMobile ? 0 : 8,
                    minWidth: isMobile ? "100%" : 0,
                    position: "relative",
                    paddingTop: isMobile ? 2 : 0,
                    paddingBottom: isMobile ? 6 : 0,
                    gap: isMobile ? 8 : 10,
                }}>
                    {/* Соответствия — кнопка сверху */}
                    {allowActions && onShowMatches && (
                        <button
                            onClick={async e => {
                                e.stopPropagation();
                                if (!allowActions) return;
                                if (onMatchesViewed) await onMatchesViewed();
                                setLocalNewMatchesCount?.(0);
                                // Мобилка: уходим на экран «Соответствий» с фильтром по ТС
                                // Десктоп: прежняя модалка
                                if (isMobile && transport?.id) {
                                    try { router.push(`/matches?transportId=${transport.id}`); } catch { }
                                } else {
                                    onShowMatches(transport?.id);
                                }
                            }}
                            style={{
                                minWidth: 0,
                                padding: "7px 16px", // чуть больше паддинга
                                background: localNewMatchesCount > 0 ? "var(--compact-card-matches-new-bg)" : "var(--compact-card-matches-bg)",
                                color: "var(--compact-card-matches-text)",
                                border: "none",
                                borderRadius: 11,
                                fontWeight: 600,
                                fontSize: 14,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 5,
                                boxShadow: localNewMatchesCount > 0 ? "var(--compact-card-matches-shadow)" : undefined,
                                position: "relative",
                                transition: "background .18s",
                                whiteSpace: "nowrap",
                                marginBottom: isMobile ? 0 : 8,
                                width: isMobile ? "100%" : undefined,
                            }}
                            title={
                                localNewMatchesCount > 0
                                    ? t("matches.newCount", "Новых соответствий: {count}").replace("{count}", String(localNewMatchesCount)) +
                                    (typeof shownMatches === "number" ? ` / ${t("matches.totalCount", "Суммарно: {count}").replace("{count}", String(shownMatches))}` : "")
                                    : (typeof shownMatches === "number"
                                        ? t("matches.totalCount", "Суммарно: {count}").replace("{count}", String(shownMatches))
                                        : t("matches.show", "Показать совпадения"))
                            }
                        >
                            <FaLink size={17} color="var(--compact-card-matches-text)" style={{ marginRight: 5, flexShrink: 0 }} />
                            {localNewMatchesCount > 0 && (
                                <span style={{
                                    marginLeft: 6,
                                    fontWeight: 800,
                                    fontSize: 13,
                                    padding: "1px 8px",
                                    borderRadius: 999,
                                    background: "#14532d",
                                    color: "#fff"
                                }}>{localNewMatchesCount}</span>
                            )}
                            {/* Вот тут — одной строкой! */}
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                                {typeof shownMatches === "number"
                                    ? t("matches.count", "{count} соответствий").replace("{count}", String(shownMatches))
                                    : t("matches.title", "Совпадения")}
                            </span>
                        </button>
                    )}

                    {/* Кнопки действий */}
                    {!isMobile ? (
                        /* --- Desktop: оставляем вашу текущую решётку 4x (без изменений) --- */
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 44px)",
                            gap: 10,
                            marginTop: 12
                        }}>
                            {/* Тумблер (только для своих в менеджерском кабинете) */}
                            <div>
                                {typeof transport.is_active !== "undefined" && !hideStatus && allowActions && (
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (!toggleLoading) handleToggleActive();
                                        }}
                                        style={{
                                            background: isActive
                                                ? "var(--compact-card-action-active-bg)"
                                                : "var(--compact-card-action-archive-bg)",
                                            border: "none",
                                            borderRadius: 7,
                                            width: 44,
                                            height: 44,
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            cursor: "pointer",
                                            boxShadow: isActive
                                                ? "0 1px 5px var(--compact-card-action-active-shadow)"
                                                : undefined,
                                            transition: ".13s"
                                        }}
                                        title={
                                            isActive
                                                ? t("card.deactivateTransportHint", "Скрыть транспорт для всех (перевести в неактивные)")
                                                : t("card.activateTransportHint", "Сделать транспорт снова активным (видимым для поиска)")
                                        }
                                    >
                                        <span style={{
                                            fontSize: 18, fontWeight: 800,
                                            color: isActive
                                                ? "var(--compact-card-action-active-text)"
                                                : "var(--compact-card-action-archive-text)",
                                            marginBottom: 2,
                                        }}>
                                            {isActive ? "✓" : "—"}
                                        </span>
                                        <span style={{
                                            fontSize: 11,
                                            color: isActive
                                                ? "var(--compact-card-action-active-text)"
                                                : "var(--compact-card-action-archive-text)",
                                            fontWeight: 600,
                                            lineHeight: 1,
                                            opacity: 0.93
                                        }}>
                                            {isActive ? t("card.active", "Актив") : t("card.archive", "Архив")}
                                        </span>
                                    </button>
                                )}
                            </div>
                            {/* Share location (кнопка активна только для своих). Скрыта в модалках Соответствий */}
                            {!inModal && !hideLive && (
                                <div>
                                    <button
                                        title={allowActions ? t("gps.share", "Поделиться локацией") : t("gps.onlyOwn", "Доступно только для ваших транспортов")}
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
                                            cursor: allowActions ? "pointer" : "not-allowed",
                                            transition: ".13s",
                                            boxShadow: "var(--compact-card-gps-shadow)",
                                            position: "relative",
                                            opacity: allowActions ? 1 : .45
                                        }}
                                        onClick={e => { e.stopPropagation(); setShowSoon(true); }}
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
                                        {/* LIVE-индикатор с пульсом (только свои) */}
                                        {!hideLive && hasLive && canSeeLive && (
                                            <span
                                                style={{
                                                    position: "absolute",
                                                    top: 6, right: 6,
                                                    width: 10, height: 10,
                                                    pointerEvents: "none"
                                                }}
                                            >
                                                {/* ядро точки */}
                                                <span style={{
                                                    position: "absolute",
                                                    inset: 0,
                                                    borderRadius: 999,
                                                    background: "#33de7b",
                                                    boxShadow: "0 0 8px #33de7b, 0 0 14px #33de7b66"
                                                }} />
                                                {/* пульсирующее кольцо */}
                                                <span className="live-pulse-ring" />
                                            </span>
                                        )}
                                        {/* локальные стили для пульса */}
                                        <style jsx>{`
                              .live-pulse-ring{
                                position:absolute;
                                top:-4px; left:-4px; right:-4px; bottom:-4px;
                                border-radius:9999px;
                                border:2px solid #33de7b;
                                opacity:.6;
                                animation: livePulse 1.6s ease-out infinite;
                              }
                              @keyframes livePulse{
                                0%{ transform: scale(0.6); opacity:.8; }
                                70%{ transform: scale(1.6); opacity:0; }
                                100%{ transform: scale(1.6); opacity:0; }
                              }
                            `}</style>
                                    </button>
                                </div>
                            )}

                            {/* Редактировать (только свои в менеджерском кабинете) */}
                            <div>
                                {typeof onEdit === "function" && allowActions && (
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
                                            cursor: "pointer"
                                        }}
                                        onClick={e => {
                                            e.stopPropagation();
                                            if (!allowActions) return;
                                            onEdit && onEdit();
                                        }}
                                    >
                                        <FaEdit color="#fff" size={17} style={{ marginBottom: 2 }} />
                                        <span style={{
                                            fontSize: 11,
                                            color: "var(--compact-card-edit-text)",
                                            fontWeight: 600,
                                            lineHeight: 1
                                        }}>
                                            {t("common.editShort", "Ред.")}
                                        </span>
                                    </button>
                                )}
                            </div>
                            {/* Удалить */}
                            <div>
                                {typeof onDelete === "function" && allowActions && (
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
                                            cursor: "pointer"
                                        }}
                                        onClick={e => {
                                            e.stopPropagation();
                                            onDelete && onDelete();
                                        }}
                                    >
                                        <FaTrash color="#fff" size={17} style={{ marginBottom: 2 }} />
                                        <span style={{
                                            fontSize: 11,
                                            color: "var(--compact-card-delete-text)",
                                            fontWeight: 600,
                                            lineHeight: 1
                                        }}>
                                            {t("common.delete", "Удалить")}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* --- Mobile: 2 чипа + кнопка "Ещё" --- */
                        <div style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 8,
                            paddingRight: 0
                        }}>
                            {/* Актив/Архив как чип (идентично Cargo) */}
                            {allowActions && typeof transport?.is_active !== "undefined" && (
                                <button
                                    ref={activeChipRef}
                                    onClick={(e) => { e.stopPropagation(); if (!toggleLoading) handleToggleActive(); }}
                                    title={isActive ? t("card.toArchive", "Перевести в архив") : t("card.makeActive", "Сделать активным")}
                                    style={{
                                        ...chipBase,
                                        background: isActive
                                            ? "var(--compact-card-action-active-bg)"
                                            : "var(--compact-card-action-archive-bg)",
                                        color: isActive
                                            ? "var(--compact-card-action-active-text)"
                                            : "var(--compact-card-action-archive-text)",
                                        whiteSpace: "nowrap",
                                        cursor: "pointer",
                                        boxShadow: isActive
                                            ? "0 1px 5px var(--compact-card-action-active-shadow)"
                                            : "0 0 0 1px var(--compact-card-pill-border)",
                                        flex: "1 1 130px"
                                    }}
                                >
                                    <span style={{ fontSize: 14, lineHeight: 1 }}>{isActive ? "✓" : "—"}</span>
                                    <span>{isActive ? t("card.active", "Актив") : t("card.archive", "Архив")}</span>
                                </button>
                            )}

                            {/* GPS share как чип (живой индикатор остаётся) */}
                            {!inModal && !hideLive && (
                                <button
                                    title={allowActions ? t("gps.share", "Поделиться локацией") : t("gps.onlyOwnShort", "Доступно только для своих")}
                                    onClick={(e) => { e.stopPropagation(); setShowSoon(true); }}
                                    style={{
                                        ...chipBase,
                                        background: "var(--compact-card-pill-bg)",
                                        color: "var(--compact-card-pill-text)",
                                        cursor: allowActions ? "pointer" : "not-allowed",
                                        opacity: allowActions ? 1 : .45,
                                        position: "relative",
                                        boxShadow: "0 0 0 1px var(--compact-card-pill-border)",
                                        width: chipWidth || undefined,
                                        justifyContent: "space-between",
                                        flex: "1 1 130px"
                                    }}
                                >
                                    <FaShareAlt size={14} />
                                    <span>{t("gps.short", "GPS")}</span>
                                    {!hideLive && hasLive && canSeeLive && (
                                        <span style={{ position: "absolute", top: -4, right: -4, width: 10, height: 10 }}>
                                            <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: "#33de7b" }} />
                                            <span className="live-pulse-ring" />
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Ещё — открывает bottom-sheet со всеми действиями */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setMobileActionsOpen(true); }}
                                title={t("common.more", "Ещё")}
                                style={{
                                    ...chipBase,
                                    background: "var(--compact-card-pill-bg)",
                                    color: "var(--compact-card-pill-text)",
                                    cursor: "pointer",
                                    boxShadow: "0 0 0 1px var(--compact-card-pill-border)",
                                    width: chipWidth || undefined,
                                    justifyContent: "space-between",
                                    flex: "1 1 130px"
                                }}
                            >
                                <FaEllipsisH size={14} />
                                <span>{t("common.more", "Ещё")}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
            {/* ^ закрываем внешний правый столбец действий после тернарника */}

            {/* Chevron справа */}
            <FaChevronRight
                color="#43c8ff"
                style={{
                    marginLeft: isMobile ? 0 : 14,
                    fontSize: 22,
                    position: isMobile ? "absolute" : "static",
                    right: isMobile ? 10 : undefined,
                    top: isMobile ? "50%" : undefined,
                    transform: isMobile ? "translateY(-50%)" : undefined,
                    pointerEvents: "none"
                }}
            />

            {/* Заглушка: единая модалка "Скоро доступно" */}
            {showSoon && ReactDOM.createPortal(
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
                                style={{ background: "var(--compact-card-accent)", color: "var(--text-on-brand)", border: "none", borderRadius: 9, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}
                            >
                                {t("common.ok", "Понятно")}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Mobile actions sheet */}
            {!hideActions && isMobile && mobileActionsOpen && ReactDOM.createPortal(
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
                                onClick={() => { setMobileActionsOpen(false); handleCardClick(); }}
                                style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--compact-card-pill-border)", background: "var(--compact-card-bg)", color: "var(--compact-card-text-primary)", fontWeight: 800, textAlign: "left" }}
                            >{t("card.open", "Открыть карточку")}</button>


                            {allowActions && typeof transport?.is_active !== "undefined" && (
                                <button
                                    onClick={() => {
                                        armClickGuard(400);
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
                                    {isActive ? t("card.toArchive", "Перевести в архив") : t("card.makeActive", "Сделать активным")}
                                </button>
                            )}

                            {typeof onEdit === "function" && allowActions && (
                                <button
                                    onClick={() => { armClickGuard(400); setMobileActionsOpen(false); onEdit && onEdit(); }}
                                    style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #2a4872", background: "#14324b", color: "#d6e9ff", fontWeight: 800, textAlign: "left" }}
                                >{t("common.edit", "Редактировать")}</button>
                            )}

                            {typeof onDelete === "function" && allowActions && (
                                <button
                                    onClick={() => { armClickGuard(400); setMobileActionsOpen(false); onDelete && onDelete(); }}
                                    style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #5b1e2a", background: "#2a0f19", color: "#ffd6e0", fontWeight: 800, textAlign: "left" }}
                                >{t("common.delete", "Удалить")}</button>
                            )}

                            <button
                                onClick={() => { armClickGuard(400); setMobileActionsOpen(false); }}
                                style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: "transparent", color: "#9cc4e7", fontWeight: 800 }}
                            >{t("common.cancel", "Отмена")}</button>
                        </div>
                    </div>
                </div>,
                document.body
            )
            }

            {/* Модалка блокировки активации */}
            {
                showOverdueModal && ReactDOM.createPortal(
                    <div
                        style={{
                            position: "fixed",
                            left: 0, top: 0, width: "100vw", height: "100vh",
                            background: "#001a", zIndex: 9999,
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}
                        onClick={e => {
                            e.stopPropagation();
                            setShowOverdueModal(false);
                        }}
                    >
                        <div
                            style={{
                                background: "#22304b",
                                color: "#fff",
                                borderRadius: 18,
                                padding: "32px 28px",
                                fontSize: 18,
                                boxShadow: "0 8px 42px #00184499",
                                maxWidth: 400,
                                minWidth: 220,
                                textAlign: "center",
                                position: "relative"
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowOverdueModal(false)}
                                style={{
                                    position: "absolute",
                                    top: 12, right: 15,
                                    background: "none", border: "none",
                                    color: "#7aa3cc",
                                    fontSize: 23,
                                    cursor: "pointer",
                                    padding: 0,
                                    lineHeight: 1,
                                    zIndex: 1
                                }}
                                title={t("common.close", "Закрыть")}
                            >×</button>
                            <b>{t("transport.overdue.title", "Заявка просрочена!")}</b>
                            <div style={{ margin: "18px 0 8px 0", fontSize: 17 }}>
                                {t("transport.overdue.body1", "Для повторной активации транспорта")}<br />
                                <b>{t("transport.overdue.bodyBold", "обновите дату")}</b> {t("transport.overdue.body2", "на актуальную.")}
                            </div>
                            <button
                                onClick={() => {
                                    setShowOverdueModal(false);
                                    onEdit && onEdit();
                                }}
                                style={{
                                    background: "#43c8ff",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 9,
                                    padding: "8px 22px",
                                    fontWeight: 700,
                                    fontSize: 15,
                                    marginTop: 12,
                                    cursor: "pointer"
                                }}
                            >
                                {t("transport.overdue.updateBtn", "Обновить дату")}
                            </button>
                        </div>
                    </div>,
                    document.body
                )
            }
        </div >
    );
}
