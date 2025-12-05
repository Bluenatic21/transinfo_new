"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import { FaTruck, FaBox } from "react-icons/fa"; // ← как в Header

/**
 * Роутовые табы для раздела "Заявки":
 *  - "Грузы"      -> /orders
 *  - "Транспорт"  -> /transport
 * Последний выбор запоминаем в localStorage("ordersTab").
 */
export default function OrdersTabs({ mode = "route" }) {
    const pathname = usePathname();
    // Контекст пользователя (роль)
    const { user } = useUser() || {};
    const role = (user?.role || "").toUpperCase();
    const { t } = useLang();

    const isActive = (tabKey) => {
        if (mode !== "route") return false;
        if (tabKey === "cargo") {
            return pathname === "/orders" || pathname?.startsWith("/orders/");
        }
        if (tabKey === "transport") {
            return pathname === "/transport" || pathname?.startsWith("/transport/");
        }
        return false;
    };

    const hrefFor = (tabKey) => (tabKey === "cargo" ? "/orders" : "/transport");

    const remember = useCallback((tabKey) => {
        try {
            localStorage.setItem("ordersTab", tabKey);
        } catch { }
    }, []);

    // OWNER и TRANSPORT не видят переключатель "Грузы / Транспорт"
    if (role === "OWNER" || role === "TRANSPORT") {
        return null;
    }

    const Tab = ({ tKey, label, Icon }) => (
        <Link
            href={hrefFor(tKey)}
            prefetch={false}
            onClick={() => remember(tKey)}
            className={`flex-1 text-center py-2 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 ${isActive(tKey)
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-white/5 text-slate-300"
                }`}
        >
            {/* слева иконка как в Header */}
            <Icon className="shrink-0" style={{ fontSize: 16 }} />
            <span>{label}</span>
        </Link>
    );

    return (
        <div className="sticky top-0 z-20 bg-[#0b1324]/80 backdrop-blur px-3 pt-3 pb-2">
            <div className="flex gap-2">
                <Tab
                    tKey="cargo"
                    label={t("orders.tabs.cargo", "Грузы")}
                    Icon={FaBox}
                />
                <Tab
                    tKey="transport"
                    label={t("orders.tabs.transport", "Транспорт")}
                    Icon={FaTruck}
                />
            </div>
        </div>
    );
}
