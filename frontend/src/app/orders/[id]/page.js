"use client";
import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useIsMobile } from "../../../hooks/useIsMobile";
import dynamic from "next/dynamic";
import ReactCountryFlag from "react-country-flag";
import countries from "i18n-iso-countries";
import "i18n-iso-countries/langs/en.json";
import "i18n-iso-countries/langs/ru.json";
import "i18n-iso-countries/langs/tr.json";
import "i18n-iso-countries/langs/ka.json";
import { FaUserCircle } from "react-icons/fa";
import MiniUserCard from "@/app/components/MiniUserCard";
import { FaGavel } from "react-icons/fa";
import { AnimatePresence, motion } from "framer-motion";
import { FaFileAlt, FaEye } from "react-icons/fa";
import SafeBoundary from "@/app/components/SafeBoundary";
import SaveToggleButton from "@/app/components/SaveToggleButton";
import OrderShareButtons from "@/app/components/OrderShareButtons";
import { CURRENCIES, formatPrice } from "@/app/utils/currency";
import { api, abs } from "@/config/env";
import { useLang } from "@/app/i18n/LangProvider";
import { LOADING_TYPES, getTruckBodyTypes, getLoadingTypes } from "@/app/components/truckOptions";
import PaywallModal from "@/app/components/PaywallModal";
import { useUser } from "@/app/UserContext";
import { useTheme } from "@/app/providers/ThemeProvider";

// ADR классы — через t()
const getAdrClassInfo = (t) => ({
    "1": t("adr.info.1", "Класс 1: Взрывчатые вещества и изделия"),
    "2": t("adr.info.2", "Класс 2: Газы"),
    "3": t("adr.info.3", "Класс 3: Легковоспламеняющиеся жидкости"),
    "4": t("adr.info.4", "Класс 4: Легковоспламеняющиеся твёрдые вещества"),
    "5": t("adr.info.5", "Класс 5: Окисляющие вещества и органические перекиси"),
    "6": t("adr.info.6", "Класс 6: Ядовитые и инфекционные вещества"),
    "7": t("adr.info.7", "Класс 7: Радиоактивные материалы"),
    "8": t("adr.info.8", "Класс 8: Коррозионные вещества"),
    "9": t("adr.info.9", "Класс 9: Прочие опасные вещества"),
});

countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ru.json"));
countries.registerLocale(require("i18n-iso-countries/langs/tr.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ka.json"));

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
                borderRadius: 5,
                marginRight: 8,
                marginLeft: -2,
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

const OrderRouteMap = dynamic(() => import("../../components/OrderRouteMap"), {
    ssr: false,
    loading: () => <div style={{ height: 220, background: "var(--surface-soft)", borderRadius: 16 }} />,
});

// SVG ICONS
const icons = {
    route: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <path d="M7 7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7C17 11.5 12 21 12 21C12 21 7 11.5 7 7Z" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="7" r="2" fill="currentColor" />
        </svg>
    ),
    pay: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
        </svg>
    ),
    cargo: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <rect x="4" y="8" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="currentColor" strokeWidth="2" />
        </svg>
    ),
    truck: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <rect x="1" y="7" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <rect x="16" y="11" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
            <circle cx="5.5" cy="19.5" r="1.5" fill="currentColor" />
            <circle cx="18.5" cy="19.5" r="1.5" fill="currentColor" />
        </svg>
    ),
    customs: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <path d="M12 2L2 7v7c0 5 10 9 10 9s10-4 10-9V7l-10-5z" stroke="currentColor" strokeWidth="2" />
            <path d="M9 14l6-6" stroke="currentColor" strokeWidth="2" />
            <path d="M15 14H9v-6" stroke="currentColor" strokeWidth="2" />
        </svg>
    ),
    contact: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M4 20v-1a6 6 0 0 1 12 0v1" stroke="currentColor" strokeWidth="2" />
        </svg>
    ),
    files: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 2v4a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="2" />
        </svg>
    ),
    comment: (
        <svg width="22" height="22" style={{ marginRight: 10, color: "#43c8ff" }} fill="none" viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" stroke="currentColor" strokeWidth="2" />
        </svg>
    ),
};

const getColors = (theme = "dark") => ({
    pageBg: "var(--bg-body)",
    cardBg: "var(--surface)",
    border: theme === "light" ? "var(--border-subtle)" : "var(--border-strong)",
    text: "var(--text-primary)",
    heading: "var(--text-primary)",
    muted: "var(--text-secondary)",
    accent: "var(--brand-blue)",
    accentSoft: theme === "light" ? "color-mix(in srgb, var(--brand-blue) 16%, transparent)" : "rgba(129, 202, 255, 0.16)",
    highlight: "var(--brand-orange)",
    shadow: "var(--shadow-soft)",
    pillBg: "var(--surface-soft)",
});

// --- Helpers for attachments (как в транспортах) ---
function getExt(name = "") {
    const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
}
function isImageByExt(ext) {
    return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext);
}
function normalizeAttachments(raw = []) {
    return (raw || [])
        .map((it) => {
            if (!it) return null;
            if (typeof it === "string") {
                const ext = getExt(it);
                return {
                    url: it,
                    name: it.split("/").pop(),
                    kind: isImageByExt(ext) ? "image" : "file",
                    ext,
                };
            }
            const url = it.file_url || it.url || it.href || "";
            const name = it.name || it.filename || (url ? url.split("/").pop() : "file");
            const ext = getExt(name) || getExt(url);
            const kind =
                it.file_type === "images" || it.type === "images" || isImageByExt(ext)
                    ? "image"
                    : "file";
            return { url, name, kind, ext };
        })
        .filter(Boolean);
}
// Централизованные хелперы из @/config/env:
//  - api('/path') -> https://api.transinfo.ge/path
//  - abs('/file') -> https://api.transinfo.ge/file
function FileIcon({ ext }) {
    const upper = (ext || "").toUpperCase();
    return (
        <span
            style={{
                width: 28,
                height: 28,
                minWidth: 28,
                minHeight: 28,
                borderRadius: 7,
                background: "#1f2f4d",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "#9fd3ff",
                border: "1px solid #27446d",
            }}
        >
            {upper || "FILE"}
        </span>
    );
}

