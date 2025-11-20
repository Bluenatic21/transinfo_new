"use client";

import { useEffect, useState } from "react";

/**
 * useIsMobile — SSR-safe:
 *  - Пока <html data-booting="1"> (первичная гидратация) всегда возвращает false
 *  - После снятия data-booting можно инициализировать реальным значением через matchMedia
 *  - В useEffect следим за resize / change и обновляем значение
 */
function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(() => {
        // На сервере window/document нет → всегда false
        if (typeof window === "undefined") return false;

        try {
            // Пока html[data-booting="1"] — идёт первичная гидратация.
            // Чтобы разметка сервера и первый рендер клиента совпали,
            // принудительно возвращаем false и НЕ смотрим matchMedia.
            const root = document.documentElement;
            if (root && root.getAttribute("data-booting") === "1") {
                return false;
            }
        } catch {
            return false;
        }

        if (!window.matchMedia) return false;

        try {
            return !!window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
        } catch {
            return false;
        }
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const update = () => setIsMobile(!!mql.matches);

        update(); // после маунта выставляем реальное значение
        if (mql.addEventListener) mql.addEventListener("change", update);
        else if (mql.addListener) mql.addListener(update);
        window.addEventListener("resize", update, { passive: true });

        // iOS visualViewport (адресная строка)
        const vv = window.visualViewport;
        vv && vv.addEventListener("resize", update, { passive: true });

        return () => {
            if (mql.removeEventListener) mql.removeEventListener("change", update);
            else if (mql.removeListener) mql.removeListener(update);
            window.removeEventListener("resize", update);
            vv && vv.removeEventListener("resize", update);
        };
    }, [breakpoint]);

    return isMobile;
}

export default useIsMobile;
export { useIsMobile };
