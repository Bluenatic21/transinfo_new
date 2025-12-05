// app/orders/layout.js
"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useRouter } from "next/navigation";

import Sidebar from "../components/Sidebar";
import { useIsMobile } from "../../hooks/useIsMobile";
import Footer from "../components/Footer";

export default function OrdersLayout({ children }) {
    const isMobile = useIsMobile();

    // ХУКИ ДОЛЖНЫ БЫТЬ ВЫЗВАНЫ БЕЗУСЛОВНО (исправление ошибки порядка хуков)
    const pathname = usePathname();
    const prevDepthRef = useRef(0);
    const router = useRouter(); // ← добавили
    const controls = useDragControls();   // ← вынесено из условия, порядок хуков стабилен

    const depth = (pathname || "").split("/").filter(Boolean).length;
    const direction = depth > prevDepthRef.current ? 1 : -1; // +1 — углубляемся (/orders -> /orders/[id])
    prevDepthRef.current = depth;

    // === МОБИЛЬНАЯ ВЕРСИЯ: слайд-переходы между списком и детальной ===
    if (isMobile) {
        const isDetail = /(^|\/)orders\/[^\/]+(\/|$)/.test(pathname);

        const handleSwipeEnd = (_, info) => {
            const distance = info.offset.x;   // > 0 — свайп вправо
            const velocity = info.velocity.x;
            const passed = distance > 60 || velocity > 500;
            if (isDetail && passed) router.back();
        };

        return (
            <AnimatePresence initial={false} mode="sync">
                <motion.div
                    key={pathname}
                    // Направление анимации: глубже — заезжаем справа.
                    initial={{ x: 0, opacity: 1 }}
                    animate={{ x: 0, opacity: 1, transition: { duration: 0.28 } }}
                    exit={{ x: direction > 0 ? "-25%" : "100%", opacity: 1, transition: { duration: 0.22 } }}

                    // --- свайп «слева → вправо» только на детальной
                    drag={isDetail ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.06}
                    dragMomentum={false}
                    onDragEnd={handleSwipeEnd}
                    dragControls={controls}
                    dragListener={false}
                    onPointerDown={(e) => {
                        // начинаем жест, только если палец у левого края (28px)
                        if (isDetail && e.clientX <= 28) controls.start(e);
                    }}
                    style={{
                        minHeight: "100dvh",
                        overflowX: "hidden",
                        willChange: "transform",
                        touchAction: "pan-y" // вертикальная прокрутка остаётся
                    }}
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        );
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "row",
                minHeight: "100dvh",
                // ВАЖНО: <main> по умолчанию центрирует детей (align-items:center),
                // поэтому берём ширину вьюпорта, чтобы сайдбар был слева без «прилипания».
                width: "100vw",
                alignSelf: "stretch",
            }}
        >
            <Sidebar />
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100dvh",
                    minWidth: 0, // чтобы контент справа не расталкивал лейаут
                }}
            >
                {children}
            </div>
        </div>
    );
}
