"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "../UserContext";
import { useMessenger } from "./MessengerContext";
import { NAV_BY_ROLE, getBadgeCount } from "../config/mobileNav";
import { FaPlusCircle } from "react-icons/fa";
import { FaRightToBracket } from "react-icons/fa6";
import { useLang } from "../i18n/LangProvider";


// i18n-ключ по маршруту (чтобы не зависеть от raw label из конфигов)
const NAV_HREF_TO_KEY = {
    "/": "nav.home",
    "/orders": "nav.orders",
    "/matches": "nav.matches",
    "/profile": "nav.profile",
    "/transport": "nav.transport",
    "/cargo": "nav.cargo",
    "/messenger": "nav.messenger",
    "/contacts": "nav.contacts",
    "/support": "nav.support",
};

// Русские фолбэки на случай отсутствия перевода
const KEY_FALLBACK_RU = {
    "nav.home": "Главная",
    "nav.orders": "Заявки",
    "nav.matches": "Соответствия",
    "nav.profile": "Профиль",
    "nav.transport": "Транспорт",
    "nav.cargo": "Грузы",
    "nav.messenger": "Чаты",
    "nav.contacts": "Контакты",
    "nav.support": "Поддержка",
    "nav.my": "Моё",
    "common.add": "Добавить",
};

/**
 * Мобильный нижний бар:
 * - используем твой NAV_BY_ROLE (ничего не ломаем)
 * - без второго бара; центральный "+" встроен
 * - action sheet: /create и /create-transport
 * - открытие оверлея чата из контекста
 * - автоскрытие при скролле, safe-area, бейджи
 */
