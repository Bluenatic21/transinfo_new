"use client";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { FaEye } from "react-icons/fa";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useIsMobile } from "../../../hooks/useIsMobile";
import ReactCountryFlag from "react-country-flag";
import countries from "i18n-iso-countries";
import { API_BASE, api, abs } from "@/config/env";
import "i18n-iso-countries/langs/en.json";
import "i18n-iso-countries/langs/ru.json";
import "i18n-iso-countries/langs/tr.json";
import "i18n-iso-countries/langs/ka.json";
import MiniUserCard from "@/app/components/MiniUserCard";
import SaveToggleButton from "@/app/components/SaveToggleButton";
import TransportShareButtons from "@/app/components/TransportShareButtons";
import { useLang } from "../../i18n/LangProvider";
import { useTheme } from "../../providers/ThemeProvider";
import {
    LOADING_TYPES,
    getTruckBodyTypes,
    getLoadingTypes,
    getTransportKindOptions,
    localizeRegularity
} from "@/app/components/truckOptions";

countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ru.json"));
countries.registerLocale(require("i18n-iso-countries/langs/tr.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ka.json"));


function parseDateDMY(str) {
    if (!str) return null;
    const parts = str.split(/[./-]/);
    if (parts.length !== 3) return null;
    if (str.includes("-")) return str;
    const [d, m, y] = parts;
    return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function FlagIcon({ country, size = 22, colors }) {
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
                background: colors.accentSoft,
                borderRadius: 5,
                border: `1.2px solid ${colors.border}`,
                marginRight: 8,
                marginLeft: -2,
                boxShadow: colors.shadow,
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
    const parts = location.split(",").map(s => s.trim());
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

// SVG-иконки для секций
const icons = {
    route: (
        <svg width="20" height="20" fill="none" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <rect x="2" y="9" width="16" height="2" rx="1" fill="#43c8ff" />
            <circle cx="4" cy="10" r="3" fill="#2971c7" />
            <circle cx="16" cy="10" r="3" fill="#3ee98a" />
        </svg>
    ),
    params: (
        <svg width="20" height="20" fill="none" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <rect x="2" y="9" width="16" height="2" rx="1" fill="#43c8ff" />
            <rect x="7" y="3" width="6" height="14" rx="3" fill="#222d3d" stroke="#43c8ff" strokeWidth="1.5" />
        </svg>
    ),
    pay: (
        <svg width="18" height="18" fill="none" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <rect x="2" y="6" width="14" height="6" rx="3" fill="#43c8ff" />
            <rect x="7" y="2" width="4" height="14" rx="2" fill="#2971c7" />
        </svg>
    ),
    contact: (
        <svg width="18" height="18" fill="none" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <circle cx="9" cy="6" r="4" fill="#43c8ff" />
            <rect x="3" y="11" width="12" height="5" rx="2.5" fill="#2971c7" />
        </svg>
    ),
    comment: (
        <svg width="18" height="18" fill="none" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <rect x="2" y="2" width="14" height="10" rx="3" fill="#43c8ff" />
            <rect x="5" y="13" width="8" height="3" rx="1.5" fill="#2971c7" />
        </svg>
    ),
    features: (
        <svg width="18" height="18" fill="none" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <rect x="3" y="4" width="8" height="2" rx="1" fill="#2971c7" />
            <rect x="3" y="8" width="12" height="2" rx="1" fill="#43c8ff" />
            <rect x="3" y="12" width="9" height="2" rx="1" fill="#3ee98a" />
            <circle cx="14.5" cy="5" r="1.5" fill="#43c8ff" />
            <circle cx="16" cy="12" r="1.5" fill="#3ee98a" />
        </svg>
    ),
    files: (
        <svg width="18" height="18" fill="none" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <rect x="4" y="2" width="10" height="14" rx="2" fill="#2971c7" />
            <rect x="7" y="4" width="4" height="2" rx="1" fill="#43c8ff" />
        </svg>
    ),
};

const LIGHT_COLORS = {
    pageBg: "#f5f7fb",
    cardBg: "#ffffff",
    border: "#e1e8f0",
    text: "#1f2937",
    heading: "#0f172a",
    muted: "#526075",
    accent: "#0f75e0",
    accentSoft: "#e6f2ff",
    highlight: "#f6d24b",
    shadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
    pillBg: "#f0f4fa",
    infoBg: "#eef2f7",
    infoText: "#526075",
    badgeBg: "#e6f2ff",
    badgeText: "#0f172a",
    overlayBg: "rgba(0,0,0,0.85)",
};

const DARK_COLORS = {
    pageBg: "rgba(24,34,54,0.96)",
    cardBg: "#1b2742",
    border: "#27446d",
    text: "#c9eaff",
    heading: "#e3f2fd",
    muted: "#9fb6d6",
    accent: "#43c8ff",
    accentSoft: "#193158cc",
    highlight: "#FFD600",
    shadow: "0 6px 28px #192f4c85",
    pillBg: "#172a47",
    infoBg: "#172a47",
    infoText: "#6ec6ff",
    badgeBg: "#193158cc",
    badgeText: "#cfe9ff",
    overlayBg: "rgba(0,0,0,0.85)",
};

// ADR классы — берём локализованный текст через t()
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

function Section({ title, children, style, colors }) {
    return (
        <section
            style={{
                background: colors.cardBg,
                border: `1px solid ${colors.border}`,
                borderRadius: 16,
                padding: "clamp(14px, 4vw, 18px)",
                marginBottom: "clamp(12px, 3vw, 18px)",
                height: "100%", // <--- ДОБАВЬ ЭТО
                boxShadow: colors.shadow,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                color: colors.text,
                ...style,
            }}
        >
            {title && (
                <div
                    style={{
                        color: colors.heading,
                        fontWeight: 750,
                        fontSize: 17,
                        marginBottom: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                    }}
                >
                    {title}
                </div>
            )}
            {children}
        </section>
    );
}

// --- Helpers for attachments ---
function getExt(name = "") {
    const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
}
function isImageByExt(ext) {
    return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext);
}
function normalizeAttachments(raw = []) {
    // принимаем: ["http://.../a.jpg", ...] либо [{url,name,__type}, ...]
    return raw
        .map((it) => {
            if (!it) return null;
            if (typeof it === "string") {
                const ext = getExt(it);
                return { url: it, name: it.split("/").pop(), kind: isImageByExt(ext) ? "image" : "file", ext };
            }
            // объект с url/name/__type
            const url = it.url || it.file_url || it.href || "";
            const name = it.name || it.filename || url.split("/").pop() || "file";
            const t = it.__type || it.type || "";
            const ext = getExt(name) || getExt(url);
            const kind = t === "images" || isImageByExt(ext) ? "image" : "file";
            return { url, name, kind, ext };
        })
        .filter(Boolean);
}

// Централизуем формирование абсолютных URL бекенда
const withApi = (u) => abs(u);

function FileIcon({ ext, colors }) {
    const upper = (ext || "").toUpperCase();
    return (
        <span style={{
            width: 28, height: 28, minWidth: 28, minHeight: 28,
            borderRadius: 7, background: colors.pillBg,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, color: colors.accent, border: `1px solid ${colors.border}`
        }}>
            {upper || "FILE"}
        </span>
    );
}


export default function TransportDetailPage() {
    const { t } = useLang();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const colors = resolvedTheme === "light" ? LIGHT_COLORS : DARK_COLORS;
    const infoPlaceholderStyle = {
        color: colors.infoText,
        fontWeight: 500,
        fontSize: 16,
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 13,
        opacity: resolvedTheme === "light" ? 0.9 : 0.67,
    };
    const infoIconStyle = {
        width: 23,
        height: 23,
        borderRadius: "50%",
        background: colors.infoBg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    };
    const infoIconFill = {
        circle: colors.border,
        text: colors.infoText,
    };
    // Витрины: label = перевод, value = канон (RU)
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const TRANSPORT_KIND_OPTS = useMemo(() => getTransportKindOptions(t), [t]);
    const LOADING_TYPES_I18N = useMemo(() => getLoadingTypes(t), [t]);

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

    // label типа кузова по канон. value (без учёта регистра/пробелов)
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
    const { id } = useParams();
    const [transport, setTransport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [ownerUser, setOwnerUser] = useState(null);
    const [viewsCount, setViewsCount] = useState(0);
    const router = useRouter();
    const isMobile = useIsMobile();
    const [adrDropdownOpen, setAdrDropdownOpen] = useState(false);
    const adrDropdownRef = useRef();
    const [lightbox, setLightbox] = useState({ open: false, index: 0 });
    // Edge-swipe: запоминаем X старта жеста
    const dragStartX = useRef(0);


    useEffect(() => {
        function handleClickOutside(e) {
            if (adrDropdownRef.current && !adrDropdownRef.current.contains(e.target)) {
                setAdrDropdownOpen(false);
            }
        }
        if (adrDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [adrDropdownOpen]);

    useEffect(() => {
        if (!id) return;
        const token = localStorage.getItem("token");
        if (!token) {
            setTransport(null);
            setLoading(false);
            return;
        }
        fetch(api(`/transports/${id}`), {
            headers: {
                Authorization: "Bearer " + token
            }
        })
            .then(r => r.json())
            .then((data) => {
                setTransport(data);
                setViewsCount(Number(data?.views ?? 0));
            })
            .catch(() => setTransport(null))
            .finally(() => setLoading(false));
    }, [id]);

    // Инкремент просмотров (1 раз/день обеспечивается на бэке)
    useEffect(() => {
        if (!transport?.id) return;
        const token = (typeof window !== "undefined" && localStorage.getItem("token")) || null;
        fetch(api(`/transports/${transport.id}/view`), {
            method: "POST",
            headers: token ? { Authorization: "Bearer " + token } : undefined,
        })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && typeof d.views === "number") setViewsCount(d.views);
            })
            .catch(() => { });
    }, [transport?.id]);

    useEffect(() => {
        if (!transport?.owner_id && !transport?.user) return;

        // Если пользователь пришёл в объекте транспорта, не прячем карточку
        if (transport?.user) {
            setOwnerUser(transport.user);
        }

        if (!transport?.owner_id) return;

        fetch(api(`/users/${transport.owner_id}`))
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) setOwnerUser(data);
            })
            .catch(console.error);
    }, [transport?.owner_id, transport?.user]);

    useEffect(() => {
        if (transport) {
            console.log("[ATTACHMENTS DEBUG]", transport.attachments);
        }
    }, [transport?.attachments]);

    // ---- Лайтбокс: подготовка данных + навигация + горячие клавиши ----
    const files = Array.isArray(transport?.attachments) ? transport.attachments : [];
    const norm = normalizeAttachments(files);
    const imageItems = norm.filter(x => x.kind === "image");
    const docItems = norm.filter(x => x.kind === "file");

    const nextImage = () =>
        setLightbox(s => ({ open: true, index: (s.index + 1) % imageItems.length }));
    const prevImage = () =>
        setLightbox(s => ({ open: true, index: (s.index - 1 + imageItems.length) % imageItems.length }));

    useEffect(() => {
        if (!lightbox.open) return;
        const onKey = (e) => {
            if (e.key === "Escape") setLightbox({ open: false, index: 0 });
            if (e.key === "ArrowRight") nextImage();
            if (e.key === "ArrowLeft") prevImage();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [lightbox.open, imageItems.length]);

    if (loading) return <div style={{ padding: 32, color: "#c9eaff" }}>{t("common.loading", "Загрузка...")}</div>;
    if (!transport || transport.detail === "not found") {
        return <div style={{ padding: 32, color: "#ff9090" }}>{t("transport.notFound", "Транспорт не найден")}</div>;
    }


    // --- ВСЁ ТОЛЬКО ПО transport.adr и transport.adr_class --- //
    const {
        truck_type = "-",
        transport_kind = "-",
        from_location = "-",
        to_locations = [],
        ready_date_from,
        ready_date_to,
        weight,
        volume,
        body_length, body_width, body_height,
        trailer_length, trailer_width, trailer_height,
        load_types = [],
        special = [],
        crew,
        adr, adr_class, // только эти две!
        gps_monitor,
        rate_with_vat, rate_without_vat, rate_cash,
        currency,
        bargain,
        contact_name,
        phone,
        email,
        comment,
        attachments = [],
        created_at
    } = transport;

    // Габариты
    const bodySize = [body_length, body_width, body_height].filter(Boolean).join("×");
    const trailer = [trailer_length, trailer_width, trailer_height].filter(Boolean).length
        ? [trailer_length, trailer_width, trailer_height].filter(Boolean).join("×") + " м"
        : null;
    const toStr = Array.isArray(to_locations) && to_locations.length
        ? to_locations.map(l => (typeof l === "string" ? l : l.location)).join(", ")
        : "-";
    // для условного отображения стрелки и блока "Куда"
    const toText = Array.isArray(to_locations) && to_locations.length
        ? to_locations
            .map(l => (typeof l === "string" ? l : l.location))
            .filter(Boolean)
            .join(", ")
        : "";
    const hasFrom = !!(from_location && String(from_location).trim());
    const hasTo = !!(toText && String(toText).trim());
    const adrClasses = Array.isArray(adr_class)
        ? adr_class.filter(Boolean)
        : (typeof adr_class === "string" && adr_class
            ? adr_class.split(",").map(x => x.trim()).filter(Boolean)
            : []);
    const valOrDash = v => v ? `${v} ${currency || ""}` : "—";
    const bargainStr = bargain === true || bargain === "true"
        ? t("bargain.no", "Без торга")
        : t("bargain.yes", "Можно торговаться");
    const gpsStr = gps_monitor === true || gps_monitor === "true"
        ? t("common.yes", "Да")
        : t("common.no", "Нет");
    // Доступность: поддержка режима "постоянно"
    let readyDateInterval = "—";
    if (transport?.mode === "постоянно") {
        readyDateInterval = transport?.regularity
            ? `${t("availability.constant", "постоянно")} — ${localizeRegularity(t, transport.regularity)}`
            : t("availability.constant", "постоянно");
    } else if (transport?.ready_date_from || transport?.ready_date_to) {
        readyDateInterval = `${new Date(parseDateDMY(ready_date_from)).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })} — ${new Date(parseDateDMY(ready_date_to)).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" })}`;
    } else if (ready_date_from) {
        readyDateInterval = new Date(parseDateDMY(ready_date_from)).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
    }
    const specialStr = Array.isArray(special) && special.length ? special.join(", ") : null;

    // === МОБИЛЬНАЯ ВЕРСИЯ ===
    if (isMobile) {
        return (
            <>
                {/* Левый «edge» для свайпа-назад */}
                <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragStart={(e, info) => { dragStartX.current = info?.point?.x || 0; }}
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
                        width: 28,           // зона «edge swipe»
                        zIndex: 50,
                        touchAction: "none",
                        background: "transparent"
                    }}
                />

                <div style={{
                    background: colors.pageBg,
                    minHeight: "100vh",
                    color: colors.text,
                    padding: "24px 16px 48px",
                    maxWidth: 520,
                    margin: "0 auto",
                    fontSize: 16,
                    lineHeight: 1.45,
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}>
                    {/* Просмотры — правый верхний угол */}
                    <span
                        title={t("views.title", "Просмотры")}
                        style={{
                            position: "absolute",
                            top: 8,
                            right: 10,
                            zIndex: 60,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: colors.accentSoft,
                            border: `1px solid ${colors.border}`,
                            color: colors.heading,
                            fontWeight: 700,
                            fontSize: 12,
                            pointerEvents: "none",
                            boxShadow: colors.shadow,
                        }}
                    >
                        <FaEye />
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{viewsCount}</span>
                    </span>
                    <button
                        style={{
                            marginBottom: 16,
                            background: colors.accent,
                            color: "#ffffff",
                            border: `1px solid ${colors.border}`,
                            borderRadius: 8,
                            padding: "10px 19px",
                            fontWeight: 800,
                            fontSize: 17,
                            boxShadow: colors.shadow
                        }}
                        onClick={() => router.back()}
                    >← {t("common.back", "Назад")}</button>
                    <div style={{
                        fontWeight: 900, fontSize: 22, letterSpacing: 0.01,
                        margin: "0 0 3px 0"
                    }}>
                        {findBodyLabelByValue(truck_type)} <span style={{ fontWeight: 400 }}>•</span> {findKindLabelByValue(transport_kind)}
                    </div>
                    {created_at && (
                        <div style={{ color: "#89b1dd", fontSize: 14, marginBottom: 10, marginTop: 1 }}>
                            {new Date(created_at).toLocaleString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit"
                            })}
                        </div>
                    )}
                    {/* Сохранить — в мобильном хедере, сразу под датой */}
                    <div style={{ display: "flex", gap: 10, margin: "6px 0 12px", flexWrap: "wrap" }}>
                        <SaveToggleButton type="transport" id={transport.id} variant="bar" />
                        <TransportShareButtons
                            transport={transport}
                            variant="pills"
                            style={{ rowGap: 6 }}
                        />
                    </div>
                    {ownerUser && (
                        <div style={{ marginBottom: 12 }}>
                            <MiniUserCard user={ownerUser} transport={transport} />
                        </div>
                    )}
                    <Section colors={colors} title={<>{icons.route}{t("route.title", "Маршрут и дата")}</>}>
                        <div style={{ marginBottom: 5, display: "flex", alignItems: "center" }}>
                            <b>{t("route.from", "Откуда")}:</b>
                            <FlagIcon colors={colors} country={getCountryCode(from_location)} />
                            {from_location}
                        </div>
                        <div style={{ marginBottom: 5, display: "flex", alignItems: "center" }}>
                            <b>{t("route.to", "Куда")}:</b>
                            {Array.isArray(to_locations) && to_locations.length > 0
                                ? to_locations.map((l, i) => (
                                    <span key={i} style={{ display: "flex", alignItems: "center", marginRight: 9 }}>
                                        <FlagIcon colors={colors} country={getCountryCode(typeof l === "string" ? l : l.location)} />
                                        {typeof l === "string" ? l : l.location}
                                        {i !== to_locations.length - 1 ? <span style={{ margin: "0 4px", color: "#b7e1fd" }}>•</span> : null}
                                    </span>
                                ))
                                : <>
                                    <FlagIcon colors={colors} country={getCountryCode(toStr)} />
                                    {toStr}
                                </>
                            }
                        </div>
                        <div style={{ marginBottom: 5 }}><b>{t("transport.available", "Доступен")}:</b> {readyDateInterval}</div>
                    </Section>
                    <Section colors={colors} title={<>{icons.params}{t("transport.params", "Параметры транспорта")}</>}>
                        {(
                            truck_type ||
                            transport_kind ||
                            weight ||
                            volume ||
                            bodySize ||
                            trailer
                        ) ? (
                            <>
                                {truck_type && <div><b>{t("truck.bodyType", "Тип кузова")}:</b> {findBodyLabelByValue(truck_type)}</div>}
                                {transport_kind && <div><b>{t("transport.kind.label", "Тип транспорта")}:</b> {findKindLabelByValue(transport_kind)}</div>}
                                {weight && <div><b>{t("transport.capacity", "Грузоподъемность")}:</b> {weight} {t("units.t", "т")}</div>}
                                {volume && <div><b>{t("transport.bodyVolume", "Объем кузова")}:</b> {volume} {t("units.m3", "м³")}</div>}
                                {bodySize && <div><b>{t("transport.bodyDims", "Кузов (Д×Ш×В)")}:</b> {bodySize} {t("units.m", "м")}</div>}
                                {trailer && <div><b>{t("transport.trailerDims", "Габариты прицепа")}:</b> {trailer}</div>}
                            </>
                        ) : (
                            <div style={infoPlaceholderStyle}>
                                <span style={infoIconStyle}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill={infoIconFill.circle} /><text x="8" y="12" textAnchor="middle" fill={infoIconFill.text} fontSize="13" fontWeight="bold">i</text></svg>
                                </span>
                                {t("info.missing", "Информация не указана")}
                            </div>
                        )}
                    </Section>

                    {/* ОСОБЕННОСТИ */}
                    <Section colors={colors} title={<>{icons.features}{t("features.title", "Особенности")}</>}>
                        <div>
                            <b>{t("loading.types", "Типы загрузки")}:</b>{" "}
                            {Array.isArray(load_types) && load_types.length
                                ? localizeLoadingTypes(load_types).map((label, i) =>
                                    <span key={i} style={{
                                        background: "#11284a",
                                        color: "#43c8ff",
                                        borderRadius: 8,
                                        padding: "2px 11px",
                                        marginLeft: 6,
                                        fontSize: 14,
                                        fontWeight: 500
                                    }}>{label}</span>
                                ) : "—"}
                        </div>
                        {specialStr && <div><b>{t("features.other", "Особенности")}:</b> {specialStr}</div>}
                        {crew && specialStr && specialStr.includes("Экипаж") && (
                            <div><b>{t("transport.special.crew", "Экипаж")}:</b> {crew} {t("crew.driversSuffix", "водитель(я)")}
                            </div>
                        )}
                        <div><b>{t("gps.title", "GPS")}:</b> {gpsStr}</div>
                        {/* --- ADR КАК В СПИСКЕ! --- */}
                        {adr && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <b>ADR:</b>
                                <span style={{ position: "relative", display: "inline-block" }}>
                                    <span
                                        style={{
                                            marginLeft: 6,
                                            background: colors.accentSoft,
                                            color: colors.heading,
                                            fontWeight: 700,
                                            borderRadius: 6,
                                            padding: "2px 13px",
                                            fontSize: 16,
                                            cursor: "pointer",
                                            boxShadow: colors.shadow,
                                            border: adrDropdownOpen ? `2px solid ${colors.accent}` : `2px solid ${colors.border}`,
                                            transition: "border .15s",
                                            display: "inline-block",
                                        }}
                                        onClick={e => {
                                            e.stopPropagation();
                                            setAdrDropdownOpen(v => !v);
                                        }}
                                    >
                                        {adrClasses.join(", ") || "-"}
                                    </span>
                                    {adrDropdownOpen && (
                                        <div style={{
                                            position: "absolute",
                                            left: 0,
                                            top: "110%",
                                            background: colors.cardBg,
                                            color: colors.text,
                                            borderRadius: 10,
                                            padding: "13px 19px 13px 19px",
                                            boxShadow: colors.shadow,
                                            zIndex: 24,
                                            minWidth: 220,
                                            fontSize: 15,
                                            whiteSpace: "pre-line"
                                        }}>
                                            {adrClasses.map(num => (
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
                                                    <span style={{ color: "#fff", fontWeight: 900, marginRight: 7 }}>{num}</span>
                                                    {getAdrClassInfo(t)[num] || ""}

                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </span>
                            </div>
                        )}
                    </Section>
                    <Section colors={colors} title={<>{icons.pay}{t("rate.title", "Ставка")}</>}>
                        <div><b>{t("rate.withVat", "С НДС")}:</b> {valOrDash(rate_with_vat)}</div>
                        <div><b>{t("rate.withoutVat", "Без НДС")}:</b> {valOrDash(rate_without_vat)}</div>
                        <div><b>{t("rate.cash", "Наличными")}:</b> {valOrDash(rate_cash)}</div>
                        <div><b>{t("rate.bargain", "Торг")}:</b> {bargainStr}</div>
                    </Section>
                    <Section colors={colors} title={<>{icons.contact}{t("contacts.title", "Контакты")}</>}>
                        <div><b>{t("contacts.person", "Контактное лицо")}:</b> {contact_name || "-"}</div>
                        <div>
                            <b>{t("contacts.phone", "Телефон")}:</b>{" "}
                            {phone
                                ? <a href={`tel:${phone}`} style={{ color: "#b6eaff" }}>{phone}</a>
                                : "-"}
                        </div>
                        <div>
                            <b>Email:</b>{" "}
                            {email
                                ? <a href={`mailto:${email}`} style={{ color: "#b6eaff" }}>{email}</a>
                                : "-"}
                        </div>
                    </Section>
                    {comment && (
                        <Section colors={colors} title={<>{icons.comment}{t("comment.title", "Комментарий")}</>}>
                            <div style={{ whiteSpace: "pre-wrap" }}>{comment}</div>
                        </Section>
                    )}
                    {files.length > 0 && (
                        <Section colors={colors} title={<>{icons.files}{t("files.title", "Файлы")}</>}>
                            {(imageItems.length === 0 && docItems.length === 0) && (
                                <div style={{ ...infoPlaceholderStyle, marginTop: 6 }}>
                                    <span style={{ ...infoIconStyle, borderRadius: 6, width: 22, height: 22 }}>
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill={infoIconFill.circle} /><text x="8" y="12" textAnchor="middle" fill={infoIconFill.text} fontSize="12" fontWeight="bold">i</text></svg>
                                    </span>
                                    {t("info.missing", "Информация не указана")}
                                </div>
                            )}

                            {imageItems.length > 0 && (
                                <>
                                    <div style={{ color: colors.heading, fontWeight: 700, marginBottom: 6 }}>
                                        {t("files.photos", "Фотографии")}
                                    </div>
                                    <div style={{
                                        display: "flex", overflowX: "auto", gap: 9, paddingBottom: 6, marginBottom: 12
                                    }}>
                                        {imageItems.map((img, idx) => (
                                            <img
                                                key={idx}
                                                src={withApi(img.url)}
                                                alt={img.name || `image-${idx}`}
                                                title={img.name}
                                                style={{
                                                    width: 140, height: 100, objectFit: "cover",
                                                    borderRadius: 10, border: `1px solid ${colors.border}`,
                                                    boxShadow: colors.shadow,
                                                    cursor: "pointer", flexShrink: 0
                                                }}
                                                onClick={() => setLightbox({ open: true, index: idx })}
                                                loading="lazy"
                                            />
                                        ))}
                                    </div>
                                </>
                            )}

                            {docItems.length > 0 && (
                                <>
                                    <div style={{ color: colors.heading, fontWeight: 700, margin: "2px 0 6px" }}>
                                        {t("files.docs", "Документы")}
                                    </div>
                                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                        {docItems.map((f, i) => (
                                            <li key={i} style={{
                                                display: "flex", alignItems: "center", gap: 10,
                                                background: colors.cardBg, border: `1px solid ${colors.border}`,
                                                borderRadius: 10, padding: "10px 12px", marginBottom: 8,
                                                boxShadow: colors.shadow,
                                            }}>
                                                <FileIcon ext={f.ext} colors={colors} />
                                                <a
                                                    href={withApi(f.url)} target="_blank" rel="noopener noreferrer"
                                                    style={{ color: colors.text, textDecoration: "none", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                                    title={f.name}
                                                >
                                                    {f.name}
                                                </a>
                                                <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                                                    <a
                                                        href={withApi(f.url)} download
                                                        style={{
                                                            background: colors.accent,
                                                            border: `1px solid ${colors.border}`,
                                                            color: "#ffffff", borderRadius: 8, padding: "6px 10px",
                                                            fontSize: 14, textDecoration: "none"
                                                        }}
                                                    >
                                                        {t("files.download", "Скачать")}
                                                    </a>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </Section>
                    )}
                </div>
            </>
        );
    }

    // === DESKTOP ВЕРСИЯ ===
    return (
        <>
            <div style={{
                background: colors.pageBg,
                minHeight: "100vh",
                color: colors.text,
                padding: "40px 40px 80px 40px",
                maxWidth: 1300,
                margin: "0 auto",
                borderRadius: 20,
                boxShadow: colors.shadow,
                position: "relative"
            }}>
                {/* Просмотры — правый верхний угол */}
                <span
                    title={t("views.title", "Просмотры")}
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 14,
                        zIndex: 60,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: colors.badgeBg,
                        border: `1px solid ${colors.border}`,
                        color: colors.badgeText,
                        fontWeight: 700,
                        fontSize: 13,
                        pointerEvents: "none"
                    }}
                >
                    <FaEye />
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{viewsCount}</span>
                </span>
                <button
                    style={{
                        marginBottom: 32,
                        background: colors.accent,
                        color: resolvedTheme === "light" ? "#ffffff" : "#182337",
                        border: `1px solid ${colors.border}`,
                        borderRadius: 10,
                        padding: "11px 27px",
                        fontWeight: 800,
                        fontSize: 18,
                        boxShadow: "0 2px 14px #40c8fc33",
                        cursor: "pointer"
                    }}
                    onClick={() => router.back()}
                >← {t("common.back", "Назад")}</button>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                        gap: isMobile ? 16 : 36,
                        alignItems: "start",
                        maxWidth: 1200,
                        margin: "0 auto"
                    }}
                >
                    <div>
                        <div style={{
                            fontWeight: 900,
                            fontSize: 28,
                            letterSpacing: 0.01,
                            marginBottom: 8,
                            color: colors.accent
                        }}>
                            {findBodyLabelByValue(truck_type)} <span style={{ fontWeight: 400 }}>•</span> {findKindLabelByValue(transport_kind)}
                        </div>
                        <div style={{ color: colors.muted, fontSize: 15, marginBottom: 20 }}>
                            {created_at && <>{t("common.created", "Создано")}: {new Date(created_at).toLocaleString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit"
                            })}</>}
                        </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        {/* Сохранить — единый стиль нижней панели */}
                        <SaveToggleButton type="transport" id={transport.id} variant="bar" />
                        <TransportShareButtons
                            transport={transport}
                            variant="pills"
                            style={{ rowGap: 6 }}
                        />
                        {ownerUser && (
                            <MiniUserCard user={ownerUser} transport={transport} />
                        )}
                    </div>

                    <div style={{
                        gridColumn: isMobile ? "auto" : "1 / span 2",
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                        gap: isMobile ? 16 : 36,
                        marginBottom: 0,
                    }}>
                        <Section colors={colors} title={null}
                            style={{
                                color: "#e3f2fd",
                                marginBottom: 0,
                                marginTop: 0,
                                minWidth: 220,
                                gap: 10,
                                position: "relative",
                                minHeight: 120,
                                maxHeight: 240,
                                overflow: "auto", // Внутренний скролл при переполнении
                                boxSizing: "border-box",
                            }}
                        >
                            <div
                                style={{
                                    color: "#cfe3ff",
                                    fontWeight: 750,
                                    fontSize: 17,
                                    marginBottom: 10,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                }}
                            >
                                {icons.route}
                                <span style={{ marginLeft: 4 }}>{t("route.title", "Маршрут и дата")}</span>
                            </div>
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                fontSize: 17,
                                fontWeight: 800,
                                background: resolvedTheme === "light"
                                    ? "linear-gradient(90deg, #e9f2ff 0%, #d7e6ff 100%)"
                                    : "linear-gradient(90deg, #183969 38%, #253759 100%)",
                                color: resolvedTheme === "light" ? colors.heading : "#fff",
                                borderRadius: 9,
                                padding: "7px 13px",
                                marginBottom: 2,
                                boxShadow: colors.shadow,
                                letterSpacing: 0.02,
                                gap: 9,
                                flexWrap: "wrap",
                                lineHeight: 1.18,
                                wordBreak: "break-word"
                            }}>
                                <span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", gap: 6 }}>
                                    <FlagIcon colors={colors} country={getCountryCode(from_location)} size={18} />
                                    <span style={{ color: colors.muted, fontWeight: 700 }}>{from_location || "-"}</span>
                                </span>
                                {hasFrom && hasTo && (
                                    <span style={{
                                        fontSize: 19,
                                        margin: "0 7px",
                                        color: "#43c8ff",
                                        fontWeight: 900,
                                        flexShrink: 0,
                                    }}>→</span>
                                )}
                                {hasTo && (
                                    <span style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 4,
                                        maxHeight: 80,
                                        overflowY: (Array.isArray(to_locations) && to_locations.length > 3) ? "auto" : "visible",
                                        minWidth: 0,
                                    }}>
                                        {to_locations.map((l, i) => {
                                            const loc = typeof l === "string" ? l : l.location;
                                            const radius = typeof l === "object" && l.radius_km ? l.radius_km : null;
                                            return (
                                                <span key={i} style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    background: "#1a273f",
                                                    borderRadius: 7,
                                                    padding: "3px 10px",
                                                    fontSize: 15,
                                                    marginBottom: i !== to_locations.length - 1 ? 3 : 0,
                                                    color: "#8ecae6",
                                                    fontWeight: 700,
                                                    boxShadow: "0 1px 8px #42a9ff11",
                                                    minWidth: 0,
                                                    whiteSpace: "nowrap",
                                                    lineHeight: 1.17
                                                }}>
                                                    <FlagIcon colors={colors} country={getCountryCode(loc)} size={16} />
                                                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {loc}
                                                    </span>
                                                    {radius && (
                                                        <span style={{
                                                            background: "#1f2f48",
                                                            color: "#8ecae6",
                                                            fontWeight: 600,
                                                            fontSize: 13,
                                                            borderRadius: 8,
                                                            padding: "2px 7px",
                                                            marginLeft: 6
                                                        }}>
                                                            +{radius} {t("units.km", "км")}
                                                        </span>
                                                    )}
                                                </span>
                                            );
                                        })}
                                    </span>
                                )}
                            </div>
                            <div style={{ color: "#fff", fontSize: 15 }}>
                                <b>{t("transport.available", "Доступен")}:</b> {readyDateInterval}
                            </div>
                        </Section>
                        <Section colors={colors} title={<>{icons.pay}{t("rate.title", "Ставка")}</>} style={{
                            minHeight: 170,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "flex-start"
                        }}>
                            {rate_with_vat && (
                                <div><b>{t("rate.withVat", "С НДС")}:</b> {rate_with_vat} {currency || ""}</div>
                            )}
                            {rate_without_vat && (
                                <div><b>{t("rate.withoutVat", "Без НДС")}:</b> {rate_without_vat} {currency || ""}</div>
                            )}
                            {rate_cash && (
                                <div><b>{t("rate.cash", "Наличными")}:</b> {rate_cash} {currency || ""}</div>
                            )}
                            {bargainStr && (
                                <div><b>{t("rate.bargain", "Торг")}:</b> {bargainStr}</div>
                            )}
                        </Section>
                    </div>

                    <Section colors={colors} title={<>{icons.params}{t("transport.params", "Параметры транспорта")}</>}>
                        {[
                            truck_type && <div key="truck_type"><b>{t("truck.bodyType", "Тип кузова")}:</b> {findBodyLabelByValue(truck_type)}</div>,
                            transport_kind && <div key="transport_kind"><b>{t("transport.kind", "Тип транспорта")}:</b> {findKindLabelByValue(transport_kind)}</div>,
                            weight && <div key="weight"><b>{t("transport.capacity", "Грузоподъемность")}</b> {weight} т</div>,
                            volume && <div key="volume"><b>Объем кузова:</b> {volume} м³</div>,
                            bodySize && <div key="body_size"><b>Кузов (Д×Ш×В):</b> {bodySize} м</div>,
                            trailer && <div key="trailer"><b>Габариты прицепа:</b> {trailer}</div>,
                        ].filter(Boolean).length > 0 ? (
                            [
                                truck_type && <div key="truck_type"><b>{t("truck.bodyType", "Тип кузова")}:</b> {findBodyLabelByValue(truck_type)}</div>,
                                transport_kind && <div key="transport_kind"><b>{t("transport.kind", "Тип транспорта")}:</b> {findKindLabelByValue(transport_kind)}</div>,
                                weight && <div key="weight"><b>{t("transport.capacity", "Грузоподъемность")}:</b> {weight} т</div>,
                                volume && <div key="volume"><b>Объем кузова:</b> {volume} м³</div>,
                                bodySize && <div key="body_size"><b>Кузов (Д×Ш×В):</b> {bodySize} м</div>,
                                trailer && <div key="trailer"><b>Габариты прицепа:</b> {trailer}</div>,
                            ].filter(Boolean)
                        ) : (
                            <div style={infoPlaceholderStyle}>
                                <span style={infoIconStyle}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill={infoIconFill.circle} /><text x="8" y="12" textAnchor="middle" fill={infoIconFill.text} fontSize="13" fontWeight="bold">i</text></svg>
                                </span>
                                {t("info.missing", "Информация не указана")}
                            </div>
                        )}
                    </Section>

                    {/* Особенности - теперь именно тут выводится ADR! */}
                    <Section colors={colors} title={<>{icons.features}{t("features.title", "Особенности")}</>}>
                        {Array.isArray(load_types) && load_types.length > 0 && (
                            <div>
                                <b>{t("loading.types", "Типы загрузки")}:</b>{" "}
                                {localizeLoadingTypes(load_types).map((label, i) =>
                                    <span key={i} style={{
                                        background: resolvedTheme === "light" ? colors.accentSoft : "#11284a",
                                        color: colors.accent,
                                        borderRadius: 8,
                                        padding: "2px 11px",
                                        marginLeft: 6,
                                        fontSize: 14,
                                        fontWeight: 500
                                    }}>{label}</span>
                                )}
                            </div>
                        )}
                        {specialStr && <div><b>{t("features.other", "Особенности")}:</b> {specialStr}</div>}
                        {crew && specialStr && specialStr.includes("Экипаж") && (
                            <div><b>{t("transport.special.crew", "Экипаж")}:</b> {crew} {t("crew.driversSuffix", "водитель(я)")}
                            </div>
                        )}
                        <div><b>{t("gps.title", "GPS")}:</b> {gpsStr}</div>
                        {/* --- ADR КАК В СПИСКЕ! --- */}
                        {adr && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <b>ADR:</b>
                                <span style={{ position: "relative", display: "inline-block" }}>
                                    <span
                                        style={{
                                            marginLeft: 6,
                                            background: resolvedTheme === "light" ? colors.accentSoft : "#232f45",
                                            color: resolvedTheme === "light" ? colors.heading : colors.highlight,
                                            fontWeight: 700,
                                            borderRadius: 6,
                                            padding: "2px 13px",
                                            fontSize: 16,
                                            cursor: "pointer",
                                            boxShadow: colors.shadow,
                                            border: adrDropdownOpen ? `2px solid ${colors.accent}` : `2px solid ${colors.border}`,
                                            transition: "border .15s",
                                            display: "inline-block",
                                        }}
                                        onClick={e => {
                                            e.stopPropagation();
                                            setAdrDropdownOpen(v => !v);
                                        }}
                                    >
                                        {adrClasses.join(", ") || "-"}
                                    </span>
                                    {adrDropdownOpen && (
                                        <div style={{
                                            position: "absolute",
                                            left: 0,
                                            top: "110%",
                                            background: colors.cardBg,
                                            color: colors.heading,
                                            borderRadius: 10,
                                            padding: "13px 19px 13px 19px",
                                            boxShadow: colors.shadow,
                                            zIndex: 24,
                                            minWidth: 220,
                                            fontSize: 15,
                                            whiteSpace: "pre-line"
                                        }}>
                                            {adrClasses.map(num => (
                                                <div
                                                    key={num}
                                                    style={{
                                                        marginBottom: 8,
                                                        color: colors.heading,
                                                        fontWeight: 600,
                                                        letterSpacing: 0.04,
                                                        lineHeight: 1.4,
                                                    }}
                                                >
                                                    <span style={{ color: colors.text, fontWeight: 900, marginRight: 7 }}>{num}</span>
                                                    {getAdrClassInfo(t)[num] || ""}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </span>
                            </div>
                        )}
                    </Section>

                    <div style={{
                        gridColumn: "1 / span 2",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 36,
                        marginBottom: 0,
                    }}>
                        {/* Слева — Контакты */}
                        <Section colors={colors} title={<>{icons.contact}{t("contacts.title", "Контакты")}</>}>
                            {[
                                contact_name && <div key="contact_name"><b>{t("contacts.person", "Контактное лицо")}:</b> {contact_name}</div>,
                                phone && (
                                    <div key="phone">
                                        <b>{t("contacts.phone", "Телефон")}:</b>{" "}
                                        <a href={`tel:${phone}`} style={{ color: colors.accent }}>{phone}</a>
                                    </div>
                                ),
                                email && (
                                    <div key="email">
                                        <b>{t("messenger.email", "Эл. почта")}:</b>{" "}
                                        <a href={`mailto:${email}`} style={{ color: colors.accent }}>{email}</a>
                                    </div>
                                ),
                            ].filter(Boolean).length > 0 ? (
                                [
                                    contact_name && <div key="contact_name"><b>{t("contacts.person", "Контактное лицо")}:</b> {contact_name}</div>,
                                    phone && (
                                        <div key="phone">
                                            <b>{t("contacts.phone", "Телефон")}:</b>{" "}
                                            <a href={`tel:${phone}`} style={{ color: colors.accent }}>{phone}</a>
                                        </div>
                                    ),
                                    email && (
                                        <div key="email">
                                            <b>{t("messenger.email", "Эл. почта")}:</b>{" "}
                                            <a href={`mailto:${email}`} style={{ color: colors.accent }}>{email}</a>
                                        </div>
                                    ),
                                ].filter(Boolean)
                            ) : (
                                <div style={infoPlaceholderStyle}>
                                    <span style={infoIconStyle}>
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill={infoIconFill.circle} /><text x="8" y="12" textAnchor="middle" fill={infoIconFill.text} fontSize="13" fontWeight="bold">i</text></svg>
                                    </span>
                                    {t("info.missing", "Информация не указана")}
                                </div>
                            )}
                        </Section>
                        {/* Справа — Комментарий */}
                        <Section colors={colors} title={<>{icons.comment}{t("comment.title", "Комментарий")}</>} style={{
                            minHeight: 120,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "flex-start"
                        }}>
                            {comment
                                ? <div style={{ whiteSpace: "pre-wrap" }}>{comment}</div>
                                : (
                                    <div style={infoPlaceholderStyle}>
                                        <span style={infoIconStyle}>
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill={infoIconFill.circle} /><text x="8" y="12" textAnchor="middle" fill={infoIconFill.text} fontSize="13" fontWeight="bold">i</text></svg>
                                        </span>
                                        {t("info.missing", "Информация не указана")}
                                    </div>
                                )
                            }
                        </Section>
                    </div>
                    {/* Файлы: изображения и документы отдельно (нормализованные) */}
                    <div style={{ gridColumn: "1 / span 2", marginTop: 0 }}>
                        <Section colors={colors} title={<>{icons.files}{t("files.title", "Файлы")}</>} style={{
                            minHeight: 120, height: "100%",
                            display: "flex", flexDirection: "column", justifyContent: "flex-start"
                        }}>
                            {(imageItems.length === 0 && docItems.length === 0) ? (
                                <div style={infoPlaceholderStyle}>
                                    <span style={infoIconStyle}>
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                            <circle cx="8" cy="8" r="8" fill={infoIconFill.circle} />
                                            <text x="8" y="12" textAnchor="middle" fill={infoIconFill.text} fontSize="13" fontWeight="bold">i</text>
                                        </svg>
                                    </span>
                                    {t("info.missing", "Информация не указана")}
                                </div>
                            ) : (
                                <>
                                    {imageItems.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{ color: colors.heading, fontWeight: 700, marginBottom: 6 }}>
                                                {t("files.photos", "Фотографии")}
                                            </div>
                                            <div style={{ display: "flex", overflowX: "auto", gap: 12, paddingBottom: 8 }}>
                                                {imageItems.map((img, idx) => (
                                                    <img
                                                        key={idx}
                                                        src={withApi(img.url)}
                                                        alt={img.name || `image-${idx}`}
                                                        title={img.name}
                                                        style={{
                                                            width: 160, height: 114, objectFit: "cover",
                                                            borderRadius: 10, border: `1px solid ${colors.border}`,
                                                            boxShadow: colors.shadow, cursor: "pointer", flexShrink: 0
                                                        }}
                                                        onClick={() => setLightbox({ open: true, index: idx })}
                                                        loading="lazy"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {docItems.length > 0 && (
                                        <div>
                                            <div style={{ color: colors.heading, fontWeight: 700, margin: "2px 0 6px" }}>
                                                {t("files.docs", "Документы")}
                                            </div>
                                            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                                {docItems.map((f, i) => (
                                                    <li key={i} style={{
                                                        display: "flex", alignItems: "center", gap: 10,
                                                        background: colors.cardBg, border: `1px solid ${colors.border}`,
                                                        borderRadius: 10, padding: "10px 12px", marginBottom: 8
                                                    }}>
                                                        <FileIcon ext={f.ext} colors={colors} />
                                                        <a
                                                            href={withApi(f.url)} target="_blank" rel="noopener noreferrer"
                                                            style={{
                                                                color: colors.text, textDecoration: "none", fontWeight: 600,
                                                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                                                            }}
                                                            title={f.name}
                                                        >
                                                            {f.name}
                                                        </a>
                                                        <div style={{ marginLeft: "auto" }}>
                                                            <a
                                                                href={withApi(f.url)} download
                                                                style={{
                                                                    background: colors.accent, border: `1px solid ${colors.border}`,
                                                                    color: "#e8f4ff", borderRadius: 8, padding: "6px 10px",
                                                                    fontSize: 14, textDecoration: "none"
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
                                </>
                            )}
                        </Section>
                    </div>
                </div>
            </div>
            {lightbox.open && imageItems[lightbox.index] && (
                <div
                    onClick={() => setLightbox({ open: false, index: 0 })}
                    style={{
                        position: "fixed", inset: 0, background: colors.overlayBg,
                        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                >
                    {/* Левая зона (назад) */}
                    <div
                        onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%" }}
                    />

                    {/* Правая зона (вперёд) */}
                    <div
                        onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%" }}
                    />

                    {/* Кнопка закрытия */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setLightbox({ open: false, index: 0 }); }}
                        style={{
                            position: "absolute", top: 16, right: 16, fontSize: 22,
                            background: colors.cardBg, color: colors.text, border: `1px solid ${colors.border}`,
                            borderRadius: 12, padding: "6px 10px", cursor: "pointer"
                        }}
                    >
                        ✕
                    </button>

                    {/* Стрелка влево */}
                    <button
                        onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        style={{
                            position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                            fontSize: 28, background: colors.cardBg, color: colors.text,
                            border: `1px solid ${colors.border}`, borderRadius: 999, width: 48, height: 48, cursor: "pointer"
                        }}
                        aria-label={t("common.prev", "Назад")}
                    >
                        ‹
                    </button>

                    {/* Стрелка вправо */}
                    <button
                        onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        style={{
                            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                            fontSize: 28, background: colors.cardBg, color: colors.text,
                            border: `1px solid ${colors.border}`, borderRadius: 999, width: 48, height: 48, cursor: "pointer"
                        }}
                        aria-label={t("common.next", "Вперёд")}
                    >
                        ›
                    </button>

                    {/* Изображение */}
                    <img
                        src={withApi(imageItems[lightbox.index].url)}
                        alt={imageItems[lightbox.index].name}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain",
                            borderRadius: 12, border: `1px solid ${colors.border}`, boxShadow: colors.shadow
                        }}
                    />
                </div>
            )}
        </>
    );
}
