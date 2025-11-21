"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../UserContext";
import { api } from "@/config/env";
import { motion } from "framer-motion";
import { FiTruck, FiPackage, FiArrowRight } from "react-icons/fi";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";

const SimpleMap = dynamic(() => import("./SimpleMap"), { ssr: false });

function CardSkeleton() {
    return (
        <motion.div
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: "reverse" }}
            className="rounded-2xl border backdrop-blur-xl shadow-[0_6px_24px_rgba(0,0,0,0.35)] h-[340px] md:h-[380px] bg-white/80 border-slate-200 dark:bg-[#0b1528]/60 dark:border-white/8"
        />
    );
}

export default function HomeMapsSection() {
    const { t } = useLang();
    const { resolvedTheme } = useTheme();
    const isLight = resolvedTheme === "light";
    const { authFetchWithRefresh } = useUser();
    const [orders, setOrders] = useState(null);
    const [transports, setTransports] = useState(null);
    const abortRef = useRef(null);
    const router = useRouter();

    useEffect(() => {
        const controller = new AbortController();
        abortRef.current = controller;

        async function load() {
            try {
                const norm = (data) =>
                    Array.isArray(data) ? data :
                        (Array.isArray(data?.items) ? data.items : []);

                const hasCoords = (it) => {
                    if (Array.isArray(it?.from_locations_coords) && it.from_locations_coords[0]?.lat != null && it.from_locations_coords[0]?.lng != null) return true;
                    if (it?.from_location_coords?.lat != null && it?.from_location_coords?.lng != null) return true;
                    if (it?.from_location_lat != null && it?.from_location_lng != null) return true;
                    return false;
                };

                const fetchArrayWithHardFallback = async (authUrl, pubUrl) => {
                    // 1) пробуем авторизованный
                    let primary;
                    try {
                        const r = await authFetchWithRefresh(authUrl, { signal: controller.signal, cache: "no-store" });
                        if (r.status === 401 || r.status === 403) throw new Error("UNAUTH");
                        primary = r.ok ? await r.json() : null;
                    } catch {
                        primary = null;
                    }
                    let arr = norm(primary);
                    // 2) если не массив/пусто/нет координат — берём публичный
                    if (!Array.isArray(arr) || arr.length === 0 || arr.filter(hasCoords).length === 0) {
                        try {
                            const r2 = await fetch(pubUrl, { signal: controller.signal, cache: "no-store" });
                            const j2 = r2.ok ? await r2.json() : [];
                            arr = norm(j2);
                        } catch {
                            arr = [];
                        }
                    }
                    return arr.filter(hasCoords).slice(0, 120);
                };

                const [ordersArr, transportsArr] = await Promise.all([
                    fetchArrayWithHardFallback(api("/orders?page=1&page_size=120"), api("/public/orders_map?limit=120")),
                    fetchArrayWithHardFallback(api("/transports?page=1&page_size=120"), api("/public/transports_map?limit=120")),
                ]);

                // Диагностика в консоль — поможет сразу увидеть счётчики
                console.log("[HomeMapsSection] loaded:", {
                    orders_total: ordersArr.length,
                    transports_total: transportsArr.length,
                });

                setOrders(ordersArr);
                setTransports(transportsArr);
            } catch (e) {
                const aborted = e?.name === "AbortError" || (typeof e === "string" && (e === "component-unmount" || e === "fetch-replaced"));
                if (!aborted) console.warn("[HomeMapsSection] load error:", e);
            }
        }
        load();

        return () => {
            try { controller.abort("component-unmount"); } catch { }
        };
    }, [authFetchWithRefresh]);

    return (
        <section
            aria-label={t("home.map.aria", "Карта предложений")}
            className="relative py-4 md:py-6"
            style={{ color: "var(--text-primary)" }}
        >
            <div className="mx-auto max-w-7xl px-6">
                {/* Общая карта: Грузы + Транспорт */}
                <div
                    className={`rounded-2xl overflow-hidden backdrop-blur-xl transition-colors duration-200 ${isLight
                        ? "bg-white border border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
                        : "bg-[#0b1528]/60 border border-white/8 shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
                        }`}
                >
                    <div className="flex items-center justify-between px-4 md:px-5 pt-3">
                        <div className="flex items-center gap-2">
                            <div
                                className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border ${isLight ? "bg-slate-100 border-slate-200" : "bg-[#1a2a47] border-white/10"
                                    }`}
                            >
                                <FiTruck className={isLight ? "text-sky-500" : "text-[#53b7ff]"} />
                            </div>
                            <div
                                className={`text-[15px] md:text-[16px] font-semibold ${isLight ? "text-slate-800" : "text-[#e6eefc]"
                                    }`}
                            >
                                {t("home.map.header", "Грузы + Транспорт (общая карта)")}
                            </div>
                            {Array.isArray(orders) && Array.isArray(transports) && (
                                <span
                                    className={`ml-2 text-[12.5px] ${isLight ? "text-slate-600" : "text-[#9fb0d5]"}`}
                                >
                                    ≈ {orders.length + transports.length}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.push("/transport")}
                                className={`group inline-flex items-center gap-1.5 text-[12.5px] md:text-[13px] transition-colors ${isLight
                                    ? "text-slate-600 hover:text-slate-900"
                                    : "text-[#9fb0d5] hover:text-white"
                                    }`}
                            >
                                {t("nav.transport", "Транспорт")}
                                <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
                            </button>
                            <button
                                onClick={() => router.push("/orders")}
                                className={`group inline-flex items-center gap-1.5 text-[12.5px] md:text-[13px] transition-colors ${isLight
                                    ? "text-slate-600 hover:text-slate-900"
                                    : "text-[#9fb0d5] hover:text-white"
                                    }`}
                            >
                                {t("saved.cargo.title", "Грузы")}
                                <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
                            </button>
                        </div>
                    </div>
                    <div className="px-4 md:px-5 pb-4 md:pb-5">
                        <div
                            className={`rounded-xl overflow-hidden border h-[320px] md:h-[360px] ${isLight
                                ? "bg-white border-slate-200 shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
                                : "bg-[#0a1426] border-white/8"
                                }`}
                        >
                            {Array.isArray(orders) && Array.isArray(transports) ? (
                                <SimpleMap
                                    orders={orders}
                                    transports={transports}
                                    hideSearch
                                    fitAll
                                    mixed
                                    showLegend
                                    onPinClick={({ id, item }) => {
                                        // item.__kind: "order" | "transport" (передаётся из SimpleMap)
                                        const kind = item?.__kind === "transport" ? "transport" : "order";
                                        if (kind === "transport") {
                                            router.push(`/transport?focus=${id}`);
                                        } else {
                                            router.push(`/orders?focus=${id}`);
                                        }
                                    }}
                                />
                            ) : (
                                <CardSkeleton />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
