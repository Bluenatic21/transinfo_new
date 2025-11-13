"use client";

import { useEffect } from "react";

export default function BootHydrator() {
    useEffect(() => {
        const html = document.documentElement;
        const loader = document.getElementById("boot-loader");

        // убираем признак предгидрационного состояния
        html.removeAttribute("data-booting");
        // плавно прячем лоадер (см. ваш CSS для .boot-hide)
        loader?.classList.add("boot-hide");

        const t = setTimeout(() => loader?.remove(), 400);
        return () => clearTimeout(t);
    }, []);

    return null;
}
