"use client";
import { useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Свайп-навигация влево/вправо (мобилка).
 * - Игнорирует вертикальные жесты и интерактивные элементы (кнопки/инпуты/карта).
 * - Навигирует на toLeft / toRight при достаточном горизонтальном смещении.
 */
export default function useSwipeNav({
    toLeft,         // маршрут при свайпе ВЛЕВО (dx < 0)
    toRight,        // маршрут при свайпе ВПРАВО (dx > 0)
    enabled = true,
    minDx = 60,     // порог по X
    maxDy = 40,     // допустимая «вертикальность» жеста
} = {}) {
    const start = useRef({ x: 0, y: 0, active: false });
    const router = useRouter();

    const shouldIgnore = (target) => {
        if (!target || !target.closest) return false;
        // не срабатываем на кликах по интерактиву и по карте
        return !!target.closest(
            '.no-swipe, [data-no-swipe="true"], button, a, input, select, textarea, [role="button"], ' +
            'canvas, .leaflet-container, .mapboxgl-map, .map'
        );
    };

    const onTouchStart = useCallback((e) => {
        if (!enabled) return;
        const t = e.touches && e.touches[0];
        if (!t || shouldIgnore(e.target)) return;
        start.current = { x: t.clientX, y: t.clientY, active: true };
    }, [enabled]);

    const onTouchEnd = useCallback((e) => {
        if (!enabled) return;
        const s = start.current;
        if (!s.active) return;
        s.active = false;
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - s.x;
        const dy = Math.abs(t.clientY - s.y);
        if (dy > maxDy) return;                 // вертикальный скролл — игнор
        if (Math.abs(dx) < minDx) return;       // слишком короткий жест
        if (dx < 0 && toLeft) router.push(toLeft);
        if (dx > 0 && toRight) router.push(toRight);
    }, [enabled, toLeft, toRight, maxDy, minDx, router]);

    // onTouchMove не обязателен, но оставим для совместимости со Spread-пропсами
    const onTouchMove = useCallback(() => { }, []);

    return { onTouchStart, onTouchEnd, onTouchMove };
}
