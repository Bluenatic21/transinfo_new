// src/app/components/ThemeToggle.tsx
"use client";
import { useEffect, useState } from "react";
import { useTheme } from "../providers/ThemeProvider";
import { FiMoon, FiSun } from "react-icons/fi";

export default function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    const next = resolvedTheme === "dark" ? "light" : "dark";
    const Icon = resolvedTheme === "dark" ? FiSun : FiMoon;

    return (
        <button
            type="button"
            aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme(next)}
            className="header-icon-btn"
            style={{
                height: 40,
                width: 40,
                borderRadius: 12,
                background: "var(--control-bg)",
                color: "var(--text-primary)",
                border: `1px solid var(--border-subtle)`,
                boxShadow: "var(--shadow-soft)",
                transition: "background var(--transition-fast), color var(--transition-fast), border var(--transition-fast)",
            }}
        >
            <Icon />
        </button>
    );
}