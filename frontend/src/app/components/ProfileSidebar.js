"use client";
import Link from "next/link";
import { useUser } from "@/app/UserContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
    FaFileAlt, FaTruck, FaRegComments, FaIdCard, FaCertificate, FaLock,
    FaUser, FaUserFriends, FaInbox, FaUserShield, FaUserCog, FaChevronRight, FaDollarSign, FaMapMarker, FaUserSlash, FaUserPlus,
    FaBookmark, FaLanguage
} from "react-icons/fa";
import LangSwitcher from "./LangSwitcher";
import { FaSignOutAlt } from "react-icons/fa";
import { useEffect, useState } from "react";
import { Headset } from "lucide-react";
import { useOpenSupport } from "../../hooks/useOpenSupport";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

export default function ProfileSidebar({ variant = "desktop" }) {
    const { t } = useLang();
    const [showSoon, setShowSoon] = useState(false);
    const { isAdmin, contacts = [], contactReq = { incoming: [], outgoing: [] }, fetchContacts, fetchContactRequests } = useUser();
    const [user, setUser] = useState(null);
    const { authFetchWithRefresh } = useUser();
    // для выхода из аккаунта
    const { handleLogoutClick } = useUser();

    // Общий хук открытия поддержки — то же поведение, что и у иконки в десктопе
    const openSupport = useOpenSupport();
    useEffect(() => { try { fetchContacts?.(); fetchContactRequests?.(); } catch { } }, []);

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        authFetchWithRefresh(api(`/me`))
            .then(res => res.json())
            .then(data => setUser(data));
    }, []);

    const iconColor = "var(--sidebar-icon)";

    const baseStyle = {
        minWidth: 280,
        background: "var(--sidebar-bg)",
        borderRadius: 18,
        border: "1px solid var(--sidebar-border)",
        boxShadow: "var(--sidebar-shadow)",
        padding: "38px 14px 28px 18px",
        color: "var(--sidebar-link)",
        height: "fit-content",
        marginRight: 22,
        transition: "background var(--transition-normal), color var(--transition-normal), border-color var(--transition-normal)",
    };
    const mobStyle = {
        ...baseStyle,
        minWidth: "auto",
        width: "100%",
        marginRight: 0,
        borderRadius: 14,
        padding: "22px 12px 18px 12px",
    };

    if (!user) return (
        <aside style={variant === "mobile" ? mobStyle : baseStyle}>
            {variant === "mobile" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "var(--sidebar-link)" }}>
                        {t("auth.loginOrRegister", "შესვლა / რეგისტრაცია")}
                    </div>
                    <div style={{ marginLeft: "auto" }}>
                        <LangSwitcher variant="compact" />
                    </div>
                </div>
            ) : (
                <div style={{ fontWeight: 700, fontSize: 18, color: "var(--sidebar-title)" }}>
                    {t("nav.profile", "Профиль")}
                </div>
            )}
            <div style={{ marginTop: variant === "mobile" ? 6 : 25, color: "var(--sidebar-link-muted)" }}>
                {t("common.loading", "Загрузка...")}
            </div>
        </aside>
    );


    return (
        <aside
            style={{
                ...(variant === "mobile" ? mobStyle : baseStyle),
                display: "flex",
                flexDirection: "column",
                gap: 15
            }}>
            {variant !== "mobile" && (
                <div style={{
                    fontWeight: 700,
                    fontSize: 22,
                    color: "var(--sidebar-title)",
                    marginBottom: 17,
                    marginLeft: 3,
                }}>
                    {user.first_name || user.username || t("nav.profile", "Профиль")}
                </div>
            )}


            {/* Язык — показываем прямо в списке, только в мобильной версии */}
            {variant === "mobile" && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 13,
                        padding: "10px 8px 10px 6px",
                        borderRadius: 9,
                        color: "var(--sidebar-link)",
                        fontWeight: 600,
                        fontSize: 16,
                        background: "none",
                        boxShadow: "none"
                    }}
                >
                    <span style={{ fontSize: 18 }}>
                        <FaLanguage style={{ color: iconColor }} />
                    </span>
                    <span>{t("lang.title", "Язык")}</span>
                    <span style={{ marginLeft: "auto" }}>
                        {/* компактная кнопка-флаг, по тапу открывается список с флагами и названиями */}
                        <LangSwitcher variant="compact" />
                    </span>
                </div>
            )}

            {/* Основной профиль */}
            <SidebarLink
                href="/profile"
                icon={<FaIdCard style={{ color: iconColor }} />}
                active={pathname === "/profile" && !searchParams.toString()}
            >{t("sidebar.myProfile", "Мой профиль")}</SidebarLink>

            {/* Мониторинг GPS (заглушка) */}
            <button
                type="button"
                onClick={() => setShowSoon(true)}
                className="w-full"
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "10px 8px 10px 6px",
                    borderRadius: 9,
                    color: "var(--sidebar-link)",
                    fontWeight: 600,
                    fontSize: 16,
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    boxShadow: "none",
                    transition: "all .18s",
                    cursor: "pointer"
                }}
            >
                <span style={{ fontSize: 18, color: iconColor }}><FaMapMarker /></span>
                {t("live.title", "GPS мониторинг")}
            </button>

            {/* Сохранённые */}
            <SidebarLink
                href="/profile?saved=1"
                icon={<FaBookmark style={{ color: iconColor }} />}
                active={!!searchParams.get("saved")}
            >{t("sidebar.saved", "Сохранённые")}</SidebarLink>

            {/* Owner: заявки */}
            {user.role?.toLowerCase() === "owner" && (
                <SidebarLink
                    href="/profile?orders=1"
                    icon={<FaFileAlt style={{ color: iconColor }} />}
                    active={!!searchParams.get("orders")}
                >{t("sidebar.orders", "Заявки")}</SidebarLink>
            )}

            {user.role?.toLowerCase() === "transport" && (
                <>
                    <SidebarLink
                        href="/profile?transports=1"
                        icon={<FaTruck style={{ color: iconColor }} />}
                        active={!!searchParams.get("transports")}
                    >{t("sidebar.transports", "Транспорт")}</SidebarLink>

                    <SidebarLink
                        href="/profile?mybids=1"
                        icon={<FaDollarSign style={{ color: iconColor }} />}
                        active={!!searchParams.get("mybids")}
                    >{t("sidebar.bids", "Ставки")}</SidebarLink>
                </>
            )}

            {/* Экспедитор: заявки, транспорт и ставки */}
            {user.role?.toLowerCase() === "manager" && (
                <>
                    <SidebarLink
                        href="/profile?orders=1"
                        icon={<FaFileAlt style={{ color: iconColor }} />}
                    active={!!searchParams.get("orders")}
                >{t("sidebar.orders", "Заявки")}</SidebarLink>
                <SidebarLink
                    href="/profile?transports=1"
                    icon={<FaTruck style={{ color: iconColor }} />}
                    active={!!searchParams.get("transports")}
                >{t("sidebar.transports", "Транспорт")}</SidebarLink>
                <SidebarLink
                    href="/profile?mybids=1"
                    icon={<FaDollarSign style={{ color: iconColor }} />}
                    active={!!searchParams.get("mybids")}
                >{t("sidebar.bids", "Ставки")}</SidebarLink>
                    <SidebarLink
                        href="/profile?employees=1"
                        icon={<FaUserCog style={{ color: iconColor }} />}
                        active={!!searchParams.get("employees")}
                    >{t("sidebar.employees", "Сотрудники")}</SidebarLink>
                </>
            )}
            {user.role?.toLowerCase() === "employee" && (
                <>
                    <SidebarLink
                        href="/profile?orders=1"
                    icon={<FaFileAlt style={{ color: iconColor }} />}
                        active={!!searchParams.get("orders")}
                    >{t("sidebar.orders", "Заявки")}</SidebarLink>
                    <SidebarLink
                        href="/profile?transports=1"
                    icon={<FaTruck style={{ color: iconColor }} />}
                        active={!!searchParams.get("transports")}
                    >{t("sidebar.transports", "Транспорт")}</SidebarLink>
                    <SidebarLink
                        href="/profile?mybids=1"
                    icon={<FaDollarSign style={{ color: iconColor }} />}
                        active={!!searchParams.get("mybids")}
                    >{t("sidebar.bids", "Ставки")}</SidebarLink>
                </>
            )}

            {/* Контакты */}
            <SidebarLink
                href="/profile?contacts=1"
                icon={<FaUserFriends style={{ color: iconColor }} />}
                active={!!searchParams.get("contacts")}
            >
                <>
                    <span>{t("sidebar.contacts", "Контакты")}</span>
                    <span style={{ marginLeft: "auto", background: "var(--sidebar-badge-bg)", color: "var(--sidebar-badge-fg)", border: "1px solid var(--sidebar-badge-border)", borderRadius: 10, padding: "2px 8px", fontSize: 12 }}>
                        {(contacts || []).length || 0}
                    </span>
                </>
            </SidebarLink>

            {/* Запросы в контакты — перенесены внутрь страницы "Контакты" */}

            {/* Заблокированные */}
            <SidebarLink
                href="/profile?blocked=1"
                icon={<FaUserSlash style={{ color: iconColor }} />}
                active={!!searchParams.get("blocked")}
            >{t("sidebar.blocked", "Заблокированные")}</SidebarLink>

            {/* Отзывы */}
            <SidebarLink
                href="/profile?reviews=1"
                icon={<FaRegComments style={{ color: iconColor }} />}
                active={!!searchParams.get("reviews")}
            >{t("sidebar.reviews", "Отзывы")}</SidebarLink>

            {/* Поддержка (всегда доступна). Жмём тот же сценарий, что и FAB → open by chatId */}
            <button
                type="button"
                data-close
                onClick={openSupport}
                className="w-full"
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "10px 8px 10px 6px",
                    borderRadius: 9,
                    color: "var(--sidebar-link)",
                    fontWeight: 600,
                    fontSize: 16,
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    boxShadow: "none",
                    transition: "all .18s"
                }}
            >
                <span style={{ fontSize: 18 }}>
                    <Headset size={18} color={iconColor} />
                </span>
                {t("sidebar.support", "Поддержка")}
            </button>

            {/* Выйти — только в мобильной версии сайдбара, сразу под "Настройки" */}
            {variant === "mobile" && (
                <button
                    type="button"
                    data-close
                    onClick={async () => {
                        try { await handleLogoutClick?.(); }
                        finally {
                            try { router.push("/"); } catch { }
                            try { router.refresh(); } catch { }
                        }
                    }}
                    className="w-full"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 13,
                        padding: "10px 8px 10px 6px",
                        borderRadius: 9,
                        color: "var(--sidebar-link)",
                        fontWeight: 600,
                        fontSize: 16,
                        textDecoration: "none",
                        background: "none",
                        border: "none",
                        width: "100%",
                        textAlign: "left",
                        marginBottom: 10
                    }}
                >
                    <span style={{ fontSize: 18 }}>
                        <FaSignOutAlt style={{ color: iconColor }} />
                    </span>
                    {t("sidebar.logout", "Выйти")}
                </button>
            )}

            {/* Админка — только для ADMIN */}
            {isAdmin && (
                <SidebarLink
                    href="/admin"
                    icon={<FaUserShield style={{ color: iconColor }} />}
                    active={false}
                >{t("sidebar.admin", "Админ-панель")}</SidebarLink>
            )}

            {/* --- Простая модалка "Скоро доступно" (внутри компонента) --- */}
            {showSoon && (
                <div
                    onClick={() => setShowSoon(false)}
                    style={{
                        position: "fixed", inset: 0, background: "#001a", zIndex: 200000,
                        display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "min(92vw, 420px)",
                            background: "var(--sidebar-bg)",
                            border: "1px solid var(--sidebar-border)",
                            borderRadius: 14,
                            padding: 22,
                            color: "var(--sidebar-link)",
                            boxShadow: "0 10px 40px color-mix(in srgb, #000 22%, transparent)"
                        }}
                    >
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                            {t("gps.soon.title", "Скоро доступно")}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--sidebar-link-muted)" }}>
                            {t("gps.soon.body", "GPS-мониторинг находится в разработке и появится в ближайших обновлениях.")}
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
                            <button
                                onClick={() => setShowSoon(false)}
                                style={{ background: "var(--brand-blue)", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}
                            >
                                {t("common.ok", "Понятно")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}

function SidebarLink({ href, icon, active, children }) {
    return (
        <Link
            href={href}
            className="sidebar-link"
            style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "10px 8px 10px 6px",
                background: active ? "var(--sidebar-link-active-bg)" : "none",
                borderRadius: 9,
                color: active ? "var(--sidebar-link-active)" : "var(--sidebar-link)",
                fontWeight: 600,
                fontSize: 16,
                textDecoration: "none",
                boxShadow: active ? "0 2px 8px color-mix(in srgb, var(--sidebar-link-active) 18%, transparent)" : "none",
                transition: "all .18s"
            }}
        >
            <span style={{ fontSize: 18 }}>{icon}</span>
            {children}
            {active && <FaChevronRight size={15} style={{ marginLeft: "auto", color: "var(--sidebar-link-active)" }} />}
        </Link>
    );
}
