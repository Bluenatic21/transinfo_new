"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import OrdersTabs from "../components/OrdersTabs";
import { useUser } from "../UserContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import useSwipeNav from "../components/mobile/useSwipeNav";
import { useMapHover } from "../components/MapHoverContext";
import { useLang } from "../i18n/LangProvider";

// грузим без SSR (без гидрационных рассинхронов)
const TransportList = dynamic(() => import("../components/TransportList"), { ssr: false });

export default function TransportPage() {
    const { t } = useLang();
    const { user } = useUser() || {};
    const params = useSearchParams();
    const router = useRouter();
    const { setClickedItemId } = useMapHover();
    const [hydrated, setHydrated] = useState(false);

    // ❶ привычный хук
    const isMobileUA = useIsMobile();
    // ❷ доп. проверка ширины, чтобы «узкое десктопное окно» считалось мобильным
    const [isNarrow, setIsNarrow] = useState(false);
    useEffect(() => {
        setHydrated(true);
        try {
            const mq = window.matchMedia("(max-width: 768px)");
            const apply = () => setIsNarrow(mq.matches);
            apply();
            mq.addEventListener("change", apply);
            return () => mq.removeEventListener("change", apply);
        } catch { }
    }, []);

    const isCompact = isMobileUA || isNarrow;

    // 🚫 Роль TRANSPORT не должна видеть список всех транспортов
    const role = (user?.role || "").toUpperCase();
    useEffect(() => {
        if (role === "TRANSPORT") {
            // отправляем к своим транспортам в профиле
            try { router.replace("/profile?transports=1"); } catch { }
        }
    }, [role, router]);


    useEffect(() => {
        try { localStorage.setItem("ordersTab", "transport"); } catch { }
    }, []);


    // Фокус по ?focus=<transportId> (пришли с главной карты)
    useEffect(() => {
        const id = params?.get?.("focus");
        if (!id) return;
        const t = setTimeout(() => {
            try { setClickedItemId(id); } catch { }
            try {
                const u = new URL(window.location.href);
                u.searchParams.delete("focus");
                window.history.replaceState({}, "", u.toString());
            } catch { }
        }, 120);
        return () => clearTimeout(t);
    }, [params, setClickedItemId]);

    // Гостям тоже показываем список; запрещаем лишь роли TRANSPORT (их редиректим в профиль)
    const ready = hydrated && role !== "TRANSPORT";

    // ВНИМАНИЕ: не используем margin (шорт-хенд)!
    const cardStyle = {
        width: "100%",
        alignSelf: "stretch",
        minWidth: 0,
        maxWidth: isCompact ? "100%" : 1400,
        marginInline: isCompact ? 0 : "auto",
        marginBlockStart: 12,               // то, что было marginTop
        background: "var(--orders-panel-bg)",
        border: "1px solid var(--orders-panel-border)",
        borderRadius: isCompact ? 0 : 20,
        paddingInline: isCompact ? 12 : 24,
        paddingBlock: isCompact ? "12px 40px" : "24px 40px",
        boxShadow: "var(--orders-panel-shadow)",
        minHeight: 380,
        display: "flex",
        flexDirection: "column",
        gap: 18,
    };

    // свайп: влево -> на заявки
    const swipe = useSwipeNav({ toLeft: "/orders", enabled: isCompact });

    return (
        <div
            {...swipe}
            style={{
                width: "100%",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                // ВАЖНО: сам корневой блок растягивается в родительском <main>
                alignSelf: "stretch",
                alignItems: "stretch",
            }}
        >
            <OrdersTabs mode="route" />

            <div style={cardStyle}>
                {/* На мобилке заголовок отрисовывает TransportListMobile (рядом с «Карта / Фильтр») */}
                {!isCompact && (
                    <div
                        className="section-title"
                        style={{
                            marginLeft: 0,
                            marginBottom: 18,
                            fontSize: 26,
                            fontWeight: 700,
                            color: "var(--orders-heading)",
                            letterSpacing: 0.1,
                            textAlign: "left",
                        }}
                    >
                        {t("transport.title", "Транспорт")}
                    </div>
                )}

                {!ready ? (
                    <div style={{ opacity: 0.7, fontSize: 14, color: "var(--orders-muted)" }}>{t("common.loading", "Загрузка...")}</div>
                ) : (
                    <TransportList key="transport-list" />
                )}
            </div>
        </div>
    );
}

