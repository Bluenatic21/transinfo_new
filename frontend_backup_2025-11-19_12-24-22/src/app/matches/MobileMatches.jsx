// src/app/matches/MobileMatches.jsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useIsMobile } from "../../hooks/useIsMobile";
import OrderCardMobile from "../components/OrderCardMobile";
import TransportCardMobile from "../components/TransportCardMobile";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

function SectionHeader({ title, count }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                background: "#1b2741",
                position: "sticky",
                top: 48,
                zIndex: 5,
                borderBottom: "1px solid rgba(255,255,255,.06)",
            }}
        >
            <div
                style={{
                    fontWeight: 900,
                    fontSize: 15,
                    color: "#9fd8ff",
                    letterSpacing: 0.2,
                }}
            >
                {title}
            </div>
            <div
                style={{
                    background: "#0f2037",
                    border: "1px solid rgba(67,200,255,.35)",
                    color: "#d6f2ff",
                    borderRadius: 14,
                    padding: "3px 10px",
                    fontWeight: 800,
                    fontSize: 12,
                }}
            >
                {count ?? 0}
            </div>
        </div>
    );
}

export default function MobileMatches() {
    const { t } = useLang?.() || { t: (_k, fallback) => fallback };
    const router = useRouter();
    const isMobile = useIsMobile();

    const [tab, setTab] = useState("orders"); // "orders" | "transport"
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [transports, setTransports] = useState([]);

    // экран второго уровня:
    // { type: "hub" } | { type: "order", id, order } | { type: "transport", id, transport }
    const [screen, setScreen] = useState({ type: "hub" });

    // читаем query (?orderId= / ?transportId=) для прямого открытия нужного экрана
    const searchParams = useSearchParams();
    useEffect(() => {
        const oid = searchParams?.get("orderId");
        const tid = searchParams?.get("transportId");

        if (oid) {
            setScreen({ type: "order", id: oid, order: null });

            // очистим URL, чтобы Back не ломал состояние
            if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.delete("orderId");
                window.history.replaceState({}, "", url.toString());
            }
        } else if (tid) {
            setScreen({ type: "transport", id: tid, transport: null });

            if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.delete("transportId");
                window.history.replaceState({}, "", url.toString());
            }
        }
    }, [searchParams]);

    // если не мобилка — уходим на обычные «matches»
    useEffect(() => {
        if (typeof window !== "undefined" && !isMobile) {
            router.replace("/matches");
        }
    }, [isMobile, router]);

    // загрузка списков
    useEffect(() => {
        let aborted = false;

        async function load() {
            setLoading(true);
            try {
                const token = localStorage.getItem("token");
                if (!token) {
                    router.push("/auth");
                    return;
                }
                const h = { headers: { Authorization: "Bearer " + token } };
                const [oRes, tRes] = await Promise.all([
                    fetch(api(`/orders/my`), h).then((r) => (r.ok ? r.json() : [])),
                    fetch(api(`/transports/my`), h).then((r) => (r.ok ? r.json() : [])),
                ]);

                if (!aborted) {
                    setOrders(Array.isArray(oRes) ? oRes : []);
                    setTransports(Array.isArray(tRes) ? tRes : []);
                }
            } catch {
                if (!aborted) {
                    setOrders([]);
                    setTransports([]);
                }
            } finally {
                if (!aborted) setLoading(false);
            }
        }

        load();
        return () => {
            aborted = true;
        };
    }, [router]);

    const toolbarBtn = {
        border: "1px solid rgba(255,255,255,.15)",
        background: "transparent",
        color: "#cfe7ff",
        padding: "8px 12px",
        borderRadius: 12,
        fontWeight: 800,
        fontSize: 13,
    };

    // роутинг на экраны соответствий
    if (screen.type === "order") {
        const OrderMatchesMobile = require("./OrderMatchesMobile").default;
        return (
            <OrderMatchesMobile
                order={screen.order}
                orderId={screen.id}
                onBack={() => router.replace("/profile?orders=1")}
            />
        );
    }

    if (screen.type === "transport") {
        const TransportMatchesMobile = require("./TransportMatchesMobile").default;
        return (
            <TransportMatchesMobile
                transport={screen.transport}
                transportId={screen.id}
                onBack={() => router.replace("/profile?transports=1")}
            />
        );
    }

    // хаб
    return (
        <div style={{ background: "#182337", minHeight: "100vh", paddingBottom: 64 }}>
            {/* header */}
            <div
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    background: "#212c46",
                    padding: "18px 16px 12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid rgba(255,255,255,.06)",
                }}
            >
                <span style={{ fontWeight: 900, fontSize: 21, color: "#43c8ff" }}>
                    {t("matches.hubTitle", "Соответствия")}
                </span>

                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        onClick={() => setTab("orders")}
                        style={{
                            ...toolbarBtn,
                            background: tab === "orders" ? "#0f2037" : "transparent",
                        }}
                    >
                        {t("matches.tab.orders", "Грузы")}
                    </button>
                    <button
                        onClick={() => setTab("transport")}
                        style={{
                            ...toolbarBtn,
                            background: tab === "transport" ? "#0f2037" : "transparent",
                        }}
                    >
                        {t("matches.tab.transports", "Транспорт")}
                    </button>
                </div>
            </div>

            {/* вкладка Грузы */}
            {tab === "orders" ? (
                <>
                    <SectionHeader
                        title={t("matches.myOrdersTitle", "Мои заявки (грузы)")}
                        count={orders.length}
                    />
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            padding: "10px 12px 18px 12px",
                        }}
                    >
                        {(orders || []).map((order) => (
                            <div key={order.id || order.uid} style={{ position: "relative" }}>
                                <div
                                    style={{
                                        position: "absolute",
                                        top: 10,
                                        right: 10,
                                        zIndex: 2,
                                        background: "#0f2037",
                                        border: "1px solid rgba(67,200,255,.35)",
                                        borderRadius: 12,
                                        padding: "3px 8px",
                                        fontSize: 12,
                                        fontWeight: 900,
                                        color: "#d6f2ff",
                                    }}
                                >
                                    {order.matchesCount ?? 0}
                                </div>

                                <OrderCardMobile order={order} />

                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        gap: 8,
                                        marginTop: 6,
                                    }}
                                >
                                    <button
                                        style={toolbarBtn}
                                        onClick={() =>
                                            setScreen({ type: "order", id: order.id, order })
                                        }
                                    >
                                        {t("matches.show", "Показать Соответствия")}
                                    </button>
                                </div>
                            </div>
                        ))}

                        {!loading && (orders?.length || 0) === 0 && (
                            <div style={{ color: "#b3d5fa", padding: "12px 14px" }}>
                                {t("matches.noOrdersMine", "У вас пока нет заявок.")}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                // вкладка Транспорт
                <>
                    <SectionHeader
                        title={t("matches.myTransportTitle", "Мой транспорт")}
                        count={transports.length}
                    />
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            padding: "10px 12px 18px 12px",
                        }}
                    >
                        {(transports || []).map((tr) => (
                            <div key={tr.id || tr.uid} style={{ position: "relative" }}>
                                <div
                                    style={{
                                        position: "absolute",
                                        top: 10,
                                        right: 10,
                                        zIndex: 2,
                                        background: "#0f2037",
                                        border: "1px solid rgba(67,200,255,.35)",
                                        borderRadius: 12,
                                        padding: "3px 8px",
                                        fontSize: 12,
                                        fontWeight: 900,
                                        color: "#d6f2ff",
                                    }}
                                >
                                    {tr.matchesCount ?? 0}
                                </div>

                                <TransportCardMobile transport={tr} />

                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        gap: 8,
                                        marginTop: 6,
                                    }}
                                >
                                    <button
                                        style={toolbarBtn}
                                        onClick={() =>
                                            setScreen({
                                                type: "transport",
                                                id: tr.id || tr.uid,
                                                transport: tr,
                                            })
                                        }
                                    >
                                        {t("matches.show", "Показать Соответствия")}
                                    </button>
                                </div>
                            </div>
                        ))}

                        {!loading && (transports?.length || 0) === 0 && (
                            <div style={{ color: "#b3d5fa", padding: "12px 14px" }}>
                                {t("matches.noTransportsMine", "У вас пока нет транспорта.")}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
