"use client";
import React, { useEffect, useRef, useState } from "react";
import { Polyline, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { ws } from "@/config/env";

// --- Профессиональный «живой» пин (пульс + стрелка курса)
const ensurePinCss = () => {
    if (typeof document === "undefined") return;
    if (document.getElementById("live-pin-css")) return;
    const style = document.createElement("style");
    style.id = "live-pin-css";
    style.textContent = `
    .pin-wrap{position:relative;width:26px;height:26px;}
    .pin-core{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;
      background:#00e0ff;box-shadow:0 0 0 2px #fff}
    .pin-pulse{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;
      background:rgba(0,224,255,.25);animation:pinPulse 1.8s ease-out infinite}
    @keyframes pinPulse{
      0%{transform:translate(-50%,-50%) scale(.9);opacity:.9}
      70%{transform:translate(-50%,-50%) scale(1.9);opacity:.2}
      100%{transform:translate(-50%,-50%) scale(2.4);opacity:0}
    }
    .pin-heading{position:absolute;left:50%;top:50%;width:0;height:0;
      border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid #00e0ff;
      transform-origin:50% -6px;filter:drop-shadow(0 0 4px rgba(0,0,0,.35))}
  `;
    document.head.appendChild(style);
};
if (typeof window !== "undefined") ensurePinCss();

const makeLivePin = (heading = 0) =>
    L.divIcon({
        className: "live-pin",
        html: `
      <div class="pin-wrap">
        <div class="pin-pulse"></div>
        <div class="pin-core"></div>
        <div class="pin-heading" style="transform:translate(-50%,-50%) rotate(${Math.round(heading) || 0}deg)"></div>
      </div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });

export default function LiveTrackLayer({ sessionId, token, shareToken }) {
    const map = useMap();
    const [points, setPoints] = useState([]);
    const [err, setErr] = useState("");
    const [topOffset, setTopOffset] = useState(64); // высота шапки по умолчанию
    const wsRef = useRef(null);
    const initedRef = useRef(false);

    // реальная высота верхней навигации — чтобы fitBounds не уезжал под шапку
    useEffect(() => {
        const nav = document.querySelector("nav, header, .topbar");
        if (nav && nav.getBoundingClientRect) {
            setTopOffset(Math.max(48, Math.min(96, Math.round(nav.getBoundingClientRect().height))));
        }
    }, []);

    // Подключение к WS и накопление точек
    useEffect(() => {
        if (!sessionId) return;
        setErr("");
        initedRef.current = false; // новая сессия — заново вписываемся в кадр

        const params = new URLSearchParams();
        params.set("session_id", sessionId);
        if (token) params.set("token", token);
        if (shareToken) params.set("share", shareToken);

        const wsUrl = ws(`/ws/track/watch?${params.toString()}`);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            try { ws.send(JSON.stringify({ type: "init" })); } catch { }
        };
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === "batch") {
                    // ожидается [{lat,lng,ts,speed,heading,accuracy}, ...]
                    setPoints(Array.isArray(msg.points) ? msg.points : []);
                } else if (msg.type === "point") {
                    setPoints(prev => [...prev, msg.point].slice(-1000));
                }
            } catch (err) {
                console.error("[LiveTrackLayer] parse error", err);
            }
        };
        ws.onerror = (e) => {
            console.warn("[LiveTrackLayer] ws error", e);
            setErr("ws_error");
        };
        ws.onclose = () => { /* no-op */ };

        return () => {
            try { ws.close(); } catch { }
        };
    }, [sessionId, token, shareToken]);

    // Автофокус/сопровождение
    useEffect(() => {
        if (!points.length) return;
        const latlngs = points.map(p => [p.lat, p.lng]);
        if (!initedRef.current) {
            // первичная подгонка
            if (latlngs.length > 1) {
                const b = L.latLngBounds(latlngs);
                if (b.isValid()) {
                    map.flyToBounds(b, {
                        paddingTopLeft: [12, topOffset + 12],
                        paddingBottomRight: [12, 12],
                        maxZoom: 16,
                        duration: 0.8
                    });
                }
            } else {
                map.flyTo(latlngs[0], Math.max(map.getZoom(), 15), { animate: true, duration: 0.8 });
            }
            initedRef.current = true;
            return;
        }
        // мягко держим последнюю точку в кадре
        const last = latlngs[latlngs.length - 1];
        const dist = map.distance(map.getCenter(), last);
        if (dist > 300) {
            map.panTo(last, { animate: true, duration: 0.5 });
        }
    }, [points.length, topOffset, map]);

    if (err) return null;
    if (points.length === 0) return null;

    const latlngs = points.map(p => [p.lat, p.lng]);
    const lastPoint = points[points.length - 1];

    return (
        <>
            <Polyline positions={latlngs} weight={4} />
            <Marker
                position={latlngs[latlngs.length - 1]}
                icon={makeLivePin(lastPoint?.heading)}
                zIndexOffset={1000}
            >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                    <div style={{ fontSize: 12 }}>
                        <div>Live</div>
                        <div>{new Date(lastPoint.ts).toLocaleString()}</div>
                    </div>
                </Tooltip>
            </Marker>
        </>
    );
}
