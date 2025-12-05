"use client";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import L from "leaflet";
import { useLang } from "../i18n/LangProvider";

// ---- НАСТРОЙКИ ----
const ORS_API_KEY = "5b3ce3597851110001cf6248e0d64cb4a6fd46e0a42286775eb9d392";
const DEFAULT_CENTER = [54, 39];
const SEGMENT_COLORS = {
    free: "#50B8FF",
    toll: "#8E3DF5",
    platon: "#FF6E51",
    default: "#50B8FF"
};

// --- Фокусировка карты на маршруте ---
function FitMapToRoute({ routeCoords, from, to }) {
    const map = useMap();
    useEffect(() => {
        let bounds = null;
        if (routeCoords && routeCoords.length > 1) {
            bounds = L.latLngBounds(routeCoords);
        } else if (from && to) {
            bounds = L.latLngBounds([from, to]);
        }
        if (bounds && bounds.isValid()) {
            setTimeout(() => {
                map.fitBounds(bounds, { padding: [60, 60] });
            }, 250);
        }
    }, [map, JSON.stringify(routeCoords), JSON.stringify(from), JSON.stringify(to)]);
    return null;
}

// --- Glow подложка для маршрута ---
function GlowPolyline({ positions }) {
    const map = useMap();
    const polylineRef = useRef();
    useEffect(() => {
        if (!map || !positions?.length) return;
        if (polylineRef.current) polylineRef.current.remove();
        polylineRef.current = L.polyline(positions, {
            color: "#fff",
            weight: 16,
            opacity: 0.13,
            className: "gradient-route-glow"
        }).addTo(map);
        return () => {
            if (polylineRef.current) polylineRef.current.remove();
        };
    }, [map, JSON.stringify(positions)]);
    return null;
}

