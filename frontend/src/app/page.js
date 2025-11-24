"use client";
import OrderForm from "./components/OrderForm";
import OrderList from "./components/OrderList";
import OrderListMobile from "./components/OrderListMobile";
import LoginForm from "./components/LoginForm";
import FlashMessage from "./components/FlashMessage";
import TransportForm from "./components/TransportForm";
import BottomNavBar from "./components/BottomNavBar";
import RegisterForm from "./components/RegisterForm";
import { useUser } from "./UserContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { useState, useEffect, useReducer } from "react";
import { useRouter } from "next/navigation";
import { FaTruck, FaClipboardCheck, FaUser } from "react-icons/fa6";
import { FaSignInAlt } from "react-icons/fa";
import CountUp from "react-countup";
import { FaChartLine, FaUserTie, FaUsers, FaClipboardList } from "react-icons/fa6";
import ServiceSection from "./components/ServiceSection";
import CompactHero from "./components/CompactHero";
import AuthModal from "./components/AuthModal";
import HomeMapsSection from "./components/HomeMapsSection";
import { useLang } from "./i18n/LangProvider";

// --- Глобальное состояние для модалки регистрации ---
const BASE_STATS = {
    index: { key: "index", value: 217, label: "TransInfo-Индекс", color: "#5ee8c4", icon: <FaChartLine size={30} style={{ color: "#5ee8c4" }} /> },
    cargos: { key: "cargos", value: 23000, label: "Грузы", color: "#fbbf24", icon: <FaClipboardList size={30} style={{ color: "#fbbf24" }} /> },
    trucks: { key: "trucks", value: 10000, label: "Машины", color: "#34d399", icon: <FaTruck size={30} style={{ color: "#34d399" }} /> },
    companies: { key: "companies", value: 80000, label: "Участники", color: "#60a5fa", icon: <FaUsers size={30} style={{ color: "#60a5fa" }} /> },
    tenders: { key: "tenders", value: 121, label: "Тендеры", color: "#c084fc", icon: <FaUserTie size={30} style={{ color: "#c084fc" }} /> }
};
const PER_MINUTE = {
    index: [0.03, 0.06],      // индекс — примерно 2–4 в час
    cargos: [0.6, 1.2],       // грузы — примерно 36–72 в час
    trucks: [0.15, 0.3],      // машины — примерно 9–18 в час
    companies: [0.08, 0.18],  // участники — примерно 5–11 в час
    tenders: [0.01, 0.03]     // тендеры — примерно 0.6–1.8 в час
};
const PROJECT_START_DATE = new Date("2025-07-08T07:17:00Z");

const SPEED_DIVISOR = 3; // замедляем приращения в 3 раза

// === Helpers for month-over-month index and 20x downscale ===
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function minutesSinceStart(d) { return Math.max(0, Math.floor((d - PROJECT_START_DATE) / (1000 * 60))); }

const STAT_SEEDS = { cargos: 3, trucks: 4, companies: 5, tenders: 6 };

function valueAtKeyAtMinutes(key, minutes) {
    const base = BASE_STATS[key].value;
    const [min, max] = PER_MINUTE[key];
    const seed = STAT_SEEDS[key];
    return getStatGrowth(base, min, max, minutes, seed);
}

function sumPeriod(keys, startDate, endDate) {
    const m1 = minutesSinceStart(startDate);
    const m2 = minutesSinceStart(endDate);
    let total = 0;
    for (const k of keys) total += valueAtKeyAtMinutes(k, m2) - valueAtKeyAtMinutes(k, m1);
    return total;
}

