"use client";
import React from "react";

/**
 * GuestMask — полупрозрачная «шторка» для скрытия контента от гостей.
 * - enabled: boolean — вкл/выкл маску
 * - onRequestAuth: () => void — вызывается при клике (показать модалку)
 */
export default function GuestMask({ enabled, onRequestAuth, children }) {
    if (!enabled) return <>{children}</>;

    const onClick = (e) => {
        e.stopPropagation();
        onRequestAuth?.();
    };

    return (
        <div className="relative" onClick={onClick}>
            <div className="pointer-events-none select-none opacity-60 blur-sm">
                {children}
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
                <button
                    className="rounded-xl px-3 py-2 text-sm font-semibold bg-sky-600 text-white shadow"
                    onClick={onClick}
                >
                    Войдите или зарегистрируйтесь
                </button>
            </div>
        </div>
    );
}
