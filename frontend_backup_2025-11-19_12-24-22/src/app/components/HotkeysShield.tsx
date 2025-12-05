"use client";

import React from "react";

type Props = {
    enabled?: boolean;
    selector?: string;
};

/**
 * Глушит глобальные хоткеи, если событие приходит из интерактивных полей.
 * Работает в capture-фазе: останавливает keydown/keypress/keyup.
 */
export default function HotkeysShield({
    enabled = true,
    selector = 'input, textarea, [contenteditable="true"], [role="searchbox"], [data-hotkeys-shield], .hotkeys-shield'
}: Props) {
    React.useEffect(() => {
        if (!enabled) return;

        const isInteractive = (el: EventTarget | null) => {
            const node = el as HTMLElement | null;
            if (!node) return false;
            if (node.matches?.(selector)) return true;
            return Boolean(node.closest?.(selector));
        };

        const stopIfInteractive = (e: KeyboardEvent) => {
            if (isInteractive(e.target)) {
                // Блокируем дальнейшие глобальные обработчики
                e.stopImmediatePropagation?.();
                e.stopPropagation();
            }
        };

        document.addEventListener("keydown", stopIfInteractive, true);
        document.addEventListener("keypress", stopIfInteractive, true);
        document.addEventListener("keyup", stopIfInteractive, true);

        return () => {
            document.removeEventListener("keydown", stopIfInteractive, true);
            document.removeEventListener("keypress", stopIfInteractive, true);
            document.removeEventListener("keyup", stopIfInteractive, true);
        };
    }, [enabled, selector]);

    return null;
}
