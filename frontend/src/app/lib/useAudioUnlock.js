// useAudioUnlock.js
"use client";
import { useEffect, useRef } from "react";

let _ctx = null;
export function getAudioContext() {
    if (typeof window === "undefined") return null;
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
}

export default function useAudioUnlock() {
    const triedRef = useRef(false);

    useEffect(() => {
        const ctx = getAudioContext();
        if (!ctx) return;

        function tryResume() {
            if (triedRef.current) return;
            triedRef.current = true;
            if (ctx.state === "suspended") ctx.resume().catch(() => { });
            // через 100ms отпускаем флаг — на случай, если пользователь кликал до загрузки
            setTimeout(() => (triedRef.current = false), 100);
        }

        const evs = ["pointerdown", "keydown"];
        evs.forEach(ev => window.addEventListener(ev, tryResume, { once: true }));
        return () => evs.forEach(ev => window.removeEventListener(ev, tryResume));
    }, []);
}
