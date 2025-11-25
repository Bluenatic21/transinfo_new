"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { api } from "@/config/env";
import dynamic from "next/dynamic";
import { useUser } from "../UserContext";

import ProfileCard from "../components/ProfileCard";
import ChangePasswordForm from "../components/ChangePasswordForm"
import CargoCompactCard from "../components/CargoCompactCard";
import TransportCompactCard from "../components/TransportCompactCard";
import ConfirmModal from "../components/ConfirmModal";
import UserReviewsList from "../components/ratings/UserReviewsList";
import { FaTruck, FaFileAlt } from "react-icons/fa";
import { FiSearch } from "react-icons/fi";
import { useIsMobile } from "../../hooks/useIsMobile";
import EditProfileForm from "../components/EditProfileForm";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import SavedOrdersSection, { SavedTransportsSection, SavedAllSection } from "../components/SavedOrdersSection";
import MatchedOrdersModal from "../components/MatchedOrdersModal";
import MatchedTransportsModal from "../components/MatchedTransportsModal";
import EmployeeList from "../components/EmployeeList";
import ContactsList from "../components/ContactsList";
import ContactRequests from "../components/ContactRequests";
import EmployeeRegisterModal from "../components/EmployeeRegisterModal";
import BlockedUsersList from "../components/BlockedUsersList";
import { useLang } from "@/app/i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";

const MonitoringSection = dynamic(() => import("../components/MonitoringSection"), { ssr: false });

const useProfileThemeColors = () => {
    const { resolvedTheme } = useTheme();
    const isLight = resolvedTheme === "light";

    return useMemo(() => ({
        cardBg: isLight ? "#f6f8fb" : "#182033",
        cardShadow: isLight ? "0 2px 14px rgba(25,57,105,0.1)" : "0 2px 14px #19396922",
        cardBorder: isLight ? "#dbe4f3" : "#233a5a",
        textPrimary: isLight ? "#0f1b2a" : "#e3f2fd",
        textMuted: isLight ? "#4b5563" : "#b3d5fa",
        accentBlue: "#43c8ff",
        accentGreen: "#34c759",
        highlightDot: isLight ? "#0284c7" : "#72ebff",
        pillBg: isLight ? "#e9f1fb" : "#0f1a2b",
        pillBorder: isLight ? "#dbe4f3" : "#233a5a",
        toggleActiveBg: isLight ? "#d7eafe" : "#20325a",
        toggleActiveText: isLight ? "#0b5cab" : "#43c8ff",
        toggleInactiveText: isLight ? "#4b5563" : "#9cc4e7",
        searchBg: isLight ? "#ffffff" : "#0f1a2b",
        searchBorder: isLight ? "#dbe4f3" : "#233a5a",
        searchText: isLight ? "#0f1b2a" : "#e3f2fd",
        searchIcon: isLight ? "#6b7280" : "#9cc4e7",
        segmentedBg: isLight ? "#e9f1fb" : "#0f1b34",
        segmentedBorder: isLight ? "#dbe4f3" : "#2a4872",
        segmentedActiveText: isLight ? "#0f1b2a" : "#0c223a",
        stickyBg: isLight ? "rgba(246,248,251,0.95)" : "rgba(10,16,28,0.94)",
        stickyBorder: isLight ? "1px solid rgba(209,213,219,.8)" : "1px solid rgba(40,70,110,.25)",
    }), [isLight]);
};

const ContactsTabs = ({ active, onChange }) => {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const colors = useProfileThemeColors();
    return (
        <div className="flex items-center gap-2 mb-3">
            <button
                onClick={() => onChange("contacts")}
                style={{
                    padding: "6px 12px",
                    borderRadius: 12,
                    fontSize: 14,
                    background: active === "contacts" ? colors.accentBlue : colors.pillBg,
                    color: active === "contacts" ? "#fff" : colors.toggleInactiveText,
                    border: `1px solid ${colors.pillBorder}`,
                    transition: "all .2s ease",
                }}
            >
                {t("contacts.my", "Мои контакты")}
            </button>
            <button
                onClick={() => onChange("contact_requests")}
                style={{
                    padding: "6px 12px",
                    borderRadius: 12,
                    fontSize: 14,
                    background: active === "contact_requests" ? colors.accentBlue : colors.pillBg,
                    color: active === "contact_requests" ? "#fff" : colors.toggleInactiveText,
                    border: `1px solid ${colors.pillBorder}`,
                    transition: "all .2s ease",
                }}
            >
                {t("profile.contacts.requests", "Запросы")}
            </button>
        </div>
    );
};

