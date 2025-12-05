"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../UserContext";
import { api } from "@/config/env";
import { motion } from "framer-motion";
import { FiTruck, FiPackage, FiArrowRight } from "react-icons/fi";
import { useLang } from "../i18n/LangProvider";

const SimpleMap = dynamic(() => import("./SimpleMap"), { ssr: false });

function CardSkeleton() {
    return (
        <motion.div
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: "reverse" }}
            className="rounded-2xl bg-[#0b1528]/60 border border-white/8 backdrop-blur-xl shadow-[0_6px_24px_rgba(0,0,0,0.35)] h-[340px] md:h-[380px]"
        />
    );
}

export default function HomeMapsSection() {
    const { t } = useLang();
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
        <section aria-label={t("home.map.aria", "Карта предложений")} className="relative py-4 md:py-6">
            <div className="mx-auto max-w-7xl px-6">
                {/* Общая карта: Грузы + Транспорт */}
                <div className="rounded-2xl bg-[#0b1528]/60 border border-white/8 backdrop-blur-xl shadow-[0_6px_24px_rgba(0,0,0,0.35)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 md:px-5 pt-3">
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#1a2a47] border border-white/10">
                                <FiTruck className="text-[#53b7ff]" />
                            </div>
                            <div className="text-[15px] md:text-[16px] font-semibold text-[#e6eefc]">
                                {t("home.map.header", "Грузы + Транспорт (общая карта)")}
                            </div>
                            {Array.isArray(orders) && Array.isArray(transports) && (
                                <span className="ml-2 text-[12.5px] text-[#9fb0d5]">≈ {orders.length + transports.length}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.push("/transport")}
                                className="group inline-flex items-center gap-1.5 text-[12.5px] md:text-[13px] text-[#9fb0d5] hover:text-white transition-colors"
                            >
                                {t("nav.transport", "Транспорт")}
                                <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
                            </button>
                            <button
                                onClick={() => router.push("/orders")}
                                className="group inline-flex items-center gap-1.5 text-[12.5px] md:text-[13px] text-[#9fb0d5] hover:text-white transition-colors"
                            >
                                {t("saved.cargo.title", "Грузы")}
                                <FiArrowRight className="transition-transform group-hover:translate-x-0.5" />
                            </button>
                        </div>
                    </div>
                    <div className="px-4 md:px-5 pb-4 md:pb-5">
                        <div className="rounded-xl overflow-hidden border border-white/8 h-[320px] md:h-[360px] bg-[#0a1426]">
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
