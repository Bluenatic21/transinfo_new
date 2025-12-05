"use client";

import { ReactNode, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "framer-motion";

import { useIsMobile } from "../../hooks/useIsMobile";
import TransportSidebar from "../components/TransportSidebar";


export default function TransportLayout({ children }: { children: ReactNode }) {
    const isMobile = useIsMobile();

    // Хуки вызываем безусловно — чтобы не нарушать порядок хуков
    const pathname = usePathname();
    const prevDepthRef = useRef(0);

    const depth = (pathname || "").split("/").filter(Boolean).length;
    const direction = depth > prevDepthRef.current ? 1 : -1; // +1 — углубляемся (/transport -> /transport/[id])
    prevDepthRef.current = depth;

    // === МОБИЛКА: слайд-переходы между списком и деталкой ===
    if (isMobile) {
        return (
            <AnimatePresence initial={false} mode="wait">
                <motion.div
                    key={pathname}
                    // При переходе со списка в карточку — заезжаем справа,
                    // при возврате — уезжаем вправо. Раньше было наоборот,
                    // из-за чего на первом кадре экран «сползал» влево.
                    initial={{ x: direction > 0 ? "100%" : "-25%", opacity: 1 }}
                    animate={{ x: 0, opacity: 1, transition: { duration: 0.28 } }}
                    exit={{ x: direction > 0 ? "-25%" : "100%", opacity: 1, transition: { duration: 0.22 } }}
                    style={{ minHeight: "100vh", overflowX: "hidden", willChange: "transform" }}
                >
                    <main style={{ padding: 0 }}>{children}</main>
                </motion.div>
            </AnimatePresence>
        );
    }

    // === ДЕСКТОП: без изменений ===
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "row",
                minHeight: "100vh",
                width: "100vw",
            }}
        >
            <TransportSidebar />
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100vh",
                }}
            >
                {children}
            </div>
        </div>
    );
}
