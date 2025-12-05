// src/app/components/ThemeToggle.tsx
"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
    // HARD LOCK: всегда тёмная
    const [theme] = useState<'dark' | 'light'>("dark");

    useEffect(() => {
        try {
            const root = document.documentElement;
            root.setAttribute("data-theme", "dark");
            root.classList.add("dark"); // для Tailwind 'dark:' классов
            localStorage.setItem("theme", "dark");
        } catch {}
    }, []);
    // TEMP: прячем кнопку переключения темы целиком
    return null;
}
