"use client";
import dynamic from "next/dynamic";
import { useEffect, useState, use as usePromise } from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";
import { WORLD_BOUNDS } from "@/app/constants/mapBounds";

// ВАЖНО: импортируем компоненты карты только на клиенте
const MapContainer = dynamic(
    () => import("react-leaflet").then(m => m.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import("react-leaflet").then(m => m.TileLayer),
    { ssr: false }
);

// Берём ваш слой
const LiveTrackLayer = dynamic(() => import("@/app/components/LiveTrackLayer"), { ssr: false });

export default function PublicTrackPage({ params }) {
    const { t } = useLang();
    // params теперь Promise — распаковываем через React.use()
    const { token } = usePromise(params);
    const [resolved, setResolved] = useState(null);
    const [err, setErr] = useState("");
    const [topOffset, setTopOffset] = useState(64); // высота шапки по умолчанию

    useEffect(() => {
        // определим реальную высоту верхней навигации
        const nav = document.querySelector("nav, header, .topbar");
        if (nav && nav.getBoundingClientRect) {
            setTopOffset(Math.max(48, Math.min(96, Math.round(nav.getBoundingClientRect().height))));
        }
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(api(`/track/share_link/${token}`));
                if (!r.ok) throw new Error(t("track.invalid", "Ссылка недействительна или истекла"));
                const data = await r.json(); // { session_id, share }
                setResolved(data);
            } catch (e) { setErr(e.message || t("common.error", "Ошибка")); }
        })();
    }, [token]);

    if (err) return <div className="p-6 text-sm">{err}</div>;
    if (!resolved) return <div className="p-6 text-sm">{t("common.loading", "Загрузка…")}</div>;

    // Фуллскрин-контейнер под шапкой
    const holderStyle = {
        position: "fixed",
        top: topOffset,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1, // ниже шапки
        background: "#0B1622",
        minHeight: "360px",   // карта не станет слишком низкой
    };

    return (
        <>
            {/* заголовок остаётся в шапке сайта — карту поднимаем ниже */}
            <div style={{ position: "fixed", top: Math.max(8, topOffset - 40), left: 16, zIndex: 2, color: "#fff", fontWeight: 700 }}>
                {t("track.liveTitle", "LIVE-трек транспорта")}
            </div>

            <div style={holderStyle}>
                <MapContainer
                    center={[54, 39]}
                    zoom={5}
                    style={{ width: "100%", height: "100%" }}
                    preferCanvas
                    maxBounds={WORLD_BOUNDS}
                    maxBoundsViscosity={1}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        bounds={WORLD_BOUNDS}
                        noWrap
                    />
                    <LiveTrackLayer sessionId={resolved.session_id} shareToken={resolved.share} />
                </MapContainer>
            </div>
        </>
    );
}
