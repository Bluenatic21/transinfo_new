"use client";
import React, { useEffect, useRef, useState } from "react";
import { useUser } from "@/app/UserContext";
import { useLang } from "@/app/i18n/LangProvider";
import { api, ws } from "@/config/env";

export default function LiveTrackControls({
    orderId = null,
    transportId = null,
    defaultVisibility = "private", // или "link"
}) {
    const { user, authFetchWithRefresh } = useUser();
    const { t } = useLang();
    const [session, setSession] = useState(null);
    const [publishing, setPublishing] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
    const geoWatchIdRef = useRef(null);
    const pubWsRef = useRef(null);

    const canCreate = !!user;

    const startSession = async () => {
        if (!canCreate) return alert(t("live.loginToStart", "Войдите, чтобы включить мониторинг"));
        const body = { order_id: orderId, transport_id: transportId, visibility: defaultVisibility };
        const res = await authFetchWithRefresh(api(`/track/sessions`), {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) return alert(t("live.cantCreate", "Не удалось создать сессию") + ": " + (await res.text()));
        const data = await res.json();
        setSession(data);
        if (data.share_token) {
            const url = `${window.location.origin}/track/link/${data.share_token}`;
            setShareUrl(url);
        }
    };

    const stopSession = async () => {
        if (!session) return;
        await authFetchWithRefresh(api(`/track/sessions/${session.id}/end`), { method: "POST" });
        setSession(null);
        stopPublishing();
    };

    const startPublishing = async () => {
        if (!session) return alert(t("live.createFirst", "Сначала создайте сессию"));
        if (!navigator.geolocation) return alert(t("live.geolocationNotSupported", "Геолокация не поддерживается"));
        const token = localStorage.getItem("token");
        const params = new URLSearchParams({ session_id: session.id, token: token || "" });
        const ws = new WebSocket(ws(`/ws/track/publish?${params.toString()}`));
        pubWsRef.current = ws;

        ws.onopen = () => {
            geoWatchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    const { latitude, longitude, accuracy, heading, speed } = pos.coords;
                    const payload = { type: "point", lat: latitude, lng: longitude, accuracy, heading, speed, ts: new Date().toISOString() };
                    try { ws.send(JSON.stringify(payload)); } catch { }
                },
                (err) => console.warn("[LiveTrack] geolocation err", err),
                { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
            );
            setPublishing(true);
        };
        ws.onclose = stopPublishing;
        ws.onerror = stopPublishing;
    };

    const stopPublishing = () => {
        if (geoWatchIdRef.current !== null) {
            try { navigator.geolocation.clearWatch(geoWatchIdRef.current); } catch { }
            geoWatchIdRef.current = null;
        }
        if (pubWsRef.current) { try { pubWsRef.current.close(); } catch { }; pubWsRef.current = null; }
        setPublishing(false);
    };

    return (
        <div className="rounded-2xl shadow p-3" style={{ background: "#0B1622", border: "1px solid rgba(255,255,255,.06)" }}>
            <div className="text-sm opacity-80 mb-2">{t("live.title", "GPS мониторинг")}</div>
            {!session ? (
                <button onClick={startSession} className="px-3 py-2 rounded-xl" style={{ background: "#1f2a37" }}>
                    {t("live.create", "Создать сессию")}
                </button>
            ) : (
                <div className="flex flex-wrap items-center gap-8">
                    <div className="text-xs opacity-70">{t("live.session", "Сессия")}: {String(session.id).slice(0, 8)}…</div>
                    {!publishing ? (
                        <button onClick={startPublishing} className="px-3 py-2 rounded-xl" style={{ background: "#163e2b" }}>
                            {t("live.publishFromThisDevice", "Публиковать с этого устройства")}
                        </button>
                    ) : (
                        <button onClick={stopPublishing} className="px-3 py-2 rounded-xl" style={{ background: "#412225" }}>
                            {t("live.stopPublishing", "Остановить публикацию")}
                        </button>
                    )}
                    <button onClick={stopSession} className="px-3 py-2 rounded-xl" style={{ background: "#382525" }}>
                        {t("live.endSession", "Завершить сессию")}
                    </button>
                    {session.share_token && (
                        <button onClick={() => navigator.clipboard.writeText(shareUrl)} className="px-3 py-2 rounded-xl" style={{ background: "#1f2a37" }}>
                            {t("live.copyObserverLink", "Скопировать ссылку наблюдателя")}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
