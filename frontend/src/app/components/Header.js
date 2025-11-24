"use client";
import Link from "next/link";
import { useUser } from "../UserContext";
import { usePathname } from "next/navigation";
import {
    FaTruck, FaBox, FaPlus, FaInfoCircle, FaUserPlus, FaSignInAlt,
    FaComments, FaStar, FaRegStar, FaUserShield, FaUserCog, FaUser, FaSearch
} from "react-icons/fa";
import { useMessenger } from "./MessengerContext";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import NotificationBell from "./NotificationBell";
import MobileSidebar from "./MobileSidebar";
import LangSwitcher from "./LangSwitcher";
import { useLang } from "../i18n/LangProvider";
import ThemeToggle from "./ThemeToggle"; // путь поправь, если Header в другой папке
import getAvatarUrl from "./getAvatarUrl";

// ——— media‑hook для брейкпоинтов (работает и в старых браузерах)
function useMedia(query) {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mql = window.matchMedia(query);
        const onChange = (e) => setMatches(e.matches);
        setMatches(mql.matches);
        if (mql.addEventListener) mql.addEventListener("change", onChange);
        else mql.addListener(onChange);
        return () => {
            if (mql.removeEventListener) mql.removeEventListener("change", onChange);
            else mql.removeListener(onChange);
        };
    }, [query]);
    return matches;
}


// Compact rating stars (10→green, 0→red) с поддержкой дробной части
function RatingStars({ value = 10, size = 12, showValue = true }) {
    const v = Math.max(0, Math.min(10, Number(value) || 0));
    const full = Math.floor(v);
    const frac = v - full;
    const hue = (v / 10) * 120; // 0..120 (0=красный, 120=зелёный)
    const color = `hsl(${hue}, 90%, 45%)`;
    const emptyColor = "var(--text-secondary, #273040)";

    return (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {Array.from({ length: 10 }).map((_, i) => {
                const index = i + 1;
                if (index <= full) return <FaStar key={i} size={size} color={color} />;
                if (index === full + 1 && frac > 0) {
                    return (
                        <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
                            <FaRegStar size={size} color={emptyColor} style={{ position: "absolute", inset: 0 }} />
                            <span style={{ position: "absolute", left: 0, top: 0, width: `${Math.round(frac * 100)}%`, overflow: "hidden" }}>
                                <FaStar size={size} color={color} />
                            </span>
                        </span>
                    );
                }
                return <FaRegStar key={i} size={size} color={emptyColor} />;
            })}
            {showValue && (
                <span style={{ fontWeight: 700, fontSize: Math.round(size * 0.95), color, letterSpacing: ".01em", marginLeft: 6 }}>
                    {v.toFixed(1)}
                </span>
            )}
        </span>
    );
}

