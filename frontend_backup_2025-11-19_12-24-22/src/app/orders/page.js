"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OrdersTabs from "../components/OrdersTabs";
import OrderList from "../components/OrderList";
import { useUser } from "../UserContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import useSwipeNav from "../components/mobile/useSwipeNav";
import { useMapHover } from "../components/MapHoverContext";
import { useLang } from "../i18n/LangProvider";

export default function OrdersPage() {
    const { t } = useLang?.() || { t: (k, f) => f || k };
    const router = useRouter();
    const params = useSearchParams();
    const { user } = useUser() || {};

    const { setClickedItemId } = useMapHover();

    // ❶
    const isMobileUA = useIsMobile();
    // ❷
    const [isNarrow, setIsNarrow] = useState(false);
    useEffect(() => {
        try {
            const mq = window.matchMedia("(max-width: 768px)");
            const apply = () => setIsNarrow(mq.matches);
            apply();
            mq.addEventListener("change", apply);
            return () => mq.removeEventListener("change", apply);
        } catch { }
    }, []);
    const isCompact = isMobileUA || isNarrow;

    // если зачем-то пришли на /orders?type=transport — редиректим на /transport
    useEffect(() => {
        const t = params?.get?.("type");
        if (t === "transport") router.replace("/transport");
    }, [params, router]);

    useEffect(() => { try { localStorage.setItem("ordersTab", "cargo"); } catch { } }, []);

    // Фокус по ?focus=<orderId> (пришли с главной карты)
    useEffect(() => {
        const id = params?.get?.("focus");
        if (!id) return;
        const t = setTimeout(() => {
            try { setClickedItemId(id); } catch { }
            // опционально очищаем параметр, чтобы не триггерился повторно при навигации назад
            try {
                const u = new URL(window.location.href);
                u.searchParams.delete("focus");
                window.history.replaceState({}, "", u.toString());
            } catch { }
        }, 120);
        return () => clearTimeout(t);
    }, [params, setClickedItemId]);


    // Гости тоже должны видеть список — не блокируем рендер
    const ready = true; // (переменная больше не используется, можно и удалить)

    const cardStyle = {
        width: "100%",
        alignSelf: "stretch",
        minWidth: 0,
        maxWidth: isCompact ? "100%" : 1400,
        marginInline: isCompact ? 0 : "auto",
        marginBlockStart: 24,
        background: "rgba(23,38,60,0.98)",
        borderRadius: isCompact ? 0 : 20,
        paddingInline: isCompact ? 12 : 24,
        paddingBlock: isCompact ? "12px 40px" : "24px 40px",
        boxShadow: "0 4px 24px #00184455",
        minHeight: 380,
        display: "flex",
        flexDirection: "column",
        gap: 18,
    };

    // свайп: вправо -> на транспорт
    const swipe = useSwipeNav({ toRight: "/transport", enabled: isCompact });

    return (
        <div
            {...swipe}
            style={{
                width: "100%",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                alignSelf: "stretch",
                alignItems: "stretch",

            }}
        >
            <OrdersTabs mode="route" />

            <div style={cardStyle}>
                {/* На мобилке заголовок отрисовывает OrderListMobile (рядом с «Карта / Фильтр») */}
                {!isCompact && (
                    <div
                        className="section-title"
                        style={{
                            marginLeft: 0,
                            marginBottom: 18,
                            fontSize: 26,
                            fontWeight: 700,
                            color: "#43c8ff",
                            letterSpacing: 0.1,
                            textAlign: "left",
                        }}
                    >
                        {t("orders.title", "Заявки")}
                    </div>
                )}

                <OrderList key="cargo-list" />
            </div>
        </div>
    );
}