export default function OrderDetailsPage() {
    // Достаём контексты единообразно, без условных вызовов хуков
    const langCtx = useLang();
    const { t } = langCtx || { t: (_k, f) => f };
    // ОДНА декларация useUser на весь компонент
    const userCtx = useUser();
    const { user, authFetchWithRefresh } = userCtx || {};
    // Витрины: label = перевод, value = канон (RU)
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const LOADING_TYPES_I18N = useMemo(() => getLoadingTypes(t), [t]);

    // Лейбл типа кузова по канон. value (без учёта регистра/пробелов)
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

    // Локализация списка видов загрузки (данные остаются каноном)
    const localizeLoadingTypes = useCallback((arr) => {
        const i18n = LOADING_TYPES_I18N || [];
        return (arr || []).map(v => {
            const idx = LOADING_TYPES.findIndex(x => String(x).toLowerCase() === String(v).toLowerCase());
            return idx >= 0 ? (i18n[idx] || v) : v;
        });
    }, [LOADING_TYPES_I18N]);

    // === helpers ДОЛЖНЫ быть объявлены до использования ниже в transportSection/paySection ===
    const normalize = (s) =>
        String(s || "")
            .normalize("NFKC")
            .replace(/[\u00A0\u202F\u2009]+/g, " ")
            .trim()
            .toLowerCase();

    // Тип ставки (rate_type)
    const localizeRateType = useCallback((raw) => {
        const s = normalize(raw);
        if (!s) return "";
        if (["торги", "аукцион"].includes(s)) return t("bargain.auction", "Торги");
        if (["без торга", "нет торга"].includes(s)) return t("bargain.no", "Без торга");
        if (["фикс", "фиксированная", "фиксированная цена", "фиксированная ставка"].includes(s))
            return t("bargain.fixed", "Фикс");
        if (["по договоренности", "договорная"].includes(s))
            return t("bargain.negotiable", "По договоренности");
        return raw;
    }, [t]);

    // Разрешён ли торг (логика показа кнопки «Ставки»)
    const isBargainAllowed = useCallback((raw) => {
        const s = normalize(raw);
        return s ? !["без торга", "нет торга"].includes(s) : true;
    }, []);

    // Тип перевозки (если backend прислал RU)
    const localizeTransportType = useCallback((raw) => {
        const s = normalize(raw);
        if (!s) return "";
        if (s === "экспорт") return t("transport.type.export", "Экспорт");
        if (s === "импорт") return t("transport.type.import", "Импорт");
        if (s === "транзит") return t("transport.type.transit", "Транзит");
        if (["внутренняя", "внутренний рынок", "по стране"].includes(s))
            return t("transport.type.domestic", "Внутренняя");
        return raw;
    }, [t]);
    const isMobile = useIsMobile();
    const params = useParams();
    const { id } = params;
    const router = useRouter();
    const searchParams = useSearchParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ownerUser, setOwnerUser] = useState(null);
    const [viewsCount, setViewsCount] = useState(0);
    const highlightParam = searchParams?.get("highlight");
    const shouldHighlight = highlightParam === "1";

    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const COLORS = useMemo(() => getColors(resolvedTheme), [resolvedTheme]);
    const routeColors = useMemo(
        () => ({
            barBackground:
                resolvedTheme === "light"
                    ? COLORS.accentSoft
                    : "linear-gradient(90deg, #183969 38%, #253759 100%)",
            barText: resolvedTheme === "light" ? COLORS.heading : "#fff",
            city: resolvedTheme === "light" ? COLORS.accent : "#8ecae6",
            arrow: resolvedTheme === "light" ? COLORS.highlight : "#43c8ff",
            text: resolvedTheme === "light" ? COLORS.text : "#fff",
            shadow: resolvedTheme === "light" ? "var(--shadow-soft)" : "0 2px 8px #43c8ff17",
        }),
        [COLORS.accent, COLORS.accentSoft, COLORS.heading, COLORS.highlight, COLORS.text, resolvedTheme]
    );

    const bidColors = useMemo(
        () =>
            resolvedTheme === "light"
                ? {
                      overlay: "linear-gradient(135deg, #e8f1ffcc, #dbeafecc)",
                      panelBg: "var(--surface)",
                      panelShadow: "0 12px 40px rgba(15, 23, 42, 0.14)",
                      title: COLORS.heading,
                      closeBg: "var(--control-bg)",
                      closeBorder: `1px solid ${COLORS.border}`,
                      closeText: COLORS.text,
                      listBg: "var(--surface-soft)",
                      listPrimary: COLORS.text,
                      listSecondary: COLORS.muted,
                      yourBadgeBg: "color-mix(in srgb, var(--brand-blue) 18%, #ffffff)",
                      yourBadgeText: COLORS.heading,
                      inputBg: "var(--input)",
                      inputBorder: `1.2px solid ${COLORS.border}`,
                      inputText: COLORS.text,
                      primaryBtnBg: "#43c8ff",
                      primaryBtnText: "#0b1a2f",
                  }
                : {
                      overlay: "linear-gradient(135deg, #0a1628cc, #0f203acc)",
                      panelBg: "#222e44",
                      panelShadow: "0 8px 40px #43c8ff44",
                      title: "#43c8ff",
                      closeBg: "#1a2a44",
                      closeBorder: "1px solid #2a4470",
                      closeText: "#d7e9ff",
                      listBg: "#182234",
                      listPrimary: "#fff",
                      listSecondary: "#8ecae6",
                      yourBadgeBg: "#11284a",
                      yourBadgeText: "#ffd600",
                      inputBg: "#1a253a",
                      inputBorder: "1.2px solid #2e415f",
                      inputText: "#fff",
                      primaryBtnBg: "#43c8ff",
                      primaryBtnText: "#0b1a2f",
                  },
        [COLORS.border, COLORS.heading, COLORS.muted, COLORS.text, resolvedTheme]
    );

    const [showBidPanel, setShowBidPanel] = useState(false);
    const [allBids, setAllBids] = useState([]);
    const [loadingBids, setLoadingBids] = useState(false);
    const [yourBid, setYourBid] = useState(null);
    const [loadingBid, setLoadingBid] = useState(true);
    const [amount, setAmount] = useState("");
    const [bidCurrency, setBidCurrency] = useState("");
    const [bidComment, setBidComment] = useState("");
    const [sending, setSending] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);


    const bidPanelRef = useRef();
    const mapRef = useRef(null);
    const highlightRef = useRef(null);

    const actionPillStyle = useMemo(() => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: isMobile ? "7px 12px" : "7px 14px",
        borderRadius: 999,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.pillBg,
        color: COLORS.heading,
        fontWeight: 600,
        fontSize: isMobile ? 14 : 15,
        cursor: "pointer",
        transition: "border-color .15s ease, box-shadow .15s ease, opacity .15s ease, transform .12s ease",
    }), [COLORS.border, COLORS.heading, COLORS.pillBg, isMobile]);

    const backButtonStyle = useMemo(
        () =>
            isMobile
                ? {
                    ...actionPillStyle,
                    padding: "8px 12px",
                    boxShadow: COLORS.shadow,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                }
                : {
                    background: COLORS.accent,
                    color: "#ffffff",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 10,
                    padding: "11px 18px",
                    fontWeight: 800,
                    fontSize: 18,
                    boxShadow: COLORS.shadow,
                    cursor: "pointer",
                },
        [COLORS.accent, COLORS.border, COLORS.shadow, actionPillStyle, isMobile]
    );

    // Для edge-swipe назад
    const dragStartX = useRef(0);

    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    // --- Функции переключения ---
    const handlePrevImage = () => {
        setLightboxIndex((prev) => (prev - 1 + imageItems.length) % imageItems.length);
    };
    const handleNextImage = () => {
        setLightboxIndex((prev) => (prev + 1) % imageItems.length);
    };

    // Подхватываем валюту заявки как дефолт для ставки
    useEffect(() => {
        const c = order?.rate_currency || order?.currency || "₾";
        setBidCurrency(c);
    }, [order?.rate_currency, order?.currency]);

    useEffect(() => {
        if (!lightboxOpen) return;
        const onKey = (e) => {
            if (e.key === "Escape") setLightboxOpen(false);
            if (e.key === "ArrowRight") handleNextImage();
            if (e.key === "ArrowLeft") handlePrevImage();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [lightboxOpen]);

    useEffect(() => {
        if (!showBidPanel) return;
        function handleClickOutside(event) {
            if (bidPanelRef.current && !bidPanelRef.current.contains(event.target)) {
                setShowBidPanel(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showBidPanel]);

    // Получить ставки по заявке
    const reloadBids = useCallback(() => {
        if (!order?.id) return;
        setLoadingBids(true);
        authFetchWithRefresh(api(`/orders/${order.id}/bids`))
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => setAllBids(Array.isArray(data) ? data : []))
            .finally(() => setLoadingBids(false));
    }, [order?.id]);

    // Получить твою ставку
    const updateYourBid = useCallback(() => {
        if (!order?.id) return; setLoadingBid(true);
        authFetchWithRefresh(api(`/orders/${order.id}/my_bid`))
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data && data.id) setYourBid(data);
                else setYourBid(null);
            })
            .finally(() => setLoadingBid(false));
    }, [order?.id]);

    useEffect(() => {
        if (showBidPanel) reloadBids();
    }, [showBidPanel, reloadBids]);

    useEffect(() => {
        updateYourBid();
    }, [order?.id, updateYourBid]);

    // Отправить ставку
    async function handleSendBid() {
        if (!amount) return;
        setSending(true);
        const resp = await authFetchWithRefresh(api(`/orders/${order.id}/bids`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount, currency: bidCurrency, comment: bidComment }),
        });
        if (resp.ok) {
            await reloadBids();
            await updateYourBid();
            setShowBidPanel(false);
            setAmount("");
            setBidComment("");
        } else {
            alert("Ошибка при отправке ставки");
        }
        setSending(false);
    }

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                const res = await authFetchWithRefresh(api(`/orders/${id}`), { cache: "no-store" });
                if (res.status === 401) { // только гостям показываем paywall, авторизованным даём доступ
                    setShowPaywall(true);
                    setOrder(null);
                    return;
                }
                if (!res.ok) { setOrder(null); return; }
                const data = await res.json();
                setOrder(data);
                setViewsCount(Number(data?.views ?? 0));
            } catch {
                setOrder(null);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    useEffect(() => {
        if (!order?.owner_id && !order?.user) return;

        // Показываем карточку сразу, если пользователь уже пришёл вместе с заявкой
        if (order?.user) {
            setOwnerUser(order.user);
        }

        if (!order?.owner_id) return;

        fetch(api(`/users/${order.owner_id}`))
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) setOwnerUser(data);
            })
            .catch(console.error);
    }, [order?.owner_id, order?.user]);

    // Инкремент просмотров при заходе на детальную
    useEffect(() => {
        if (!order?.id) return;
        authFetchWithRefresh(api(`/orders/${order.id}/view`), { method: "POST" })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data && typeof data.views === "number") setViewsCount(data.views);
            })
            .catch(() => { });
    }, [order?.id]);

    useEffect(() => {
        if (!shouldHighlight || loading) return;
        const node = highlightRef.current;
        if (!node) return;

        node.classList.add("page-highlight");
        node.setAttribute("tabindex", "-1");
        node.focus({ preventScroll: true });
        node.scrollIntoView({ behavior: "smooth", block: "start" });

        const timer = setTimeout(() => node.classList.remove("page-highlight"), 2000);
        return () => {
            clearTimeout(timer);
            node.classList.remove("page-highlight");
        };
    }, [loading, shouldHighlight]);

    const cardStyle = useMemo(
        () => ({
            background: COLORS.cardBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: isMobile ? 14 : 18,
            display: "flex",
            flexDirection: "column",
            gap: isMobile ? 10 : 12,
            boxShadow: COLORS.shadow,
        }),
        [COLORS.border, COLORS.cardBg, COLORS.shadow, isMobile]
    );

    // На мобильных «голый» текст загрузки выглядел как пустой экран
    // из‑за наследования цвета. Делаем явный, контрастный лоадер,
    // как в странице транспорта.
    if (loading) {
        return (
            <div
                aria-busy="true"
                style={{
                    padding: 32,
                    color: "#c9eaff",
                    minHeight: "calc(100dvh - 110px)",
                    display: "grid",
                    placeItems: "center",
                }}
            >
                <div className="boot-spinner">
                    <span className="boot-dot" />
                    <span className="boot-dot" />
                    <span className="boot-dot" />
                </div>
                <p className="boot-text">{t("common.loading", "Загрузка…")}</p>
            </div>
        );
    }
    if (!order || order.detail === "Order not found") {
        return <div style={{ padding: 16, color: "#f88" }}>{t("order.notFound", "Заявка не найдена")}</div>;
    }

    // --- Карта: вычисляем координаты ТОЛЬКО после загрузки order ---
    const fromCoords =
        Array.isArray(order.from_locations_coords) && order.from_locations_coords.length
            ? [order.from_locations_coords[0].lat, order.from_locations_coords[0].lng]
            : null;
    const toCoords =
        Array.isArray(order.to_locations_coords) && order.to_locations_coords.length
            ? [order.to_locations_coords[0].lat, order.to_locations_coords[0].lng]
            : null;
    const waypoints =
        Array.isArray(order.routes_coords) && order.routes_coords.length
            ? order.routes_coords.map((r) => [r.lat, r.lng])
            : [];

    // --- Детали ---
    const mainCargo =
        Array.isArray(order.cargo_items) && order.cargo_items.length > 0 ? order.cargo_items[0] : {};
    const from =
        Array.isArray(order.from_locations) && order.from_locations.length > 0
            ? order.from_locations.join(", ")
            : "";
    const to =
        Array.isArray(order.to_locations) && order.to_locations.length > 0
            ? order.to_locations.join(", ")
            : "";
    const loadDate = order.load_date || "";
    const unloadDate = order.unload_date || "";
    const truckType = order.truck_type || "";
    const transportType = order.transport_type || "";
    const loadingTypes = Array.isArray(order.loading_types) ? order.loading_types : [];
    const gpsMonitoring = order.gps_monitoring ? t("common.yes", "Да") : "";
    const adr = order.adr ? t("common.yes", "Да") : "";
    const adrClass = order.adr_class || "";
    const tempMode = order.temp_mode ? t("common.yes", "Да") : "";
    const tempFrom = order.temp_from || "";
    const tempTo = order.temp_to || "";
    const hasCustoms = order.has_customs ? t("common.yes", "Да") : t("common.no", "Нет");
    const customsInfo = order.customs_info || "";
    const paymentScenario = order.payment_scenario || "";
    const paymentDays = order.payment_days || "";
    const prepayAmount = order.prepay_amount || "";
    const postpayDays = order.postpay_days || "";
    const paymentComment = order.payment_comment || "";
    const rateType = order.rate_type || "";
    const rateWithVat = order.rate_with_vat || "";
    const rateNoVat = order.rate_no_vat || "";
    const rateCash = order.rate_cash || "";
    const currency = order.rate_currency || order.currency || "₾";
    const rateToCard = order.rate_to_card ? t("common.yes", "Да") : "";
    const prominentPrice = (() => {
        const amount = rateWithVat || rateNoVat || rateCash || order?.price || "";
        const curr = currency || "";
        if (!amount) return "";
        return `${amount} ${curr}`.trim();
    })();
    const comment = order.comment || "";
    const description = order.description || "";
    const phone = order.phone || "";
    const email = order.email || "";
    const username = order.username || "";
    const createdAt = order.created_at
        ? new Date(order.created_at).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        })
        : "";
    const attachments = Array.isArray(order.attachments) ? order.attachments : [];
    const norm = normalizeAttachments(attachments);
    const imageItems = norm.filter((x) => x.kind === "image");
    const fileItems = norm.filter((x) => x.kind === "file");
    const docItems = norm.filter((x) => x.kind === "file");

    const truckQuantity =
        order.truck_quantity !== undefined && order.truck_quantity !== null ? order.truck_quantity : "";
    const cargos =
        Array.isArray(order.cargo_items) && order.cargo_items.length > 0 ? order.cargo_items : [];
    const routes = Array.isArray(order.routes) && order.routes.length > 0 ? order.routes.join(", ") : "";

    // Стили для секций
    const sectionTitleStyle = {
        fontWeight: 750,
        fontSize: isMobile ? 16.5 : 19,
        color: resolvedTheme === "light" ? COLORS.heading : "#cfe3ff",
        marginBottom: isMobile ? 10 : 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        letterSpacing: 0.1,
    };

    const sectionTextStyle = {
        lineHeight: 1.45,
        fontSize: isMobile ? 14.5 : 16,
    };

    const loadingPillStyle = useMemo(
        () => ({
            background: resolvedTheme === "light" ? COLORS.accentSoft : "#11284a",
            color: resolvedTheme === "light" ? COLORS.heading : "#43c8ff",
            borderRadius: 8,
            padding: `2px ${isMobile ? "10px" : "11px"}`,
            fontSize: isMobile ? 13 : 14,
            fontWeight: 500,
        }),
        [COLORS.accentSoft, COLORS.heading, isMobile, resolvedTheme]
    );


    // ── Готовим секции как переменные, чтобы легко переставить местами ─────────────────
    const transportSection =
        (truckType || transportType || truckQuantity || loadingTypes.length > 0 || gpsMonitoring || order.adr || tempMode)
            ? (
                <div
                    key="transport"
                    style={{
                        ...cardStyle,
                        ...sectionTextStyle,
                        minHeight: 180,
                        height: "100%",
                    }}
                >
                    <div style={sectionTitleStyle}>{icons.truck}{t("transport.title", "Транспорт")}</div>
                    {truckType && (<div><b>{t("truck.bodyType", "Тип кузова")}:</b> {findBodyLabelByValue(truckType)}</div>)}
                    {transportType && (<div><b>{t("transport.transportType", "Тип перевозки")}:</b> {localizeTransportType(transportType)}</div>)}
                    {truckQuantity && (<div><b>{t("transport.truckCount", "Количество машин")}:</b> {truckQuantity}</div>)}
                    {loadingTypes.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <b style={{ marginRight: 6 }}>{t("loading.types", "Типы загрузки")}:</b>
                            {localizeLoadingTypes(loadingTypes).map((label, i) => (
                                <span
                                    key={i}
                                    style={loadingPillStyle}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                    )}
                    {gpsMonitoring && (<div><b>{t("gps.title", "GPS")}:</b> {gpsMonitoring}</div>)}
                    {order.adr && (
                        <div style={{ color: "#e6aa00", fontWeight: 600, margin: "6px 0" }}>
                            ADR{order.adr_class ? `: ${t("adr.classShort", "класс")} ${order.adr_class} (${getAdrClassInfo(t)[order.adr_class] || ""})` : ""}
                        </div>
                    )}
                    {tempMode && (
                        <div>
                            <b>{t("order.tempMode", "Температурный режим")}:</b> {tempMode}
                            {(order.temp_from || order.temp_to) && <span> ({order.temp_from ?? "-"}…{order.temp_to ?? "-"}°C)</span>}
                        </div>
                    )}
                </div>
            ) : null;

    const paySection = (
        <div
            key="pay"
            style={{
                ...cardStyle,
                ...sectionTextStyle,
                minHeight: 180,
                height: "100%",
            }}
        >
            <div style={sectionTitleStyle}>{icons.pay}{t("payment.title", "Оплата")}</div>
            {prominentPrice && (
                <div
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                        background: "linear-gradient(135deg, #2b1f09 0%, #3a2a10 50%, #1e1405 100%)",
                        border: "1px solid #f7c948",
                        borderRadius: 12,
                        padding: isMobile ? "8px 12px" : "10px 14px",
                        boxShadow: "0 6px 22px #f7c94825",
                        margin: "6px 0 12px",
                    }}
                >
                    <span style={{ color: "#ffe8a3", fontWeight: 700, letterSpacing: 0.02 }}>
                        {t("info.price", "Цена")}:
                    </span>
                    <span
                        style={{
                            color: "#ffd166",
                            fontWeight: 900,
                            fontSize: isMobile ? 20 : 22,
                            letterSpacing: 0.03,
                        }}
                    >
                        {prominentPrice}
                    </span>
                </div>
            )}
            {rateType && (<div><b>{t("rate.type", "Тип ставки")}:</b> {localizeRateType(rateType)}</div>)}
            {rateWithVat && (<div><b>{t("rate.withVat", "С НДС")}:</b> {`${rateWithVat} ${currency || ""}`}</div>)}
            {rateNoVat && (<div><b>{t("rate.withoutVat", "Без НДС")}:</b> {`${rateNoVat} ${currency || ""}`}</div>)}
            {rateCash && (<div><b>{t("rate.cash", "Наличными")}:</b> {`${rateCash} ${currency || ""}`}</div>)}
            {rateToCard && (<div><b>{t("rate.toCard", "На карту")}:</b> {rateToCard}</div>)}
            {paymentScenario && (
                <div>
                    <b>{t("payment.scenario", "Сценарий оплаты")}:</b>{" "}
                    <span>
                        {paymentScenario === "unload" && t("payment.atUnload", "На выгрузке")}
                        {paymentScenario === "after_x_days" &&
                            `${t("payment.afterDays.prefix", "Через")} ${paymentDays || "?"} ${t("payment.afterDays.suffix", "дней после выгрузки")}`}
                        {paymentScenario === "prepay" &&
                            `${t("payment.prepayPrefix", "Предоплата")} ${prepayAmount || ""}${prepayAmount ? ", " : ""}${t("payment.prepayRestPrefix", "остаток через")} ${postpayDays || "?"} ${t("payment.daysSuffix", "дней")}`}
                        {paymentScenario === "contract" && (paymentComment || t("payment.contract", "По договору"))}
                    </span>
                </div>
            )}
        </div>
    );

    // === ДИНАМИЧЕСКИЕ СЕКЦИИ (без пустых мест!) ===
    // Груз | Таможня
    const cargoCustomsSections = [];
    if (cargos.length > 0) {
        cargoCustomsSections.push(
            <div
                key="cargo"
                style={{
                    ...cardStyle,
                    ...sectionTextStyle,
                }}
            >
                <div style={sectionTitleStyle}>
                    {icons.cargo}{cargos.length > 1 ? t("cargo.plural", "Грузы") : t("cargo.singular", "Груз")}
                </div>
                {cargos.map((cargo, i) => (
                    <div
                        key={i}
                        style={{
                            marginBottom: 12,
                            paddingBottom: 8,
                            borderBottom: i < cargos.length - 1 ? "1px solid #30466b" : "none",
                            lineHeight: 1.35,
                            fontSize: isMobile ? 14.5 : 16,
                        }}
                    >
                        {cargo.name && <div><b>{t("cargo.name", "Наименование")}:</b> {cargo.name}</div>}
                        {(cargo.tons || cargo.volume) && (
                            <div>
                                {cargo.tons && (<><b>{t("cargo.weight", "Вес")}:</b> {cargo.tons} {t("units.t", "т")}</>)}
                                {cargo.tons && cargo.volume && <span>&nbsp; </span>}
                                {cargo.volume && (<><b>{t("cargo.volume", "Объём")}:</b> {cargo.volume} {t("units.m3", "м³")}</>)}
                            </div>
                        )}
                        {cargo.packaging && (<div><b>{t("cargo.packaging", "Упаковка")}:</b> {cargo.packaging}</div>)}
                        {cargo.pieces && (<div><b>{t("cargo.pieces", "Мест")}:</b> {cargo.pieces}</div>)}
                        {(cargo.length || cargo.width || cargo.height || cargo.diameter) && (
                            <div>
                                <b>{t("cargo.dimensions", "Габариты (Д×Ш×В×Ø)")}:</b> {cargo.length ?? "-"}×{cargo.width ?? "-"}×{cargo.height ?? "-"}×{cargo.diameter ?? "-"}
                            </div>
                        )}
                        {cargo.description && (<div><b>{t("cargo.description", "Описание")}:</b> {cargo.description}</div>)}
                    </div>
                ))}
            </div>
        );
    }

    // Контакты (а "Оплата" отправится в этот блок вместо "Транспорта")
    const transportContactsSections = [];
    // Вместо "Транспорт" — кладём сюда "Оплата"
    transportContactsSections.push(paySection);
    if (phone || email || username) {
        transportContactsSections.push(
            <div
                key="contacts"
                style={{
                    ...cardStyle,
                    ...sectionTextStyle,
                }}
            >
                <div style={sectionTitleStyle}>{icons.contact}{t("order.contacts", "Контакты")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    {phone && (<div><b>{t("order.contact.phone", "Телефон")}:</b> {phone}</div>)}
                </div>
                {email && (<div style={{ marginTop: 8 }}><b>Email:</b> {email}</div>)}
                {username && (<div><b>{t("user.title", "Пользователь")}:</b> {username}</div>)}
            </div>
        );
    }

    // Дополнительно | Файлы (сводка)
    const additionalFilesSections = [];
    if (comment !== undefined || description) {
        additionalFilesSections.push(
            <div
                key="additional"
                style={{
                    ...cardStyle,
                    ...sectionTextStyle,
                    minHeight: 120,
                    height: "100%",
                }}
            >
                <div style={sectionTitleStyle}>{icons.comment}{t("order.more", "Дополнительно")}</div>
                {description || comment ? (
                    <>
                        {description && (<div><b>{t("order.comment", "Комментарий")}:</b> {description}</div>)}
                        {comment && !description && (<div><b>{t("order.comment", "Комментарий")}:</b> {comment}</div>)}
                    </>
                ) : (
                    <div
                        style={{
                            color: "#6ec6ff",
                            fontWeight: 500,
                            fontSize: isMobile ? 14 : 16,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 10,
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
                                <text x="8" y="12" textAnchor="middle" fill="#6ec6ff" fontSize="13" fontWeight="bold">i</text>
                            </svg>
                        </span>
                        {t("common.noInfo", "Информация не указана")}
                    </div>
                )}
            </div>
        );
    }
    if (norm.length > 0) {
        additionalFilesSections.push(
            <div
                key="files-summary"
                style={{
                    ...cardStyle,
                    ...sectionTextStyle,
                    minHeight: 120,
                    height: "100%",
                }}
            >
                <div style={sectionTitleStyle}>{icons.files}{t("order.files", "Файлы")}</div>
                {(imageItems.length > 0 || fileItems.length > 0) && (
                    <div
                        style={{
                            display: "flex",
                            gap: 12,
                            overflowX: "auto",
                            paddingBottom: 6,
                            WebkitOverflowScrolling: "touch",
                        }}
                    >
                        {imageItems.map((f, i) => (
                            <div
                                key={i}
                                style={{
                                    width: isMobile ? 120 : 150,
                                    borderRadius: 8,
                                    overflow: "hidden",
                                    border: "1px solid #2c4a70",
                                    background: "#0b1c2f",
                                    cursor: "pointer",
                                    flex: "0 0 auto",
                                }}
                                onClick={() => {
                                    setLightboxIndex(i);
                                    setLightboxOpen(true);
                                }}
                            >
                                <img
                                    src={abs(f.url)}
                                    alt={f.name}
                                    style={{ width: "100%", height: isMobile ? 84 : 100, objectFit: "cover" }}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // === Динамический UI ===
    const PAD = isMobile ? 16 : 40;
    const GAP = isMobile ? 14 : 36;

    return (
        <>
            <motion.div
                initial={false}
                animate={false}
                exit={undefined}
                style={{ willChange: "transform" }}
            >
                {/* Левый edge для свайпа-назад на мобилке */}
                {isMobile && (
                    <motion.div
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        onDragStart={(e, info) => {
                            dragStartX.current = info?.point?.x || 0;
                        }}
                        onDragEnd={(e, info) => {
                            if (dragStartX.current <= 36 && (info.offset.x > 80 || info.velocity.x > 800)) {
                                router.back();
                            }
                        }}
                        style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            bottom: 0,
                            width: 28,
                            zIndex: 50,
                            touchAction: "none",
                            background: "transparent",
                        }}
                    />
                )}

                <div
                    ref={highlightRef}
                    tabIndex={shouldHighlight ? -1 : undefined}
                    style={{
                        background: isMobile ? "transparent" : COLORS.pageBg,
                        minHeight: "100dvh",
                        color: COLORS.text,
                        padding: `${PAD + (isMobile ? 4 : 0)}px ${PAD}px ${PAD * (isMobile ? 2 : 2)}px`,
                        boxSizing: "border-box",           // ← фикс переполнения по ширине
                        maxWidth: isMobile ? "100%" : 1300,
                        margin: "0 auto",
                        borderRadius: isMobile ? 0 : 20,
                        boxShadow: isMobile ? "none" : COLORS.shadow,
                        position: "relative"
                    }}
                >
                    {/* Индикатор просмотров в правом верхнем углу */}
                    <span
                        title={t("views.title", "Просмотры")}
                        style={{
                            position: "absolute",
                            top: isMobile ? 8 : 10,
                            right: isMobile ? 10 : 14,
                            zIndex: 60,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: COLORS.accentSoft,
                            border: `1px solid ${COLORS.border}`,
                            color: COLORS.heading,
                            fontWeight: 700,
                            fontSize: isMobile ? 12 : 13,
                            boxShadow: COLORS.shadow
                        }}
                    >
                        <FaEye style={{ filter: "drop-shadow(0 0 3px #43c8ff55)" }} />
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{viewsCount}</span>
                    </span>
                    {/* Верхняя панель действий */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: isMobile ? "flex-start" : "space-between",
                            marginBottom: isMobile ? 14 : 24,
                            gap: isMobile ? 10 : 12,
                            flexWrap: isMobile ? "nowrap" : "wrap",
                            overflowX: isMobile ? "auto" : "visible",
                            paddingBottom: isMobile ? 4 : 0,
                        }}
                    >
                        <button
                            style={backButtonStyle}
                            onClick={() => router.back()}
                            aria-label={t("common.back", "Назад")}
                        >
                            {isMobile ? "<" : `← ${t("common.back", "Назад")}`}
                        </button>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                flexWrap: isMobile ? "nowrap" : "wrap",
                                overflowX: isMobile ? "auto" : "visible",
                            }}
                        >
                            {isBargainAllowed(order.rate_type) && (
                                <div style={{ position: "relative", display: "inline-block" }}>
                                    <button
                                        onClick={() => setShowBidPanel((v) => !v)}
                                        style={{
                                            ...actionPillStyle,
                                            border: showBidPanel ? "1px solid #43c8ff" : actionPillStyle.border,
                                            boxShadow: showBidPanel ? "0 0 0 1px rgba(67, 200, 255, 0.25)" : "none",
                                        }}
                                        title={t("bids.make", "Сделать ставку")}
                                    >
                                        <FaGavel style={{ fontSize: isMobile ? 17 : 19, color: "#43c8ff" }} />
                                        {t("bids.title", "Ставки")}
                                    </button>

                                    {/* Оверлей ставок: привязан к кнопке, крупный */}
                                    <AnimatePresence>
                                        {showBidPanel && (
                                            <div
                                                style={
                                                    isMobile
                                                        ? {
                                                            position: "fixed",
                                                            inset: 0,
                                                            zIndex: 200,
                                                            padding: "16px 14px 18px",
                                                            background: bidColors.overlay,
                                                            backdropFilter: "blur(6px)",
                                                            display: "flex",
                                                            alignItems: "flex-start",
                                                            justifyContent: "center",
                                                            overflowY: "auto",
                                                        }
                                                        : {
                                                            position: "absolute",
                                                            top: "calc(100% + 8px)",
                                                            right: 0,
                                                            zIndex: 40,
                                                            width: 720,
                                                            maxHeight: "70vh",
                                                        }
                                                }
                                            >
                                                <motion.div
                                                    ref={bidPanelRef}
                                                    initial={{ opacity: 0, y: 20, scale: 0.97 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 20, scale: 0.97 }}
                                                    transition={{ duration: 0.32 }}
                                                    style={{
                                                        background: bidColors.panelBg,
                                                        borderRadius: 14,
                                                        boxShadow: bidColors.panelShadow,
                                                        padding: isMobile ? "18px 16px 20px" : "22px",
                                                        width: "100%",
                                                        maxWidth: isMobile ? 520 : "100%",
                                                        boxSizing: "border-box",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            gap: 12,
                                                            marginBottom: 10,
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 800, color: bidColors.title, fontSize: 16 }}>
                                                            {t("bids.title", "Ставки")} ({loadingBids ? "..." : allBids.length})
                                                        </div>
                                                        {isMobile && (
                                                            <button
                                                                onClick={() => setShowBidPanel(false)}
                                                                style={{
                                                                    background: bidColors.closeBg,
                                                                    border: bidColors.closeBorder,
                                                                    color: bidColors.closeText,
                                                                    borderRadius: 10,
                                                                    padding: "8px 12px",
                                                                    fontWeight: 700,
                                                                    fontSize: 14,
                                                                    minWidth: 86,
                                                                }}
                                                            >
                                                                {t("common.close", "Закрыть")}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* список ставок — делаем выше */}
                                                    <div
                                                        style={{
                                                            maxHeight: isMobile ? "46vh" : 360, /* было 150 */
                                                            overflowY: "auto",
                                                            marginBottom: 12,
                                                            borderRadius: 8,
                                                            background: bidColors.listBg,
                                                            padding: 6,
                                                        }}
                                                    >
                                                        {allBids.length === 0 && (
                                                            <div style={{ color: bidColors.listSecondary, fontSize: 15 }}>
                                                                {t("bids.noneYet", "Ставок пока нет.")}
                                                            </div>
                                                        )}
                                                        {allBids.length > 0 &&
                                                            allBids
                                                                .sort((a, b) => b.amount - a.amount)
                                                                .map((bid) => (
                                                                    <div
                                                                        key={bid.id}
                                                                        style={{
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            gap: 9,
                                                                            padding: "5px 2px",
                                                                            fontSize: 16,
                                                                        }}
                                                                    >
                                                                        <span style={{ color: bidColors.listPrimary, fontWeight: 700 }}>
                                                                            {formatPrice(bid.amount, bid.currency)}
                                                                        </span>
                                                                        <span style={{ color: bidColors.listSecondary, fontSize: 14 }}>
                                                                            {bid.username || bid.user_email}
                                                                        </span>
                                                                        {yourBid && bid.id === yourBid.id && (
                                                                            <span
                                                                                style={{
                                                                                    color: bidColors.yourBadgeText,
                                                                                    background: bidColors.yourBadgeBg,
                                                                                    borderRadius: 6,
                                                                                    padding: "2px 8px",
                                                                                    fontWeight: 600,
                                                                                    marginLeft: 8,
                                                                                }}
                                                                            >
                                                                                {t("bids.yourBid", "Ваша ставка")}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                    </div>

                                                    {/* форма ставки */}
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: isMobile ? "stretch" : "center",
                                                            gap: isMobile ? 10 : 9,
                                                            marginTop: isMobile ? 12 : 7,
                                                            flexWrap: isMobile ? "nowrap" : "wrap",
                                                            flexDirection: isMobile ? "column" : "row",
                                                        }}
                                                    >
                                                        <input
                                                            type="number"
                                                            placeholder={t("form.amount", "Сумма")}
                                                            value={amount}
                                                            onChange={(e) => setAmount(e.target.value)}
                                                            style={{
                                                                background: bidColors.inputBg,
                                                                color: bidColors.inputText,
                                                                border: bidColors.inputBorder,
                                                                borderRadius: 8,
                                                                padding: "9px 12px",
                                                                fontSize: 16,
                                                                width: isMobile ? "100%" : 95,
                                                                boxSizing: "border-box",
                                                            }}
                                                            min={0}
                                                            disabled={sending}
                                                        />
                                                        <select
                                                            value={bidCurrency}
                                                            onChange={(e) => setBidCurrency(e.target.value)}
                                                            style={{
                                                                background: bidColors.inputBg,
                                                                color: bidColors.inputText,
                                                                border: bidColors.inputBorder,
                                                                borderRadius: 8,
                                                                padding: "9px 10px",
                                                                fontSize: 16,
                                                                width: isMobile ? "100%" : 96,
                                                                boxSizing: "border-box",
                                                            }}
                                                            disabled={sending}
                                                        >
                                                            {CURRENCIES.map((cur) => (
                                                                <option key={cur} value={cur}>
                                                                    {cur}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <input
                                                            type="text"
                                                            placeholder={t("form.comment", "Комментарий")}
                                                            value={bidComment}
                                                            onChange={(e) => setBidComment(e.target.value)}
                                                            style={{
                                                                background: bidColors.inputBg,
                                                                color: bidColors.inputText,
                                                                border: bidColors.inputBorder,
                                                                borderRadius: 8,
                                                                padding: "9px 12px",
                                                                fontSize: 16,
                                                                flex: 1,
                                                                minWidth: isMobile ? "100%" : 180,
                                                                boxSizing: "border-box",
                                                            }}
                                                            disabled={sending}
                                                        />
                                                        <button
                                                            onClick={handleSendBid}
                                                            style={{
                                                                background: bidColors.primaryBtnBg,
                                                                color: bidColors.primaryBtnText,
                                                                border: "none",
                                                                borderRadius: 10,
                                                                padding: isMobile ? "10px 14px" : "8px 18px",
                                                                fontWeight: 800,
                                                                fontSize: 16,
                                                                cursor: "pointer",
                                                                minWidth: isMobile ? "100%" : 120,
                                                                maxWidth: isMobile ? "100%" : 170,
                                                                boxSizing: "border-box",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                            disabled={sending || !amount}
                                                        >
                                                            {sending ? "..." : t("bids.make", "Сделать ставку")}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            </div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            <span style={{ display: "inline-flex" }}>
                            <SaveToggleButton type="order" id={order.id} variant="bar" />
                        </span>

                        <OrderShareButtons
                            order={order}
                            variant="pills"
                            style={{ marginLeft: 2, rowGap: 6 }}
                            buttonStyle={
                                isMobile
                                    ? {
                                        ...actionPillStyle,
                                        padding: "7px 12px",
                                        whiteSpace: "nowrap",
                                    }
                                    : undefined
                            }
                        />
                        {!loadingBid && yourBid && (
                            <span
                                style={{
                                    background: "#172b3f",
                                        color: "#ffd600",
                                        borderRadius: 7,
                                        padding: isMobile ? "3px 8px" : "3px 10px",
                                        fontWeight: 600,
                                        fontSize: isMobile ? 14 : 16,
                                    }}
                                >
                                    {t("bids.yourBid", "Ваша ставка")}: {yourBid.amount} {yourBid.currency || "₾"}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Заголовок + автор */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isMobile ? 8 : 0 }}>
                        <div>
                            <div
                                style={{
                                    fontWeight: 900,
                                    fontSize: isMobile ? 22 : 28,
                                    letterSpacing: 0.01,
                                    marginBottom: 6,
                                    color: "#43c8ff",
                                }}
                            >
                                {t("order.idPrefix", "Заявка №")}{order.id}
                            </div>
                            {createdAt && <div style={{ color: "#8ecae6", fontSize: isMobile ? 13 : 15 }}>{t("common.created", "Создана")}: {createdAt}</div>}

                        </div>

                        {!isMobile && ownerUser && <MiniUserCard user={ownerUser} attachment={{ order }} />}
                    </div>

                    {/* Автор под заголовком на мобиле */}
                    {isMobile && ownerUser && (
                        <div style={{ marginBottom: 10 }}>
                            <MiniUserCard user={ownerUser} attachment={{ order }} />
                        </div>
                    )}

                    {/* === Основная сетка === */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: GAP,
                            alignItems: "start",
                            maxWidth: isMobile ? "100%" : 1200,
                            margin: "0 auto",
                        }}
                    >
                        {/* === Маршрут + Транспорт === */}
                        <div
                            style={{
                                gridColumn: isMobile ? "auto" : "1 / span 2",
                                display: "grid",
                                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                                gap: GAP,
                                alignItems: "stretch",
                                marginBottom: 0,
                            }}
                        >
                            {/* Маршрут и время */}
                            <div
                                style={{
                                    ...cardStyle,
                                    color: routeColors.text,
                                    marginBottom: 0,
                                    minWidth: 220,
                                    gap: 10,
                                    position: "relative",
                                    minHeight: 120,
                                    maxHeight: isMobile ? "unset" : 240,
                                    overflow: isMobile ? "visible" : "auto",
                                    boxSizing: "border-box",
                                }}
                            >
                                <div style={sectionTitleStyle}>
                                    {icons.route}
                                    <span style={{ marginLeft: 4 }}>{t("route.title", "Маршрут и дата")}</span>
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        fontSize: isMobile ? 15 : 17,
                                        fontWeight: 800,
                                        background: routeColors.barBackground,
                                        color: routeColors.barText,
                                        borderRadius: 9,
                                        padding: isMobile ? "7px 10px" : "7px 13px",
                                        marginBottom: 2,
                                        boxShadow: routeColors.shadow,
                                        letterSpacing: 0.02,
                                        gap: 9,
                                        flexWrap: "wrap",
                                        lineHeight: 1.18,
                                        wordBreak: "break-word",
                                    }}
                                >
                                    <span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", gap: 6 }}>
                                        <FlagIcon country={getCountryCode(from)} size={18} />
                                        <span style={{ color: routeColors.city, fontWeight: 700 }}>{from || "-"}</span>
                                    </span>
                                    <span
                                        style={{
                                            fontSize: isMobile ? 17 : 19,
                                            margin: "0 7px",
                                            color: routeColors.arrow,
                                            fontWeight: 900,
                                            flexShrink: 0,
                                        }}
                                    >
                                        →
                                    </span>
                                    <span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", gap: 6 }}>
                                        <FlagIcon country={getCountryCode(to)} size={18} />
                                        <span style={{ color: routeColors.city, fontWeight: 700 }}>{to || "-"}</span>
                                    </span>
                                </div>

                                {loadDate && <div style={{ color: routeColors.text, fontSize: isMobile ? 14 : 15 }}><b>{t("route.load", "Погрузка")}:</b> {loadDate}</div>}
                                {unloadDate && <div style={{ color: routeColors.text, fontSize: isMobile ? 14 : 15 }}><b>{t("route.unload", "Разгрузка")}:</b> {unloadDate}</div>}
                                {routes && (
                                    <div style={{ color: routeColors.text, fontSize: isMobile ? 13.5 : 14, marginTop: 3, wordBreak: "break-word" }}>
                                        <b>{t("route.pointsPath", "Маршрут по точкам")}:</b> {routes}
                                    </div>
                                )}
                            </div>
                            {/* Транспорт */}
                            {transportSection}
                        </div>

                        {/* Карта */}
                        {fromCoords && toCoords && (
                            <div style={{ gridColumn: isMobile ? "auto" : "1 / span 2", width: "100%", marginTop: 6 }}>
                                <SafeBoundary label="OrderRouteMap">
                                    <OrderRouteMap from={fromCoords} to={toCoords} waypoints={waypoints} />
                                </SafeBoundary>
                            </div>
                        )}

                        {/* Транспорт / Контакты */}
                        {transportContactsSections.length > 0 && (
                            <div
                                style={{
                                    display: "grid",
                                    gridColumn: isMobile ? "auto" : "1 / span 2",
                                    gridTemplateColumns: isMobile
                                        ? "1fr"
                                        : transportContactsSections.length === 2
                                            ? "1fr 1fr"
                                            : "1fr",
                                    gap: GAP,
                                    alignItems: "stretch",
                                    marginTop: 8,
                                }}
                            >
                                {transportContactsSections}
                            </div>
                        )}

                        {/* Груз + Дополнительно (рядом/в столбик) */}
                        {(cargoCustomsSections.length > 0 || additionalFilesSections.length > 0) && (
                            <div
                                style={{
                                    display: "grid",
                                    gridColumn: isMobile ? "auto" : "1 / span 2",
                                    gridTemplateColumns:
                                        !isMobile && cargoCustomsSections.length > 0 && additionalFilesSections.length > 0
                                            ? "1fr 1fr"
                                            : "1fr",
                                    gap: GAP,
                                    alignItems: "stretch",
                                    marginTop: 8,
                                }}
                            >
                                {cargoCustomsSections[0] || <div />}
                                {additionalFilesSections[0] || <div />}
                            </div>
                        )}

                        {/* Полная секция файлов */}
                        {(imageItems.length > 0 || docItems.length > 0) && (
                            <div
                                style={{
                                    ...cardStyle,
                                    ...sectionTextStyle,
                                    marginBottom: 6,
                                    gridColumn: isMobile ? "auto" : "1 / -1",
                                }}
                            >
                                <div style={sectionTitleStyle}>{icons.files}{t("order.files", "Файлы")}</div>

                                {(imageItems.length > 0 || fileItems.length > 0) && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                                        {imageItems.map((f, i) => (
                                            <div key={i} style={{ width: isMobile ? 120 : 150, textAlign: "center" }}>
                                                <img
                                                    src={abs(f.url)}
                                                    alt={f.name}
                                                    style={{
                                                        width: "100%",
                                                        height: isMobile ? 84 : 100,
                                                        objectFit: "cover",
                                                        borderRadius: 8,
                                                        border: `1px solid ${COLORS.border}`,
                                                        background: COLORS.pillBg,
                                                        cursor: "pointer",
                                                    }}
                                                    onClick={() => {
                                                        setLightboxIndex(i);
                                                        setLightboxOpen(true);
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {docItems.length > 0 && (
                                    <div style={{ marginTop: 10 }}>
                                        <div style={{ color: "#9fd3ff", fontWeight: 700, margin: "2px 0 6px" }}>
                                            {t("common.documents", "Документы")}
                                        </div>
                                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                            {docItems.map((f, i) => (
                                                <li
                                                    key={i}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 10,
                                                        background: COLORS.pillBg,
                                                        border: `1px solid ${COLORS.border}`,
                                                        borderRadius: 10,
                                                        padding: "10px 12px",
                                                        marginBottom: 8,
                                                    }}
                                                >
                                                    <FileIcon ext={f.ext} />
                                                    <a
                                                        href={abs(f.url)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            color: "#c9eaff",
                                                            textDecoration: "none",
                                                            fontWeight: 600,
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                        title={f.name}
                                                    >
                                                        {f.name}
                                                    </a>
                                                    <div style={{ marginLeft: "auto" }}>
                                                        <a
                                                            href={abs(f.url)}
                                                            download
                                                            style={{
                                                                background: "#2a6eb3",
                                                                border: "1px solid #3a86d1",
                                                                color: "#e8f4ff",
                                                                borderRadius: 8,
                                                                padding: "6px 10px",
                                                                fontSize: 14,
                                                                textDecoration: "none",
                                                            }}
                                                        >
                                                            {t("files.download", "Скачать")}
                                                        </a>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {lightboxOpen && imageItems[lightboxIndex] && (
                        <div
                            onClick={() => setLightboxOpen(false)}
                            style={{
                                position: "fixed",
                                inset: 0,
                                background: "rgba(0,0,0,0.85)",
                                zIndex: 9999,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {/* левая кликабельная зона (назад) */}
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrevImage();
                                }}
                                style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%" }}
                            />

                            {/* правая кликабельная зона (вперёд) */}
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleNextImage();
                                }}
                                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%" }}
                            />

                            {/* кнопка закрытия */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxOpen(false);
                                }}
                                style={{
                                    position: "absolute",
                                    top: 16,
                                    right: 16,
                                    fontSize: 22,
                                    background: "#0b1c2f",
                                    color: "#fff",
                                    border: "1px solid #27446d",
                                    borderRadius: 12,
                                    padding: "6px 10px",
                                    cursor: "pointer",
                                }}
                                aria-label="Close"
                            >
                                ✕
                            </button>

                            {/* стрелка влево */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrevImage();
                                }}
                                style={{
                                    position: "absolute",
                                    left: 16,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    fontSize: 28,
                                    background: "#0b1c2f",
                                    color: "#fff",
                                    border: "1px solid #27446d",
                                    borderRadius: 999,
                                    width: 48,
                                    height: 48,
                                    cursor: "pointer",
                                }}
                                aria-label="Previous"
                            >
                                ‹
                            </button>

                            {/* стрелка вправо */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleNextImage();
                                }}
                                style={{
                                    position: "absolute",
                                    right: 16,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    fontSize: 28,
                                    background: "#0b1c2f",
                                    color: "#fff",
                                    border: "1px solid #27446d",
                                    borderRadius: 999,
                                    width: 48,
                                    height: 48,
                                    cursor: "pointer",
                                }}
                                aria-label="Next"
                            >
                                ›
                            </button>

                            {/* само изображение */}
                            <img
                                src={abs(imageItems[lightboxIndex].url)}
                                alt={imageItems[lightboxIndex].name}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    maxWidth: "94vw",
                                    maxHeight: "88vh",
                                    objectFit: "contain",
                                    borderRadius: 12,
                                    border: "1px solid #27446d",
                                    boxShadow: "0 10px 40px #0008",
                                }}
                            />
                        </div>
                    )}
                </div>
            </motion.div>

            {/* модалка должна быть внутри одного корневого узла */}
            <PaywallModal open={showPaywall} onClose={() => setShowPaywall(false)} anonymous={!user} />
        </>
    );
}
