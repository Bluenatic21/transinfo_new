"use client";

import dynamic from "next/dynamic";

// Динамически грузим сам тост БЕЗ SSR, но в КЛИЕНТ-КОМПОНЕНТЕ
const GpsRequestToast = dynamic(() => import("./GpsRequestToast"), { ssr: false });

export default function GpsRequestToastClient() {
    return <GpsRequestToast />;
}
