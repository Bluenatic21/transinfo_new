
"use client";
import Link from "next/link";
import { useUser } from "@/app/UserContext";
import { FaListAlt, FaCheckCircle, FaPlusCircle, FaInfoCircle, FaUser } from "react-icons/fa";
import { useLang } from "../i18n/LangProvider";

export default function Sidebar({ activeTab = "list", onTabChange }) {
    const { t } = useLang();
    const navItems = (t) => ([
        { href: "/orders", label: t("nav.orders", "Заявки"), icon: <FaListAlt /> },
        { href: "/orders?matches_only=1", label: t("nav.matches", "Соответствия"), icon: <FaCheckCircle /> },
        { href: "/create", label: t("nav.createOrder", "Создать заявку"), icon: <FaPlusCircle /> },
        { href: "/#service", label: t("nav.about", "О сервисе"), icon: <FaInfoCircle /> },
        { href: "/profile", label: t("nav.profile", "Профиль"), icon: <FaUser /> },
    ]);
    const { user } = useUser() || {};
    const role = (user?.role || "").toUpperCase();
    const isOwnerRole = role === "OWNER";
    const itemsAll = navItems(t);
    const items = isOwnerRole ? itemsAll.filter((i) => !i.href.startsWith("/orders")) : itemsAll;

    return (
        <aside
            className="app-sidebar"
            style={{
                width: 232,
                background: "var(--sidebar-bg)",
                borderRight: "1.5px solid var(--sidebar-border)",
                padding: "24px 0 0 0",
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                boxShadow: "var(--sidebar-shadow)",
                backdropFilter: "blur(4px)",
                position: "sticky",
                top: 0,
                marginTop: 24,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
            }}
        >
            <div
                style={{
                    color: "var(--sidebar-title)",
                    fontWeight: 900,
                    fontSize: 27,
                    letterSpacing: 2,
                    margin: "0 0 30px 32px",
                    textShadow: "var(--sidebar-title-shadow)",
                    userSelect: "none",
                }}
            >
                {t("sidebar.logistics", "Логистика")}
            </div>

            <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        style={{
                            padding: "13px 32px",
                            textDecoration: "none",
                            fontWeight: 700,
                            borderRadius: 8,
                            margin: "0 14px",
                            position: "relative",
                            transition: "background var(--transition-normal), color var(--transition-fast)",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                        className="sidebar-link"
                    >
                        <span style={{ display: "inline-flex" }}>{item.icon}</span>
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>
        </aside>
    );
}