// Одна панель с таб-переключателем (показывает либо контакты, либо запросы)
const ContactsOnePane = ({ isMobile }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const colors = useProfileThemeColors();

    const active =
        searchParams.get("contact_requests") ? "contact_requests" : "contacts";

    const setActive = (key) => {
        const params = new URLSearchParams(searchParams);
        if (key === "contacts") {
            params.delete("contact_requests");
            params.set("contacts", "1");
        } else {
            params.delete("contacts");
            params.set("contact_requests", "1");
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <div
            className="rounded-2xl p-4 shadow-md"
            style={{
                background: colors.cardBg,
                boxShadow: colors.cardShadow,
                border: `1px solid ${colors.cardBorder}`,
            }}
        >
            <ContactsTabs active={active} onChange={setActive} />
            {active === "contacts" ? <ContactsList /> : <ContactRequests />}
        </div>
    );
};
export default function ProfilePage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const colors = useProfileThemeColors();
    const [managerOrdersScope, setManagerOrdersScope] = useState("account"); // 'account' | 'my'
    const [managerTransportsScope, setManagerTransportsScope] = useState("account"); // 'account' | 'my'
    const [accountOrders, setAccountOrders] = useState([]);
    const [accountTransports, setAccountTransports] = useState([]);
    const [accountOrdersLoading, setAccountOrdersLoading] = useState(false);
    const [accountTransportsLoading, setAccountTransportsLoading] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);

    const [hoveredItemId, setHoveredItemId] = useState(null);

    const { user, isUserLoaded, fetchMyBids, monitoringReloadTick, matchesReloadTick } = useUser();
    const [myOrders, setMyOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [deleteId, setDeleteId] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [myTransports, setMyTransports] = useState([]);
    const [transportsLoading, setTransportsLoading] = useState(true);
    const [deleteTransportId, setDeleteTransportId] = useState(null);
    const [deletingTransport, setDeletingTransport] = useState(false);

    const orderRefs = useRef({});
    const transportRefs = useRef({});
    const changePasswordRef = useRef(null);
    const searchParams = useSearchParams();
    const highlightTransportId = searchParams.get("highlight_transport");
    const router = useRouter();

    const highlightOrderId = searchParams.get("highlight_order");
    const highlightBidId = searchParams.get("highlight_bid");
    const isMyBids = searchParams.get("mybids");


    const [showMatchesModal, setShowMatchesModal] = useState(false);
    const [selectedOrderMatches, setSelectedOrderMatches] = useState([]);

    const [showMatchedOrdersModal, setShowMatchedOrdersModal] = useState(false);
    const [selectedTransportMatches, setSelectedTransportMatches] = useState([]);

    const [newMatchesCount, setnewMatchesCount] = useState({});
    const [matchedOrderId, setMatchedOrderId] = useState(null);
    const [matchedTransportId, setMatchedTransportId] = useState(null);

    const [highlightedOrderId, setHighlightedOrderId] = useState(null);
    const [highlightedTransportId, setHighlightedTransportId] = useState(null);

    // Поисковые запросы по секциям профиля
    const [ordersQuery, setOrdersQuery] = useState("");
    const [transportsQuery, setTransportsQuery] = useState("");
    const [bidsQuery, setBidsQuery] = useState("");
    const [employeesQuery, setEmployeesQuery] = useState("");


    // --- Модалки «Сотрудники»
    const [registerModalOpen, setRegisterModalOpen] = useState(false);
    const [registerData, setRegisterData] = useState({ name: "", email: "", password: "" });
    const [employeesReloadTick, setEmployeesReloadTick] = useState(0);

    // guard-рефы, чтобы не дергать одни и те же «аккаунт»-эндпоинты на каждом изменении user-объекта
    const accountLoadGuardRef = useRef({ userId: null, done: false });
    const accountBidsGuardRef = useRef({ userId: null, done: false });

    // Нормализация и матчинги для простого текстового поиска
    const norm = (v) => (v ?? "").toString().toLowerCase();

    const matchAny = (text, q) => {
        if (!q) return true;
        return norm(text).includes(norm(q));
    };

    const collectOrderText = (o = {}) =>
        [
            o.from_location,
            o.to_location,
            o.cargo_name || o.name,
            o.description,
            o.comment,
            o.client_name,
            o.owner_name,
            o.state_number,
            o.driver_name,
            o.city,
            o.country,
            o.id
        ].filter(Boolean).join(" ");

    const collectTransportText = (t = {}) =>
        [
            t.from_location,
            t.to_location,
            t.truck_type,
            t.transport_kind,
            t.comment,
            t.description,
            t.owner_name,
            t.contact_name,
            t.phone,
            t.email,
            t.state_number,
            t.city,
            t.country,
            t.id
        ].filter(Boolean).join(" ");

    const matchOrder = (o, q) => matchAny(collectOrderText(o), q);
    const matchTransport = (t, q) => matchAny(collectTransportText(t), q);
    const matchBid = (b, q) =>
        matchAny(collectOrderText(b?.order || {}), q) ||
        matchAny(String(b?.amount ?? ""), q) ||
        matchAny(b?.status ?? "", q);

    // Кому отправлена ставка (компания + ФИО владельца заявки)
    const getBidRecipientLabel = (order = {}) => {
        const company =
            order.owner_company || order.company || order?.owner?.company || order.client_company || order?.client?.company;
        const first =
            order.owner_name || order?.owner?.name || order.user_name || order.contact_name || order.client_name || order.name;
        const last =
            order.owner_lastname || order?.owner?.lastname || order.user_lastname || order.contact_lastname || order.client_lastname || order.lastname || order.surname;
        const fullname = [first, last].filter(Boolean).join(" ");
        if (company) return fullname ? `${company} — ${fullname}` : company;
        return fullname || "";
    };

    // Дефолт: MANAGER — "account", EMPLOYEE — "my". Но кнопку "Все" не блокируем.
    // Инициализация скоупов только один раз (URL-параметры имеют приоритет), без перезаписи выбора пользователя
    const pathname = usePathname();
    const scopesInitRef = useRef(false);

    useEffect(() => {
        if (scopesInitRef.current) return;

        const role = (user?.role || "").toLowerCase();

        // читаем из URL (?orders_scope=account|my&transports_scope=account|my)
        const ordersScopeParam = (searchParams.get("orders_scope") || "").toLowerCase();
        const transportsScopeParam = (searchParams.get("transports_scope") || "").toLowerCase();

        const defaultOrders = role === "manager" ? "account" : role === "employee" ? "my" : "my";
        const defaultTransports = role === "manager" ? "account" : role === "employee" ? "my" : "my";

        setManagerOrdersScope(
            ordersScopeParam === "account" || ordersScopeParam === "my" ? ordersScopeParam : defaultOrders
        );
        setManagerTransportsScope(
            transportsScopeParam === "account" || transportsScopeParam === "my" ? transportsScopeParam : defaultTransports
        );

        scopesInitRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.role, searchParams]);

    // Флаг для отключения переключения в "Все" (визуально и по клику)
    const onlySelfScope = false;


    // TODO: заменить на реальные эндпоинты аккаунта, когда будут готовы
    useEffect(() => {
        const role = user?.role?.toLowerCase();
        const uid = user?.id;
        if (!uid || (role !== "manager" && role !== "employee")) return;
        // не перезагружать одни и те же данные на каждом изменении объекта user
        if (accountLoadGuardRef.current.userId === uid && accountLoadGuardRef.current.done) return;
        accountLoadGuardRef.current.userId = uid;

        const token = localStorage.getItem("token");
        if (!token) return;

        setAccountOrdersLoading(true);
        setAccountTransportsLoading(true);

        Promise.all([
            fetch(api(`/orders/account`), { headers: { Authorization: "Bearer " + token } }).then(r => r.ok ? r.json() : []),
            fetch(api(`/transports/account`), { headers: { Authorization: "Bearer " + token } }).then(r => r.ok ? r.json() : []),
        ])
            .then(([ordersData, transportsData]) => {
                const ordersArr = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || ordersData?.items || ordersData?.data || []);
                const transportsArr = Array.isArray(transportsData) ? transportsData : (transportsData?.transports || transportsData?.items || transportsData?.data || []);
                setAccountOrders(Array.isArray(ordersArr) ? ordersArr : []);
                setAccountTransports(Array.isArray(transportsArr) ? transportsArr : []);
                accountLoadGuardRef.current.done = true;
            })
            .catch(err => {
                console.warn("[account fetch] error:", err);
                setAccountOrders([]);
                setAccountTransports([]);
            })
            .finally(() => {
                setAccountOrdersLoading(false);
                setAccountTransportsLoading(false);
            });
    }, [user?.id, user?.role]);  // важное сужение зависимостей



    // Индикатор новых Соответствий по заявкам и транспортам
    useEffect(() => {
        async function fetchNew() {
            const token = localStorage.getItem("token");
            const all = [
                ...(myOrders || []).map(o => ({ type: "order", id: o.id })),
                ...(myTransports || []).map(t => ({ type: "transport", id: t.id })),
            ];
            const results = {};
            await Promise.all(all.map(async (item) => {
                const url = item.type === "order"
                    ? api(`/orders/${item.id}/new_matches_count`)
                    : api(`/transport/${item.id}/new_matches_count`);
                try {
                    const resp = await fetch(url, { headers: { Authorization: "Bearer " + token } });
                    const data = await resp.json();
                    results[`${item.type}_${item.id}`] = data?.new_matches || 0;
                } catch {
                    results[`${item.type}_${item.id}`] = 0;
                }
            }));
            setnewMatchesCount(results);
        }
        if ((myOrders?.length > 0) || (myTransports?.length > 0)) fetchNew();
    }, [myOrders, myTransports, matchesReloadTick]);

    // Сброс непросмотренных Соответствий
    const handleMatchesViewed = async (id, type) => {
        const token = localStorage.getItem("token");
        const url = type === "transport"
            ? api(`/transport/${id}/view_matches`)
            : api(`/orders/${id}/view_matches`);
        try {
            await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + token } });
        } finally {
            setnewMatchesCount(prev => ({ ...prev, [`${type}_${id}`]: 0 }));
        }
    };

    const isMobile = useIsMobile();

    // Автоскролл к секции смены пароля на мобильных
    useEffect(() => {
        if (isMobile && showChangePassword && changePasswordRef.current) {
            changePasswordRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [isMobile, showChangePassword]);
    const [myBids, setMyBids] = useState([]);
    const [bidsLoading, setBidsLoading] = useState(true);
    const [accountBids, setAccountBids] = useState([]);
    const [accountBidsLoading, setAccountBidsLoading] = useState(true);
    const [bidsScope, setBidsScope] = useState("my"); // "my" | "account"
    const myBidsRefs = useRef({});
    const [showNoOrderModal, setShowNoOrderModal] = useState(false);



    const activeTab = searchParams.get("contacts")
        ? "contacts"
        : searchParams.get("contact_requests")
            ? "contact_requests"
            : searchParams.get("employees")
                ? "employees"
                : searchParams.get("blocked")
                    ? "blocked"
                    : searchParams.get("orders")
                        ? "orders"
                        : searchParams.get("transports")
                            ? "transports"
                            : searchParams.get("mybids")
                                ? "mybids"
                                : searchParams.get("monitoring")
                                    ? "monitoring"
                                    : searchParams.get("saved")
                                        ? "saved"
                                        : searchParams.get("reviews")
                                            ? "reviews"
                                            : "profile"; // по умолчанию — «Мой профиль»

    // Мои заявки/транспорты
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            window.location.href = "/";
            return;
        }
        fetch(api(`/orders/my`), { headers: { Authorization: "Bearer " + token } })
            .then(res => res.json())
            .then(data => setMyOrders(data || []))
            .finally(() => setOrdersLoading(false));
        fetch(api(`/transports/my`), { headers: { Authorization: "Bearer " + token } })
            .then(res => res.json())
            .then(data => setMyTransports(data || []))
            .finally(() => setTransportsLoading(false));
    }, []);

    // Мои ставки (только для вкладки)
    useEffect(() => {
        if (isMyBids && ["transport", "manager", "employee"].includes(user?.role?.toLowerCase())) {
            setBidsLoading(true);
            fetchMyBids().then(data => setMyBids(data || [])).finally(() => setBidsLoading(false));
        }
    }, [isMyBids, user?.role]);

    // По умолчанию: MANAGER -> "Все", другие -> "Мои"
    useEffect(() => {
        if (!isMyBids) return;
        const role = (user?.role || "").toLowerCase();
        setBidsScope(role === "manager" ? "account" : "my");
    }, [isMyBids, user?.role]);

    useEffect(() => {
        if (!isMyBids) return;
        if ((user?.role || "").toLowerCase() !== "manager") return;

        const uid = user?.id;
        if (accountBidsGuardRef.current.userId === uid && accountBidsGuardRef.current.done) return;
        accountBidsGuardRef.current.userId = uid;

        const token = localStorage.getItem("token");
        if (!token) return;

        setAccountBidsLoading(true);
        fetch(api(`/bids/account`), { headers: { Authorization: "Bearer " + token } })
            .then(r => r.ok ? r.json() : [])
            .then(d => {
                const arr = Array.isArray(d) ? d : (d?.items || d?.data || []);
                setAccountBids(Array.isArray(arr) ? arr : []);
            })
            .catch(() => setAccountBids([]))
            .finally(() => {
                setAccountBidsLoading(false);
                accountBidsGuardRef.current.done = true;
            });
    }, [isMyBids, user?.id, user?.role]);

    // --- Ensure correct tab is visible when highlight params come from external links ---
    useEffect(() => {
        if (highlightOrderId && activeTab !== "orders") {
            const params = new URLSearchParams(window.location.search);
            params.set("orders", "1");
            window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
        }
    }, [highlightOrderId, activeTab]);

    useEffect(() => {
        if (highlightTransportId && activeTab !== "transports") {
            const params = new URLSearchParams(window.location.search);
            params.set("transports", "1");
            window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
        }
    }, [highlightTransportId, activeTab]);

    // --- Auto-switch manager scopes so the highlighted ORDER is visible (stable, no ping-pong) ---
    const urlOrdersScope = (searchParams.get("orders_scope") || "").toLowerCase();
    const inMyOrder = useMemo(() => {
        if (!highlightOrderId) return false;
        const id = String(highlightOrderId);
        return Array.isArray(myOrders) && myOrders.some(o => String(o.id) === id);
    }, [highlightOrderId, myOrders]);
    const inAccOrder = useMemo(() => {
        if (!highlightOrderId) return false;
        const id = String(highlightOrderId);
        return Array.isArray(accountOrders) && accountOrders.some(o => String(o.id) === id);
    }, [highlightOrderId, accountOrders]);
    const desiredOrdersScope = useMemo(() => {
        if (!highlightOrderId) return null;
        if (urlOrdersScope === "my" && inMyOrder) return "my";
        if (urlOrdersScope === "account" && inAccOrder) return "account";
        if (inMyOrder) return "my";
        if (inAccOrder) return "account";
        return null;
    }, [highlightOrderId, urlOrdersScope, inMyOrder, inAccOrder]);
    // (a) state ← desired
    useEffect(() => {
        if (!desiredOrdersScope) return;
        if (managerOrdersScope !== desiredOrdersScope) {
            setManagerOrdersScope(desiredOrdersScope);
        }
    }, [desiredOrdersScope, managerOrdersScope]);
    // (b) URL ← desired (replaceState only when differs)
    useEffect(() => {
        if (!desiredOrdersScope) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("orders_scope") !== desiredOrdersScope) {
            params.set("orders_scope", desiredOrdersScope);
            window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
        }
    }, [desiredOrdersScope]);

    // --- Auto-switch manager scopes so the highlighted TRANSPORT is visible (stable, no ping-pong) ---
    const urlTransportsScope = (searchParams.get("transports_scope") || "").toLowerCase();
    const inMyTransport = useMemo(() => {
        if (!highlightTransportId) return false;
        const id = String(highlightTransportId);
        return Array.isArray(myTransports) && myTransports.some(t => String(t.id) === id);
    }, [highlightTransportId, myTransports]);
    const inAccTransport = useMemo(() => {
        if (!highlightTransportId) return false;
        const id = String(highlightTransportId);
        return Array.isArray(accountTransports) && accountTransports.some(t => String(t.id) === id);
    }, [highlightTransportId, accountTransports]);
    const desiredTransportsScope = useMemo(() => {
        if (!highlightTransportId) return null;
        if (urlTransportsScope === "my" && inMyTransport) return "my";
        if (urlTransportsScope === "account" && inAccTransport) return "account";
        if (inMyTransport) return "my";
        if (inAccTransport) return "account";
        return null;
    }, [highlightTransportId, urlTransportsScope, inMyTransport, inAccTransport]);
    // (a) state ← desired
    useEffect(() => {
        if (!desiredTransportsScope) return;
        if (managerTransportsScope !== desiredTransportsScope) {
            setManagerTransportsScope(desiredTransportsScope);
        }
    }, [desiredTransportsScope, managerTransportsScope]);
    // (b) URL ← desired (replaceState only when differs)
    useEffect(() => {
        if (!desiredTransportsScope) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("transports_scope") !== desiredTransportsScope) {
            params.set("transports_scope", desiredTransportsScope);
            window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
        }
    }, [desiredTransportsScope]);

    // Highlight and scroll for order
    useEffect(() => {
        if (highlightOrderId && myOrders.length > 0 && orderRefs.current[highlightOrderId]) {
            orderRefs.current[highlightOrderId].scrollIntoView({ behavior: "smooth", block: "center" });
            setHighlightedOrderId(highlightOrderId);
            // Удаляем highlightOrderId из урла только когда точно прошла анимация
            const timeout1 = setTimeout(() => setHighlightedOrderId(null), 1400);
            const timeout2 = setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("highlight_order");
                window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
            }, 1600);
            return () => {
                clearTimeout(timeout1);
                clearTimeout(timeout2);
            };
        }
    }, [highlightOrderId, myOrders]);

    useEffect(() => {
        if (highlightTransportId && myTransports.length > 0 && transportRefs.current[highlightTransportId]) {
            transportRefs.current[highlightTransportId].scrollIntoView({ behavior: "smooth", block: "center" });
            setHighlightedTransportId(highlightTransportId);
            const timeout1 = setTimeout(() => setHighlightedTransportId(null), 1400);
            const timeout2 = setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("highlight_transport");
                window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
            }, 1600);
            return () => {
                clearTimeout(timeout1);
                clearTimeout(timeout2);
            };
        }
    }, [highlightTransportId, myTransports]);

    // Автооткрытие "Мои ставки"
    useEffect(() => {
        if (highlightBidId && !isMyBids && user?.role?.toLowerCase() === "transport") {
            const params = new URLSearchParams(window.location.search);
            params.set("mybids", "1");
            params.set("highlight_bid", highlightBidId);
            router.replace(`${window.location.pathname}?${params.toString()}`);
        }
    }, [highlightBidId, isMyBids, user, router]);

    // Scroll к нужной ставке
    useEffect(() => {
        if (highlightBidId && isMyBids && myBids.length > 0 && myBidsRefs.current[highlightBidId]) {
            myBidsRefs.current[highlightBidId].scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("highlight_bid");
                window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
            }, 1400);
        }
    }, [highlightBidId, isMyBids, myBids]);

    // Показать Соответствия по заявке (грузы)
    async function handleShowMatches(order) {
        const token = localStorage.getItem("token");
        const res = await fetch(api(`/orders/${order.id}/matching_transports`), {
            headers: { Authorization: "Bearer " + token }
        });
        if (res.ok) {
            const data = await res.json();
            setMatchedOrderId(order.id);
            setSelectedOrderMatches(data || []);
            setShowMatchesModal(true);
        } else {
            alert(t("matches.loadError", "Не удалось загрузить Соответствия"));
        }
    }
    // Показать Соответствия по транспорту (транспорты)
    async function handleShowOrderMatches(transport) {
        const token = localStorage.getItem("token");
        const res = await fetch(api(`/transports/${transport.id}/matching_orders`), {
            headers: { Authorization: "Bearer " + token }
        });
        if (res.ok) {
            const data = await res.json();
            setMatchedTransportId(transport.id);
            setSelectedTransportMatches(data || []);
            setShowMatchedOrdersModal(true);
        } else {
            alert(t("matches.loadError", "Не удалось загрузить соответствия"));
        }
    }

    // Удалить заявку
    function handleConfirmDelete() {
        if (!deleteId) return;
        setDeleting(true);
        const token = localStorage.getItem("token");
        fetch(api(`/orders/${deleteId}`), {
            method: "DELETE",
            headers: { Authorization: "Bearer " + token }
        })
            .then(res => {
                if (res.ok) {
                    setMyOrders(orders => orders.filter(o => o.id !== deleteId));
                    setDeleteId(null);
                } else {
                    alert(t("orders.deleteError", "Ошибка при удалении заявки!"));
                }
            })
            .catch(() => alert(t("common.networkErrorDelete", "Ошибка сети при удалении!")))
            .finally(() => setDeleting(false));
    }
    function handleCancelDelete() {
        setDeleteId(null);
        setDeleting(false);
    }

    // Удалить транспорт
    function handleConfirmDeleteTransport() {
        if (!deleteTransportId) return;
        setDeletingTransport(true);
        const token = localStorage.getItem("token");
        fetch(api(`/transports/${deleteTransportId}`), {
            method: "DELETE",
            headers: { Authorization: "Bearer " + token }
        })
            .then(res => {
                if (res.ok) {
                    setMyTransports(list => list.filter(o => o.id !== deleteTransportId));
                    setDeleteTransportId(null);
                } else {
                    alert(t("transport.deleteError", "Ошибка при удалении транспорта!"));
                }
            })
            .catch(() => alert(t("common.networkErrorDelete", "Ошибка сети при удалении!")))
            .finally(() => setDeletingTransport(false));
    }
    function handleCancelDeleteTransport() {
        setDeleteTransportId(null);
        setDeletingTransport(false);
    }

    async function handleToggleActiveOrder(order) {
        const token = localStorage.getItem("token");
        const resp = await fetch(api(`/orders/${order.id}`), {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
            },
            body: JSON.stringify({ is_active: !order.is_active }),
        });
        if (resp.ok) {
            setMyOrders(orders => orders.map(o => o.id === order.id ? { ...o, is_active: !o.is_active } : o));
        } else {
            alert(t("orders.statusChangeError", "Ошибка при изменении статуса заявки"));
        }
    }

    if (!isUserLoaded) return <div className="profile-loading">{t("common.loading", "Загрузка...")}</div>;
    if (!user) {
        if (typeof window !== "undefined") window.location.href = "/";
        return null;
    }

    const myOrdersArray = Array.isArray(myOrders) ? myOrders : [];
    const myTransportsArray = Array.isArray(myTransports) ? myTransports : [];

    const myOrder = myOrdersArray.find(o => o.id === matchedOrderId);
    const myTransport = myTransportsArray.find(o => o.id === matchedTransportId);

    const anyOrderFocused = myOrdersArray.some(order => highlightOrderId == order.id);
    const anyTransportFocused = myTransportsArray.some(tr => highlightTransportId == tr.id);

    // Если открыт «Мой профиль» — показываем ТОЛЬКО карточку профиля (DESKTOP)
    if (!isMobile && activeTab === "profile") {
        return (
            <div className="profile-page-root profile-mobile"
                style={{
                    width: "100%",
                    maxWidth: "100%",
                    margin: 0,
                    padding: "24px 24px 56px"
                }}>
                <ProfileCard user={user} onEdit={() => setEditOpen(true)} showMobileLogout onChangePasswordClick={() => setShowChangePassword(true)} />
                {showChangePassword && (
                    <div ref={changePasswordRef} id="change-password-section">
                        <ChangePasswordForm />
                    </div>
                )}
                {editOpen && (
                    <EditProfileForm
                        user={user}
                        onClose={() => setEditOpen(false)}
                        onSave={() => setEditOpen(false)}
                    />
                )}
            </div>
        );
    }

    // MOBILE: «Мой профиль»
    if (isMobile && activeTab === "profile") {
        return (
            <div className="profile-page-root profile-mobile"
                style={{ width: "100%", maxWidth: "100%", margin: 0, padding: "16px 12px 72px" }}>
                <ProfileCard user={user} onEdit={() => setEditOpen(true)} showMobileLogout onChangePasswordClick={() => setShowChangePassword(true)} />
                {showChangePassword && (
                    <div ref={changePasswordRef} id="change-password-section">
                        <ChangePasswordForm />
                    </div>
                )}
                {editOpen && (
                    <EditProfileForm
                        user={user}
                        onClose={() => setEditOpen(false)}
                        onSave={() => setEditOpen(false)}
                    />
                )}
            </div>
        );
    }

    // --- Desktop ---
    if (!isMobile) {
        // Режим GPS-мониторинга: без ProfileCard, во всю ширину

        const isMonitoring = activeTab === "monitoring";

        const ownerPaneStyle = {
            flex: "1 1 50%",
            minWidth: 0,
            maxWidth: "100%",
            background: colors.cardBg,
            borderRadius: 18,
            boxShadow: colors.cardShadow,
            padding: "26px 24px 24px 24px",
            height: "calc(100vh - 160px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16
        };

        const mePaneStyle = {
            flex: "1 1 50%",
            minWidth: 0,
            maxWidth: "100%",
            background: colors.cardBg,
            borderRadius: 18,
            boxShadow: colors.cardShadow,
            padding: "26px 24px 24px 24px",
            height: "calc(100vh - 160px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 24
        };

        return (
            <div className="profile-desktop-root"
                style={{
                    width: "100%",
                    maxWidth: "100%",
                    margin: 0,
                    padding: "32px 24px 56px 24px",
                    display: "flex",
                    flexDirection: "row",
                    gap: 24,
                    alignItems: "stretch"
                }}>

                {activeTab === "profile" && (
                    <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 32 }}>
                        <ProfileCard user={user} onEdit={() => setEditOpen(true)} showMobileLogout onChangePasswordClick={() => setShowChangePassword(true)} />
                        {showChangePassword && (
                            <div ref={changePasswordRef} id="change-password-section">
                                <ChangePasswordForm />
                            </div>
                        )}
                        {editOpen && (
                            <EditProfileForm
                                user={user}
                                onClose={() => setEditOpen(false)}
                                onSave={() => setEditOpen(false)}
                            />
                        )}
                    </div>
                )}

                {activeTab === "reviews" && (
                    <div
                        style={{
                            flex: "1 1 100%",
                            minWidth: 0,
                            maxWidth: "100%",
                            background: colors.cardBg,
                            borderRadius: 18,
                            boxShadow: colors.cardShadow,
                            padding: "26px 24px 24px 24px",
                            height: "calc(100vh - 160px)",
                            overflowY: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                            border: `1px solid ${colors.cardBorder}`,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 999, background: colors.highlightDot }} />
                            <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>{t("reviews.title", "Отзывы")}</span>
                        </div>
                        <UserReviewsList userId={user?.id} />
                    </div>
                )}
                {/* Owner */}
                {user.role?.toLowerCase() === "owner" && activeTab !== "reviews" && (
                    <div style={ownerPaneStyle}>
                        {activeTab === "saved" ? (
                            (isMobile ? <SavedAllSection /> : <SavedOrdersSection />)
                        ) : activeTab === "blocked" ? (
                            <BlockedUsersList />
                        ) : (activeTab === "contacts" || activeTab === "contact_requests") ? (
                            <ContactsOnePane isMobile={isMobile} />
                        ) : activeTab !== "monitoring" ? (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                    <FaFileAlt color="#43c8ff" size={22} />
                                    <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                        История моих заявок
                                    </span>
                                </div>
                                {ordersLoading ? (
                                    <span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>
                                ) : (myOrders && myOrders.length > 0
                                    ? (
                                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                                            {[...myOrders]
                                                .sort((a, b) => new Date(b.created_at || b.load_date) - new Date(a.created_at || a.load_date))
                                                .map(order => (
                                                    <CargoCompactCard
                                                        key={order.id}
                                                        ref={el => { orderRefs.current[order.id] = el; }}
                                                        cargo={order}
                                                        onClick={() => window.location.href = `/orders/${order.id}`}
                                                        onEdit={() => window.location.href = `/orders/${order.id}/edit`}
                                                        onDelete={() => setDeleteId(order.id)}
                                                        isMobile={false}
                                                        isFocused={highlightOrderId == order.id}
                                                        onToggleActive={() => handleToggleActiveOrder(order)}
                                                        matchesCount={order.matchesCount}
                                                        onShowMatches={() => handleShowMatches(order)}
                                                        newMatchesCount={newMatchesCount[`order_${order.id}`] || 0}
                                                        onMatchesViewed={() => handleMatchesViewed(order.id, "order")}
                                                        hoveredItemId={hoveredItemId}
                                                        setHoveredItemId={setHoveredItemId}
                                                        disableAllHover={anyOrderFocused}
                                                        className={highlightedOrderId == order.id || highlightOrderId == order.id ? "profile-card-highlight" : ""}
                                                    />
                                                ))}
                                        </div>
                                    )
                                    : <span style={{ color: colors.textMuted }}>У вас пока нет заявок.</span>
                                )}
                            </>
                        ) : (
                            <MonitoringSection />
                        )}
                    </div>
                )}
                {/* Manager / Employee only */}
                {(["manager", "employee"].includes(user?.role?.toLowerCase())) && activeTab !== "reviews" && (
                    <div style={mePaneStyle}>
                        <AnimatePresence mode="wait">
                            {activeTab === "blocked" && (
                                <motion.div
                                    key="blocked"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <BlockedUsersList />
                                </motion.div>
                            )}
                            {(activeTab === "contacts" || activeTab === "contact_requests") && (
                                <motion.div
                                    key="contacts"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <ContactsOnePane isMobile={isMobile} />
                                </motion.div>
                            )}
                            {activeTab === "employees" && (user.role?.toLowerCase() === "manager") && (
                                <motion.div
                                    key="manager-employees"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <EmployeeList
                                        canManage={true}
                                        reloadSignal={employeesReloadTick}
                                        onCreateNew={() => setRegisterModalOpen(true)}
                                    />
                                </motion.div>
                            )}
                            {activeTab === "monitoring" && (
                                <motion.div
                                    key="monitoring"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <MonitoringSection key={monitoringReloadTick} />
                                </motion.div>
                            )}
                            {activeTab === "orders" && (
                                <motion.div key="manager-orders" initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -70, opacity: 0 }} transition={{ duration: 0.32, type: "tween" }}>
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                            <FaFileAlt color="#43c8ff" size={22} />
                                            <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                                {t("orders.title", "Заявки")}</span>
                                            <div style={{ marginLeft: 10, display: "inline-flex", gap: 8, padding: 4, borderRadius: 10, background: colors.pillBg, border: `1px solid ${colors.pillBorder}` }}>
                                                <button
                                                    onClick={() => {
                                                        setManagerOrdersScope("account");
                                                        const p = new URLSearchParams(Array.from(searchParams.entries()));
                                                        p.set("orders_scope", "account");
                                                        router.replace(`${pathname}?${p.toString()}`);
                                                    }}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: 8,
                                                        border: "none",
                                                        cursor: "pointer",
                                                        background: managerOrdersScope === "account" ? colors.toggleActiveBg : "transparent",
                                                        color: managerOrdersScope === "account" ? colors.toggleActiveText : colors.toggleInactiveText,
                                                        fontWeight: 800
                                                    }}>
                                                    {t("common.all", "Все")}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setManagerOrdersScope("my");
                                                        const p = new URLSearchParams(Array.from(searchParams.entries()));
                                                        p.set("orders_scope", "my");
                                                        router.replace(`${pathname}?${p.toString()}`);
                                                    }}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: 8,
                                                        border: "none",
                                                        cursor: "pointer",
                                                        background: managerOrdersScope === "my" ? colors.toggleActiveBg : "transparent",
                                                        color: managerOrdersScope === "my" ? colors.toggleActiveText : colors.toggleInactiveText,
                                                        fontWeight: 800
                                                    }}>
                                                    {t("common.my", "Мои")}
                                                </button>
                                                <div style={{ marginLeft: "auto" }}>
                                                    <div style={{ position: "relative", display: "inline-flex", width: 420, maxWidth: "36vw" }}>
                                                        <FiSearch size={18} color={colors.searchIcon}
                                                            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                                        <input
                                                            value={ordersQuery}
                                                            onChange={(e) => setOrdersQuery(e.target.value)}
                                                            placeholder={t("orders.searchPlaceholder", "Поиск по заявкам (маршрут, груз, коммент, №.)")}
                                                            style={{ padding: "10px 12px 10px 34px", background: colors.searchBg, border: `1px solid ${colors.searchBorder}`, borderRadius: 10, color: colors.searchText, fontSize: 14, outline: "none", width: "100%" }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {(managerOrdersScope === "my" ? ordersLoading : accountOrdersLoading)
                                            ? (<span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>)
                                            : (
                                                (managerOrdersScope === "my" ? myOrders : accountOrders)?.length
                                                    ? (
                                                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                                                            {(managerOrdersScope === "my" ? myOrders : accountOrders)
                                                                .slice()
                                                                .filter(o => matchOrder(o, ordersQuery))
                                                                .sort((a, b) => new Date(b.created_at || b.load_date) - new Date(a.created_at || a.load_date))
                                                                .map(order => (
                                                                    <CargoCompactCard
                                                                        key={order.id}
                                                                        ref={el => { orderRefs.current[order.id] = el; }}
                                                                        cargo={order}
                                                                        onClick={() => window.location.href = `/orders/${order.id}`}
                                                                        onEdit={() => window.location.href = `/orders/${order.id}/edit`}
                                                                        onDelete={() => setDeleteId(order.id)}
                                                                        isMobile={false}
                                                                        isFocused={highlightOrderId == order.id}
                                                                        onToggleActive={() => handleToggleActiveOrder(order)}
                                                                        matchesCount={order.matchesCount}
                                                                        onShowMatches={() => handleShowMatches(order)}
                                                                        newMatchesCount={newMatchesCount[`order_${order.id}`] || 0}
                                                                        onMatchesViewed={() => handleMatchesViewed(order.id, "order")}
                                                                        hoveredItemId={hoveredItemId}
                                                                        setHoveredItemId={setHoveredItemId}
                                                                        disableAllHover={anyOrderFocused}
                                                                        ownerLabel={managerOrdersScope === "account" ? (order.owner_name || order.owner?.name || order.user_name) : undefined}
                                                                        isMine={managerOrdersScope === "account" ? !!order.isMine : undefined}
                                                                        showOwnerBadge={managerOrdersScope === "account"}
                                                                        managerContext={true}
                                                                    />
                                                                ))}
                                                        </div>
                                                    )
                                                    : <span style={{ color: colors.textMuted }}>
                                                        {managerOrdersScope === "my" ? t("orders.empty.mine", "У вас пока нет заявок.") : t("orders.empty.account", "В аккаунте пока нет заявок.")}
                                                    </span>
                                            )
                                        }
                                    </div>
                                </motion.div>
                            )}
                            {activeTab === "transports" && (
                                <motion.div key="manager-transports" initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -70, opacity: 0 }} transition={{ duration: 0.32, type: "tween" }}>
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                            <FaTruck color="#43c8ff" size={22} />
                                            <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                                {t("transports.title", "Транспорт")}
                                            </span>
                                            <div style={{ marginLeft: 10, display: "inline-flex", gap: 8, padding: 4, borderRadius: 10, background: colors.pillBg, border: `1px solid ${colors.pillBorder}` }}>
                                                <button
                                                    disabled={onlySelfScope}
                                                    onClick={() => { if (!onlySelfScope) setManagerTransportsScope("account"); }}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: 8,
                                                        border: "none",
                                                        cursor: onlySelfScope ? "not-allowed" : "pointer",
                                                        background: managerTransportsScope === "account" ? colors.toggleActiveBg : "transparent",
                                                        color: managerTransportsScope === "account" ? colors.toggleActiveText : colors.toggleInactiveText,
                                                        fontWeight: 800,
                                                        opacity: onlySelfScope ? .45 : 1
                                                    }}>
                                                    {t("common.all", "Все")}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setManagerTransportsScope("my");
                                                        const p = new URLSearchParams(Array.from(searchParams.entries()));
                                                        p.set("transports_scope", "my");
                                                        router.replace(`${pathname}?${p.toString()}`);
                                                    }}
                                                    style={{
                                                        padding: "6px 10px",
                                                        borderRadius: 8,
                                                        border: "none",
                                                        cursor: "pointer",
                                                        background: managerTransportsScope === "my" ? colors.toggleActiveBg : "transparent",
                                                        color: managerTransportsScope === "my" ? colors.toggleActiveText : colors.toggleInactiveText,
                                                        fontWeight: 800
                                                    }}>
                                                    {t("common.my", "Мои")}
                                                </button>
                                                <div style={{ marginLeft: "auto" }}>
                                                    <div style={{ position: "relative", display: "inline-flex", width: 420, maxWidth: "36vw" }}>
                                                        <FiSearch size={18} color={colors.searchIcon}
                                                            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                                        <input
                                                            value={transportsQuery}
                                                            onChange={(e) => setTransportsQuery(e.target.value)}
                                                            placeholder={t("transports.searchPlaceholder", "Поиск по транспорту (маршрут, тип, контакт, №.)")}
                                                            style={{ padding: "10px 12px 10px 34px", background: colors.pillBg, border: `1px solid ${colors.pillBorder}`, borderRadius: 10, color: colors.textPrimary, fontSize: 14, outline: "none", width: "100%" }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {(managerTransportsScope === "my" ? transportsLoading : accountTransportsLoading)
                                            ? (<span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>)
                                            : (
                                                (managerTransportsScope === "my" ? myTransports : accountTransports)?.length
                                                    ? (
                                                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                                                            {(managerTransportsScope === "my" ? myTransports : accountTransports)
                                                                .slice()
                                                                .filter(t => matchTransport(t, transportsQuery))
                                                                .sort((a, b) => new Date(b.created_at || b.available_from) - new Date(a.created_at || a.available_from))
                                                                .map(tr => (
                                                                    <TransportCompactCard
                                                                        key={tr.id}
                                                                        transport={tr}
                                                                        onClick={() => window.location.href = `/transport/${tr.id}`}
                                                                        onEdit={() => window.location.href = `/transport/${tr.id}/edit`}
                                                                        onDelete={() => setDeleteTransportId(tr.id)}
                                                                        isMobile={false}
                                                                        matchesCount={tr.matchesCount}
                                                                        onShowMatches={() => handleShowOrderMatches(tr)}
                                                                        newMatchesCount={newMatchesCount[`transport_${tr.id}`] || 0}
                                                                        onMatchesViewed={() => handleMatchesViewed(tr.id, "transport")}
                                                                        hoveredItemId={hoveredItemId}
                                                                        setHoveredItemId={setHoveredItemId}
                                                                        isFocused={highlightTransportId == tr.id}
                                                                        data-transport-id={tr.id}
                                                                        disableAllHover={anyTransportFocused}
                                                                        ownerLabel={managerTransportsScope === "account" ? (tr.owner_name || tr.owner?.name || tr.user_name) : undefined}
                                                                        isMine={managerTransportsScope === "account" ? !!tr.isMine : undefined}
                                                                        showOwnerBadge={managerTransportsScope === "account"}
                                                                        managerContext={true}
                                                                        className={highlightedTransportId == tr.id || highlightTransportId == tr.id ? "profile-card-highlight" : ""}
                                                                    />
                                                                ))}
                                                        </div>
                                                    )
                                                    : <span style={{ color: colors.textMuted }}>
                                                        {managerTransportsScope === "my" ? t("transports.empty.mine", "У вас пока нет транспортов.") : t("transports.empty.account", "В аккаунте пока нет транспорта.")}
                                                    </span>
                                            )
                                        }
                                    </div>
                                </motion.div>
                            )}
                            {activeTab === "saved" && (
                                <motion.div key="saved" initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -70, opacity: 0 }} transition={{ duration: 0.32, type: "tween" }}>
                                    <SavedAllSection />
                                </motion.div>
                            )}
                            {activeTab === "mybids" && (
                                <motion.div key="manager-mybids" initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -70, opacity: 0 }} transition={{ duration: 0.32, type: "tween" }}>
                                    <div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
                                                marginBottom: 14,
                                                // мобильные улучшения:
                                                position: isMobile ? "sticky" : "static",
                                                top: isMobile ? 60 : "auto",           // под Header
                                                background: isMobile ? colors.stickyBg : "transparent",
                                                backdropFilter: isMobile ? "blur(4px)" : undefined,
                                                zIndex: 5,
                                                padding: isMobile ? "8px 0 6px" : 0,
                                                borderBottom: isMobile ? colors.stickyBorder : "none",
                                            }}
                                        >
                                            <FaFileAlt color="#34c759" size={22} />
                                            <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                                {t("bids.title", "Ставки")}
                                            </span>
                                            {(user?.role || "").toLowerCase() === "manager" && (
                                                <div style={{ marginLeft: 10, display: "inline-flex", gap: 8, padding: 4, borderRadius: 10, background: colors.pillBg, border: `1px solid ${colors.pillBorder}` }}>
                                                    <button
                                                        onClick={() => setBidsScope("account")}
                                                        style={{
                                                            padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                                                            background: bidsScope === "account" ? colors.toggleActiveBg : "transparent",
                                                            color: bidsScope === "account" ? colors.toggleActiveText : colors.toggleInactiveText, fontWeight: 800
                                                        }}
                                                    >{t("common.all", "Все")}</button>
                                                    <button
                                                        onClick={() => setBidsScope("my")}
                                                        style={{
                                                            padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                                                            background: bidsScope === "my" ? colors.toggleActiveBg : "transparent",
                                                            color: bidsScope === "my" ? colors.toggleActiveText : colors.toggleInactiveText, fontWeight: 800
                                                        }}
                                                    >{t("common.my", "Мои")}</button>
                                                </div>
                                            )}
                                            <div style={{ marginLeft: "auto" }}>
                                                <div style={{ position: "relative", display: "inline-flex", width: 420, maxWidth: "36vw" }}>
                                                    <FiSearch size={18} color={colors.searchIcon}
                                                        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                                    <input
                                                        value={bidsQuery}
                                                        onChange={(e) => setBidsQuery(e.target.value)}
                                                        placeholder={t("bids.searchPlaceholder", "Поиск по ставкам (заявка, сумма, статус.)")}
                                                        style={{ padding: "10px 12px 10px 34px", background: colors.pillBg, border: `1px solid ${colors.pillBorder}`, borderRadius: 10, color: colors.textPrimary, fontSize: 14, outline: "none", width: "100%" }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {(bidsScope === "account" ? accountBidsLoading : bidsLoading) ? (
                                            <span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>
                                        ) : ((bidsScope === "account" ? accountBids : myBids)?.length > 0
                                            ? (
                                                <div
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                                                        gap: isMobile ? 12 : 16,
                                                        paddingBottom: isMobile ? 76 : 0,   // чтобы не упиралось в нижнюю нав-панель
                                                        margin: isMobile ? "0 -8px" : 0,    // чуть растягиваем контент на мобилке
                                                    }}
                                                >
                                                    {(bidsScope === "account" ? accountBids : myBids)
                                                        .filter(bid => bid.order)
                                                        .filter(bid => matchBid(bid, bidsQuery))
                                                        .map(bid => (
                                                            <CargoCompactCard
                                                                key={bid.id}
                                                                ref={el => { if (el) myBidsRefs.current[bid.id] = el; }}
                                                                cargo={bid.order}
                                                                hoverKey={`bid_${bid.id}`}
                                                                bidAmount={bid.amount}
                                                                bidCurrency={bid.currency}
                                                                bidStatus={bid.status}
                                                                bidRecipientLabel={getBidRecipientLabel(bid.order)}
                                                                isMobile={isMobile}
                                                                disableAllHover={isMobile}   // убираем hover-эффекты на тач-устройствах
                                                                isMyBid={bidsScope === "account" ? !!bid.isMine : true}
                                                                isFocused={String(highlightBidId) === String(bid.id)}
                                                                hoveredItemId={hoveredItemId}
                                                                setHoveredItemId={setHoveredItemId}
                                                                onClick={() => {
                                                                    if (bid.order && bid.order.id) {
                                                                        window.location.href = `/orders/${bid.order.id}`;
                                                                    } else {
                                                                        setShowNoOrderModal(true);
                                                                    }
                                                                }}
                                                            />
                                                        ))}
                                                </div>
                                            )
                                            : <span style={{ color: colors.textMuted }}>
                                                {bidsScope === "account"
                                                    ? t("bids.empty.account", "В аккаунте пока нет ставок.")
                                                    : t("bids.empty.my", "У вас пока нет ставок.")}
                                            </span>
                                        )}
                                        <ConfirmModal open={showNoOrderModal} text={t("bids.orderMissing", "Заявка, на которую была сделана эта ставка, больше не существует.")} onConfirm={() => setShowNoOrderModal(false)} onCancel={() => setShowNoOrderModal(false)} />
                                        <MatchedOrdersModal open={showMatchedOrdersModal} onClose={() => setShowMatchedOrdersModal(false)} matches={selectedTransportMatches} myTransportId={matchedOrderId} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )
                }
                {/* Transport */}
                {user.role?.toLowerCase() === "transport" && activeTab !== "reviews" && (
                    <div style={mePaneStyle}>
                        <AnimatePresence mode="wait">
                            {activeTab === "blocked" && (
                                <motion.div
                                    key="transport-blocked"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <BlockedUsersList />
                                </motion.div>
                            )}
                            {(activeTab === "contacts" || activeTab === "contact_requests") && (
                                <motion.div
                                    key="contacts"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <ContactsOnePane isMobile={isMobile} />
                                </motion.div>
                            )}
                            {activeTab === "monitoring" ? (
                                <motion.div
                                    key="transport-monitoring"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <MonitoringSection />
                                </motion.div>
                            ) : activeTab === "saved" ? (
                                <motion.div key="saved" initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -70, opacity: 0 }} transition={{ duration: 0.32, type: "tween" }}>
                                    {isMobile ? <SavedAllSection /> : <SavedOrdersSection />}
                                </motion.div>
                            ) : (!isMyBids && activeTab === "transports") && (
                                <motion.div
                                    key="myTransports"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                            <FaTruck color="#43c8ff" size={22} />
                                            <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                                {t("transports.myFleetTitle", "Мой автопарк / История транспорта")}
                                            </span>
                                            <div style={{ marginLeft: "auto" }}>
                                                <div style={{ position: "relative", display: "inline-flex", width: 420, maxWidth: "36vw" }}>
                                                    <FiSearch size={18} color={colors.searchIcon}
                                                        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                                    <input
                                                        value={transportsQuery}
                                                        onChange={(e) => setTransportsQuery(e.target.value)}
                                                        placeholder={t("transports.searchPlaceholder", "Поиск по транспорту (маршрут, тип, контакт, №.)")}
                                                        style={{ padding: "10px 12px 10px 34px", background: colors.pillBg, border: `1px solid ${colors.pillBorder}`, borderRadius: 10, color: colors.textPrimary, fontSize: 14, outline: "none", width: "100%" }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {transportsLoading ? (
                                            <span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>
                                        ) : (myTransports && myTransports.length > 0
                                            ? (
                                                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                                                    {[...myTransports]
                                                        .filter(t => matchTransport(t, transportsQuery))
                                                        .sort((a, b) => new Date(b.created_at || b.available_from) - new Date(a.created_at || a.available_from))
                                                        .map(tr => (
                                                            <TransportCompactCard
                                                                key={tr.id}
                                                                transport={tr}
                                                                onClick={() => window.location.href = `/transport/${tr.id}`}
                                                                onEdit={() => window.location.href = `/transport/${tr.id}/edit`}
                                                                onDelete={() => setDeleteTransportId(tr.id)}
                                                                isMobile={false}
                                                                matchesCount={tr.matchesCount}
                                                                onShowMatches={() => handleShowOrderMatches(tr)}
                                                                newMatchesCount={newMatchesCount[`transport_${tr.id}`] || 0}
                                                                onMatchesViewed={() => handleMatchesViewed(tr.id, "transport")}
                                                                hoveredItemId={hoveredItemId}
                                                                setHoveredItemId={setHoveredItemId}
                                                                isFocused={highlightTransportId == tr.id}
                                                                data-transport-id={tr.id}
                                                                disableAllHover={anyTransportFocused}
                                                                className={highlightedTransportId == tr.id || highlightTransportId == tr.id ? "profile-card-highlight" : ""}
                                                            />
                                                        ))}
                                                </div>
                                            )
                                            : <span style={{ color: colors.textMuted }}>{t("transports.empty.mine", "У вас пока нет транспортов.")}</span>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                            {(isMyBids && activeTab === "mybids") && (
                                <motion.div
                                    key="myBids"
                                    initial={{ x: 70, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -70, opacity: 0 }}
                                    transition={{ duration: 0.32, type: "tween" }}
                                >
                                    <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                            <FaFileAlt color="#34c759" size={22} />
                                            <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                                {t("bids.my.title", "Мои ставки")}
                                            </span>
                                            <div style={{ marginLeft: "auto" }}>
                                                <div style={{ position: "relative", display: "inline-flex", width: 420, maxWidth: "36vw" }}>
                                                    <FiSearch size={18} color={colors.searchIcon}
                                                        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                                                    <input
                                                        value={bidsQuery}
                                                        onChange={(e) => setBidsQuery(e.target.value)}
                                                        placeholder={t("bids.searchPlaceholder", "Поиск по ставкам (заявка, сумма, статус.)")}
                                                        style={{ padding: "10px 12px 10px 34px", background: colors.pillBg, border: `1px solid ${colors.pillBorder}`, borderRadius: 10, color: colors.textPrimary, fontSize: 14, outline: "none", width: "100%" }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {bidsLoading ? (
                                            <span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>
                                        ) : (myBids && myBids.length > 0
                                            ? (
                                                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                                                    {myBids
                                                        .filter(bid => bid.order)
                                                        .filter(bid => matchBid(bid, bidsQuery))
                                                        .map(bid => (
                                                            <CargoCompactCard
                                                                key={bid.id}
                                                                ref={el => { if (el) myBidsRefs.current[bid.id] = el; }}
                                                                cargo={bid.order}
                                                                hoverKey={`bid_${bid.id}`}
                                                                bidAmount={bid.amount}
                                                                bidCurrency={bid.currency}
                                                                bidStatus={bid.status}
                                                                bidRecipientLabel={getBidRecipientLabel(bid.order)}
                                                                isMyBid={true}
                                                                isFocused={String(highlightBidId) === String(bid.id)}
                                                                hoveredItemId={hoveredItemId}
                                                                setHoveredItemId={setHoveredItemId}
                                                                onClick={() => {
                                                                    if (bid.order && bid.order.id) {
                                                                        window.location.href = `/orders/${bid.order.id}`;
                                                                    } else {
                                                                        setShowNoOrderModal(true);
                                                                    }
                                                                }}
                                                            />
                                                        ))}
                                                </div>
                                            )
                                            : <span style={{ color: colors.textMuted }}>{t("bids.empty.my", "У вас пока нет ставок.")}</span>
                                        )}
                                        <ConfirmModal open={showNoOrderModal} text={t("bids.orderMissing", "Заявка, на которую была сделана эта ставка, больше не существует.")} onConfirm={() => setShowNoOrderModal(false)} onCancel={() => setShowNoOrderModal(false)} />
                                        <MatchedOrdersModal open={showMatchedOrdersModal} onClose={() => setShowMatchedOrdersModal(false)} matches={selectedTransportMatches} myOrderId={matchedOrderId} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <ConfirmModal open={!!deleteId} text={deleting ? t("common.deleting", "Удаляем...") : t("orders.deleteConfirm", "Удалить заявку?")} onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />
                <ConfirmModal open={!!deleteTransportId} text={deletingTransport ? t("common.deleting", "Удаляем...") : t("transport.deleteConfirm", "Удалить транспорт?")} onConfirm={handleConfirmDeleteTransport} onCancel={handleCancelDeleteTransport} />
                <MatchedTransportsModal
                    open={showMatchesModal}
                    onClose={() => setShowMatchesModal(false)}
                    matches={selectedOrderMatches}
                    myOrderId={matchedOrderId}
                    myTransport={myTransport}
                    myOrder={myOrder}
                />
                <MatchedOrdersModal
                    open={showMatchedOrdersModal}
                    onClose={() => setShowMatchedOrdersModal(false)}
                    matches={selectedTransportMatches}
                    myTransportId={matchedTransportId}
                    myOrder={myOrder}
                    myTransport={myTransport}
                />

                {/* --- Modal: Зарегистрировать нового сотрудника --- */}
                <EmployeeRegisterModal
                    visible={registerModalOpen}
                    onClose={() => setRegisterModalOpen(false)}
                    onDone={() => setEmployeesReloadTick(t => t + 1)}
                />
            </div >
        );
    }
    // --- Мобильная версия ---
    // На вкладке мониторинга показываем только MonitoringSection (без ProfileCard)
    if (activeTab === "monitoring") {
        return (
            <div className="profile-page-root profile-mobile" style={{ maxWidth: 1100, margin: "0 auto", padding: "34px 10px 56px 10px" }}>
                <MonitoringSection />
            </div>
        );
    }
    // Остальные вкладки: мобильные ленты
    // Для MANAGER/EMPLOYEE показываем переключатель "Все / Мои"
    const roleMobile = (user?.role || "").toLowerCase();
    const showManagerToggleMobile = ["manager", "employee"].includes(roleMobile);
    return (
        <div className="profile-page-root profile-mobile" style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 10px 96px 10px" }}>
            {activeTab === "profile" && (
                <>
                    <ProfileCard user={user} onEdit={() => setEditOpen(true)} showMobileLogout onChangePasswordClick={() => setShowChangePassword(true)} />
                    {showChangePassword && (
                        <div ref={changePasswordRef} id="change-password-section">
                            <ChangePasswordForm />
                        </div>
                    )}
                    {editOpen && (
                        <EditProfileForm
                            user={user}
                            onClose={() => setEditOpen(false)}
                            onSave={() => setEditOpen(false)}
                        />
                    )}
                </>
            )}

            {activeTab === "saved" && (
                <SavedAllSection />
            )}

            {activeTab === "reviews" && (
                <div
                    style={{
                        width: "100%", maxWidth: "100%", margin: 0,
                        padding: "16px 12px 72px",
                        display: "flex", flexDirection: "column", gap: 12
                    }}
                >
                    <div style={{
                        display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                        position: "sticky", top: 60, background: colors.stickyBg,
                        backdropFilter: "blur(4px)", zIndex: 5, padding: "8px 0 6px",
                        borderBottom: colors.stickyBorder
                    }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: colors.highlightDot }} />
                        <span style={{ fontWeight: 700, fontSize: 18, color: colors.textPrimary, letterSpacing: ".01em" }}>{t("reviews.title", "Отзывы")}</span>
                    </div>
                    <UserReviewsList userId={user?.id} />
                </div>
            )}


            {(activeTab === "contacts" || activeTab === "contact_requests") && (
                <ContactsOnePane isMobile />
            )}

            {activeTab === "blocked" && (
                <BlockedUsersList />
            )}


            {activeTab === "employees" && (user.role?.toLowerCase() === "manager") && (
                <EmployeeList
                    canManage
                    reloadSignal={employeesReloadTick}
                    onCreateNew={() => setRegisterModalOpen(true)}
                />
            )}

            {activeTab === "orders" && (
                <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <FaFileAlt color="#43c8ff" size={18} />
                            <span style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                {t("orders.title", "Заявки")}
                            </span>
                        </div>
                        {showManagerToggleMobile && (
                            <div style={{ display: "inline-flex", background: colors.segmentedBg, border: `1px solid ${colors.segmentedBorder}`, borderRadius: 12, padding: 3 }}>
                                <button
                                    type="button"
                                    onClick={() => setManagerOrdersScope("account")}
                                    style={{
                                        padding: "6px 10px",
                                        borderRadius: 9,
                                        fontSize: 13,
                                        fontWeight: 800,
                                        background: managerOrdersScope === "account" ? colors.accentBlue : "transparent",
                                        color: managerOrdersScope === "account" ? colors.segmentedActiveText : colors.textMuted
                                    }}
                                >
                                    {t("common.all", "Все")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setManagerOrdersScope("my")}
                                    style={{
                                        padding: "6px 10px",
                                        borderRadius: 9,
                                        fontSize: 13,
                                        fontWeight: 800,
                                        background: managerOrdersScope === "my" ? colors.accentBlue : "transparent",
                                        color: managerOrdersScope === "my" ? colors.segmentedActiveText : colors.textMuted
                                    }}
                                >
                                    {t("common.my", "Мои")}
                                </button>
                            </div>
                        )}
                    </div>
                    {/* MOBILE: поиск по заявкам */}
                    <div className="md:hidden" style={{ marginBottom: 10 }}>
                        <div style={{ position: "relative" }}>
                            <FiSearch
                                size={18}
                                color={colors.searchIcon}
                                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                            />
                            <input
                                value={ordersQuery}
                                onChange={(e) => setOrdersQuery(e.target.value)}
                                placeholder={t("orders.searchPlaceholder", "Поиск по заявкам (маршрут, груз, коммент, №.)")}
                                inputMode="search"
                                style={{
                                    padding: "10px 12px 10px 34px",
                                    background: colors.searchBg,
                                    border: `1px solid ${colors.searchBorder}`,
                                    borderRadius: 10,
                                    color: colors.searchText,
                                    fontSize: 14,
                                    outline: "none",
                                    width: "100%"
                                }}
                            />
                        </div>
                    </div>
                    {(managerOrdersScope === "my" ? ordersLoading : accountOrdersLoading) ? (
                        <span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>
                    ) : (
                        ((managerOrdersScope === "my" ? myOrders : accountOrders)?.length ? (
                            <div className="compact-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                                {(managerOrdersScope === "my" ? myOrders : accountOrders)
                                    .slice()
                                    .filter((o) => matchOrder(o, ordersQuery))
                                    .sort((a, b) => new Date(b.created_at || b.load_date) - new Date(a.created_at || a.load_date))
                                    .map((order) => (
                                        <CargoCompactCard
                                            key={order.id}
                                            cargo={order}
                                            isMobile={true}
                                            onClick={() => window.location.href = `/orders/${order.id}`}
                                            onEdit={() => window.location.href = `/orders/${order.id}/edit`}
                                            onDelete={() => setDeleteId(order.id)}
                                            matchesCount={order.matchesCount}
                                            onShowMatches={() => handleShowMatches(order)}
                                            newMatchesCount={newMatchesCount[`order_${order.id}`] || 0}
                                            onMatchesViewed={() => handleMatchesViewed(order.id, "order")}
                                        />
                                    ))}
                            </div>
                        ) : (
                            <span style={{ color: colors.textMuted }}>
                                {managerOrdersScope === "my" ? t("orders.empty.mine", "У вас пока нет заявок.") : t("orders.empty.account", "В аккаунте пока нет заявок.")}
                            </span>
                        ))
                    )}
                </>
            )}

            {activeTab === "transports" && (
                <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <FaTruck color="#43c8ff" size={18} />
                            <span style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary, letterSpacing: ".01em" }}>
                                {t("transports.title", "Транспорт")}
                            </span>
                        </div>
                        {showManagerToggleMobile && (
                            <div style={{ display: "inline-flex", background: colors.segmentedBg, border: `1px solid ${colors.segmentedBorder}`, borderRadius: 12, padding: 3 }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setManagerTransportsScope("account");
                                        const p = new URLSearchParams(Array.from(searchParams.entries()));
                                        p.set("transports_scope", "account");
                                        router.replace(`${pathname}?${p.toString()}`);
                                    }}
                                    style={{
                                        padding: "6px 10px",
                                        borderRadius: 9,
                                        fontSize: 13,
                                        fontWeight: 800,
                                        background: managerTransportsScope === "account" ? colors.accentBlue : "transparent",
                                        color: managerTransportsScope === "account" ? colors.segmentedActiveText : colors.textMuted
                                    }}
                                >
                                    {t("common.all", "Все")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setManagerTransportsScope("my")}
                                    style={{
                                        padding: "6px 10px",
                                        borderRadius: 9,
                                        fontSize: 13,
                                        fontWeight: 800,
                                        background: managerTransportsScope === "my" ? colors.accentBlue : "transparent",
                                        color: managerTransportsScope === "my" ? colors.segmentedActiveText : colors.textMuted
                                    }}
                                >
                                    {t("common.my", "Мои")}
                                </button>
                            </div>
                        )}
                    </div>
                    {/* MOBILE: поиск по транспорту */}
                    <div className="md:hidden" style={{ marginBottom: 10 }}>
                        <div style={{ position: "relative" }}>
                            <FiSearch
                                size={18}
                                color={colors.searchIcon}
                                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                            />
                            <input
                                value={transportsQuery}
                                onChange={(e) => setTransportsQuery(e.target.value)}
                                placeholder={t("transports.searchPlaceholder", "Поиск по транспорту (маршрут, вид ТС, коммент, №.)")}
                                inputMode="search"
                                style={{
                                    padding: "10px 12px 10px 34px",
                                    background: colors.searchBg,
                                    border: `1px solid ${colors.searchBorder}`,
                                    borderRadius: 10,
                                    color: colors.searchText,
                                    fontSize: 14,
                                    outline: "none",
                                    width: "100%"
                                }}
                            />
                        </div>
                    </div>

                    {(managerTransportsScope === "my" ? transportsLoading : accountTransportsLoading) ? (
                        <span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>
                    ) : (
                        ((managerTransportsScope === "my" ? myTransports : accountTransports)?.length ? (
                            <div className="compact-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                                {(managerTransportsScope === "my" ? myTransports : accountTransports)
                                    .slice()
                                    .filter((tr) => matchTransport(tr, transportsQuery))
                                    .sort((a, b) => new Date(b.created_at || b.available_from) - new Date(a.created_at || a.available_from))
                                    .map((tr) => (
                                        <TransportCompactCard
                                            key={tr.id}
                                            transport={tr}
                                            isMobile={true}
                                            onClick={() => window.location.href = `/transport/${tr.id}`}
                                            onEdit={() => window.location.href = `/transport/${tr.id}/edit`}
                                            onDelete={() => setDeleteTransportId(tr.id)}
                                            matchesCount={tr.matchesCount}
                                            onShowMatches={() => handleShowOrderMatches(tr)}
                                            newMatchesCount={newMatchesCount[`transport_${tr.id}`] || 0}
                                            onMatchesViewed={() => handleMatchesViewed(tr.id, "transport")}
                                        />
                                    ))}
                            </div>
                        ) : (
                            <span style={{ color: colors.textMuted }}>
                                {managerTransportsScope === "my" ? t("profile.noTransportYou", "У вас пока нет транспорта.") : t("profile.noTransportAccount", "В аккаунте пока нет транспорта.")}
                            </span>

                        ))
                    )}
                </>
            )}
            {activeTab === "mybids" && (
                <>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 12,
                            position: "sticky",
                            top: 60,                          // под верхним header
                            background: colors.stickyBg,
                            backdropFilter: "blur(4px)",
                            zIndex: 5,
                            padding: "8px 0 6px",
                            borderBottom: colors.stickyBorder,
                        }}
                    >
                        <FaFileAlt color="#34c759" size={18} />
                        <span style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary, letterSpacing: ".01em" }}>
                            {t("bids.title", "Ставки")}
                        </span>

                        {/* переключатель "Все/Мои" показываем только менеджеру */}
                        {(user?.role || "").toLowerCase() === "manager" && (
                            <div style={{
                                marginLeft: "auto", display: "inline-flex", background: colors.segmentedBg,
                                border: `1px solid ${colors.segmentedBorder}`, borderRadius: 12, padding: 3
                            }}>
                                <button type="button"
                                    onClick={() => setBidsScope("account")}
                                    style={{
                                        padding: "6px 10px", borderRadius: 9, fontSize: 13, fontWeight: 800,
                                        background: bidsScope === "account" ? colors.accentBlue : "transparent",
                                        color: bidsScope === "account" ? colors.segmentedActiveText : colors.textMuted
                                    }}>
                                    {t("common.all", "Все")}
                                </button>
                                <button type="button"
                                    onClick={() => setBidsScope("my")}
                                    style={{
                                        padding: "6px 10px", borderRadius: 9, fontSize: 13, fontWeight: 800,
                                        background: bidsScope === "my" ? colors.accentBlue : "transparent",
                                        color: bidsScope === "my" ? colors.segmentedActiveText : colors.textMuted
                                    }}>
                                    {t("common.my", "Мои")}
                                </button>
                            </div>
                        )}
                    </div>

                    {(bidsScope === "account" ? accountBidsLoading : bidsLoading) ? (
                        <span style={{ color: colors.textMuted }}>{t("common.loading", "Загрузка...")}</span>
                    ) : ((bidsScope === "account" ? accountBids : myBids)?.length > 0 ? (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr",
                                gap: 12,
                                paddingBottom: 76,    // не упираемся в нижнюю панель
                                margin: "0 -8px",     // чуть растягиваем контент
                            }}
                        >
                            {(bidsScope === "account" ? accountBids : myBids)
                                .filter(bid => bid.order)
                                .filter(bid => matchBid(bid, bidsQuery))
                                .map(bid => (
                                    <CargoCompactCard
                                        key={bid.id}
                                        ref={el => { if (el) myBidsRefs.current[bid.id] = el; }}
                                        cargo={bid.order}
                                        hoverKey={`bid_${bid.id}`}
                                        bidAmount={bid.amount}
                                        bidCurrency={bid.currency}
                                        bidStatus={bid.status}
                                        bidRecipientLabel={getBidRecipientLabel(bid.order)}
                                        isMobile
                                        disableAllHover
                                        isMyBid={bidsScope === "account" ? !!bid.isMine : true}
                                        isFocused={String(highlightBidId) === String(bid.id)}
                                        hoveredItemId={hoveredItemId}
                                        setHoveredItemId={setHoveredItemId}
                                        onClick={() => {
                                            if (bid.order?.id) window.location.href = `/orders/${bid.order.id}`;
                                            else setShowNoOrderModal(true);
                                        }}
                                    />
                                ))}
                        </div>
                    ) : (
                        <span style={{ color: colors.textMuted }}>
                            {bidsScope === "account" ? t("profile.noBidsAccount", "В аккаунте пока нет ставок.") : t("profile.noBidsYou", "У вас пока нет ставок.")}
                        </span>
                    ))}

                    <ConfirmModal
                        open={showNoOrderModal}
                        text={t("bids.orderMissing", "Заявка, на которую была сделана эта ставка, больше не существует.")}
                        onConfirm={() => setShowNoOrderModal(false)}
                        onCancel={() => setShowNoOrderModal(false)}
                    />
                </>
            )}
            {/* --- Confirm-модалки для мобилки (грузы и транспорт) --- */}
            <ConfirmModal
                open={!!deleteId}
                text={deleting ? t("common.deleting", "Удаляем...") : t("orders.deleteConfirm", "Удалить заявку?")}
                onConfirm={handleConfirmDelete}
                onCancel={handleCancelDelete}
            />
            <ConfirmModal
                open={!!deleteTransportId}
                text={deletingTransport ? t("common.deleting", "Удаляем...") : t("transport.deleteConfirm", "Удалить транспорт?")}
                onConfirm={handleConfirmDeleteTransport}
                onCancel={handleCancelDeleteTransport}
            />
        </div>
    );
}