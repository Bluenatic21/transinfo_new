
"use client";
import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLang } from "../i18n/LangProvider";

/**
 * Универсальный bottom-sheet для мобилок.
 * Закрывается свайпом вниз, по бэкдропу, по Esc и по кнопке "назад".
 */
export default function MobileBottomSheet({
    isOpen,
    onClose,
    children,
    initialVH = 92,          // высота листа в процентах от экрана
    useHistoryBack = true,   // интеграция с кнопкой "назад"
    onBack,                  // <- кнопка "назад" в шапке листа (опционально)
    onSwipeLeft,             // <- жест "свайп влево" (опционально)
    closeOnPullDown = true,  // <- можно ли закрывать вниз тягой (только для списка)
    closeOnBackdrop = true,  // <- можно ли закрывать тапом по фону (только для списка)
}) {
    const { t } = useLang();
    const sheetRef = useRef(null);
    const startYRef = useRef(0);
    const startXRef = useRef(0); // <-- FIX: объявляем X-координату для горизонтального свайпа
    const [dragY, setDragY] = useState(0);
    const [dragging, setDragging] = useState(false);
    const dirRef = useRef(null); // 'v' | 'h' | null

    // запрет скролла фона
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
        return () => { document.documentElement.style.overflow = prev; };
    }, [isOpen]);

    // Esc закрывает
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    // Back (история) закрывает
    useEffect(() => {
        if (!isOpen || !useHistoryBack) return;
        const state = { __sheet: true };
        history.pushState(state, "");
        const onPop = (e) => { onClose?.(); };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, [isOpen, onClose, useHistoryBack]);

    const onTouchStart = useCallback((e) => {
        setDragging(true);
        dirRef.current = null;
        if (!e.touches || e.touches.length === 0) return;
        startYRef.current = e.touches[0].clientY;
        startXRef.current = e.touches[0].clientX; // <-- используем объявленный ref
        setDragY(0);
    }, []);

    const onTouchMove = useCallback((e) => {
        if (!dragging) return;
        if (!e.touches || e.touches.length === 0) return;

        const dy = e.touches[0].clientY - startYRef.current;
        const dx = e.touches[0].clientX - startXRef.current; // <-- используем объявленный ref

        // Определяем направление при первом ощутимом движении
        if (!dirRef.current) {
            if (Math.abs(dx) > Math.abs(dy) + 10) dirRef.current = "h";
            else if (Math.abs(dy) > Math.abs(dx) + 10) dirRef.current = "v";
            else return;
        }

        if (dirRef.current === "h") {
            // Горизонтальный свайп: если уходим влево достаточно сильно — триггерим onSwipeLeft
            if (dx < -60 && typeof onSwipeLeft === "function") {
                dirRef.current = "locked";
                onSwipeLeft();
            }
            return;
        }

        // Вертикальный свайп вниз — тянем лист
        if (dirRef.current === "v") {
            setDragY(Math.max(0, dy));
        }
    }, [dragging, onSwipeLeft]);

    const onTouchEnd = useCallback(() => {
        if (!dragging) return;
        const shouldClose =
            closeOnPullDown && dirRef.current === "v" && dragY > 60; // порог закрытия вниз
        setDragging(false);
        setDragY(0);
        dirRef.current = null;
        if (shouldClose) onClose?.();
    }, [dragY, dragging, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] pointer-events-auto">
            {/* backdrop */}
            <div
                className="fixed inset-0 bg-black/50 transition-opacity"
                onClick={closeOnBackdrop ? onClose : undefined}
                aria-label={t("bottomSheet.close", "Закрыть чат")}
            />

            {/* sheet */}
            <div
                ref={sheetRef}
                className="fixed inset-x-0 bottom-0 rounded-t-2xl shadow-2xl flex flex-col"
                style={{
                    background: "var(--mobile-sheet-bg, var(--bg-card))",
                    color: "var(--mobile-sheet-fg, var(--text-primary))",
                    height: `min(${initialVH}vh, 100dvh)`,
                    transform: dragging ? `translateY(${dragY}px)` : "translateY(0)",
                    transition: dragging ? "none" : "transform 220ms ease",
                    paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {/* Header: handle + close */}
                <div className="relative py-3">
                    <div
                        className="mx-auto h-1.5 w-10 rounded-full"
                        style={{ background: "var(--mobile-sheet-handle, rgba(255,255,255,0.25))" }}
                    />
                    <button
                        onClick={onClose}
                        className="absolute right-2 top-1.5 px-3 py-2 text-xl leading-none transition-opacity opacity-80 hover:opacity-100"
                        style={{ color: "var(--mobile-sheet-close, var(--text-secondary))" }}
                        aria-label={t("bottomSheet.close", "Закрыть чат")}
                    >
                        ×
                    </button>
                </div>

                {/* content */}
                <div className="flex-1 min-h-0 overflow-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}
