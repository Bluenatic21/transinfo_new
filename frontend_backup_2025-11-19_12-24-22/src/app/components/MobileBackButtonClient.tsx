"use client";

import React, { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLang } from "../i18n/LangProvider";

/**
 * Мобильная кнопка "Назад" + свайп-gesture от левого края.
 * Рендерится ТОЛЬКО на /messages/[id] и ТОЛЬКО на мобилке (lg скрыт).
 */
export default function MobileBackButtonClient() {
    const pathname = usePathname();
    const router = useRouter();
    const { t } = useLang();

    const isChat = /^\/messages\/[\w-]+\/?$/.test(pathname || "");

    // свайп-назад от левого края экрана
    const startX = useRef<number | null>(null);
    const startY = useRef<number | null>(null);
    const active = useRef(false);

    useEffect(() => {
        if (!isChat) return;

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            // Разрешаем жест только если стартуем у самого левого края (< 24px)
            if (t.clientX <= 24) {
                startX.current = t.clientX;
                startY.current = t.clientY;
                active.current = true;
            } else {
                active.current = false;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!active.current || startX.current == null || startY.current == null) return;
            const t = e.touches[0];
            const dx = t.clientX - startX.current;
            const dy = Math.abs(t.clientY - startY.current);
            // горизонтальный свайп вправо, почти без вертикали
            if (dx > 70 && dy < 50) {
                active.current = false;
                // назад, fallback -> /messages
                try {
                    // если есть история — вернёмся
                    router.back();
                } catch {
                    router.push("/messages");
                }
            }
        };

        const onTouchEnd = () => {
            startX.current = null;
            startY.current = null;
            active.current = false;
        };

        document.addEventListener("touchstart", onTouchStart, { passive: true });
        document.addEventListener("touchmove", onTouchMove, { passive: true });
        document.addEventListener("touchend", onTouchEnd, { passive: true });

        return () => {
            document.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
        };
    }, [isChat, router]);

    if (!isChat) return null;

    const goBack = () => {
        try {
            router.back();
        } catch {
            router.push("/messages");
        }
    };

    return (
        // Скрываем на десктопе, фиксируем в левом верхнем углу, учитывая safe-area
        <button
            type="button"
            onClick={goBack}
            aria-label={t("common.back", "Назад")}
            className="lg:hidden fixed z-[60] rounded-full shadow-md backdrop-blur
                 size-10 flex items-center justify-center
                 bg-[#0b1220cc] border border-white/10
                 hover:bg-[#0b1220e6] active:scale-95 transition"
            style={{
                top: "calc(env(safe-area-inset-top, 0px) + 8px)",
                left: 8,
            }}
        >
            {/* Лёгкая стрелка без зависимостей */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    );
}
