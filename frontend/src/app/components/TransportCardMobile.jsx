"use client";

import React, { useState } from "react";
import ReactDOM from "react-dom";
import { useUser } from "@/app/UserContext";
import PaywallModal from "@/app/components/PaywallModal";
import TransportCompactCard from "@/app/components/TransportCompactCard";
import { useRouter } from "next/navigation";

export default function TransportCardMobile({ transport }) {
    const router = useRouter();
    const { user } = useUser() || {};
    const [open, setOpen] = useState(false);
    // ограниченный режим — как и у грузов: гость или неактивная подписка
    const isLimited = !user; // ограничиваем только гостей (авторизованным — полный доступ)

    const handleClick = () => {
        if (!transport?.id) return;
        if (isLimited) { setOpen(true); return; }
        router.push(`/transport/${transport.id}`);
    };
    return (
        <>
            <TransportCompactCard
                transport={transport}
                isMobile
                routeStacked
                /* без экшен-кнопок */
                managerContext={false}
                showOwnerBadge={false}
                onClick={handleClick}
                showTransportBadges
                hideActions
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
