"use client";
import React from "react";
import BootHydrator from "@/app/components/BootHydrator";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/app/UserContext";
import { useLang } from "@/app/i18n/LangProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const pathname = usePathname();
    const { isAdmin } = useUser();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    if (!isAdmin) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center text-slate-200">
                <div className="p-6 rounded-2xl border border-slate-700/60 bg-slate-900/40">
                    {t("admin.onlyAdmins", "Доступ только для администраторов.")}
                </div>
            </div>
        );
    }
    const router = useRouter();
    const { user } = useUser(); // предполагается, что тут есть user.role

    React.useEffect(() => {
        if (!user) return;
        const role = (user.role || "").toUpperCase();
        if (role !== "ADMIN") router.replace("/");
    }, [user, router]);

    const NavLink = ({ href, label }: { href: string; label: string }) => (
        <Link
            href={href}
            className={`block px-4 py-2 rounded-xl transition ${pathname === href
                ? "bg-slate-800/70 text-white shadow-sm"
                : "hover:bg-slate-800/40 text-slate-300"
                }`}
            onClick={() => setIsMenuOpen(false)}
        >
            {label}
        </Link>
    );

    return (
        <div className="flex min-h-[calc(100vh-80px)] text-slate-100 flex-col md:flex-row">
            <div className="md:hidden p-4 flex items-center justify-between">
                <div className="font-bold text-xl text-slate-200">{t("admin.sidebar.title", "Админ")}</div>
                <button
                    className="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-200 bg-slate-900/60"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                >
                    {isMenuOpen ? t("common.close", "Закрыть") : t("common.menu", "Меню")}
                </button>
            </div>
            <aside
                className={`md:w-64 p-4 border border-slate-700/60 bg-slate-900/40 backdrop-blur rounded-r-2xl md:border-r ${isMenuOpen ? "block" : "hidden"} md:block md:sticky md:top-4 md:self-start md:h-[calc(100vh-100px)]`}
            >
                <div className="hidden md:block font-bold text-xl mb-4 text-slate-200">{t("admin.sidebar.title", "Админ")}</div>
                <nav className="space-y-1">
                    {/* активный пункт — плотнее и светлее */}
                    <NavLink href="/admin" label={t("admin.sidebar.dashboard", "Панель")} />
                    <NavLink href="/admin/users" label={t("admin.sidebar.users", "Пользователи")} />
                    <NavLink href="/admin/orders" label={t("admin.sidebar.orders", "Заявки")} />
                    <NavLink href="/admin/transports" label={t("admin.sidebar.transports", "Транспорт")} />
                    <NavLink href="/admin/tracking" label={t("admin.sidebar.tracking", "Трекинг")} />
                    <NavLink href="/admin/audit" label={t("admin.sidebar.audit", "Аудит")} />
                    {/* Следующие разделы добавим во 2 фазе */}
                    {/* <NavLink href="/admin/verifications" label="Verifications" /> */}
                    {/* <NavLink href="/admin/orders" label="Orders" /> */}
                    {/* <NavLink href="/admin/transports" label="Transports" /> */}
                    {/* <NavLink href="/admin/tracking" label="Tracking" /> */}
                    {/* <NavLink href="/admin/support" label="Support" /> */}
                    {/* <NavLink href="/admin/settings" label="Settings" /> */}
                    {/* <NavLink href="/admin/audit" label="Audit" /> */}
                </nav>
            </aside>
            <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
    );
}