// --- Одна анимированная стрелка по маршруту (без лагов) ---
// --- Одна анимированная "машинка" по маршруту (без лагов) ---
function SingleAnimatedArrow({ positions }) {
    const map = useMap();
    const arrowMarker = useRef(null);
    const [offset, setOffset] = useState(0);

    // SVG машинки!
    const CAR_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="18" viewBox="0 0 32 18">
  <rect x="3" y="7" width="26" height="8" rx="3" fill="#2971c7" stroke="#222" stroke-width="2"/>
  <rect x="7" y="3" width="18" height="8" rx="2.5" fill="#fff" stroke="#222" stroke-width="1.5"/>
  <circle cx="8.5" cy="15.5" r="2.5" fill="#222"/>
  <circle cx="23.5" cy="15.5" r="2.5" fill="#222"/>
  <ellipse cx="7" cy="11" rx="1.1" ry="2" fill="#ffd600" opacity="0.85"/>
  <ellipse cx="25" cy="11" rx="1.1" ry="2" fill="#ffd600" opacity="0.85"/>
</svg>
    `);

    function getPointAt(positions, progress) {
        if (!positions || positions.length < 2) return positions?.[0];
        let totalLength = 0, segments = [];
        for (let i = 1; i < positions.length; i++) {
            const dist = map.distance(positions[i - 1], positions[i]);
            segments.push(dist);
            totalLength += dist;
        }
        let target = progress * totalLength;
        for (let i = 1, acc = 0; i < positions.length; i++) {
            if (acc + segments[i - 1] >= target) {
                const ratio = (target - acc) / segments[i - 1];
                const [lat1, lng1] = positions[i - 1];
                const [lat2, lng2] = positions[i];
                return [
                    lat1 + (lat2 - lat1) * ratio,
                    lng1 + (lng2 - lng1) * ratio,
                ];
            }
            acc += segments[i - 1];
        }
        return positions[positions.length - 1];
    }

    useEffect(() => {
        if (!map || !positions?.length) return;
        if (arrowMarker.current) arrowMarker.current.remove();

        const icon = L.icon({
            iconUrl: `data:image/svg+xml,${CAR_SVG}`,
            iconSize: [36, 22],
            iconAnchor: [18, 11]
        });

        const point = getPointAt(positions, (offset % 1000) / 1000);

        arrowMarker.current = L.marker(point, { icon, interactive: false, zIndexOffset: 1200 });
        arrowMarker.current.addTo(map);

        return () => {
            if (arrowMarker.current) arrowMarker.current.remove();
        };
    }, [map, JSON.stringify(positions), offset]);

    useEffect(() => {
        if (!positions?.length) return;
        const id = setInterval(() => setOffset(o => (o + 17) % 1000), 80);
        return () => clearInterval(id);
    }, [positions]);

    return null;
}


export default function OrderRouteMap({ from, to, waypoints = [] }) {
    const { t } = useLang();
    function prettyDuration(sec) {
        const s = t("time.secShort", "сек.");
        const hS = t("time.hShort", "ч");
        const mS = t("time.minShort", "мин.");
        if (sec < 60) return `${sec} ${s}`;
        const h = Math.floor(sec / 3600);
        const m = Math.round((sec % 3600) / 60);
        return `${h ? `${h} ${hS} ` : ""}${m} ${mS}`;
    }
    const [routeCoords, setRouteCoords] = useState([]);
    const [summary, setSummary] = useState(null);
    const [segments, setSegments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Получение маршрута
    useEffect(() => {
        if (!from || !to) {
            setRouteCoords([]);
            setSegments([]);
            setSummary(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        const coordsAll = [from, ...(waypoints || []), to];
        axios.post(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            {
                coordinates: coordsAll.map(([lat, lng]) => [lng, lat]),
                extra_info: ["tollways"]
            },
            {
                headers: {
                    Authorization: ORS_API_KEY,
                    "Content-Type": "application/json",
                },
            }
        )
            .then(res => {
                const feature = res.data.features?.[0];
                if (!feature) {
                    setLoading(false);
                    return;
                }
                const coords = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                setRouteCoords(coords);
                setSummary({
                    distance: feature.properties.summary.distance,
                    duration: feature.properties.summary.duration,
                });
                const extras = feature.properties.extras || {};
                const tolls = extras.tollways?.values || [];
                if (!tolls.length) {
                    setSegments([{ coords, color: SEGMENT_COLORS.default }]);
                } else {
                    const coloredSegments = [];
                    let idx = 0;
                    for (const t of tolls) {
                        const [fromIdx, toIdx, cat] = t;
                        let color = SEGMENT_COLORS.free;
                        if (cat === 1) color = SEGMENT_COLORS.toll;
                        if (cat === 2) color = SEGMENT_COLORS.platon;
                        coloredSegments.push({
                            coords: coords.slice(fromIdx, toIdx + 1),
                            color,
                        });
                        idx = toIdx + 1;
                    }
                    if (idx < coords.length - 1) {
                        coloredSegments.push({
                            coords: coords.slice(idx, coords.length),
                            color: SEGMENT_COLORS.free
                        });
                    }
                    setSegments(coloredSegments);
                }
                setTimeout(() => setLoading(false), 400);
            })
            .catch(() => {
                setLoading(false);
                setRouteCoords([]);
                setSegments([]);
                setSummary(null);
            });
    }, [from, to, waypoints]);

    const markerIcon = (url) => L.icon({
        iconUrl: url,
        iconSize: [36, 44],
        iconAnchor: [18, 36],
    });

    return (
        <div className="order-map-container" style={{
            width: "100%",
            position: "relative",
            borderRadius: 16,
            margin: "32px 0 0 0",
            background: "#182337",
            boxShadow: "0 3px 24px #00184435",
        }}>
            <div style={{
                padding: "12px 32px 10px 32px",
                background: "#15203a",
                color: "#fff",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                fontSize: 18,
                gap: 28,
            }}>
                {loading && t("route.loading", "Загрузка маршрута...")}
                {!loading && summary && (
                    <>
                        <span>{t("route.label", "Маршрут")}:</span>
                        <span style={{ color: "#2971c7", fontWeight: 800 }}>
                            {(summary.distance / 1000).toFixed(1)} {t("units.km", "км")}
                        </span>
                        <span>•</span>
                        <span>{t("route.time", "Время")}: <span style={{ color: "#2971c7" }}>{prettyDuration(summary.duration)}</span></span>
                    </>
                )}
            </div>
            <div style={{
                width: "100%",
                height: "100%",
                minHeight: 220,
                background: "#181f36",
                borderRadius: "0 0 16px 16px",
                overflow: "hidden",
                position: "relative",
            }}>
                <MapContainer
                    center={from || DEFAULT_CENTER}
                    zoom={7}
                    style={{ width: "100%", height: 280, position: "relative", zIndex: 1 }}
                    scrollWheelZoom={true}
                >
                    <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {routeCoords.length > 1 && (
                        <>
                            <GlowPolyline positions={routeCoords} />
                            {/* Сегменты: платные/бесплатные/Платон как линии */}
                            {segments.map((seg, i) => (
                                <Polyline key={i} positions={seg.coords} pathOptions={{
                                    color: seg.color, weight: 7, opacity: 1, className: "route-segment"
                                }} />
                            ))}
                        </>
                    )}
                    {from &&
                        <Marker position={from} icon={markerIcon("/marker-load.png")} />}
                    {to &&
                        <Marker position={to} icon={markerIcon("/marker-unload.png")} />}
                    {/* Автофокус на маршруте */}
                    <FitMapToRoute routeCoords={routeCoords} from={from} to={to} />
                </MapContainer>
                {/* --- Легенда дорог --- */}
                <div style={{
                    position: "absolute",
                    left: 24,
                    bottom: 18,
                    background: "#fff",
                    borderRadius: 12,
                    padding: "12px 22px 10px 20px",
                    color: "#222",
                    fontSize: 15,
                    fontWeight: 500,
                    boxShadow: "0 2px 14px #11285022",
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    zIndex: 2,
                    border: "1px solid #eaeaea"
                }}>
                    <span style={{ marginRight: 8 }}>{t("legend.roads", "Дороги:")}</span>
                    <span style={{
                        width: 44, height: 8, borderRadius: 8,
                        background: SEGMENT_COLORS.free, display: "inline-block"
                    }} /> <span style={{ marginRight: 15, color: "#2971c7" }}>{t("legend.free", "Бесплатные")}</span>
                    <span style={{
                        width: 44, height: 8, borderRadius: 8,
                        background: SEGMENT_COLORS.toll, display: "inline-block"
                    }} /> <span style={{ marginRight: 15, color: "#8E3DF5" }}>{t("legend.toll", "Платные")}</span>
                    <span style={{
                        width: 44, height: 8, borderRadius: 8,
                        background: SEGMENT_COLORS.platon, display: "inline-block"
                    }} /> <span style={{ color: "#FF6E51" }}>{t("legend.platon", "Платон")}</span>
                </div>
            </div>
            <style jsx global>{`
        .leaflet-marker-icon, .leaflet-marker-shadow {
          width: 36px !important;
          height: 44px !important;
          max-width: unset !important;
          max-height: unset !important;
          object-fit: contain !important;
          border-radius: 0 !important;
          background: none !important;
          box-shadow: none !important;
        }
        .order-detail-icon,
        .order-detail-icon img,
        img[data-order-icon] {
          width: 36px !important;
          height: 44px !important;
          object-fit: contain !important;
          border-radius: 0 !important;
          background: none !important;
          box-shadow: none !important;
          display: inline-block !important;
          vertical-align: middle !important;
        }
      `}</style>
        </div>
    );
}