function MiniProfile({ user, onClick, mode = "full" }) {
    // Аватар
    const avatarUrl = getAvatarUrl(user);
    const { t } = useLang();
    const roleValue = (user.role || "").toUpperCase();
    const roleIcons = {
        ADMIN: <FaUserShield style={{ color: "#2acaff" }} title={t("role.admin", "Админ")} />,
        TRANSPORT: <FaTruck style={{ color: "#ffd600" }} title={t("role.transport", "Перевозчик")} />,
        OWNER: <FaUser style={{ color: "#4ecdc4" }} title={t("role.owner", "Грузовладелец")} />,
        MANAGER: <FaUserCog style={{ color: "#c6dafc" }} title={t("role.manager", "Экспедитор")} />,
    };
    // Звёзды: 10 -> зелёный, 0 -> красный; поддержка дробных значений (компактные)
    function MiniStars({ value = 10, size = 12 }) {
        const v = Math.max(0, Math.min(10, Number(value) || 0));
        const full = Math.floor(v);
        const frac = v - full;
        const hue = (v / 10) * 120;            // 0..120  (0=красный, 120=зелёный)
        const color = `hsl(${hue}, 90%, 45%)`;
        const emptyColor = "var(--border-strong, #273040)";

        return (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {Array.from({ length: 10 }).map((_, i) => {
                    const index = i + 1;
                    if (index <= full) {
                        return <FaStar key={i} size={size} color={color} />;
                    }
                    if (index === full + 1 && frac > 0) {
                        return (
                            <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
                                <FaRegStar size={size} color={emptyColor} style={{ position: "absolute", inset: 0 }} />
                                <span style={{ position: "absolute", inset: 0, width: `${Math.round(frac * 100)}%`, overflow: "hidden" }}>
                                    <FaStar size={size} color={color} />
                                </span>
                            </span>
                        );
                    }
                    return <FaRegStar key={i} size={size} color={emptyColor} />;
                })}
                <span style={{ fontWeight: 700, fontSize: Math.round(size * 0.95), color, letterSpacing: ".01em", marginLeft: 6 }}>
                    {v.toFixed(1)}
                </span>
            </span>
        );
    }
    // Универсальный pick по первым непустым строкам
    const pick = (...cands) => {
        for (const v of cands) {
            if (typeof v === "string" && v.trim().length) return v.trim();
        }
        return "";
    };
    // Заголовок как в ProfileCard: company/organization → orgName → companyName → name → F+L → username → "Профиль"
    function getDisplayName(u) {
        const fullFL =
            `${(u?.first_name ?? u?.firstname ?? u?.firstName ?? "")} ${(u?.last_name ?? u?.lastname ?? u?.lastName ?? "")}`.trim();
        return (
            pick(
                u?.company,
                u?.organization,
                u?.org_name,
                u?.orgName,
                u?.company_name,
                u?.companyName,
                u?.name,
                fullFL,
                u?.username
            ) || t("nav.profile", "Профиль")
        );
    }
    // Подпись (имя человека) как в ProfileCard: person_name → full_name → contact_person → director → F+L → username.
    // Если совпадает с заголовком (компанией), не показываем дубликат.
    function getPersonName(u, displayName) {
        const fullFL =
            `${(u?.first_name ?? u?.firstname ?? u?.firstName ?? "")} ${(u?.last_name ?? u?.lastname ?? u?.lastName ?? "")}`.trim();
        const person = pick(
            u?.person_name,
            u?.full_name,
            u?.fullName,
            u?.contact_person,
            u?.contactPerson,
            u?.director,
            u?.director_name,
            u?.directorName,
            fullFL,
            u?.username
        );
        if (!person) return "";
        return person === displayName ? "" : person;
    }

    // Вариант: только аватар (tight, ≤1120px)
    if (mode === "icon") {
        return (
            <button
                onClick={onClick}
                className="header-icon-btn"
                aria-label={t("nav.profile", "Профиль")}
                title={t("nav.profile", "Профиль")}
                style={{ height: 40, width: 40, borderRadius: 12, padding: 0, overflow: "hidden" }}
            >
                <img
                    src={avatarUrl}
                    alt={t("img.avatar", "Аватар")}
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                    onError={(e) => { e.currentTarget.src = "/default-avatar.png"; }}
                />
            </button>
        );
    }

    // Компакт: одна строка без нижних мета‑данных (≤1280px)
    if (mode === "compact") {
        return (
            <button
                className="header-user-chip"
                style={{
                    background: "rgb(var(--surface) / 0.94)",
                    border: "1px solid var(--border-strong)",
                    boxShadow: "var(--header-shadow, var(--shadow-soft))",
                    gap: 8,
                    minWidth: 170,
                    maxWidth: 260,
                    padding: "6px 8px",
                    cursor: "pointer",
                    transition: "box-shadow .2s ease"
                }}
                onClick={onClick}
                onMouseOver={e => e.currentTarget.style.boxShadow = "var(--header-shadow-hover, var(--shadow-soft))"}
                onMouseOut={e => e.currentTarget.style.boxShadow = "var(--header-shadow, var(--shadow-soft))"}
            >
                <div style={{
                    width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
                    background: "rgb(var(--surface))", border: "1px solid var(--border-strong)", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <img src={avatarUrl} alt={t("img.avatar", "Аватар")}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => { e.currentTarget.src = "/default-avatar.png"; }} />
                </div>
                <div className="chip-text" style={{
                    fontSize: 13, fontWeight: 800, color: "var(--text-primary)",
                    lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                }}>
                    {getDisplayName(user)}
                </div>
            </button>
        );
    }

    // Полный вариант (широкие экраны)
    return (
        <button
            className="header-user-chip"
            style={{
                background: "rgb(var(--surface) / 0.94)",
                border: "1px solid var(--border-strong)",
                boxShadow: "var(--header-shadow, var(--shadow-soft))",
                gap: 8,
                minWidth: 220,
                maxWidth: 340,
                padding: "6px 9px",
                cursor: "pointer",
                transition: "box-shadow 0.2s ease",
            }}
            onClick={onClick}
            onMouseOver={e => e.currentTarget.style.boxShadow = "var(--header-shadow-hover, var(--shadow-soft))"}
            onMouseOut={e => e.currentTarget.style.boxShadow = "var(--header-shadow, var(--shadow-soft))"}
        >
            <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                overflow: "hidden",
                background: "rgb(var(--surface))",
                border: "1px solid var(--border-strong)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            }}>
                <img
                    src={avatarUrl}
                    alt={t("img.avatar", "Аватар")}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                />
            </div>

            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, width: "100%", textAlign: "left" }}>
                {/* Первая строка: организация/компания/имя (крупнее) */}
                <div style={{
                    fontSize: 13.5, fontWeight: 800, color: "var(--text-primary)", textAlign: "left",
                    lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                }}>
                    {(() => {
                        const title = getDisplayName(user);
                        return title;
                    })()}
                </div>
                {/* Вторая строка: слева имя+фамилия, справа — дни на сайте */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 8, marginTop: 0
                }}>
                    {(() => {
                        const title = getDisplayName(user);
                        const person = getPersonName(user, title);
                        return (
                            <div style={{
                                fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.1,
                                minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                            }}>
                                {person}
                            </div>
                        );
                    })()}
                    {user.created_at && (
                        <span style={{ color: `rgb(var(--primary))`, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                            {Math.max(1, Math.floor((Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)))} {t("unit.days.short", "дн.")}
                        </span>
                    )}
                </div>
                {/* Третья строка — компактный рейтинг */}
                <div className="chip-rating" style={{
                    marginTop: 2,
                    paddingTop: 2,
                    borderTop: "1px solid rgba(var(--border), 0.35)",
                    display: "flex",
                    justifyContent: "flex-end"
                }}>
                    <RatingStars value={typeof user?.final_rating === "number" ? user.final_rating : 10} size={11} showValue={false} />
                </div>
            </div>
        </button>
    );

}

