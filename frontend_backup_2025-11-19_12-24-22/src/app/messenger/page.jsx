"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
// если у вас есть хук/контекст мессенджера:
import { useMessenger } from "@/app/components/MessengerContext"; // путь поправьте под ваш проект

export default function MessengerRoute() {
    const router = useRouter();
    let opened = false;

    try {
        const m = typeof useMessenger === "function" ? useMessenger() : null;
        if (m?.openOverlay) { m.openOverlay(true); opened = true; }
        else if (m?.setOverlayOpen) { m.setOverlayOpen(true); opened = true; }
        else if (m?.open) { m.open(true); opened = true; }
    } catch { /* ничего, пойдём в fallback */ }

    useEffect(() => {
        // если модалка не открылась через контекст — просто уйдём на /orders
        if (!opened) router.replace("/orders");
        // если открылась — можно оставить URL /messenger или заменить на /orders
        // router.replace("/orders");
    }, [opened, router]);

    // Ничего не рисуем, чтобы модалка перекрыла фон
    return null;
}
