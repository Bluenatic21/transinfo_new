"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "../UserContext";
import { api } from "@/config/env";
import { motion } from "framer-motion";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";
import { FiMaximize2 } from "react-icons/fi";
import ModalPortal from "./ModalPortal";

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
    const [mapModalOpen, setMapModalOpen] = useState(false);
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

    const legendClasses = isLight
        ? "bg-white/90 border border-slate-200 text-slate-700 shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
        : "bg-[#0b1528]/85 border border-white/8 text-slate-100 shadow-[0_6px_20px_rgba(0,0,0,0.35)]";
    const modalSurface = isLight
        ? "bg-gradient-to-b from-white to-slate-50"
        : "bg-gradient-to-b from-[#0b1422] to-[#0b1528]";
    const modalHeader = isLight
        ? "border-slate-200 bg-white/80"
        : "border-white/10 bg-white/5";

    return (
        <section
            aria-label={t("home.map.aria", "Карта предложений")}
            className="relative py-4 md:py-6"
            style={{ color: "var(--text-primary)" }}
        >
            <div className="w-full px-4 sm:px-5 md:px-6 flex justify-start">
                {/* Общая карта: Грузы + Транспорт */}
                <div
                    className={`w-full rounded-2xl overflow-hidden backdrop-blur-xl transition-colors duration-200 ${isLight
                        ? "bg-white border border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
                        : "bg-[#0b1528]/60 border border-white/8 shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
                        }`}
                >
                    <div className="px-4 md:px-5 pt-6 md:pt-7 pb-6 md:pb-7">
                        <div className="relative px-1 sm:px-2 md:px-3">
                            <div className="flex items-center justify-between gap-3 mb-3 md:mb-4">
                                <button
                                    type="button"
                                    onClick={() => setMapModalOpen(true)}
                                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition shadow-sm ${isLight
                                        ? "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                                        : "bg-white/10 text-slate-100 border border-white/10 hover:bg-white/15"}`}
                                    aria-label={t("home.map.openFull", "Открыть карту целиком")}
                                    disabled={!Array.isArray(orders) || !Array.isArray(transports)}
                                >
                                    <FiMaximize2 className="shrink-0" />
                                    {t("home.map.fullscreen", "Развернуть карту")}
                                </button>
                                <div
                                    className={`${legendClasses} flex items-center gap-4 rounded-xl px-3 py-2 text-sm leading-5 backdrop-blur`}
                                    style={{ pointerEvents: "auto" }}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: "#53b7ff" }} />
                                        {t("map.legend.transport", "Транспорт")}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: "#ffb020" }} />
                                        {t("map.legend.cargo", "Груз")}
                                    </div>
                                </div>
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

            <ModalPortal
                open={mapModalOpen}
                onClose={() => setMapModalOpen(false)}
                variant="fullscreen"
                tone={isLight ? "light" : "dark"}
                overlayClassName={isLight ? "bg-[rgba(10,17,28,0.45)]" : ""}
                panelClassName="p-0"
            >
                <div className={`flex h-full w-full flex-col ${modalSurface}`}>
                    <div className={`flex items-center gap-3 px-4 py-3 border-b ${modalHeader}`}>
                        <div className="flex flex-col">
                            <span className="text-base font-semibold leading-tight">{t("home.map.fullscreenTitle", "Карта предложений")}</span>
                            <span className="text-sm opacity-75">{t("home.map.fullscreenHint", "Используйте карту на весь экран")}</span>
                        </div>
                        <div className="ml-auto flex items-center gap-2 text-sm text-slate-500 dark:text-slate-200">
                            <div
                                className={`${legendClasses} flex items-center gap-4 rounded-xl px-3 py-2 text-sm leading-5 backdrop-blur`}
                                style={{ pointerEvents: "auto" }}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: "#53b7ff" }} />
                                    {t("map.legend.transport", "Транспорт")}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: "#ffb020" }} />
                                    {t("map.legend.cargo", "Груз")}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMapModalOpen(false)}
                                className={`rounded-xl px-3 py-2 font-semibold transition ${isLight
                                    ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                                    : "bg-white/10 text-white hover:bg-white/15"}`}
                            >
                                {t("common.close", "Закрыть")}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0">
                        {Array.isArray(orders) && Array.isArray(transports) ? (
                            <SimpleMap
                                orders={orders}
                                transports={transports}
                                hideSearch
                                fitAll
                                mixed
                                showLegend
                                fullHeight
                                onPinClick={({ id, item }) => {
                                    const kind = item?.__kind === "transport" ? "transport" : "order";
                                    if (kind === "transport") {
                                        router.push(`/transport?focus=${id}`);
                                    } else {
                                        router.push(`/orders?focus=${id}`);
                                    }
                                }}
                            />
                        ) : (
                            <div className="h-full flex items-center justify-center px-4">
                                <CardSkeleton />
                            </div>
                        )}
                    </div>
                </div>
            </ModalPortal>
        </section>
    );
}