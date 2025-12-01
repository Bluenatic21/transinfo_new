"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light" | "system";
type Ctx = { theme: Theme; resolvedTheme: "dark" | "light"; setTheme: (t: Theme) => void };

const ThemeCtx = createContext<Ctx>({
    theme: "light",
    resolvedTheme: "light",
    setTheme: () => { },
});

function applyTheme(mode: "dark" | "light") {
    const root = document.documentElement;
    const body = document.body;
    root.setAttribute("data-theme", mode);
    body?.setAttribute("data-theme", mode);
    root.classList.toggle("dark", mode === "dark");
    root.style.colorScheme = mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("light");
    const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("light");

    useEffect(() => {
        const prefersDark = () =>
            typeof window !== "undefined" &&
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;

        const stored = (() => {
            try {
                return (localStorage.getItem("theme") as Theme | null) ?? null;
            } catch {
                return null;
            }
        })();

        const initial = stored ?? "light";
        setTheme(initial);
    }, []);

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handle = () => {
            const mode = theme === "system" ? (media.matches ? "dark" : "light") : theme;
            setResolvedTheme(mode);
            applyTheme(mode);
        };

        handle();
        media.addEventListener("change", handle);
        try { localStorage.setItem("theme", theme); } catch { }

        return () => media.removeEventListener("change", handle);
    }, [theme]);

    const value = useMemo<Ctx>(
        () => ({ theme, resolvedTheme, setTheme }),
        [theme, resolvedTheme]
    );

    return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
