"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../UserContext";
import { api } from "@/config/env";
import { motion } from "framer-motion";
import { FiTruck, FiPackage } from "react-icons/fi";
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
            <div className="mx-auto max-w-4xl px-4 sm:px-5 md:px-6">
                {/* Общая карта: Грузы + Транспорт */}
                <div
                    className={`rounded-2xl overflow-hidden backdrop-blur-xl transition-colors duration-200 ${isLight
                        ? "bg-white border border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
                        : "bg-[#0b1528]/60 border border-white/8 shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
                        }`}
                >
                    <div className="px-4 md:px-5 pt-14 md:pt-16 pb-6 md:pb-7">
                        <div className="relative px-1 sm:px-2 md:px-3">
                            <div className="absolute -top-12 md:-top-14 left-4 md:left-5 flex items-center gap-3 md:gap-4">
                                <button
                                    type="button"
                                    onClick={() => router.push("/orders")}
                                    className={`${isLight
                                        ? "bg-white text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.12)] border border-slate-200"
                                        : "bg-[#0f1930] text-white border border-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.35)]"
                                        } rounded-full px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-semibold hover:translate-y-[-2px] transition-transform duration-200`}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <FiPackage className="text-lg" />
                                        {t("home.map.findCargo", "Найти груз")}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => router.push("/transport")}
                                    className={`${isLight
                                        ? "bg-white text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.12)] border border-slate-200"
                                        : "bg-[#0f1930] text-white border border-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.35)]"
                                        } rounded-full px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-semibold hover:translate-y-[-2px] transition-transform duration-200`}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <FiTruck className="text-lg" />
                                        {t("home.map.findTransport", "Найти транспорт")}
                                    </span>
                                </button>
                            </div>

                            <div
                                className={`rounded-xl overflow-hidden border h-[224px] md:h-[252px] ${isLight
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
            </div>
        </section>
    );
}