export default function BottomNavBar() {
    const { t } = useLang();
    const router = useRouter();
    const pathname = usePathname();
    const { user, contactReq, setShowAuth } = useUser();
    const role = (user?.role || "").toUpperCase();
    const isOwnerRole = role === "OWNER";
    const messenger = (typeof useMessenger === "function") ? useMessenger() : null;
    // «Моё» может приходить как спец-маркер "__my__" — считаем всё это «пунктом Моё»
    const MY_HREFS = new Set(["/my", "__my__", "/messages", "/messenger"]);
    const MATCHES_HREFS = new Set(["/matches"]);
    const normalizeHref = (href) => (href === "__my__" ? "/my" : href);

    // Чтение ролей из localStorage (как в странице /my)
    const detectRoles = () => {
        try {
            const rawUser =
                localStorage.getItem("auth:user") ??
                localStorage.getItem("user") ??
                localStorage.getItem("profile");
            const rolesFromKey = localStorage.getItem("roles");
            const roles = [];
            if (rolesFromKey) {
                const r = JSON.parse(rolesFromKey);
                if (Array.isArray(r)) roles.push(...r);
            }
            if (rawUser) {
                const u = JSON.parse(rawUser);
                if (u) {
                    if (Array.isArray(u.roles)) roles.push(...u.roles);
                    if (typeof u.role === "string") roles.push(u.role);
                    if (typeof u.user_role === "string") roles.push(u.user_role);
                }
            }
            return Array.from(new Set(roles.filter(Boolean).map(r => String(r).toLowerCase().trim())));
        } catch {
            return [];
        }
    };

    const baseItems = NAV_BY_ROLE[role] || NAV_BY_ROLE.OWNER;

    // счётчики бейджей (оставил то, что уже есть в проекте)
    const counters = {
        messages: messenger?.unread || 0,
        contacts: (contactReq?.incoming?.length || 0),
        matches: 0,
    };
    // Вставляем центральный FAB (если его нет)
    const items = useMemo(() => {
        const arr = baseItems.slice();

        // Гость → первая ячейка: "Заявки" + иконка как у "ჩემი" (/my)
        // Ищем первую из возможных ссылок и приводим к /orders,
        // а иконку берём из пункта "/my" (если есть в baseItems).
        if (!user?.email) {
            const myTemplate = baseItems.find(
                (i) => MY_HREFS.has(normalizeHref(i.href))
            );
            const firstIdx = arr.findIndex(
                (i) => ["/orders", "/transport", "/cargo"].includes(i.href)
            );
            if (firstIdx !== -1) {
                arr[firstIdx] = {
                    ...arr[firstIdx],
                    href: "/orders",
                    // подпись берём по href через NAV_HREF_TO_KEY; оставим ключ для читаемости
                    label: "nav.orders",
                    // иконка — как у "ჩემი" (/my)
                    icon: myTemplate?.icon || arr[firstIdx]?.icon,
                };
            } else {
                arr.unshift({
                    href: "/orders",
                    label: "nav.orders",
                    icon: myTemplate?.icon, // иконка "ჩემი" (/my)
                });
            }
        }


        // Гость → меняем "Профиль" на "Вход"
        if (!user?.email) {
            const idx = arr.findIndex(i => i.href === "/profile");
            if (idx !== -1) {
                arr[idx] = { href: "/auth", label: t("nav.login", "Вход"), icon: FaRightToBracket };
            }
        }

        // вставляем центральный FAB, если его нет
        const hasAdd = arr.some(i =>
            i.href === "/create" || i.href === "/create-transport" || i.href === "__add__"
        );
        if (!hasAdd) {
            const mid = Math.floor((arr.length + 1) / 2);
            arr.splice(mid, 0, { href: "__add__", label: t("common.add", "Добавить"), icon: FaPlusCircle });
        }

        return arr;
    }, [baseItems, user?.email, t]);

    const [sheetOpen, setSheetOpen] = useState(false);
    const [sheetMode, setSheetMode] = useState("add"); // "add" | "auth"

    // автоскрытие на скролле (вниз — прячем, вверх — показываем)
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        let lastY = window.scrollY;
        let raf = 0;
        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const y = window.scrollY;
                const dy = y - lastY;
                if (Math.abs(dy) > 8) setHidden(dy > 0);
                lastY = y;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            cancelAnimationFrame(raf);
        };
    }, []);

    // скрываем бар при фокусе в инпут (клавиатура)
    useEffect(() => {
        const onFocusIn = (e) => {
            const tag = (e.target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) {
                setHidden(true);
            }
        };
        const onFocusOut = () => setHidden(false);
        document.addEventListener("focusin", onFocusIn);
        document.addEventListener("focusout", onFocusOut);
        return () => {
            document.removeEventListener("focusin", onFocusIn);
            document.removeEventListener("focusout", onFocusOut);
        };
    }, []);

    const handleNav = useCallback((e, href) => {

        // Специально: кнопка "Вход" должна открывать только модалку, без перехода на /auth
        if (href === "/auth") {
            e.preventDefault();
            e.stopPropagation?.();
            // FIX #2: на мобильных гарантированно показываем модалку поверх,
            // поднимаем вьюпорт к началу, чтобы оверлей был виден
            try { setShowAuth?.(true); } catch { }
            try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { }
            // снять фокус с поля ввода (моб. клавиатура/оверлеи могут мешать)
            try { document.activeElement?.blur?.(); } catch { }
            // небольшой тик, если нужно пересчитать з-индексы/оверлеи
            try { setTimeout(() => document.documentElement?.focus?.(), 0); } catch { }
            return;
        }

        if (href === "__add__") {
            e.preventDefault();
            // гость → показываем нижний шит с «Войти / Регистрация»
            if (!user?.email) { setSheetMode("auth"); setSheetOpen(true); return; }
            // роль TRANSPORT — сразу на добавление транспорта (без шита)
            if ((user?.role || "").toUpperCase() === "TRANSPORT") { setSheetOpen(false); router.push("/create-transport"); return; }
            // роль-специфика для авторизованных:
            // TRANSPORT → сразу "Добавить транспорт"
            // OWNER     → сразу "Создать заявку" (груз)
            {
                const r = (user?.role || "").toUpperCase();
                if (r === "TRANSPORT") { setSheetOpen(false); router.push("/create-transport"); return; }
                if (r === "OWNER") { setSheetOpen(false); router.push("/create"); return; }
            }
            // остальные роли → обычный шит «Создать / Добавить транспорт»
            setSheetMode("add");
            setSheetOpen(s => !s);
            return;
        }


        // «Моё»: если роль однозначна — редирект, иначе покажем меню поверх кнопки
        if (MY_HREFS.has(href)) {
            e.preventDefault();
            if (!user?.email) { setSheetMode("auth"); setSheetOpen(true); return; }
            const roles = detectRoles();
            const hasOwner = roles.includes("owner") || roles.includes("owner_role") || roles.includes("cargo") || roles.includes("владелец");
            const hasTransport = roles.includes("transport") || roles.includes("carrier") || roles.includes("перевозчик");
            // ВХОД ЧЕРЕЗ НИЖНЕЕ МЕНЮ → явно открываем фильтр
            if (hasOwner && !hasTransport) { router.push("/profile?orders=1&openFilter=1"); return; }
            if (hasTransport && !hasOwner) { router.push("/profile?transports=1&openFilter=1"); return; }
            // неоднозначно → меню выбора
            setSheetMode("my");
            setSheetOpen(true);
            return;
        }

        // «Соответствия»: поведение как на десктопе (Sidebar / TransportSidebar)
        if (MATCHES_HREFS.has(href)) {
            e.preventDefault();
            // доступ к соответствиям — только после авторизации
            if (!user?.email) { setSheetMode("auth"); setSheetOpen(true); return; }

            const r = (user?.role || "").toUpperCase();
            // OWNER → соответствия в транспортах к его грузам
            if (r === "OWNER") { router.push("/transport?matches_only=1"); return; }
            // TRANSPORT → соответствия в грузах к его транспорту
            if (r === "TRANSPORT") { router.push("/orders?matches_only=1"); return; }

            // MANAGER / EMPLOYEE / ADMIN → показать меню выбора
            setSheetMode("matches");
            setSheetOpen(true);
            return;
        }

        // Чат — оверлей/страница. Требует авторизации.
        if (false) { // (чаты отключены в нижнем баре)
            e.preventDefault();
            if (!user?.email) { setShowAuth?.(true); return; }
            if (messenger?.openOverlay) { messenger.openOverlay(true); return; }
            if (messenger?.setOverlayOpen) { messenger.setOverlayOpen(true); return; }
            router.push(href);
            return;
        }

        // «Заявки» (грузы/транспорт): помечаем прямой переход,
        // чтобы на мобильном открывать фильтр только после явного клика.
        if (href === "/orders" || href === "/transport") {
            try { sessionStorage.setItem("openMobileFilterOnEntry", "1"); } catch { }
            // не прерываем навигацию: Link сам выполнит переход
            return;
        }

        // Профиль — требует авторизации
        if (href === "/profile" && !user?.email) { e.preventDefault(); setShowAuth?.(true); return; }

        // остальные пункты — обычная навигация
    }, [messenger, router]);

    return (
        <>
            <nav
                className={[
                    "md:hidden fixed inset-x-0 bottom-0 z-[20] border-t border-white/10",
                    "bg-[#0f172a]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0f172a]/70",
                    "pb-[env(safe-area-inset-bottom)] transition-all duration-200",
                    hidden ? "translate-y-full opacity-0" : "translate-y-0 opacity-100",
                ].join(" ")}
            >
                <ul
                    className="mx-auto grid max-w-md"
                    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
                >
                    {items.map(({ href, label, icon: Icon, badgeKey }, index) => {
                        const hrefNorm = normalizeHref(href);
                        const active =
                            hrefNorm !== "__add__" &&
                            (pathname === hrefNorm || (hrefNorm !== "/" && pathname?.startsWith(hrefNorm + "/")));
                        const count = getBadgeCount(badgeKey, counters);
                        const isAdd = href === "__add__";
                        // Локализация подписи: приоритет — ключ по href; иначе используем label как ключ/фолбэк
                        const keyByHref = NAV_HREF_TO_KEY[hrefNorm];
                        const displayLabel = MY_HREFS.has(hrefNorm)
                            ? t("nav.my", KEY_FALLBACK_RU["nav.my"])
                            : keyByHref
                                ? t(keyByHref, KEY_FALLBACK_RU[keyByHref] || label)
                                : (typeof label === "string" ? t(label, label) : label);

                        return (
                            <li key={`${href}-${index}`} className="relative text-center">
                                {isAdd ? (
                                    <button
                                        onClick={(e) => handleNav(e, href)}
                                        className={[
                                            "mx-auto -translate-y-2 rounded-full ring-1 ring-white/10",
                                            "shadow-lg shadow-cyan-500/10",
                                            "grid place-items-center w-14 h-14",
                                        ].join(" ")}
                                        aria-label={t("common.add", "Добавить")}
                                    >
                                        {FaPlusCircle ? (
                                            <FaPlusCircle size={28} className="text-cyan-400" />
                                        ) : (
                                            <span className="text-cyan-400 text-2xl leading-none">＋</span>
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={hrefNorm}
                                        prefetch={false}
                                        onClick={(e) => handleNav(e, href)}
                                        className="flex flex-col items-center py-3 text-[11px] font-semibold select-none"
                                    >
                                        {Icon ? (
                                            <Icon className={active ? "opacity-100" : "opacity-60"} size={18} />
                                        ) : null}
                                        <span className={active ? "text-cyan-400" : "text-slate-400"}>
                                            {displayLabel}
                                        </span>
                                    </Link>
                                )}

                                {!isAdd && count > 0 && (
                                    <span className="absolute right-3 top-1 min-w-[18px] rounded-full px-1
                                   text-[10px] font-bold text-white bg-emerald-500">
                                        {count > 99 ? "99+" : count}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Action-sheet для "+", авторизации и пункта "Моё" */}
            {sheetOpen && (
                <>
                    <div
                        className="fixed inset-0 z-[21] bg-black/40 md:hidden"
                        onClick={() => setSheetOpen(false)}
                    />
                    <div
                        className="fixed inset-x-0 bottom-0 z-[22] md:hidden
                       bg-[#0b1220] border-t border-white/10
                       rounded-t-2xl p-4 space-y-2
                       pb-[calc(env(safe-area-inset-bottom)+12px)]"
                    >
                        {sheetMode === "matches" ? (
                            <>
                                <button
                                    onClick={() => { setSheetOpen(false); router.push("/orders?matches_only=1"); }}
                                    className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("nav.matches.cargo", "Грузы — соответствия")}
                                </button>
                                <button
                                    onClick={() => { setSheetOpen(false); router.push("/transport?matches_only=1"); }}
                                    className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("nav.matches.transport", "Транспорт — соответствия")}
                                </button>
                                <button
                                    onClick={() => setSheetOpen(false)}
                                    className="w-full rounded-xl px-4 py-3 text-center bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("common.cancel", "Отмена")}
                                </button>
                            </>
                        ) : sheetMode === "my" ? (
                            <>
                                <button
                                    onClick={() => { setSheetOpen(false); router.push("/profile?orders=1&openFilter=1"); }}
                                    className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("nav.my.cargo", "Мои грузы")}
                                </button>
                                <button
                                    onClick={() => { setSheetOpen(false); router.push("/profile?transports=1&openFilter=1"); }}
                                    className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("nav.my.transport", "Мой транспорт")}
                                </button>
                                <button
                                    onClick={() => setSheetOpen(false)}
                                    className="w-full rounded-xl px-4 py-3 text-center bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("common.cancel", "Отмена")}
                                </button>
                            </>
                        ) : sheetMode === "add" ? (
                            <>
                                <button
                                    onClick={() => { setSheetOpen(false); router.push("/create"); }}
                                    className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("order.create", "Создать Заявку")}
                                </button>
                                {!isOwnerRole && (
                                    <button
                                        onClick={() => { setSheetOpen(false); router.push("/create-transport"); }}
                                        className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                    >
                                        {t("transport.add", "Добавить Транспорт")}
                                    </button>
                                )}
                                <button
                                    onClick={() => setSheetOpen(false)}
                                    className="w-full rounded-xl px-4 py-3 text-center bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("common.cancel", "Отмена")}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => { setSheetOpen(false); setShowAuth?.(true); }}
                                    className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("auth.login", "Войти")}
                                </button>
                                <button
                                    onClick={() => { setSheetOpen(false); router.push("/register"); }}
                                    className="w-full rounded-xl px-4 py-3 text-left bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("auth.register", "Регистрация")}
                                </button>
                                <button
                                    onClick={() => setSheetOpen(false)}
                                    className="w-full rounded-xl px-4 py-3 text-center bg-white/5 hover:bg-white/10 transition"
                                >
                                    {t("common.cancel", "Отмена")}
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </>
    );
}