// Индекс = (текущий месяц / прошлый месяц) * 100
function computeMoMIndex(now) {
    const currStart = startOfMonth(now);
    const prevStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const keys = ["cargos", "trucks", "companies", "tenders"];
    const curr = sumPeriod(keys, currStart, now);
    const prev = sumPeriod(keys, prevStart, currStart);
    if (prev <= 0) return 100; // базовый случай
    return +((curr / prev) * 100).toFixed(2);
}
function getStatGrowth(base, min, max, minutes, seed) {
    function seededRand(i) {
        return Math.abs(Math.sin(seed + i) * 10000) % 1;
    }
    let total = base;
    for (let i = 0; i < minutes; i++) {
        const inc = (seededRand(i) * (max - min) + min) / SPEED_DIVISOR;
        total += inc;
    }
    return total;
}
function useForceUpdate() {
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    useEffect(() => {
        const timer = setInterval(forceUpdate, 20000);
        return () => clearInterval(timer);
    }, []);
}
function useLiveStats() {
    useForceUpdate();
    const { t } = useLang?.() || { t: (_k, f) => f };
    const now = new Date();
    const minutes = Math.floor((now - PROJECT_START_DATE) / (1000 * 60));
    const indexMoM = computeMoMIndex(now);

    return [
        {
            ...BASE_STATS.index,
            value: indexMoM,
            sub: t("home.stats.indexSub", "текущий месяц / прошлый, %")
        },
        {
            ...BASE_STATS.cargos,
            value: Math.floor(
                getStatGrowth(BASE_STATS.cargos.value, ...PER_MINUTE.cargos, minutes, 3) / 20
            ),
            sub: `~${Math.round((PER_MINUTE.cargos[0] * 60) / SPEED_DIVISOR)} - ${Math.round((PER_MINUTE.cargos[1] * 60) / SPEED_DIVISOR)} ${t("home.stats.perHour", "/час")}`
        },
        {
            ...BASE_STATS.trucks,
            value: Math.floor(
                getStatGrowth(BASE_STATS.trucks.value, ...PER_MINUTE.trucks, minutes, 4) / 20
            ),
            sub: `~${Math.round((PER_MINUTE.trucks[0] * 60) / SPEED_DIVISOR)} - ${Math.round((PER_MINUTE.trucks[1] * 60) / SPEED_DIVISOR)} ${t("home.stats.perHour", "/час")}`
        },
        {
            ...BASE_STATS.companies,
            value: Math.floor(
                getStatGrowth(BASE_STATS.companies.value, ...PER_MINUTE.companies, minutes, 5) / 20
            ),
            sub: `~${Math.round((PER_MINUTE.companies[0] * 60) / SPEED_DIVISOR)} - ${Math.round((PER_MINUTE.companies[1] * 60) / SPEED_DIVISOR)} ${t("home.stats.perHour", "/час")}`
        },
        {
            ...BASE_STATS.tenders,
            value: Math.floor(
                getStatGrowth(BASE_STATS.tenders.value, ...PER_MINUTE.tenders, minutes, 6) / 20
            ),
            sub: `~${((PER_MINUTE.tenders[0] * 60) / SPEED_DIVISOR).toFixed(2)} - ${((PER_MINUTE.tenders[1] * 60) / SPEED_DIVISOR).toFixed(2)} ${t("home.stats.perHour", "/час")}`
        }
    ];
}
function StatsBlock() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const stats = useLiveStats();
    return (
        <div
            style={{
                margin: "34px 0 26px 0",
                background: "var(--bg-card, var(--surface, #22314a))",
                borderRadius: 19,
                display: "flex",
                flexWrap: "nowrap",
                gap: 34,
                padding: "36px 16px 20px 16px",
                justifyContent: "space-between",
                alignItems: "stretch",
                boxShadow: "var(--shadow-soft, 0 2px 14px #17418e18)",
                border: "1px solid var(--border-subtle, rgba(23, 65, 142, 0.12))"
            }}
        >
            {stats.map((stat) => (
                <div
                    key={stat.label}
                    style={{
                        minWidth: 130,
                        flex: "1 1 150px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--text-primary, #eaf6ff)"
                    }}
                >
                    <div style={{ marginBottom: 4 }}>{stat.icon}</div>
                    <div style={{
                        fontSize: 27,
                        fontWeight: 900,
                        letterSpacing: 1.2,
                        color: stat.color,
                        display: "flex",
                        alignItems: "baseline"
                    }}>
                        <CountUp
                            end={stat.value}
                            duration={2.2}
                            separator=" "
                            decimals={stat.label === "TransInfo-Индекс" ? 2 : 0}
                        />
                    </div>
                    <div style={{
                        color: "var(--text-secondary, #9edfff)",
                        fontSize: 17,
                        fontWeight: 700,
                        marginBottom: 2,
                        marginTop: 4,
                        textAlign: "center"
                    }}>{t(`home.stats.${stat.key}`, stat.label)}</div>
                </div>
            ))}
        </div>
    );
}

const ROLES = [
    {
        key: "OWNER",
        label: "Грузовладелец",
        icon: <FaClipboardCheck size={34} style={{ marginBottom: 6, color: "#43c8ff" }} />
    },
    {
        key: "TRANSPORT",
        label: "Перевозчик",
        icon: <FaTruck size={34} style={{ marginBottom: 6, color: "#43c8ff" }} />
    },
    {
        key: "MANAGER",
        label: "Экспедитор",
        icon: <FaUser size={34} style={{ marginBottom: 6, color: "#43c8ff" }} />
    }
];

