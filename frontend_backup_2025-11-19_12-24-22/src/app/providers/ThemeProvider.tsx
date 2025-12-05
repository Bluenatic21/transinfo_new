"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light" | "system";
type Ctx = { theme: Theme; setTheme: (t: Theme) => void };
const ThemeCtx = createContext<Ctx>({ theme: "dark", setTheme: () => { } });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // HARD LOCK: держим только dark
    const [theme, setTheme] = useState<Theme>("dark");

    // На монтировании сразу фиксируем атрибуты/локалсторадж
    useEffect(() => {
        try {
            const root = document.documentElement;
            root.setAttribute("data-theme", "dark");
            root.classList.add("dark");
            localStorage.setItem("theme", "dark");
        } catch {}
    }, []);

    // Применяем атрибут и сохраняем выбор
    useEffect(() => {
        if (typeof document === "undefined") return;
        const root = document.documentElement;
        root.setAttribute("data-theme", "dark");
        root.classList.add("dark");
        try { localStorage.setItem("theme", "dark"); } catch {}
    }, [theme]);

    // Любые вызовы setTheme(...) игнорируются — держим dark
    const value = useMemo<Ctx>(
        () => ({ theme: "dark", setTheme: () => setTheme("dark") }),
        []
    );
    return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