export default function Header({ setShowRegisterModal }) {
    const { user, handleLogoutClick, setShowAuth, isAdmin, isActive } = useUser();
    const { t } = useLang();
    const pathname = usePathname();
    // роль пользователя (нужно, чтобы скрыть пункты меню для TRANSPORT)
    const role = (user?.role || "").toUpperCase();
    const isTransportRole = role === "TRANSPORT";
    const isOwnerRole = role === "OWNER";
    console.log("[UI][HEADER] notifications from context:", useUser().notifications);

    const { openMessenger, unread, fetchUnreadCount } = useMessenger();
    const [forceUpdate, setForceUpdate] = useState(Date.now());

    useEffect(() => {
        function handler() {
            setForceUpdate(Date.now());
        }
        window.addEventListener("inbox_update", handler);
        return () => window.removeEventListener("inbox_update", handler);
    }, []);

    /**
      * FIX #1: если пользователь залогинился (появился user.email) —
      * закрываем модалку авторизации на любой странице.
      */
    useEffect(() => {
        if (user?.email) {
            try { setShowAuth(false); } catch { }
        }
    }, [user?.email, setShowAuth]);

    // опционально: закрывать модалку при смене маршрута
    useEffect(() => { try { setShowAuth(false); } catch { } }, [pathname, setShowAuth]);

    /**
     * MOBILE FIX: перехватываем клики по ссылкам "/auth" (в т.ч. из ProfileSidebar).
     * Всегда показываем модалку авторизации поверх текущей страницы,
     * без перехода на главную. Делается на уровне документа, чтобы
     * сработало из любого места.
     */
    useEffect(() => {
        const onDocClick = (e) => {
            const a = e.target?.closest?.('a[href="/auth"],a[href="/auth/"]');
            if (!a) return;
            e.preventDefault();
            e.stopPropagation();
            try { setShowAuth(true); } catch { }
            try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { }
        };
        document.addEventListener("click", onDocClick, true);
        return () => document.removeEventListener("click", onDocClick, true);
    }, [setShowAuth]);


    // --- Выпадающее меню профиля
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);

    // --- Для поиска участника по ID/строке
    const [showUserSearch, setShowUserSearch] = useState(false);
    const [userIdInput, setUserIdInput] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const searchTimeout = useRef(null);
    const userSearchRef = useRef(null);
    const router = useRouter();

    // Mobile detection
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mql = window.matchMedia("(max-width: 768px)");
        const onChange = (e) => setIsMobile(e.matches);
        setIsMobile(mql.matches);
        try { mql.addEventListener("change", onChange); } catch { mql.addListener(onChange); }
        return () => { try { mql.removeEventListener("change", onChange); } catch { mql.removeListener(onChange); } };
    }, []);

    // ——— Мелкие десктопы
    const isCompact = useMedia("(max-width: 1280px)"); // уменьшаем шрифты/отступы
    const isTight = useMedia("(max-width: 1120px)"); // скрываем подписи у пунктов меню


    useEffect(() => {
        function updateUnread() { fetchUnreadCount(); }
        window.addEventListener("inbox_update", updateUnread);
        return () => window.removeEventListener("inbox_update", updateUnread);
    }, [fetchUnreadCount]);

    // Клик вне поиска
    useEffect(() => {
        if (!showUserSearch) return;
        function handleClick(e) {
            if (userSearchRef.current && !userSearchRef.current.contains(e.target)) {
                setShowUserSearch(false);
                setUserIdInput("");
                setResults([]);
                setNotFound(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showUserSearch]);

    // Поиск пользователей (дебаунс)
    useEffect(() => {
        if (!userIdInput.trim()) {
            setResults([]);
            setNotFound(false);
            return;
        }
        setLoading(true);
        setNotFound(false);

        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try {
                // Поменяй путь на свой API если нужно
                const resp = await fetch(`/api/users/search?query=${encodeURIComponent(userIdInput.trim())}`);
                const arr = await resp.json();
                setResults(arr);
                setNotFound(!arr.length);
            } catch {
                setResults([]);
                setNotFound(true);
            }
            setLoading(false);
        }, 330);
        return () => clearTimeout(searchTimeout.current);
    }, [userIdInput]);

    // Закрытие меню профиля по клику вне
    useEffect(() => {
        function handleClick(e) {
            if (
                profileMenuRef.current &&
                !profileMenuRef.current.contains(e.target)
            ) {
                setProfileMenuOpen(false);
            }
        }
        if (profileMenuOpen) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [profileMenuOpen]);

    // ---- Управляемые размеры логотипа/надписи/шапки
    const LOGO = isTight ? 56 : isCompact ? 70 : 84;   // размер иконки (меньше, чтобы шапка была компактнее)
    const WORD = isTight ? 16 : isCompact ? 19 : 21;   // размер надписи Transinfo.ge
    const HEADER_H = isTight ? 66 : isCompact ? 78 : 88;
    const LOGO_OVERSCAN = 1.18;       // «дозум» > 1.0, чтобы отсечь невидимые поля PNG

    const NAV_GAP = isTight ? 10 : isCompact ? 16 : 22;
    const NAV_FONT = isTight ? 13 : isCompact ? 14 : 16;
    const NAV_PAD = isTight ? "5px 8px" : isCompact ? "6px 9px" : "6px 10px";
    const ICON_BTN = isTight ? 38 : 42;
    const heroTitle = t("hero.title", "Интеллектуальная платформа для грузоперевозок");

    const headerRef = useRef(null);
    const topHeaderRef = useRef(null);
    const [headerHeight, setHeaderHeight] = useState(HEADER_H);

    useEffect(() => {
        const updateHeight = () => {
            const target = topHeaderRef.current;
            if (target) {
                const h = target.offsetHeight;
                setHeaderHeight(h);
                try { document.documentElement.style.setProperty("--header-h", `${h}px`); } catch { }
            }
        };

        updateHeight();
        window.addEventListener("resize", updateHeight);
        return () => window.removeEventListener("resize", updateHeight);
    }, [isCompact, isTight, heroTitle]);

    const logoPx = `${LOGO}px`;
    const logoInnerPx = `${Math.round(LOGO * LOGO_OVERSCAN)}px`;

    // --- Mobile header (symmetrical) ---
    if (isMobile) {
        const MOBILE_H = 56;
        return (
            <header
                className="header-root-mobile"
                style={{
                    position: "sticky",
                    top: 0,
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    height: MOBILE_H,
                    background: "rgb(var(--header-bg))",
                    padding: "0 12px",
                    boxShadow: "var(--header-shadow)",
                    zIndex: 100,
                    WebkitTapHighlightColor: "transparent"
                }}
            >
                {/* Лево: лого → домой (SPA) */}
                <Link
                    href="/"
                    aria-label={t("nav.home", "Домой")}
                    style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}
                >
                    <img src="/transinfo_logo_icon_v3.png" alt="" width={68} height={68} style={{ display: "block", borderRadius: 20 }} />
                    <span style={{ fontWeight: 900, fontSize: 18, color: "#43c8ff", letterSpacing: .3 }}>TransInfo</span>
                </Link>

                {/* Центр: пусто — поиск перенесён вправо */}
                <div />

                {/* Право: поиск + уведомления + чат + меню */}
                <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Поиск — рядом с колоколом и чатом */}
                    <button
                        onClick={() => (user ? setShowUserSearch(v => !v) : setShowAuth(true))}
                        className="header-icon-btn"
                        style={{ height: 40, width: 40, fontSize: 22, display: "grid", placeItems: "center", borderRadius: 12 }}
                        aria-label={t("search.findUser", "Найти участника")}
                        title={t("common.search", "Поиск")}
                    >
                        <FaSearch />
                    </button>
                    <div
                        role="button"
                        className="header-icon-btn"
                        style={{ height: 40, width: 40, fontSize: 22, display: "grid", placeItems: "center", borderRadius: 12 }}
                        aria-label={t("common.notifications", "Уведомления")}
                    >
                        <NotificationBell token={user?.token} userId={user?.id} />
                    </div>
                    <button
                        type="button"
                        onClick={() => (user ? openMessenger() : setShowAuth(true))}
                        className="header-icon-btn"
                        style={{ height: 40, width: 40, fontSize: 22, display: "grid", placeItems: "center", position: "relative", borderRadius: 12 }}
                        aria-label={t("nav.chat", "Чат")}
                        title={t("nav.chat", "Чат")}
                    >
                        <FaComments />
                        {unread > 0 && (
                            <span
                                style={{
                                    position: "absolute",
                                    top: 3, right: 2,
                                    background: "#e45b5b",
                                    color: "white",
                                    borderRadius: 12,
                                    padding: "0 6px",
                                    fontWeight: 800,
                                    fontSize: 12,
                                    minWidth: 18,
                                    lineHeight: "18px",
                                    textAlign: "center",
                                    boxShadow: "0 1px 4px rgba(0,0,0,.35)"
                                }}
                            >
                                {unread > 99 ? "99+" : unread}
                            </span>
                        )}
                    </button>
                    {/* Переключатель темы (мобилка) */}
                    <ThemeToggle />
                    {/* Бургер-меню (мобилка): открывает выезжающий сайдбар профиля */}
                    <MobileSidebar />
                </div>

                {/* Мобильный оверлей поиска (фиксированная ширина) */}
                {user && showUserSearch && (
                    <div style={{ position: "fixed", left: 12, right: 12, top: MOBILE_H + 8, zIndex: 120 }}>
                        <form
                            onSubmit={e => {
                                e.preventDefault();
                                if (results.length > 0) {
                                    router.push(`/profile/${results[0].id}`);
                                    setShowUserSearch(false);
                                    setUserIdInput("");
                                    setResults([]);
                                }
                            }}
                            style={{
                                position: "absolute",
                                left: 0, top: "110%",
                                zIndex: 100,
                                width: "min(520px, 100%)",
                                background: "#172236",
                                border: "1px solid #22364f",
                                borderRadius: 12,
                                padding: 12,
                                boxShadow: "0 10px 30px rgba(0,0,0,.35)"
                            }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <input
                                value={userIdInput}
                                onChange={e => setUserIdInput(e.target.value)}
                                placeholder={t("search.placeholder.user", "ID, имя или компания")}
                                style={{
                                    padding: "8px 14px",
                                    borderRadius: 8,
                                    border: "1px solid #4472c4",
                                    width: "100%",
                                    fontSize: 15,
                                    marginBottom: 5,
                                    background: "#222e46",
                                    color: "#e3f2fd",
                                    outline: "none"
                                }}
                                autoFocus
                            />
                            {loading && <div style={{ padding: 9, color: "#69e" }}>{t("common.loading", "Загрузка...")}</div>}
                            {!loading && userIdInput && (
                                <div
                                    style={{
                                        background: "#273550",
                                        borderRadius: 9,
                                        marginTop: 0,
                                        boxShadow: "0 2px 12px #0004",
                                        minWidth: 200,
                                        maxHeight: 260,
                                        overflowY: "auto",
                                        zIndex: 120
                                    }}>
                                    {notFound
                                        ? <div style={{ padding: 13, color: "#888" }}>{t("common.notFound", "Не найдено")}</div>
                                        : results.map(u => (
                                            <div key={u.id} onClick={() => {
                                                router.push(`/profile/${u.id}`);
                                                setShowUserSearch(false);
                                                setUserIdInput("");
                                                setResults([]);
                                            }} style={{
                                                display: "flex", alignItems: "center", gap: 11,
                                                cursor: "pointer", padding: "10px 13px",
                                                borderBottom: "1px solid #222e",
                                                transition: "background 0.13s",
                                            }} onMouseDown={e => e.preventDefault()}
                                                onMouseOver={e => e.currentTarget.style.background = "#23303e"}
                                                onMouseOut={e => e.currentTarget.style.background = "none"}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 18, background: "#314060",
                                                    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center"
                                                }}>
                                                    <img src={u.avatar ? abs(u.avatar) : "/default-avatar.png"}
                                                        alt="ava"
                                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                        onError={e => { e.currentTarget.src = "/default-avatar.png"; }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: "#fff" }}>
                                                        {u.organization || u.name}
                                                    </div>
                                                    <div style={{ fontSize: 13, color: "#bfe6fa" }}>{t("common.id", "ID")}: {u.id}</div>
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </form>
                    </div>
                )}
            </header>
        );
    }

    const headerPadding = isCompact
        ? { top: 10, right: 20, bottom: 8, left: 14 }
        : { top: 12, right: 22, bottom: 8, left: 16 };

    return (
        <div
            ref={headerRef}
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 0,
                ["--header-h"]: `${headerHeight}px`
            }}
        >
            <header
                className="header-root header-top"
                ref={topHeaderRef}
                style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: isCompact ? 14 : 18,
                    background: "rgb(var(--header-bg))",
                    padding: `${headerPadding.top}px ${headerPadding.right}px ${headerPadding.bottom}px ${headerPadding.left}px`,
                    boxShadow: "var(--header-shadow)",
                    borderBottom: "1px solid var(--border-strong)",
                    zIndex: 100
                }}
            >
                <Link
                    href="/"
                    className="header-logo"
                    aria-label="Transinfo.ge"
                    style={{
                        marginRight: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        ["--logo-box"]: logoPx,
                        ["--logo-inner"]: logoInnerPx
                    }}
                >
                    <div className="logo-box">
                        <img
                            className="logo-img"
                            src="/transinfo_logo_icon_v3.png"
                            alt=""
                            decoding="async"
                        />
                    </div>

                    <span
                        style={{
                            fontWeight: 900,
                            letterSpacing: ".01em",
                            fontSize: WORD,
                            lineHeight: 1,
                            color: "#7CC3FF",
                            textShadow: "0 1px 8px rgba(30,160,255,.22)"
                        }}
                    >
                        Transinfo.ge
                    </span>
                </Link>

                <div
                    className="header-tagline"
                    style={{
                        color: "var(--text-primary)",
                        fontWeight: 800,
                        fontSize: isCompact ? 15.5 : 17,
                        lineHeight: 1.32,
                        letterSpacing: 0.1,
                        maxWidth: 620,
                        paddingLeft: 4
                    }}
                >
                    {heroTitle}
                </div>

                <div style={{ flex: 1 }} />

                <div
                    className="header-actions"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: isTight ? 10 : 16,
                        minWidth: 0,
                        minHeight: ICON_BTN,
                    }}
                >
                    {user && (
                        <>
                            <div ref={userSearchRef} style={{ position: "relative" }}>
                                <button
                                    onClick={() => setShowUserSearch(v => !v)}
                                    className="header-icon-btn"
                                    style={{
                                        height: ICON_BTN, width: ICON_BTN, fontSize: isTight ? 22 : 24,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        position: "relative"
                                    }}
                                    title={t("search.findUser", "Найти участника")}
                                    tabIndex={0}
                                >
                                    <FaSearch />
                                </button>
                                {showUserSearch && (
                                    <form
                                        onSubmit={e => {
                                            e.preventDefault();
                                            if (results.length > 0) {
                                                router.push(`/profile/${results[0].id}`);
                                                setShowUserSearch(false);
                                                setUserIdInput("");
                                                setResults([]);
                                            }
                                        }}
                                        style={{
                                            position: "absolute",
                                            left: 0, top: "110%",
                                            zIndex: 100,
                                            minWidth: 250,
                                            background: "#22314a",
                                            padding: 10,
                                            borderRadius: 12,
                                            boxShadow: "0 3px 12px #0002"
                                        }}
                                    >
                                        <input
                                            type="text"
                                            value={userIdInput}
                                            onChange={e => setUserIdInput(e.target.value)}
                                            placeholder={t("search.placeholder.user", "ID, имя или компания")}
                                            style={{
                                                padding: "8px 14px",
                                                borderRadius: 8,
                                                border: "1px solid #4472c4",
                                                width: 220,
                                                fontSize: 15,
                                                marginBottom: 5,
                                                background: "#222e46",
                                                color: "#e3f2fd",
                                                outline: "none"
                                            }}
                                            autoFocus
                                        />
                                        {loading && <div style={{ padding: 9, color: "#69e" }}>{t("common.loading", "Загрузка...")}</div>}
                                        {!loading && userIdInput && (
                                            <div
                                                style={{
                                                    background: "#273550",
                                                    borderRadius: 9,
                                                    marginTop: 0,
                                                    boxShadow: "0 2px 12px #0004",
                                                    minWidth: 200,
                                                    maxHeight: 260,
                                                    overflowY: "auto",
                                                    zIndex: 120
                                                }}>
                                                {notFound
                                                    ? <div style={{ padding: 13, color: "#888" }}>{t("common.notFound", "Не найдено")}</div>
                                                    : results.map(u => (
                                                        <div
                                                            key={u.id}
                                                            onClick={() => {
                                                                router.push(`/profile/${u.id}`);
                                                                setShowUserSearch(false);
                                                                setUserIdInput("");
                                                                setResults([]);
                                                            }}
                                                            style={{
                                                                display: "flex", alignItems: "center", gap: 11,
                                                                cursor: "pointer", padding: "10px 13px",
                                                                borderBottom: "1px solid #222e",
                                                                transition: "background 0.13s",
                                                            }}
                                                            onMouseDown={e => e.preventDefault()}
                                                            onMouseOver={e => e.currentTarget.style.background = "#23303e"}
                                                            onMouseOut={e => e.currentTarget.style.background = "none"}
                                                        >
                                                            <div style={{
                                                                width: 36, height: 36, borderRadius: 18, background: "#314060",
                                                                overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center"
                                                            }}>
                                                                <img src={u.avatar ? abs(u.avatar) : "/default-avatar.png"}
                                                                    alt="ava"
                                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                                    onError={e => { e.currentTarget.src = "/default-avatar.png"; }} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, color: "#fff" }}>
                                                                    {u.organization || u.name}
                                                                </div>
                                                                <div style={{ fontSize: 13, color: "#bfe6fa" }}>{t("common.id", "ID")}: {u.id}</div>
                                                            </div>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        )}
                                    </form>
                                )}
                            </div>
                            <div
                                className="header-icon-btn"
                                style={{
                                    height: ICON_BTN, width: ICON_BTN, fontSize: isTight ? 21 : 23,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    position: "relative",
                                    transition: "box-shadow .17s, background .15s",
                                    background: "none",
                                    cursor: "pointer"
                                }}
                                aria-label={t("common.notifications", "Уведомления")}
                                onMouseOver={e => e.currentTarget.style.background = "#1c273e"}
                                onMouseOut={e => e.currentTarget.style.background = "none"}
                            >
                                <NotificationBell token={user?.token} userId={user?.id} />
                            </div>
                            <button
                                type="button"
                                onClick={openMessenger}
                                className="header-icon-btn"
                                style={{ height: ICON_BTN, width: ICON_BTN, fontSize: isTight ? 22 : 24, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
                                title={t("nav.chat", "Чат")}
                                tabIndex={0}
                            >
                                <FaComments />
                                {unread > 0 && (
                                    <span
                                        style={{
                                            position: "absolute",
                                            top: 4,
                                            right: 3,
                                            background: "#e45b5b",
                                            color: "white",
                                            borderRadius: 12,
                                            padding: "0 7px",
                                            fontWeight: 700,
                                            fontSize: 13,
                                            minWidth: 20,
                                            height: 20,
                                            textAlign: "center",
                                            lineHeight: "20px"
                                        }}
                                    >
                                        {unread}
                                    </span>
                                )}
                            </button>

                            <ThemeToggle />

                            <div style={{ position: "relative", height: "var(--header-h)" }} ref={profileMenuRef}>
                                <MiniProfile
                                    user={user}
                                    mode={isTight ? "icon" : isCompact ? "compact" : "full"}
                                    onClick={() => setProfileMenuOpen((v) => !v)}
                                />
                                {profileMenuOpen && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: 52, right: 0,
                                            background: "#232d45",
                                            borderRadius: 10,
                                            boxShadow: "0 4px 22px #123d7060",
                                            padding: "10px 0",
                                            zIndex: 100,
                                            minWidth: 165,
                                        }}
                                    >
                                        <Link
                                            href="/profile"
                                            style={{
                                                display: "block", padding: "10px 22px",
                                                color: "#fff", fontWeight: 700, textDecoration: "none",
                                                cursor: "pointer", transition: "background .14s"
                                            }}
                                            onClick={() => setProfileMenuOpen(false)}
                                        >
                                            {t("nav.profile", "Профиль")}
                                        </Link>
                                        {isAdmin && (
                                            <Link
                                                href="/admin"
                                                style={{
                                                    display: "block", padding: "10px 22px",
                                                    color: "#a6e0ff", fontWeight: 700, textDecoration: "none",
                                                    cursor: "pointer", transition: "background .14s"
                                                }}
                                                onClick={() => setProfileMenuOpen(false)}
                                            >
                                                {t("nav.admin", "Админ")}
                                            </Link>
                                        )}
                                        <div
                                            style={{
                                                height: 1, background: "#22364f", margin: "7px 0"
                                            }}
                                        />
                                        <div
                                            style={{
                                                background: "#1c2740",
                                                border: "1px solid #3a475e",
                                                borderRadius: 10,
                                                padding: "10px 12px",
                                                margin: "6px 10px 8px"
                                            }}
                                        >
                                            <LangSwitcher />
                                        </div>
                                        <button
                                            onClick={async () => {
                                                setProfileMenuOpen(false);
                                                try { await handleLogoutClick?.(); } catch { }
                                            }}
                                            style={{
                                                background: "none", border: "none", color: "#e35c5c",
                                                fontWeight: 700, fontSize: 15, width: "100%", textAlign: "left",
                                                padding: "10px 22px", cursor: "pointer"
                                            }}
                                        >
                                            {t("nav.logout", "Выйти")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {!user && (
                        <div style={{ display: "flex", alignItems: "center", gap: isTight ? 8 : 10 }}>
                            <div style={{ marginRight: 6 }}>
                                <LangSwitcher variant="compact" />
                            </div>
                            {isTight ? (
                                <>
                                    <button
                                        className="header-icon-btn"
                                        style={{ height: ICON_BTN, width: ICON_BTN, fontSize: 20 }}
                                        title={t("auth.register", "Регистрация")}
                                        aria-label={t("auth.register", "Регистрация")}
                                        onClick={() => setShowRegisterModal(true)}
                                    >
                                        <FaUserPlus />
                                    </button>
                                    <button
                                        className="header-icon-btn"
                                        style={{ height: ICON_BTN, width: ICON_BTN, fontSize: 20 }}
                                        title={t("auth.login", "Вход")}
                                        aria-label={t("auth.login", "Вход")}
                                        onClick={() => setShowAuth(true)}
                                    >
                                        <FaSignInAlt />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        className="nav-link"
                                        style={{ fontWeight: 800, fontSize: 16, background: "none", border: "none", cursor: "pointer", height: 44, padding: "0 19px" }}
                                        onClick={() => setShowRegisterModal(true)}
                                    >
                                        <FaUserPlus className="nav-icon" style={{ fontSize: 20 }} />
                                        <span className="nav-text">{t("auth.register", "Регистрация")}</span>
                                    </button>
                                    <button
                                        className="header-btn"
                                        type="button"
                                        style={{ fontWeight: 700, fontSize: 16, height: 44, padding: "0 20px" }}
                                        onClick={() => setShowAuth(true)}
                                    >
                                        <FaSignInAlt className="nav-icon" style={{ fontSize: 20 }} />
                                        {t("auth.login", "Вход")}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <div
                className="header-nav-row"
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: isCompact ? 10 : 14,
                    width: "100%",
                    padding: `0 ${headerPadding.right}px 0 0`
                }}
            >
                <div
                    className="header-nav-shell"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "rgb(var(--surface))",
                        border: "1px solid var(--border-strong)",
                        borderRadius: isTight ? "0 0 12px 12px" : "0 0 16px 16px",
                        boxShadow: "0 -4px 12px rgba(0,0,0,0.05), var(--header-shadow)",
                        padding: isCompact ? "7px 11px" : "8px 12px",
                        gap: NAV_GAP,
                        marginTop: isCompact ? -8 : -10
                    }}
                >
                    <nav
                        className="header-nav"
                        style={{
                            display: "flex", alignItems: "center",
                            gap: NAV_GAP, minWidth: 0
                        }}
                    >
                        {!isTransportRole && (
                            <Link className="nav-link" href="/transport"
                                onClick={() => { try { sessionStorage.setItem("openMobileFilterOnEntry", "1"); } catch { } }}
                                style={{ fontSize: NAV_FONT, fontWeight: 700, padding: NAV_PAD }}>
                                <FaTruck className="nav-icon" style={{ fontSize: isTight ? 18 : 20 }} />
                                {!isTight && <span className="nav-text">{t("nav.transport", "Транспорт")}</span>}
                            </Link>
                        )}
                        {!isOwnerRole && (
                            <Link className="nav-link" href="/orders"
                                onClick={() => { try { sessionStorage.setItem("openMobileFilterOnEntry", "1"); } catch { } }}
                                style={{ fontSize: NAV_FONT, fontWeight: 700, padding: NAV_PAD }}>
                                <FaBox className="nav-icon" style={{ fontSize: isTight ? 18 : 20 }} />
                                {!isTight && <span className="nav-text">{t("nav.cargo", "Груз")}</span>}
                            </Link>
                        )}
                        {!isOwnerRole && (
                            <button
                                className="nav-link"
                                onClick={() => {
                                    if (!isActive) { alert(t("error.account.blocked", "Аккаунт заблокирован")); return; }
                                    router.push("/create-transport");
                                }}
                                style={{
                                    fontSize: NAV_FONT, fontWeight: 700, padding: NAV_PAD,
                                    opacity: isActive ? 1 : .5, cursor: "pointer", background: "none", border: "none"
                                }}
                            >
                                {isTight ? <FaTruck className="nav-icon" style={{ fontSize: 18 }} /> : <FaPlus className="nav-icon" style={{ fontSize: 20 }} />}
                                {!isTight && <span className="nav-text">{t("nav.addTransport", "Добавить Транспорт")}</span>}
                            </button>
                        )}
                        {!isTransportRole && (
                            <button
                                className="nav-link"
                                onClick={() => {
                                    if (!isActive) { alert(t("error.account.blocked", "Аккаунт заблокирован")); return; }
                                    router.push("/create");
                                }}
                                style={{
                                    fontSize: NAV_FONT, fontWeight: 700, padding: NAV_PAD,
                                    opacity: isActive ? 1 : .5, cursor: "pointer", background: "none", border: "none"
                                }}
                            >
                                {isTight ? <FaBox className="nav-icon" style={{ fontSize: 18 }} /> : <FaPlus className="nav-icon" style={{ fontSize: 20 }} />}
                                {!isTight && <span className="nav-text">{t("nav.addCargo", "Добавить Груз")}</span>}
                            </button>
                        )}
                        <Link className="nav-link" href="/#service"
                            style={{ fontSize: NAV_FONT, fontWeight: 700, padding: NAV_PAD }}>
                            <FaInfoCircle className="nav-icon" style={{ fontSize: isTight ? 18 : 20 }} />
                            {!isTight && <span className="nav-text">{t("nav.about", "О Сервисе")}</span>}
                        </Link>
                    </nav>
                </div>
            </div>
        </div>
    );
}