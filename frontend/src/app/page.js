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
import { FaSignInAlt, FaBox, FaPlus, FaInfoCircle } from "react-icons/fa";
import ServiceSection from "./components/ServiceSection";
import CompactHero from "./components/CompactHero";
import AuthModal from "./components/AuthModal";
import HomeMapsSection from "./components/HomeMapsSection";
import { useLang } from "./i18n/LangProvider";

const BASE_STATS = {
    index: 217,
    cargos: 23000,
    trucks: 10000,
    companies: 80000,
    tenders: 121,
};

const PER_MINUTE = {
    index: [0.03, 0.06],
    cargos: [0.6, 1.2],
    trucks: [0.15, 0.3],
    companies: [0.08, 0.18],
    tenders: [0.01, 0.03],
};

const PROJECT_START_DATE = new Date("2025-07-08T07:17:00Z");
const SPEED_DIVISOR = 3;

function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function minutesSinceStart(d) {
    return Math.max(0, Math.floor((d - PROJECT_START_DATE) / (1000 * 60)));
}

const STAT_SEEDS = { cargos: 3, trucks: 4, companies: 5, tenders: 6 };

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

function valueAtKeyAtMinutes(key, minutes) {
    const base = BASE_STATS[key];
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

function computeMoMIndex(now) {
    const currStart = startOfMonth(now);
    const prevStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const keys = ["cargos", "trucks", "companies", "tenders"];
    const curr = sumPeriod(keys, currStart, now);
    const prev = sumPeriod(keys, prevStart, currStart);
    if (prev <= 0) return 100;
    return +((curr / prev) * 100).toFixed(2);
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
    const now = new Date();
    const minutes = Math.floor((now - PROJECT_START_DATE) / (1000 * 60));
    const indexMoM = computeMoMIndex(now);

    return [
        { key: "index", value: indexMoM },
        {
            key: "cargos",
            value: Math.floor(getStatGrowth(BASE_STATS.cargos, ...PER_MINUTE.cargos, minutes, 3) / 20),
        },
        {
            key: "trucks",
            value: Math.floor(getStatGrowth(BASE_STATS.trucks, ...PER_MINUTE.trucks, minutes, 4) / 20),
        },
        {
            key: "companies",
            value: Math.floor(getStatGrowth(BASE_STATS.companies, ...PER_MINUTE.companies, minutes, 5) / 20),
        },
        {
            key: "tenders",
            value: Math.floor(getStatGrowth(BASE_STATS.tenders, ...PER_MINUTE.tenders, minutes, 6) / 20),
        },
    ];
}

// --- Глобальное состояние для модалки регистрации ---
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
                hideActions
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

    function HeroActionsRow() {
        return (
            <div className="home-cta-row" aria-label={t("home.actions.title", "Быстрый поиск грузов и транспорта")}>
                <div className="home-cta-inner">
                    <button
                        type="button"
                        onClick={() => { setMode("main"); router.push("/transport"); }}
                        className="home-cta-btn"
                    >
                        <FaTruck />
                        {t("home.map.findTransport", "Найти транспорт")}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode("main"); router.push("/orders"); }}
                        className="home-cta-btn"
                    >
                        <FaBox />
                        {t("home.map.findCargo", "Найти груз")}
                    </button>
                </div>
            </div>
        );
    }

    function NavigationBoard() {
        const navItems = [
            {
                key: "transport",
                label: t("nav.transport", "Транспорт"),
                description: t("home.nav.transport", "Поиск свободных машин и маршрутов"),
                icon: <FaTruck />, hide: isTransportRole,
                onClick: () => {
                    try { sessionStorage.setItem("openMobileFilterOnEntry", "1"); } catch { }
                    router.push("/transport");
                }
            },
            {
                key: "orders",
                label: t("nav.cargo", "Груз"),
                description: t("home.nav.cargo", "Свежие предложения от грузовладельцев"),
                icon: <FaBox />, hide: isOwnerRole,
                onClick: () => {
                    try { sessionStorage.setItem("openMobileFilterOnEntry", "1"); } catch { }
                    router.push("/orders");
                }
            },
            {
                key: "add-transport",
                label: t("nav.addTransport", "Добавить транспорт"),
                description: t("home.nav.addTransport", "Разместить машину и получить отклики"),
                icon: <FaPlus />, hide: isOwnerRole,
                onClick: () => {
                    if (!user?.email) { setShowAuth(true); return; }
                    router.push("/create-transport");
                }
            },
            {
                key: "add-cargo",
                label: t("nav.addCargo", "Добавить груз"),
                description: t("home.nav.addCargo", "Создать заявку и найти перевозчика"),
                icon: <FaPlus />, hide: isTransportRole,
                onClick: () => {
                    if (!user?.email) { setShowAuth(true); return; }
                    router.push("/create");
                }
            },
            {
                key: "about",
                label: t("nav.about", "О сервисе"),
                description: t("home.nav.about", "Преимущества платформы и возможности"),
                icon: <FaInfoCircle />, hide: false,
                onClick: () => router.push("/#service"),
            },
        ].filter(item => !item.hide);

        return (
            <section className="home-nav-board" aria-label={t("home.nav.title", "Навигация по сервису")}>
                <div className="home-nav-grid">
                    {navItems.map((item) => (
                        <button
                            key={item.key}
                            className="home-nav-card"
                            onClick={item.onClick}
                        >
                            <span className="home-nav-icon">{item.icon}</span>
                            <div className="home-nav-text">
                                <span className="home-nav-label">{item.label}</span>
                                <span className="home-nav-desc">{item.description}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </section>
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

    function MapOrdersSection() {
        return (
            <section className="home-map-orders">
                <div className="home-map-block">
                    <HomeMapsSection hideTransportPins={isTransportRole} />
                </div>
                <div className="home-orders-block">
                    <div className="section-title">{t("home.sections.latestOrders", "Последние заявки")}</div>
                    <OrderList reload={reload} setMessage={setMessage} user={user} />
                </div>
                <div className="home-info-block">
                    <ServiceSection compact />
                </div>
            </section>
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

         .home-shell {
            position: relative;
            isolation: isolate;
          }

          .home-top-band {
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: clamp(720px, 82vh, 1200px);
            background: var(--home-top-bg, linear-gradient(180deg, #0a4c78 0%, #0b2f4d 100%));
            pointer-events: none;
            z-index: 0;
          }

          .home-network-figure {
            position: absolute;
            right: clamp(-60px, -16vw, -280px);
            top: clamp(-160px, -6vh, 80px);
            width: min(1280px, 108vw);
            aspect-ratio: 1 / 1;
            background: url("/main_web.png") top right / contain no-repeat;
            opacity: 0.82;
            filter: drop-shadow(0 22px 52px rgba(0, 0, 0, 0.35));
            pointer-events: none;
            z-index: 1;
            mix-blend-mode: screen;
          }

          .home-content {
            position: relative;
            z-index: 2;
          }

          .home-main-stack {
            display: flex;
            flex-direction: column;
            gap: clamp(18px, 2.8vw, 38px);
            padding-top: clamp(10px, 3vh, 42px);
          }

.home-hero-shell {
            display: flex;
            flex-direction: column;
            gap: clamp(10px, 1.2vw, 16px);
          }

          .home-nav-prime {
            margin-top: clamp(6px, 1.2vw, 16px);
          }

          .home-cta-row {
            display: flex;
            justify-content: center;
            margin-top: -6px;
            padding: 0 clamp(10px, 2vw, 26px);
          }

          .home-cta-inner {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            background: transparent;
            border: none;
            border-radius: 0;
            box-shadow: none;
            padding: clamp(10px, 1.4vw, 16px);
            backdrop-filter: none;
          }

          .home-cta-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            border-radius: 14px;
            border: none;
            background: linear-gradient(150deg, #fff, #eaf6ff);
            color: #0f172a;
            font-weight: 700;
            font-size: 15px;
            box-shadow: 0 10px 24px rgba(0,0,0,0.12);
            outline: none;
            transition: transform 0.18s ease, box-shadow 0.18s ease;
          }

          .home-cta-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 14px 30px rgba(0,0,0,0.16);
          }

          .home-cta-btn svg {
            font-size: 17px;
            color: var(--accent, #1fb6ff);
          }

          @media (max-width: 640px) {
            .home-cta-inner {
              width: 100%;
              justify-content: center;
            }

            .home-cta-btn {
           width: 100%;
              justify-content: center;
            }
          }

          @media (max-width: 960px) {
            .home-network-figure {
              display: none;
            }
          }

          @media (max-width: 1100px) {
            .home-hero-shell {
              gap: 18px;
            }
          }

          .home-map-orders {
            display: grid;
            grid-template-columns: minmax(0, 0.9fr) minmax(0, 2.1fr);
            grid-template-rows: auto auto;
            gap: 0;
            align-items: stretch;
            margin-top: clamp(6px, 1.8vw, 20px);
            background: linear-gradient(135deg,
              color-mix(in srgb, var(--surface, #22314a) 90%, transparent),
              color-mix(in srgb, var(--surface, #22314a) 82%, transparent));
            border-radius: 22px;
            padding: clamp(12px, 1.8vw, 18px);
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
            position: relative;
            overflow: hidden;
          }

          .home-map-block,
          .home-orders-block,
          .home-info-block {
            background: transparent;
            border-radius: 18px;
            border: none;
            padding: clamp(12px, 1.6vw, 18px);
            box-shadow: none;
          }

          .home-map-block {
            display: flex;
            flex-direction: column;
            gap: 10px;
            grid-row: 1;
            grid-column: 1;
            backdrop-filter: blur(3px);
          }

          .home-orders-block {
            grid-column: 2;
            grid-row: 1 / span 2;
            backdrop-filter: blur(3px);
          }

          .home-info-block {
            grid-row: 2;
            grid-column: 1;
            align-self: start;
            background: color-mix(in srgb, var(--bg-card, #22314a) 90%, transparent);
            border-radius: 18px;
            border: 1px solid color-mix(in srgb, var(--border-subtle, rgba(23, 65, 142, 0.12)) 80%, transparent);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
            padding: clamp(12px, 1.6vw, 18px);
            margin-top: -2px;
          }

          .home-orders-block .section-title {
            margin-bottom: 10px;
          }

          @media (max-width: 1100px) {
            .home-map-orders {
              grid-template-columns: 1fr;
              grid-template-rows: auto;
            }

            .home-nav-grid {
              width: 100%;
              max-width: none;
              grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
              margin: 0;
            }

            .home-orders-block {
              grid-row: auto;
              grid-column: 1;
            }
            .home-info-block {
              grid-column: 1;
              margin-top: 0;
            }
          }

          .home-nav-board {
            position: relative;
            padding: clamp(8px, 1.6vw, 20px) clamp(4px, 1vw, 14px) 0;
          }
          .home-nav-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: clamp(12px, 1.8vw, 20px);
            max-width: 1120px;
            margin: 0 auto;
          }
          .home-nav-card {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 10px 16px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.08);
            background: radial-gradient(circle at 18% 20%, rgba(255,255,255,0.10), transparent 45%),
              linear-gradient(150deg, color-mix(in srgb, var(--surface) 90%, transparent), color-mix(in srgb, var(--surface) 70%, transparent));
            color: var(--text-primary);
            box-shadow: 0 10px 30px rgba(0,0,0,0.10);
            transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
          }
          .home-nav-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 14px 34px rgba(0,0,0,0.14);
            border-color: color-mix(in srgb, var(--accent, #1fb6ff) 40%, transparent);
          }
          .home-nav-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            border-radius: 10px;
            background: color-mix(in srgb, var(--accent, #1fb6ff) 18%, transparent);
            color: var(--accent, #1fb6ff);
            font-size: 18px;
            flex-shrink: 0;
          }
          .home-nav-text {
            display: flex;
            flex-direction: column;
            gap: 3px;
            text-align: left;
          }
          .home-nav-label {
            font-weight: 800;
            font-size: 14px;
            letter-spacing: .005em;
          }
          .home-nav-desc {
            color: var(--text-secondary);
            font-size: 12.5px;
            line-height: 1.45;
          }

          .home-map-prime {
            position: relative;
            padding-top: clamp(6px, 2vh, 26px);
          }

          .home-hero-after-map {
            position: relative;
            padding-top: clamp(4px, 1.4vh, 18px);
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
                <div className="home-top-band" aria-hidden="true" />
                <div className="home-network-figure" aria-hidden="true" />
                <div className="home-content">
                    <HeroCompactBridge />
                    <NavigationBoard />
                    <MapOrdersSection />

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
            <div className="home-top-band" aria-hidden="true" />
            <div className="home-network-figure" aria-hidden="true" />
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
                    <div className="home-main-stack">
                        <div className="home-hero-shell">
                            <HeroCompactBridge />
                        </div>
                        <div className="home-nav-prime">
                            <NavigationBoard />
                        </div>
                        <HeroActionsRow />
                        <MapOrdersSection />
                    </div>
                )}
                {mode === "orders" && !isOwnerRole && <OrdersSection />}
                {mode === "create" && <CreateSection />}
                {mode === "create-transport" && <CreateTransportSection />}
                {mode === "about" && <ServiceSection />}
            </div>
        </div>
    );
}
