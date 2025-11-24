"use client";
import { useUser } from "../UserContext";
import Header from "./Header";
import SafeBoundary from "./SafeBoundary";
import AuthModal from "./AuthModal";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useState, useEffect, useRef } from "react";
import RegisterModal from "./RegisterModal";
import { MapHoverProvider } from "./MapHoverContext";
import PinnedChatsBar from "./PinnedChatsBar";
import TopProgressBar from "./TopProgressBar";
import { usePathname } from "next/navigation";
import BottomNavBar from "./BottomNavBar";

export default function LayoutClientWrapper({ children }) {
    const { showAuth, setShowAuth, setUser } = useUser();

    // Сначала получаем текущий путь
    const pathname = usePathname();

    // ВАЖНО: экранируем слэш перед ?$ и считаем isChat после объявления pathname
    const isChat = /^\/messages\/[\w-]+\/?$/.test(pathname || "");
    const isHome = (pathname || "") === "/";
    const isMobile = useIsMobile();

    const [showRegisterModal, setShowRegisterModal] = useState(false);

    // Высота хэдера, чтобы фон домашней страницы начинался под ним
    const headerRef = useRef(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    useEffect(() => {
        if (!isHome) return;
        const measure = () => {
            if (!headerRef.current) return;
            const nextHeight = headerRef.current.getBoundingClientRect().height;
            setHeaderHeight(nextHeight);
        };

        measure();

        let observer;
        if (typeof ResizeObserver !== "undefined" && headerRef.current) {
            observer = new ResizeObserver(measure);
            observer.observe(headerRef.current);
        }

        window.addEventListener("resize", measure);
        return () => {
            if (observer) observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [isHome]);

    // --- Loading bar state ---
    const [loading, setLoading] = useState(false);
    // ВАЖНО: чтобы исключить mismatch, мобильные элементы показываем только после маунта
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    const timerRef = useRef(null);

    useEffect(() => {
        setLoading(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setLoading(false), 700);
        return () => clearTimeout(timerRef.current);
    }, [pathname]);

    return (
        <MapHoverProvider>
            <div
                className={isHome ? "home-top-band-wrapper" : undefined}
                style={
                    isHome
                        ? {
                            position: "relative",
                            isolation: "isolate",
                        }
                        : undefined
                }
            >
                {isHome && <div className="home-top-band" aria-hidden />}

                {/* Header временно под ErrorBoundary, чтобы не валить весь апп */}
                <SafeBoundary label="Header">
                    <Header setShowRegisterModal={setShowRegisterModal} />
                </SafeBoundary>
                <TopProgressBar loading={loading} />

                {/* Глобальная модалка авторизации: теперь и на мобильных, всегда через портал */}
                <AuthModal
                    visible={showAuth}
                    onClose={() => setShowAuth(false)}
                    setShowRegisterModal={setShowRegisterModal}
                />

                {/* Модалка регистрации — глобально */}
                <RegisterModal
                    visible={showRegisterModal}
                    onClose={() => setShowRegisterModal(false)}
                />

                <main
                    suppressHydrationWarning
                    style={{
                        minHeight: "100dvh",
                        display: "flex",
                        flexDirection: "column",
                        // НА МОБИЛЕ РАСТЯГИВАЕМ ДЕТЕЙ, НА ДЕСКТОПЕ ОСТАВЛЯЕМ ЦЕНТРОВАНИЕ
                        alignItems: isMobile ? "stretch" : "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        // paddingBottom меняем только после маунта, чтобы не влиять на первый клиентский кадр
                        paddingBottom: mounted && isMobile ? "calc(env(safe-area-inset-bottom) + 60px)" : 0,
                    }}
                >
                    {/* До маунта не рендерим ветку, зависящую от isMobile */}
                    {mounted && !isMobile && <PinnedChatsBar />}
                    {children}
                </main>

                {/* Нижняя навигация — тоже только после маунта */}
                {mounted && isMobile && !isChat && <BottomNavBar />}
            </div>
        </MapHoverProvider>
    );
}