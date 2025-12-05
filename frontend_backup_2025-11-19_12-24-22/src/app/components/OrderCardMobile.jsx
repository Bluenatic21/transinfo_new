"use client";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { useRouter } from "next/navigation";
import CargoCompactCard from "@/app/components/CargoCompactCard";
import { useUser } from "@/app/UserContext";
import PaywallModal from "./PaywallModal";

export default function OrderCardMobile({ order }) {
    const router = useRouter();
    const { user } = useUser() || {};
    const [open, setOpen] = useState(false);
    const isLimited = !user; // ограничиваем только гостей (авторизованным — полный доступ)

    const handleClick = () => {
        if (!order?.id) return;
        if (isLimited) { setOpen(true); return; }
        router.push(`/orders/${order.id}`);
    };

    return (
        <>
            <CargoCompactCard
                cargo={order}
                isMobile
                onClick={handleClick}
                managerContext={false}
                showOwnerBadge={false}
                routeStacked
                showOrderBadges
                limited={isLimited}
            />
            {/* РЕНДЕР ЧЕРЕЗ ПОРТАЛ → всегда по центру экрана */}
            {open && ReactDOM.createPortal(
                <PaywallModal open={open} onClose={() => setOpen(false)} anonymous={!user} />,
                document.body
            )}
        </>
    );
}