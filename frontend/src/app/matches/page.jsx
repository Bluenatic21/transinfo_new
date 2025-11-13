// src/app/matches/page.jsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "../../hooks/useIsMobile";
import dynamic from "next/dynamic";

/**
 * На мобильном рендерим центр Соответствий,
 * на десктопе — мягкий редирект в /orders или /transport (как было).
 */
const MobileMatches = dynamic(() => import("./MobileMatches"), { ssr: false });

export default function MatchesRoute() {
    const router = useRouter();
    const isMobile = useIsMobile();

    useEffect(() => {
        if (!isMobile) {
            let last = "cargo";
            try {
                const v = localStorage.getItem("ordersTab");
                if (v === "transport") last = "transport";
            } catch { }
            router.replace(last === "transport" ? "/transport" : "/orders");
        }
    }, [isMobile, router]);

    if (!isMobile) return null;
    return <MobileMatches />;
}
