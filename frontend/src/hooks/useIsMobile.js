"use client";

import { useEffect, useState } from "react";

/**
 * useIsMobile — SSR-safe:
 *  - На сервере и на первом клиентском кадре всегда возвращает false
 *  - В useEffect выставляет реальное значение (matchMedia)
 *  - Следит за resize + change
 */
function useIsMobile(breakpoint = 768) {
    // Пытаемся определить состояние сразу на клиенте, чтобы не было мигания
    const initial =
        typeof window !== "undefined"
            ? !!window.matchMedia(`(max-width: ${breakpoint}px)`).matches
            : false;

    const [isMobile, setIsMobile] = useState(initial);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const update = () => setIsMobile(!!mql.matches);

        update(); // установить реальное значение после маунта
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
