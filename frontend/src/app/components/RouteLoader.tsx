"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function RouteLoader() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [show, setShow] = useState(false);

    useEffect(() => {
        // Показать на короткое время при любом переходе
        setShow(true);
        const t = setTimeout(() => setShow(false), 450);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, searchParams?.toString()]);

    if (!show) return null;

    return (
        <div className="route-loader-overlay">
            <div className="route-loader" />
        </div>
    );
}