// --- Исправление здесь ---
export default function Home() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const { user, setUser, showAuth, setShowAuth, message, setMessage } = useUser();
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [mode, setMode] = useState("main");
    const [reload, setReload] = useState(false);
    const router = useRouter();
    const isMobile = useIsMobile();
    const role = (user?.role || "").toUpperCase();
    const isTransportRole = role === "TRANSPORT";
    const isOwnerRole = role === "OWNER";

    const handleNav = (m) => {
        if (m === "auth") setShowAuth(true);
        else setMode(m);
    };

    // компактный hero на первом экране: берём текущие «живые» метрики и передаём в новый блок
    function HeroCompactBridge() {
        const router = useRouter();
        const live = useLiveStats(); // [index, cargos, trucks, users, tenders]
        const stats = {
            index: live?.[0]?.value,
            cargos: live?.[1]?.value,
            trucks: live?.[2]?.value,
            users: live?.[3]?.value,
            tenders: live?.[4]?.value,
        };
        return (
            <CompactHero
                hideText
                stats={stats}
                onFindCargo={() => {
                    setMode("main");
                    router.push("/orders");
                }}
                onFindTransport={() => {
                    setMode("main");
                    router.push("/transport");
                }}
            />
        );
    }

    function OrdersSection() {
        return (
            <div className="section">
                <div className="section-title">{t("home.sections.latestOrders", "Последние заявки")}</div>
                <OrderList reload={reload} setMessage={setMessage} user={user} />
            </div>
        );
    }

    function CreateSection() {
        return (
            <div className="section">
                <div className="section-title">{t("home.sections.createTitle", "Создать новую заявку (груз)")}</div>
                {!user?.email ? (
                    <div style={{ textAlign: "center", color: "var(--text-primary)", fontWeight: 600 }}>
                        {t("home.loginRequiredCreate", "Для создания заявки")}{" "}
                        <span
                            style={{ textDecoration: "underline", cursor: "pointer", color: "var(--accent, #1fb6ff)" }}
                            onClick={() => setShowAuth(true)}
                        >
                            {t("auth.loginLink", "войдите в аккаунт")}
                        </span>.
                    </div>
                ) : (
                    <OrderForm
                        onCreated={() => {
                            setMessage(t("home.messages.orderCreated", "Заявка создана!"));
                            setReload((r) => !r);
                            setMode("orders");
                        }}
                        user={user}
                    />
                )}
            </div>
        );
    }

    function CreateTransportSection() {
        return (
            <div className="section">
                <div className="section-title">{t("home.sections.addTransportTitle", "Добавить транспорт")}</div>
                {!user?.email ? (
                    <div style={{ textAlign: "center", color: "var(--text-primary)", fontWeight: 600 }}>
                        {t("home.loginRequiredAddTransport", "Для добавления транспорта")}{" "}
                        <span
                            style={{ textDecoration: "underline", cursor: "pointer", color: "var(--accent, #1fb6ff)" }}
                            onClick={() => setShowAuth(true)}
                        >
                            {t("auth.loginLink", "войдите в аккаунт")}
                        </span>.
                    </div>
                ) : (
                    <TransportForm
                        onCreated={() => {
                            setMessage(t("home.messages.transportAdded", "Транспорт добавлен!"));
                            setMode("main");
                        }}
                        user={user}
                    />
                )}
            </div>
        );
    }

    function AboutSection() {
        return (
            <div className="section">
                <div className="section-title">{t("home.sections.aboutTitle", "О сервисе")}</div>
                <div style={{ color: "var(--text-primary)", fontSize: "1.05rem", textAlign: "center" }}>
                    {t("home.about.p1", "TransInfo — это современная площадка для поиска грузов и транспорта.")}<br />
                    {t("home.about.p2", "Всё быстро, удобно, без лишних звонков и посредников.")}<br /><br />
                    <span style={{ color: "var(--accent, #FE9805)" }}>{t("home.about.tagline", "Всё как у лидеров рынка — только проще и понятнее!")}</span>
                </div>
            </div>
        );
    }

    const homeStyles = (
        <style jsx global>{`
          html { scroll-behavior: smooth; }

          .home-shell {
            position: relative;
            isolation: isolate;
          }

          .home-top-band {
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: clamp(420px, 52vh, 620px);
            background: var(--home-top-bg, linear-gradient(180deg, #0a4c78 0%, #0b2f4d 100%));
            pointer-events: none;
            z-index: 0;
          }

          .home-content {
            position: relative;
            z-index: 1;
          }

          [data-theme="light"] .home-top-band,
          [data-theme="dark"] .home-top-band {
            --home-top-bg:
              radial-gradient(circle at 18% 18%, rgba(0, 0, 0, 0.06) 0 24%, transparent 38%),
              radial-gradient(circle at 86% 12%, rgba(0, 0, 0, 0.08) 0 20%, transparent 38%),
              linear-gradient(180deg, #0c4f7c 0%, #0b3c63 38%, #0b2f4d 100%);
          }
        `}</style>
    );

    if (isMobile) {
        return (
            <div className="home-shell">
                {homeStyles}
                <div className="home-content">
                    <HeroCompactBridge />
                    <HomeMapsSection hideTransportPins={isTransportRole} />
                    <ServiceSection />

                    {showAuth && (
                        <AuthModal
                            visible={showAuth}
                            onClose={() => setShowAuth(false)}
                            setUser={setUser}
                            setShowAuth={setShowAuth}
                            setMessage={setMessage}
                            setReload={setReload}
                            previous={'/'}
                        />
                    )}

                    {showRegisterModal && (
                        <div
                            style={{
                                position: "fixed",
                                zIndex: 1300,
                                left: 0, top: 0, width: "100vw", height: "100vh",
                                background: "rgba(0,0,0,0.33)",
                                display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                            onClick={() => setShowRegisterModal(false)}
                        >
                            <div
                                style={{
                                    position: "relative",
                                    background: "#0f172a",
                                    border: "1px solid #23314a",
                                    borderRadius: 16,
                                    width: "min(560px, 92vw)",
                                    boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
                                    padding: 12
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => setShowRegisterModal(false)}
                                    style={{
                                        position: "absolute",
                                        right: 10,
                                        top: 8,
                                        fontSize: 29,
                                        background: "none",
                                        border: "none",
                                        color: "#aaa",
                                        cursor: "pointer",
                                        lineHeight: 1,
                                        zIndex: 2
                                    }}
                                    tabIndex={0}
                                    aria-label={t("auth.closeRegister", "Закрыть регистрацию")}
                                >
                                    ×
                                </button>
                                <RegisterForm onSuccess={() => setShowRegisterModal(false)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="home-shell">
            {homeStyles}
            <div className="home-content">
                <FlashMessage message={message} setMessage={setMessage} />
                {showAuth && (
                    <AuthModal
                        visible={showAuth}
                        onClose={() => setShowAuth(false)}
                        setUser={setUser}
                        setShowAuth={setShowAuth}
                        setShowRegisterModal={setShowRegisterModal}
                    />
                )}
                {showRegisterModal && (
                    <div
                        style={{
                            position: "fixed",
                            zIndex: 1300,
                            left: 0, top: 0, width: "100vw", height: "100vh",
                            background: "rgba(0,0,0,0.33)",
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}
                        onClick={() => setShowRegisterModal(false)}
                    >
                        <div
                            style={{
                                background: "#222736",
                                borderRadius: 16,
                                boxShadow: "0 4px 32px rgba(0,0,0,0.29)",
                                padding: "34px 30px 30px 30px",
                                minWidth: 340,
                                maxWidth: "92vw",
                                position: "relative"
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowRegisterModal(false)}
                                style={{
                                    position: "absolute",
                                    right: 10,
                                    top: 8,
                                    fontSize: 29,
                                    background: "none",
                                    border: "none",
                                    color: "#aaa",
                                    cursor: "pointer",
                                    lineHeight: 1,
                                    zIndex: 2
                                }}
                                tabIndex={0}
                                aria-label={t("auth.closeRegister", "Закрыть регистрацию")}
                            >
                                ×
                            </button>
                            <RegisterForm onSuccess={() => setShowRegisterModal(false)} />
                        </div>
                    </div>
                )}
                {mode === "main" && (
                    <>
                        {/* Компактный первый экран: ниже по высоте, сразу видно блок «О сервисе» */}
                        <HeroCompactBridge />
                        <HomeMapsSection hideTransportPins={isTransportRole} />
                        <ServiceSection />
                    </>
                )}
                {mode === "orders" && !isOwnerRole && <OrdersSection />}
                {mode === "create" && <CreateSection />}
                {mode === "create-transport" && <CreateTransportSection />}
                {mode === "about" && <ServiceSection />}
            </div>
        </div>
    );
}
