"use client";
import "leaflet/dist/leaflet.css";
import { useLang } from "../i18n/LangProvider";
import "../styles/map-hover-overlay.css";
import React, { useRef, useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import ModalPortal from "./ModalPortal";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Circle,
    useMap,
    useMapEvents,
    GeoJSON,
    Tooltip,
    Pane,
} from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";

// === КАСТОМНЫЙ SVG-ПИН ДЛЯ «ВАШ ГРУЗ/ТРАНСПОРТ» (без внешних иконок) ===
// buildYourIcon({ kind: "cargo" | "transport", size: 44, color: "#4F46E5", shift: {x,y} })
const buildYourIcon = ({
    kind = "cargo",
    size = 44,
    color = "#4F46E5",
    shift = { x: 0, y: 0 },
} = {}) => {
    const S = size;
    const anchor = [S / 2 - (shift?.x || 0), S / 2 - (shift?.y || 0)];
    const svgCargo = `
    <svg class="badge" viewBox="0 0 64 64" width="${S}" height="${S}" aria-hidden="true">
      <defs>
        <radialGradient id="g1" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.85"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="20" fill="url(#g1)"/>
      <!-- Куб (ваш груз) -->
      <polygon points="32,16 48,24 32,32 16,24" fill="#ffffff" opacity="0.95"/>
      <polygon points="16,24 32,32 32,48 16,40" fill="#ffffff" opacity="0.9"/>
      <polygon points="48,24 32,32 32,48 48,40" fill="#EAF0FF" opacity="0.95"/>
      <path d="M32 16 L48 24 L48 40 L32 48 L16 40 L16 24 Z" fill="none" stroke="#FFFFFF" stroke-opacity=".95" stroke-width="1.6"/>
      <g transform="translate(44,18) scale(0.8)">
        <path d="M6 0 L7.9 3.8 L12 4.4 L9 7.1 L9.7 11 L6 9.1 L2.3 11 L3 7.1 L0 4.4 L4.1 3.8 Z" fill="#FFFFFF"/>
      </g>
    </svg>`;
    const svgTransport = `
    <svg class="badge" viewBox="0 0 64 64" width="${S}" height="${S}" aria-hidden="true">
      <defs>
        <radialGradient id="g2" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.85"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="20" fill="url(#g2)"/>
      <!-- Грузовик (ваш транспорт) -->
      <rect x="16" y="28" width="22" height="10" rx="2" ry="2" fill="#FFFFFF"/>
      <rect x="38" y="30" width="10" height="8" rx="2" ry="2" fill="#EAF0FF"/>
      <rect x="40" y="32" width="6" height="4" rx="1" ry="1" fill="#ffffff"/>
      <circle cx="24" cy="42" r="3.5" fill="#0B1020"/><circle cx="42" cy="42" r="3.5" fill="#0B1020"/>
      <circle cx="24" cy="42" r="1.7" fill="#ffffff"/><circle cx="42" cy="42" r="1.7" fill="#ffffff"/>
      <g transform="translate(44,18) scale(0.8)">
        <path d="M6 0 L7.9 3.8 L12 4.4 L9 7.1 L9.7 11 L6 9.1 L2.3 11 L3 7.1 L0 4.4 L4.1 3.8 Z" fill="#FFFFFF"/>
      </g>
    </svg>`;
    const svg = kind === "transport" ? svgTransport : svgCargo;
    const html = `
    <div class="your-pin-wrap" style="transform: translate(${shift.x || 0}px,${shift.y || 0}px); --s:${S}px; --pin:${color}">
      <span class="halo"></span>${svg}
    </div>`;
    return L.divIcon({
        className: "your-pin",
        html,
        iconSize: [S, S],
        iconAnchor: anchor,
    });
};


import { circle as turfCircle, intersect as turfIntersect, booleanIntersects } from "@turf/turf";
import LocationAutocomplete from "./LocationAutocomplete";
import { useMapHover } from "./MapHoverContext";
import { api } from "@/config/env";
import MapPinOverlay from "./MapPinOverlay";
import { useCrossHover } from "../../hooks/useCrossHover";
import { useUser } from "../UserContext";

// API base централизовано через @/config/env

/* ============================= Styles (once) ============================= */
function injectStyle(id, css) {
    if (typeof window === "undefined") return;
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.innerHTML = css;
    document.head.appendChild(el);
}
injectStyle(
    "pin-anim-style",
    `
  @keyframes pulsePin {
    0% { box-shadow: 0 0 0 0 rgba(67,200,255,0.5); }
    70% { box-shadow: 0 0 0 11px rgba(67,200,255,0); }
    100% { box-shadow: 0 0 0 0 rgba(67,200,255,0); }
  }
  .pin-wrap { width:32px;height:32px; transition: transform .14s ease; will-change: transform; }
  .pin-hovered { transform: translateY(-2px) scale(1.06); }
`
);

injectStyle(
    "cluster-style",
    `
  .cluster-marker { will-change: transform; }
`
);


// Стили для нового пина «ваш ...» (инжектим в документ один раз)
injectStyle(
    "your-pin-style",
    `
  .your-pin { pointer-events: none; }
  .your-pin-wrap { position: relative; width: var(--s, 44px); height: var(--s, 44px); }
  .your-pin .badge {
    position: absolute; inset: 0;
    filter: drop-shadow(0 2px 6px rgba(7,12,32,.28));
    border-radius: 9999px;
  }
  .your-pin .halo {
    position: absolute; top: 50%; left: 50%;
    width: calc(var(--s,44px) + 12px); height: calc(var(--s,44px) + 12px);
    transform: translate(-50%,-50%);
    border-radius: 9999px; border: 3px solid var(--pin,#4F46E5);
    opacity: .45; animation: yourHalo 2.2s ease-out infinite;
  }
  @keyframes yourHalo {
    0% { transform: translate(-50%,-50%) scale(.82); opacity:.55; }
    70% { transform: translate(-50%,-50%) scale(1.32); opacity:.15; }
    100% { transform: translate(-50%,-50%) scale(1.42); opacity:0; }
  }`
);

/* ============================= Helpers ============================= */
const MAX_CLUSTER_FIT_KM = 800;
const HOVER_HIDE_DELAY = 160; // было 80 — из-за этого оверлей «мигал»

const COUNTRY_PRESETS = [
    { code: "ge", name: "Грузия", flag: "🇬🇪", center: [42.3208, 43.3713], zoom: 7 },
    { code: "az", name: "Азербайджан", flag: "🇦🇿", center: [40.2804, 47.7042], zoom: 7 },
    { code: "am", name: "Армения", flag: "🇦🇲", center: [40.0691, 45.0382], zoom: 8 },
    { code: "ru", name: "Россия", flag: "🇷🇺", center: [55.7558, 37.6176], zoom: 5 },
    { code: "ua", name: "Украина", flag: "🇺🇦", center: [49.0, 31.0], zoom: 6 },
    { code: "tr", name: "Турция", flag: "🇹🇷", center: [39.0, 35.0], zoom: 6 },
];

const packBounds = (b) => (b ? [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()] : null);
const eqBounds = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const useDebounced = (fn, delay = 250) => {
    const fnRef = React.useRef(fn);
    const timer = useRef(null);

    useEffect(() => {
        fnRef.current = fn;
    }, [fn]);

    // Чистим таймер при размонтировании, чтобы не дергать setState на размонтированном компоненте
    useEffect(() => {
        return () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
        };
    }, []);

    return React.useCallback(
        (...args) => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => fnRef.current(...args), delay);
        },
        [delay]
    );
};

function isMobile() {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 650;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getFirstCoords(item) {
    if (Array.isArray(item.from_locations_coords) && item.from_locations_coords[0]) {
        return item.from_locations_coords[0];
    }
    if (
        item.from_locations_coords &&
        typeof item.from_locations_coords === "object" &&
        item.from_locations_coords.lat != null &&
        item.from_locations_coords.lng != null
    ) {
        return item.from_locations_coords;
    }
    if (item.from_location_coords) return item.from_location_coords;
    if (item.from_location_lat != null && item.from_location_lng != null) {
        return { lat: Number(item.from_location_lat), lng: Number(item.from_location_lng) };
    }
    if (item.from_lat != null && item.from_lng != null) {
        return { lat: Number(item.from_lat), lng: Number(item.from_lng) };
    }
    // 🔧 ФОЛЛБЭК: для «расползшихся» маркеров и прочих случаев,
    // когда координаты уже положены прямо в item.lat/item.lng
    if (item.lat != null && item.lng != null) {
        return { lat: Number(item.lat), lng: Number(item.lng) };
    }
    return null;
}

function toGeoJSONFeature(item) {
    const first = getFirstCoords(item);
    if (!first) return null;
    const lng = Number(first.lng);
    const lat = Number(first.lat);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(lng.toFixed(4)), Number(lat.toFixed(4))] },
        properties: { ...item, cluster: false, id: item.id },
    };
}
const getGeoJSON = (list) => list.map(toGeoJSONFeature).filter(Boolean);

/* =========== Radius filtering (transport circles vs orders points) =========== */
function filterTransportsByRadius(list, center, searchRadiusKm, isTransports) {
    if (!center || !searchRadiusKm) return list;
    const centerCoords = [Number(center[1]), Number(center[0])]; // [lng,lat]
    const searchCircle = turfCircle(centerCoords, searchRadiusKm, { steps: 64, units: "kilometers" });
    return list.filter((tr) => {
        const first = getFirstCoords(tr);
        if (!first) return false;
        const coords = [Number(first.lng), Number(first.lat)];
        if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return false;

        if (isTransports) {
            const trRadius = tr.from_radius ? parseFloat(tr.from_radius) : 0;
            if (!trRadius) return false;
            const trCircle = turfCircle(coords, trRadius, { steps: 64, units: "kilometers" });
            return booleanIntersects(searchCircle, trCircle);
        } else {
            return booleanIntersects(searchCircle, {
                type: "Feature",
                geometry: { type: "Point", coordinates: coords },
            });
        }
    });
}

function getTransportCircles(transports) {
    return transports
        .map((tr) => {
            const first = getFirstCoords(tr);
            const radius = tr.from_radius ? parseFloat(tr.from_radius) : null;
            if (!first || !radius) return null;
            return turfCircle([first.lng, first.lat], radius, { steps: 64, units: "kilometers" });
        })
        .filter(Boolean);
}

function getTransportCircleIntersections(allCircles) {
    const result = [];
    for (let i = 0; i < allCircles.length; i++) {
        for (let j = i + 1; j < allCircles.length; j++) {
            try {
                const x = turfIntersect(allCircles[i], allCircles[j]);
                if (x) result.push(x);
            } catch { }
        }
    }
    return result;
}

/* ============================= Radius UI ============================= */
function RadiusButton({ radiusMode, setRadiusMode, setRadiusCenter }) {
    const { t } = useLang();
    if (radiusMode) return null;
    return (
        <button
            aria-label={t("map.radius.filter", "Фильтр по радиусу")}
            style={{
                position: "absolute",
                right: 20,
                top: 22,
                zIndex: 1201,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 12,
                border: "1px solid #223149",
                background: "linear-gradient(180deg,#172238 0%,#141d31 100%)",
                color: "#cfe7ff",
                fontWeight: 700,
                fontSize: 14,
                boxShadow: "0 4px 12px rgba(3,10,20,.35), inset 0 0 0 1px rgba(67,200,255,.12)",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
            }}
            onClick={() => {
                setRadiusMode(true);
                setRadiusCenter(null);
            }}
        >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6" stroke="#43c8ff" strokeWidth="2" fill="none" />
                <path d="M21 21l-4.2-4.2" stroke="#43c8ff" strokeWidth="2" fill="none" strokeLinecap="round" />
                <circle cx="11" cy="11" r="2" fill="#43c8ff" />
            </svg>
            <span style={{ color: "#e6f2ff", letterSpacing: 0.2 }}>{t("map.radius", "Радиус")}</span>
        </button>
    );
}
function ClearRadiusButton({
    filters,
    radiusCenter,
    setFilters,
    setMapViewCenter,
    setMapZoom,
    setRadiusCenter,
    setRadiusMode,
    setUserDriven,
}) {
    const { t } = useLang();
    if (!filters?.map_center && !radiusCenter) return null;
    return (
        <button
            aria-label={t("map.radius.clearAria", "Очистить радиус")}
            style={{
                position: "absolute",
                right: 22,
                top: 68,
                zIndex: 1201,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: 10,
                border: "1px solid #3a2230",
                background: "linear-gradient(180deg,#28171f 0%,#1f1218 100%)",
                color: "#ff8686",
                fontWeight: 700,
                fontSize: 13,
                boxShadow: "0 4px 10px rgba(20,0,0,.35), inset 0 0 0 1px rgba(255,104,104,.14)",
                cursor: "pointer",
            }}
            onClick={() => {
                setUserDriven?.();
                // Полный сброс как клиентских, так и серверных ключей
                setFilters?.((f) => ({
                    ...f,
                    map_center: undefined,
                    map_radius: undefined,
                    from_location_lat: undefined,
                    from_location_lng: undefined,
                    from_radius: undefined,
                }));
                setRadiusCenter?.(null);
                setRadiusMode?.(false);
                setMapViewCenter([52.2, 21.0]);
            }}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 5l14 14M19 5L5 19" stroke="#ff6868" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t("map.radius.clear", "Очистить")}
        </button>
    );
}
const RadiusOverlay = ({ radiusMode, radiusCenter }) => {
    const { t } = useLang();
    if (!radiusMode || radiusCenter) return null;
    return (
        <div
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                background: "rgba(16,24,34,0.28)",
                zIndex: 1199,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
            }}
        >
            <div
                style={{
                    background: "#18223ccc",
                    color: "#43c8ff",
                    fontSize: 18,
                    borderRadius: 12,
                    padding: "19px 36px",
                    fontWeight: 700,
                    boxShadow: "0 2px 14px #43c8ff23",
                }}
            >
                {t("map.radius.overlay", "Кликните на карту для выбора центра поиска")}
            </div>
        </div>
    );
};
function RadiusPanel({
    radiusMode,
    radiusCenter,
    radius,
    setRadius,
    setFilters,
    setRadiusMode,
    setRadiusCenter,
}) {
    const { t } = useLang();
    if (!radiusMode || !radiusCenter) return null;
    return (
        <div
            style={{
                position: "absolute",
                bottom: isMobile() ? 14 : 25,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1201,
                background: "#19223aee",
                borderRadius: 11,
                padding: "14px 28px",
                color: "#e3f2fd",
                boxShadow: "0 2px 14px #43c8ff23",
                display: "flex",
                gap: 11,
                alignItems: "center",
            }}
        >
            <span style={{ fontWeight: 700 }}>{t("map.radius.label", "Радиус:")}</span>
            <input
                type="number"
                min={10}
                max={2000}
                step={10}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                style={{
                    width: 80,
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1.2px solid #234",
                    background: "#223",
                    color: "#e3f2fd",
                    fontSize: 15,
                }}
            />
            {t("unit.km", "км")}
            <button
                onClick={() => {
                    // "Отменить" тоже снимает фильтр по радиусу
                    setFilters?.((f) => ({
                        ...f,
                        map_center: undefined,
                        map_radius: undefined,
                        from_location_lat: undefined,
                        from_location_lng: undefined,
                        from_radius: undefined,
                    }));
                    setRadiusCenter?.(null);
                    setRadiusMode?.(false);
                }}
                style={{
                    background: "#223",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontWeight: 600,
                    marginLeft: 6,
                    cursor: "pointer",
                }}
            >
                {t("common.cancel", "Отменить")}
            </button>
        </div>
    );
}

/* ============================= Component ============================= */
export default function SimpleMap({
    fullHeight = false,
    orders = [],
    transports = [],
    setFilters,
    filters,
    onFilteredIdsChange,
    hideSearch,
    fitAll = true,
    myTransportId,
    myOrderId,
    mainOrder,
    mainTransport,
    hoveredItemId,
    setHoveredItemId,
    fullscreenModal = false,
    showLegend = false,
    mixed = false,
    zoomPreset = undefined,
    refreshKey = undefined,
    onPinClick = undefined,
}) {
    // роль пользователя: для TRANSPORT скрываем чужие транспортные пины
    const { t } = useLang();
    const { user } = useUser() || {};
    const role = (user?.role || "").toUpperCase();
    const hideTransportPins = role === "TRANSPORT";
    const transportsVisible = hideTransportPins ? [] : transports;
    const hideOrderPins = role === "OWNER";
    const ordersVisible = hideOrderPins ? [] : orders;
    const { MAX_INIT_ZOOM, SINGLE_PIN_ZOOM } = useMemo(
        () => (zoomPreset === "matches" ? { MAX_INIT_ZOOM: 10, SINGLE_PIN_ZOOM: 13 } : { MAX_INIT_ZOOM: 3, SINGLE_PIN_ZOOM: 12 }),
        [zoomPreset]
    );

    // коллективный список (в смешанном режиме маркируем __kind)
    const list = useMemo(() => {
        const tagT = (t) => ({ ...t, __kind: "transport" });
        const tagO = (o) => ({ ...o, __kind: "order" });
        const tr = transportsVisible;
        if (mixed && tr.length && ordersVisible.length) return [...tr.map(tagT), ...ordersVisible.map(tagO)];
        if (tr.length) return tr.map(tagT);
        return ordersVisible.map(tagO);
    }, [mixed, transportsVisible, ordersVisible]);

    /* ---------------------------- Map state ---------------------------- */
    const [mapZoom, setMapZoom] = useState(5);
    const [mapViewCenter, setMapViewCenter] = useState([52.2, 21.0]);
    const [selectedCountry, setSelectedCountry] = useState("");
    const [leafletMap, setLeafletMap] = useState(null);
    const [boundsArr, setBoundsArr] = useState(null);

    const [radiusMode, setRadiusMode] = useState(false);
    // Client-only guard to avoid intermittent Leaflet appendChild errors when mounting/unmounting under SSR/StrictMode
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // как только карта создана — даём ей тик и валидируем размеры,
    // чтобы тайлы гарантированно подхватились после появления шторки/вкладки
    useEffect(() => {
        if (!leafletMap) return;
        const id = setTimeout(() => {
            try { leafletMap.invalidateSize(true); } catch { }
        }, 0);
        return () => clearTimeout(id);
    }, [leafletMap]);
    const [radiusCenter, setRadiusCenter] = useState(null);
    const [radius, setRadius] = useState(200);

    const [clusters, setClusters] = useState([]);
    const clustersSigRef = useRef("");
    const spiderfyCache = useRef({});
    const [spiderfied, setSpiderfied] = useState(null);

    const hoverTimerRef = useRef(null);
    const lastHoverRef = useRef({ id: null, x: null, y: null });
    const [popupPos, setPopupPos] = useState(null);
    const { setHoveredItem, hoveredItem, setClickedItemId, clickedItemId } = useMapHover();
    const [hoveredId, setHoveredId] = useCrossHover(list, hoveredItemId, setHoveredItemId);

    // Чистим таймер ховера при размонтировании и сбрасываем lastHoverRef
    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
            lastHoverRef.current = { id: null, x: null, y: null };
        };
    }, []);

    // DEBUG: логируем состояния ховера/оверлея только в dev
    useEffect(() => {
        if (process.env.NODE_ENV === "development") {
            console.log("[HOVER STATE]", {
                hoveredId,
                hoveredItem,
                popupPos,
            });
        }
    }, [hoveredId, hoveredItem, popupPos]);

    const userDrivenRef = useRef(false);
    useEffect(() => {
        if (!leafletMap || !userDrivenRef.current) return;
        try {
            leafletMap.setView(mapViewCenter, mapZoom, { animate: true });
        } catch { }
        userDrivenRef.current = false;
    }, [mapViewCenter, mapZoom, leafletMap]);

    /* -------------------------- Main pin (mine) -------------------------- */
    const [mainPin, mainCoords] = useMemo(() => {
        let coords = null;
        let node = null;
        let offset = { x: 0, y: 0 };

        const source = mainOrder || mainTransport;
        if (source) coords = getFirstCoords(source);
        if (!coords) return [null, null];

        // лёгкое смещение, если в точке есть другие пины
        try {
            const lat = Number(coords.lat);
            const lng = Number(coords.lng);
            const near = clusters.some((cl) => {
                if (!cl) return false;
                if (cl.properties?.cluster) {
                    return (
                        Math.abs(cl.geometry.coordinates[1] - lat) < 0.00004 &&
                        Math.abs(cl.geometry.coordinates[0] - lng) < 0.00004
                    );
                }
                return (
                    cl.properties?.id !== source.id &&
                    Math.abs(cl.geometry.coordinates[1] - lat) < 0.00004 &&
                    Math.abs(cl.geometry.coordinates[0] - lng) < 0.00004
                );
            });
            if (near) offset = { x: 18, y: -18 };
        } catch { }
        // новый SVG-пин (без внешних файлов); вид зависит от контекста
        const kindForYou = mainTransport ? "transport" : "cargo";
        const icon = buildYourIcon({ kind: kindForYou, size: 44, color: "#4F46E5", shift: offset });
        node = (
            <Marker pane="your-halo" interactive={false} bubblingMouseEvents={false} zIndexOffset={-1000}
                key="main-pin"
                position={[coords.lat, coords.lng]}
                icon={icon}
            >
                <Popup>
                    <b>{mainTransport ? t("map.popup.yourTransport", "Ваш транспорт") : t("map.popup.yourCargo", "Ваш груз")}</b>
                </Popup>
            </Marker>
        );
        return [node, coords];
    }, [mainOrder, mainTransport, clusters]);

    /* ----------------------- Data prep & clustering ---------------------- */
    const isMixed = mixed && transportsVisible.length > 0 && ordersVisible.length > 0;
    const isTransportsOnly = !isMixed && transportsVisible.length > 0;
    const isOrdersOnly = !isMixed && ordersVisible.length > 0 && transportsVisible.length === 0;

    const filteredList = useMemo(() => {
        if ((filters?.map_center && filters?.map_radius) || (radiusMode && radiusCenter && radius)) {
            const center = filters?.map_center || radiusCenter;
            const rad = filters?.map_radius || radius;
            return filterTransportsByRadius(list, center, rad, isTransportsOnly);
        }
        return list;
    }, [list, filters?.map_center, filters?.map_radius, radiusMode, radiusCenter, radius, isTransportsOnly]);

    const geoJsonPointsAll = useMemo(() => getGeoJSON(filteredList), [filteredList]);

    // ✅ Сообщаем родителю id видимых элементов для мгновенной фильтрации списка
    useEffect(() => {
        if (!onFilteredIdsChange) return;
        const radiusActive =
            (filters?.map_center && filters?.map_radius) || (radiusMode && radiusCenter && radius);
        if (radiusActive) {
            const ids = filteredList.map(it => it.id).filter(Boolean);
            try { onFilteredIdsChange(ids); } catch { }
        } else {
            // сброс — показывать всё
            try { onFilteredIdsChange(undefined); } catch { }
        }
    }, [filteredList, onFilteredIdsChange, filters?.map_center, filters?.map_radius, radiusMode, radiusCenter, radius]);

    const dataSig = useMemo(
        () =>
            geoJsonPointsAll
                .map((f) => `${f.geometry.coordinates[1].toFixed(3)},${f.geometry.coordinates[0].toFixed(3)}`)
                .join("|"),
        [geoJsonPointsAll]
    );

    const supercluster = useMemo(() => {
        const sc = new Supercluster({
            radius: 50,
            maxZoom: 18,
            map: (props) => ({ t: props.__kind === "transport" ? 1 : 0, o: props.__kind === "order" ? 1 : 0 }),
            reduce: (acc, props) => {
                acc.t = (acc.t || 0) + props.t;
                acc.o = (acc.o || 0) + props.o;
            },
        });
        sc.load(geoJsonPointsAll);
        return sc;
    }, [geoJsonPointsAll]);

    const debouncedSync = useDebounced((map) => {
        const nextBounds = packBounds(map.getBounds());
        setBoundsArr((prev) => (eqBounds(prev, nextBounds) ? prev : nextBounds));
        setMapZoom((prev) => {
            const z = map.getZoom();
            return z === prev ? prev : z;
        });
    }, 200);

    function MapUpdater() {
        useMapEvents({
            moveend: (e) => debouncedSync(e.target),
            zoomend: (e) => debouncedSync(e.target),
            click(e) {
                if (radiusMode) {
                    const lat = e.latlng.lat, lng = e.latlng.lng;
                    setRadiusCenter([lat, lng]);
                    setSpiderfied(null);
                    // ✅ Мгновенно применяем фильтр
                    try {
                        const patch = { map_center: [lat, lng], map_radius: radius };
                        // если на экране только транспорты — дублируем ключи для бэкенда
                        if (isTransportsOnly) {
                            patch.from_location_lat = lat;
                            patch.from_location_lng = lng;
                            patch.from_radius = radius;
                        }
                        setFilters?.(prev => ({ ...prev, ...patch }));
                    } catch { }
                    // остаёмся в режиме — можно кликать бесконечно
                }
            },
        });
        return null;
    }

    // первичное авто-кадрирование (бережно)
    const fittedOnceRef = useRef(false);
    const didInitFitRef = useRef(false);
    const runInitialFit = React.useCallback(
        (map) => {
            if (!map || didInitFitRef.current || fitAll === false) return;

            const wireSync = () => {
                const sync = () => {
                    try {
                        const b = map.getBounds();
                        const z = map.getZoom();
                        setBoundsArr([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
                        setMapZoom(z);
                    } catch { }
                };
                map.once("moveend", sync);
                map.once("zoomend", sync);
                setTimeout(sync, 0);
            };

            if (!geoJsonPointsAll.length) {
                try {
                    map.invalidateSize(true);
                } catch { }
                wireSync();
                map.fitWorld({ animate: false });
                didInitFitRef.current = true;
                fittedOnceRef.current = true;
                return;
            }

            const pts = geoJsonPointsAll.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
            if (pts.length === 1) {
                try {
                    map.invalidateSize(true);
                } catch { }
                wireSync();
                map.setView(pts[0], SINGLE_PIN_ZOOM);
                didInitFitRef.current = true;
                fittedOnceRef.current = true;
                return;
            }

            const boundsAll = L.latLngBounds(pts);
            const sw = boundsAll.getSouthWest(),
                ne = boundsAll.getNorthEast();
            const d = haversineKm(sw.lat, sw.lng, ne.lat, ne.lng);
            if (d <= MAX_CLUSTER_FIT_KM) {
                try {
                    map.invalidateSize(true);
                } catch { }
                wireSync();
                map.fitBounds(boundsAll, { padding: [50, 50], animate: false, maxZoom: MAX_INIT_ZOOM });
                didInitFitRef.current = true;
                fittedOnceRef.current = true;
                return;
            }

            // плотная зона
            let best = null;
            const world = [-180, -85, 180, 85];
            for (let z = 14; z >= 2; z -= 2) {
                const cl = supercluster.getClusters(world, z);
                for (const c of cl) {
                    const cnt = c.properties.cluster ? c.properties.point_count : 1;
                    if (!best || cnt > best.count) best = { c, count: cnt };
                }
                if (best && best.count >= 3) break;
            }
            let center = best
                ? [best.c.geometry.coordinates[1], best.c.geometry.coordinates[0]]
                : [boundsAll.getCenter().lat, boundsAll.getCenter().lng];

            let candidates = pts;
            if (best?.c?.properties?.cluster) {
                try {
                    const leaves = supercluster.getLeaves(best.c.id, 1000);
                    candidates = leaves.map((p) => [p.geometry.coordinates[1], p.geometry.coordinates[0]]);
                } catch { }
            }

            let subset = candidates.filter(
                ([lat, lng]) => haversineKm(center[0], center[1], lat, lng) <= MAX_CLUSTER_FIT_KM
            );
            if (subset.length === 0 && pts.length) {
                let nearest = pts[0],
                    bestD = Infinity;
                for (const [lat, lng] of pts) {
                    const dd = haversineKm(center[0], center[1], lat, lng);
                    if (dd < bestD) {
                        bestD = dd;
                        nearest = [lat, lng];
                    }
                }
                center = nearest;
                subset = pts.filter(
                    ([lat, lng]) => haversineKm(center[0], center[1], lat, lng) <= MAX_CLUSTER_FIT_KM
                );
            }

            wireSync();
            try {
                map.invalidateSize(true);
            } catch { }
            if (subset.length >= 2) {
                map.fitBounds(L.latLngBounds(subset), { padding: [50, 50], animate: false, maxZoom: MAX_INIT_ZOOM });
            } else if (subset.length === 1) {
                map.setView(subset[0], SINGLE_PIN_ZOOM);
            } else {
                map.fitBounds(boundsAll, { padding: [50, 50], animate: false, maxZoom: MAX_INIT_ZOOM });
            }
            didInitFitRef.current = true;
            fittedOnceRef.current = true;
        },
        [fitAll, geoJsonPointsAll, supercluster, MAX_INIT_ZOOM, SINGLE_PIN_ZOOM]
    );

    useEffect(() => {
        didInitFitRef.current = false;
    }, [dataSig]);

    useEffect(() => {
        if (!leafletMap) return;
        let outerId = null;
        let innerId = null;
        outerId = setTimeout(() => {
            try {
                leafletMap.invalidateSize(true);
            } catch { }
            didInitFitRef.current = false;
            fittedOnceRef.current = false;
            const sync = () => {
                try {
                    const b = leafletMap.getBounds();
                    const z = leafletMap.getZoom();
                    setBoundsArr([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
                    setMapZoom(z);
                } catch { }
            };
            leafletMap.once("moveend", sync);
            leafletMap.once("zoomend", sync);
            runInitialFit(leafletMap);
            innerId = setTimeout(sync, 0);
        }, 150);

        return () => {
            if (outerId) clearTimeout(outerId);
            if (innerId) clearTimeout(innerId);
        };
    }, [refreshKey, leafletMap, runInitialFit]);

    useEffect(() => {
        runInitialFit(leafletMap);
    }, [leafletMap, dataSig, runInitialFit]);

    /* -------------------------- Scroll to card -------------------------- */
    useEffect(() => {
        if (!clickedItemId) return;

        const selBase =
            `[data-order-id="${clickedItemId}"], ` +
            `[data-transport-id="${clickedItemId}"], ` +
            `[data-id="${clickedItemId}"], ` +
            `[data-key="${clickedItemId}"], ` +
            `[data-item-id="${clickedItemId}"]`;

        const hasScrollableY = (el) => {
            if (!el) return false;
            const st = getComputedStyle(el);
            return /(auto|scroll)/.test(st.overflowY || st.overflow);
        };
        const findScrollParent = (el) => {
            let p = el?.parentElement;
            while (p && p !== document.body) {
                if (hasScrollableY(p)) return p;
                p = p.parentElement;
            }
            return document.scrollingElement || document.documentElement;
        };

        const ensureListVisible = () => {
            const candidates = ['[data-view="list"]', '[data-role="list"]', ".orders-list", ".order-list"];
            let listEl = null;
            for (const sel of candidates) {
                const e = document.querySelector(sel);
                if (e) {
                    listEl = e;
                    break;
                }
            }
            const hidden =
                listEl && (getComputedStyle(listEl).display === "none" || listEl.offsetParent === null);
            if (!listEl || hidden) {
                // Не переключаемся на вкладку "Список" автоматически — оставляем карту открытой.
                // Если список скрыт (например, активна карта/шторка), пропускаем авто-переключение.
                // Пользователь сможет открыть список вручную.
                // (Раньше здесь был клик по кнопке "Список")
            }
        };

        const tryScroll = () => {
            const el = document.querySelector(selBase);
            if (!el) return false;
            const scroller = findScrollParent(el);
            if (scroller && scroller !== document.scrollingElement && scroller !== document.documentElement) {
                const elRect = el.getBoundingClientRect();
                const scRect = scroller.getBoundingClientRect();
                const offset = elRect.top - scRect.top - (scRect.height / 2 - elRect.height / 2);
                scroller.scrollBy({ top: offset, behavior: "smooth" });
            } else {
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            }
            el.classList.add("highlight");
            setTimeout(() => el.classList.remove("highlight"), 1500);
            setHoveredItem(null);
            setTimeout(() => setClickedItemId(null), 100);
            return true;
        };

        ensureListVisible();
        if (!tryScroll()) {
            setTimeout(() => {
                ensureListVisible();
                if (!tryScroll()) setTimeout(() => (ensureListVisible(), tryScroll()), 140);
            }, 70);
        }
    }, [clickedItemId, setClickedItemId, setHoveredItem]);

    /* ---------------------------- Overlay pos ---------------------------- */
    useEffect(() => {
        // Не даём позиции дергаться: если пересчёт не удался — оставляем прежнюю.
        const safeSet = (next) => {
            setPopupPos((prev) => {
                if (!next) return prev; // 👈 держим старое значение вместо null
                if (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5) return prev;
                return next;
            });
        };

        // Если ховера нет — чистим позицию честно.
        if (!hoveredItem) {
            setPopupPos(null);
            return;
        }
        if (!leafletMap || typeof leafletMap.latLngToContainerPoint !== "function") {
            return; // карты нет — ничего не трогаем
        }
        const first = getFirstCoords(hoveredItem);
        const lat = first ? Number(first.lat) : NaN;
        const lng = first ? Number(first.lng) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            try {
                const point = leafletMap.latLngToContainerPoint([lat, lng]);
                const rect = leafletMap.getContainer().getBoundingClientRect();
                if (
                    point &&
                    typeof point.x === "number" &&
                    typeof point.y === "number" &&
                    point.x >= -20 &&
                    point.y >= -20 &&
                    point.x <= rect.width + 20 &&
                    point.y <= rect.height + 20
                ) {
                    safeSet({ x: rect.left + point.x, y: rect.top + point.y });
                    return;
                }
            } catch { }
        }
        // если точка вне видимой области — оставим прежнюю позицию; эффект выше её не сотрёт
        // (при реальном уходе курсора mouseout очистит состояние)
    }, [hoveredItem, mapZoom, mapViewCenter, boundsArr, leafletMap]);

    /* ----------------------- Build clusters when view ----------------------- */
    useEffect(() => {
        if (!supercluster || !boundsArr) return;
        const bbox = [boundsArr[1], boundsArr[0], boundsArr[3], boundsArr[2]];
        const z = Math.max(0, Math.min(18, Math.round(mapZoom ?? (leafletMap?.getZoom?.() ?? 0))));
        const next = supercluster.getClusters(bbox, z);
        const sig = next.map((c) => (c?.properties?.cluster ? `c${c.id}` : `p${c?.properties?.id}`)).join(",");
        if (clustersSigRef.current !== sig) {
            clustersSigRef.current = sig;
            setClusters(next);
        }
    }, [supercluster, boundsArr, mapZoom, leafletMap]);

    /* ----------------------- Cluster helpers ----------------------- */
    function clusterContainsIntersectingPin(cluster, supercluster, list, filters, radiusMode, radiusCenter, radius) {
        const filterActive =
            (filters?.map_center && filters?.map_radius) || (radiusMode && radiusCenter && radius);
        if (!filterActive) return false;
        const center = filters?.map_center || radiusCenter;
        const rad = filters?.map_radius || radius;
        if (!center || !rad) return false;

        let ids = [];
        try {
            ids = supercluster.getLeaves(cluster.id, Infinity).map((p) => p.properties.id);
        } catch { }
        for (const id of ids) {
            const tr = list.find((x) => x.id === id);
            if (!tr) continue;
            const first = getFirstCoords(tr);
            const coords = first ? [Number(first.lng), Number(first.lat)] : null;
            const trRadius = tr.from_radius ? parseFloat(tr.from_radius) : 0;
            if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) || !trRadius) continue;
            const trCircle = turfCircle(coords, trRadius, { steps: 64, units: "kilometers" });
            const centerCoords = [Number(center[1]), Number(center[0])];
            const searchCircle = turfCircle(centerCoords, rad, { steps: 64, units: "kilometers" });
            if (booleanIntersects(searchCircle, trCircle)) return true;
        }
        return false;
    }

    const MAX_HYDRATE_CACHE_PER_KIND = 200; // можно подстроить под реальные нагрузки

    // Достаточно ли данных, чтобы отрисовать «богатый» оверлей?
    const hasOverlayData = (it) =>
        !!(
            it?.title ||
            it?.cargo_name ||
            it?.name ||
            it?.from_location ||
            it?.from_city ||
            it?.loading_date ||
            it?.ready_date ||
            it?.price ||
            it?.weight ||
            it?.volume
        );

    // Лениво тянем фулл-объект по id
    const hydrateCacheRef = useRef({
        orders: new Map(),
        transports: new Map(),
    });

    // Вспомогательная функция для добавления в кэш с ограничением по размеру
    function getFromLimitedCache(kindKey, id, factory) {
        const bucket = hydrateCacheRef.current[kindKey];
        if (!bucket) {
            return factory();
        }

        if (!bucket.has(id)) {
            // если кэш переполнен — выкидываем самый старый ключ
            if (bucket.size >= MAX_HYDRATE_CACHE_PER_KIND) {
                const oldestKey = bucket.keys().next().value;
                bucket.delete(oldestKey);
            }
            bucket.set(id, factory());
        }

        return bucket.get(id);
    }

    // Лениво тянем фулл-объект по id с ограниченным кэшем
    const fetchFullItem = async (kind, id) => {
        if (!id) return null;
        const key = kind === "transport" ? "transports" : "orders";

        return getFromLimitedCache(key, id, () =>
            fetch(api(`/${key}/${id}`))
                .then((r) => r.json())
                .catch(() => null)
        );
    };

    function clusterContainsIntersectingOrder(cluster, supercluster, list, filters, radiusMode, radiusCenter, radius) {
        const filterActive =
            (filters?.map_center && filters?.map_radius) || (radiusMode && radiusCenter && radius);
        if (!filterActive) return false;
        const center = filters?.map_center || radiusCenter;
        const rad = filters?.map_radius || radius;
        if (!center || !rad) return false;

        let ids = [];
        try {
            ids = supercluster.getLeaves(cluster.id, Infinity).map((p) => p.properties.id);
        } catch { }
        for (const id of ids) {
            const tr = list.find((x) => x.id === id);
            if (!tr) continue;
            const first = getFirstCoords(tr);
            const coords = first ? [Number(first.lng), Number(first.lat)] : null;
            const centerCoords = [Number(center[1]), Number(center[0])];
            const searchCircle = turfCircle(centerCoords, rad, { steps: 64, units: "kilometers" });
            if (
                coords &&
                Number.isFinite(coords[0]) &&
                Number.isFinite(coords[1]) &&
                booleanIntersects(searchCircle, {
                    type: "Feature",
                    geometry: { type: "Point", coordinates: coords },
                })
            )
                return true;
        }
        return false;
    }

    const transportCircles = useMemo(() => {
        if (!isTransportsOnly) return [];
        if (filters?.map_center || radiusCenter) return getTransportCircles(transportsVisible);
        return [];
    }, [transportsVisible, filters?.map_center, radiusCenter, isTransportsOnly]);

    const circleIntersections = useMemo(() => {
        if (transportCircles.length > 1) return getTransportCircleIntersections(transportCircles);
        return [];
    }, [transportCircles]);

    /* ---------------------- Unified pin event handlers ---------------------- */
    function makePinHandlers({ id, lat, lng, item, map }) {
        return {
            mouseover: (e) => {
                if (process.env.NODE_ENV === "development") {
                    console.log("[PIN mouseover]", { id, lat, lng, ev: e?.latlng });
                }

                if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                }
                try {
                    const mp = e?.target?._map || map;
                    const pt = mp.latLngToContainerPoint(e?.latlng || L.latLng(lat, lng));
                    const rc = mp.getContainer().getBoundingClientRect();
                    const pos = { x: rc.left + pt.x, y: rc.top + pt.y };
                    if (process.env.NODE_ENV === "development") {
                        console.log("[PIN pos computed]", {
                            id,
                            pos,
                            rc: { left: rc.left, top: rc.top },
                        });
                    }
                    const sameId = lastHoverRef.current.id === id;
                    const samePos = lastHoverRef.current.x === pos.x && lastHoverRef.current.y === pos.y;
                    if (!sameId || !samePos) {
                        if (process.env.NODE_ENV === "development") {
                            console.log("[HOVER update]", {
                                id,
                                sameId,
                                samePos,
                                prev: { ...lastHoverRef.current },
                                next: { id, x: pos.x, y: pos.y },
                            });
                        }
                        lastHoverRef.current = { id, x: pos.x, y: pos.y };
                        setPopupPos(pos);
                        setHoveredId(id);
                        setHoveredItem(item);
                        // Ленивое «донаполнение» карточки для главной карты:
                        // если пришли урезанные поля — подтянем полный объект и обновим оверлей.
                        if (!hasOverlayData(item)) {
                            const kind = item?.__kind === "transport" ? "transport" : "order";
                            fetchFullItem(kind, id).then((full) => {
                                if (full && lastHoverRef.current.id === id) {
                                    const merged = { ...item, ...full, __kind: item?.__kind };
                                    setHoveredItem(merged);
                                }
                            });
                        }
                    }
                } catch { }
            },
            mouseout: () => {
                if (process.env.NODE_ENV === "development") {
                    console.log("[PIN mouseout start]", { id });
                }
                if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                }
                hoverTimerRef.current = setTimeout(() => {
                    if (lastHoverRef.current.id === id) {
                        if (process.env.NODE_ENV === "development") {
                            console.log("[HOVER cleared]", {
                                id,
                                lastHover: { ...lastHoverRef.current },
                            });
                        }
                        lastHoverRef.current = { id: null, x: null, y: null };
                        setHoveredId(null);
                        setHoveredItem(null);
                        setPopupPos(null);
                    }
                }, HOVER_HIDE_DELAY);
            },
            click: () => {
                // Если с главной карты передали кастомный обработчик — отдаём ему управление (роутинг).
                if (typeof onPinClick === "function") {
                    try { onPinClick({ id, item }); } catch { }
                } else {
                    // Иначе стандарт: автофокус списка (НЕ двигаем карту!) + убираем hover
                    userDrivenRef.current = true;
                    setClickedItemId(id);
                    setSpiderfied(null);
                }
                if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                }
                lastHoverRef.current = { id: null, x: null, y: null };
                setHoveredId(null);
                setHoveredItem(null);
                setPopupPos(null);
            },
        };
    }

    /* ---------------------- Marker rendering (cluster/pin) ---------------------- */
    function clusterContainsHoveredId(cluster, supercluster, hoveredId) {
        if (!hoveredId || !cluster.properties.cluster) return false;
        try {
            const ids = supercluster.getLeaves(cluster.id, Infinity).map((p) => p.properties.id);
            return ids.includes(hoveredId);
        } catch {
            return false;
        }
    }

    function renderMarker(cluster, idx, map) {
        const [lng, lat] = cluster.geometry.coordinates;
        const isCluster = cluster.properties.cluster;

        if (isCluster) {
            // если spiderfy открыт в этой точке — не дублируем кластер
            if (
                spiderfied &&
                spiderfied.center &&
                Math.abs(spiderfied.center[0] - lat) < 0.00001 &&
                Math.abs(spiderfied.center[1] - lng) < 0.00001
            ) {
                return null;
            }

            let highlight = false;
            if (!isMixed) {
                if (isTransportsOnly) {
                    highlight = clusterContainsIntersectingPin(
                        cluster,
                        supercluster,
                        list,
                        filters,
                        radiusMode,
                        radiusCenter,
                        radius
                    );
                } else if (isOrdersOnly) {
                    highlight = clusterContainsIntersectingOrder(
                        cluster,
                        supercluster,
                        list,
                        filters,
                        radiusMode,
                        radiusCenter,
                        radius
                    );
                }
            }
            const hoveredInCluster = clusterContainsHoveredId(cluster, supercluster, hoveredId);

            return (
                <Marker pane="matches"
                    interactive={!radiusMode}
                    bubblingMouseEvents={false}
                    key={`cluster-${cluster.id}`}
                    position={[lat, lng]}
                    icon={L.divIcon({
                        html: (() => {
                            const count = cluster.properties.point_count;
                            const t = cluster.properties.t || 0;
                            const o = cluster.properties.o || 0;
                            const total = t + o || count || 1;
                            const tDeg = Math.round(360 * (t / total));
                            const gradient = `conic-gradient(#53b7ff 0deg ${tDeg}deg, #ffb020 ${tDeg}deg 360deg)`;
                            const shadow = highlight || hoveredInCluster ? "0 0 22px #43c8ffbb, 0 0 8px #ffd60099" : "0 4px 14px rgba(0,0,0,0.35)";
                            const outer =
                                `width:54px;height:54px;border-radius:50%;background:${gradient};display:flex;align-items:center;justify-content:center;border:4px solid #fff;box-shadow:${shadow};`;
                            const inner =
                                "width:34px;height:34px;border-radius:50%;background:#0b1528;color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;";
                            return `<div style="${outer}"><div style="${inner}">${count}</div></div>`;
                        })(),
                        className:
                            "cluster-marker" + (highlight ? " cluster-intersecting" : "") + (hoveredInCluster ? " cluster-hovered" : ""),
                        iconSize: [54, 54],
                        iconAnchor: [27, 54],
                    })}
                    eventHandlers={radiusMode ? undefined : {
                        click: () => {
                            if (!map) return;
                            const leaves = supercluster.getLeaves(cluster.id, Infinity);
                            const points = leaves.map((p) => [p.geometry.coordinates[1], p.geometry.coordinates[0]]);
                            const isSame = points.every((pt) => pt[0] === points[0][0] && pt[1] === points[0][1]);
                            const base = points[0];
                            const desiredZoom = 13;

                            if (isSame && points.length > 1) {
                                if (map.getZoom() >= desiredZoom) {
                                    const key = `${base[0].toFixed(6)}:${base[1].toFixed(6)}:${points.length}`;
                                    let offsets = spiderfyCache.current[key];
                                    if (!offsets) {
                                        offsets = [];
                                        for (let i = 0; i < points.length; i++) {
                                            const seed =
                                                (base[0] * 100000 + base[1] * 100000 + i * 99991) % 100000;
                                            const angle =
                                                (2 * Math.PI * ((seed % 1000) / 1000) + i * 2.17) % (2 * Math.PI);
                                            const r = 0.0022 + (seed % 23) / 2400 + 0.0013 * (i % 3);
                                            offsets.push([base[0] + Math.cos(angle) * r, base[1] + Math.sin(angle) * r]);
                                        }
                                        spiderfyCache.current[key] = offsets;
                                    }
                                    const markers = leaves.map((p, idx) => ({
                                        ...p.properties,
                                        lat: offsets[idx][0],
                                        lng: offsets[idx][1],
                                    }));
                                    setSpiderfied({ center: base, markers });
                                    return;
                                } else {
                                    setSpiderfied(null);
                                    map.flyTo([base[0], base[1]], desiredZoom, { animate: true, duration: 0.42 });
                                    const onZoom = () => {
                                        map.off("zoomend", onZoom);
                                        if (map.getZoom() >= desiredZoom) {
                                            const key = `${base[0].toFixed(6)}:${base[1].toFixed(6)}:${points.length}`;
                                            let offsets = spiderfyCache.current[key];
                                            if (!offsets) {
                                                offsets = [];
                                                for (let i = 0; i < points.length; i++) {
                                                    const seed =
                                                        (base[0] * 100000 + base[1] * 100000 + i * 99991) % 100000;
                                                    const angle =
                                                        (2 * Math.PI * ((seed % 1000) / 1000) + i * 2.17) % (2 * Math.PI);
                                                    const r = 0.0022 + (seed % 23) / 2400 + 0.0013 * (i % 3);
                                                    offsets.push([
                                                        base[0] + Math.cos(angle) * r,
                                                        base[1] + Math.sin(angle) * r,
                                                    ]);
                                                }
                                                spiderfyCache.current[key] = offsets;
                                            }
                                            const markers = leaves.map((p, idx) => ({
                                                ...p.properties,
                                                lat: offsets[idx][0],
                                                lng: offsets[idx][1],
                                            }));
                                            setSpiderfied({ center: base, markers });
                                        }
                                    };
                                    map.on("zoomend", onZoom);
                                    return;
                                }
                            }
                            setSpiderfied(null);
                            const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(cluster.id), 15);
                            map.flyTo([lat, lng], expansionZoom, { animate: true, duration: 0.3 });
                        },
                    }}
                />
            );
        }

        // обычный пин
        const isTr = isMixed ? cluster?.properties?.__kind === "transport" : isTransportsOnly;
        const item = list.find((x) => x.id === cluster.properties.id) || {};
        return (
            <Marker pane="matches"
                interactive={!radiusMode}
                bubblingMouseEvents={false}
                key={cluster.id || cluster.properties.id || idx}
                position={[lat, lng]}
                icon={L.divIcon({
                    className: "",
                    html: `<div class="pin-wrap${hoveredId === cluster.properties?.id ? " pin-hovered" : ""}">
            <img src="${isTr ? "/truck-blue.png" : "/box.png"}" style="width:32px;height:32px;display:block;"/>
          </div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 32],
                    popupAnchor: [0, -26],
                })}
                eventHandlers={
                    radiusMode
                        ? undefined
                        : makePinHandlers({
                            id: cluster.properties.id,
                            lat,
                            lng,
                            item: { ...item, __kind: isTr ? "transport" : "order" },
                            map,
                        })
                }
            >
                {isTr && cluster.properties.id === myTransportId && (
                    <Tooltip permanent direction="top">
                        <b>{t("map.popup.yourTransport", "Ваш транспорт")}</b>
                    </Tooltip>
                )}
                {!isTr && cluster.properties.id === myOrderId && (
                    <Tooltip permanent direction="top">
                        <b>{t("map.popup.yourCargo", "Ваш груз")}</b>
                    </Tooltip>
                )}
            </Marker>
        );
    }

    function MarkersWithMap() {
        const map = useMap();
        return (
            <>
                {clusters.map((c, i) => renderMarker(c, i, map))}
                {spiderfied &&
                    spiderfied.markers &&
                    spiderfied.markers.map((marker, i) => {
                        const isTr = isMixed ? marker?.__kind === "transport" : isTransportsOnly;
                        return (
                            <Marker pane="matches"
                                interactive={!radiusMode}
                                bubblingMouseEvents={false}
                                key={`spider-${marker.id}-${i}`}
                                position={[marker.lat, marker.lng]}
                                icon={L.divIcon({
                                    className: "",
                                    html: `<div class="pin-wrap${hoveredId === marker.id ? " pin-hovered" : ""}">
                    <img src="${isTr ? "/truck-blue.png" : "/box.png"}" style="width:32px;height:32px;display:block;"/>
                  </div>`,
                                    iconSize: [32, 32],
                                    iconAnchor: [16, 32],
                                    popupAnchor: [0, -26],
                                })}
                                eventHandlers={
                                    radiusMode
                                        ? undefined
                                        : makePinHandlers({
                                            id: marker.id,
                                            lat: marker.lat,
                                            lng: marker.lng,
                                            item: { ...marker, __kind: isTr ? "transport" : "order" },
                                            map,
                                        })
                                }
                            >
                                {isTr && marker.id === myTransportId && (
                                    <Tooltip permanent direction="top">
                                        <b>{t("map.popup.yourTransport", "Ваш транспорт")}</b>
                                    </Tooltip>
                                )}
                                {!isTr && marker.id === myOrderId && (
                                    <Tooltip permanent direction="top">
                                        <b>{t("map.popup.yourCargo", "Ваш груз")}</b>
                                    </Tooltip>
                                )}
                            </Marker>
                        );
                    })}
            </>
        );
    }

    /* ------------------------------ Render ------------------------------ */
    const mapHeight = fullHeight ? "100%" : (isMobile() ? "66vh" : "460px");

    // In Next.js/React 18, the first paint or StrictMode remount can happen before the DOM is fully ready.
    // Defer rendering the actual MapContainer until mounted to prevent TileLayer from touching a missing container.
    if (!mounted) {
        return <div style={{ position: "relative", width: "100%", height: mapHeight, minHeight: 340, minWidth: 250 }} />;
    }

    const handleCountrySelect = (code) => {
        const preset = COUNTRY_PRESETS.find((c) => c.code === code);
        if (!preset) return;
        setSelectedCountry(code);
        userDrivenRef.current = true;
        setMapViewCenter(preset.center);
        setMapZoom(preset.zoom);
        if (leafletMap) {
            try {
                leafletMap.flyTo(preset.center, preset.zoom, { animate: true, duration: 0.45 });
            } catch { }
        }
    };



    return (
        <div style={{ position: "relative", width: "100%", height: mapHeight, minHeight: 340, minWidth: 250 }}>
            {!hideSearch && (
                <>
                    <div
                        style={{
                            position: "absolute",
                            top: isMobile() ? 10 : 20,
                            left: isMobile() ? 10 : 30,
                            zIndex: 1200,
                            width: isMobile() ? "90vw" : 340,
                            maxWidth: "98vw",
                        }}
                    >
                        <LocationAutocomplete
                            onSelect={(coords) => {
                                userDrivenRef.current = true;
                                setMapViewCenter(coords);
                                setMapZoom(isMobile() ? 13 : 12);
                            }}
                        />
                        <div
                            style={{
                                marginTop: 10,
                                background: "rgba(11,21,40,0.9)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 12,
                                padding: "8px 10px",
                                color: "#dbeafe",
                                boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
                            }}
                        >
                            <label style={{ display: "block", fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
                                {t("map.country.label", "Быстрый выбор страны")}
                            </label>
                            <select
                                value={selectedCountry}
                                onChange={(e) => handleCountrySelect(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    background: "rgba(21,31,54,0.9)",
                                    color: "#e2e8f0",
                                    fontSize: 15,
                                    outline: "none",
                                }}
                            >
                                <option value="">{t("map.country.placeholder", "Выберите страну")}</option>
                                {COUNTRY_PRESETS.map((country) => (
                                    <option key={country.code} value={country.code}>
                                        {country.flag} {country.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <RadiusButton radiusMode={radiusMode} setRadiusMode={setRadiusMode} setRadiusCenter={setRadiusCenter} />
                    <ClearRadiusButton
                        filters={filters}
                        radiusCenter={radiusCenter}
                        setFilters={setFilters}
                        setMapViewCenter={setMapViewCenter}
                        setMapZoom={setMapZoom}
                        setRadiusCenter={setRadiusCenter}
                        setRadiusMode={setRadiusMode}
                        setUserDriven={() => {
                            userDrivenRef.current = true;
                        }}
                    />
                    <RadiusOverlay radiusMode={radiusMode} radiusCenter={radiusCenter} />
                    <RadiusPanel
                        radiusMode={radiusMode}
                        radiusCenter={radiusCenter}
                        radius={radius}
                        setRadius={setRadius}
                        setFilters={setFilters}
                        setRadiusMode={setRadiusMode}
                        setRadiusCenter={setRadiusCenter}
                    />
                </>
            )}

            <MapContainer
                center={[52.2, 21.0]}
                zoom={5}
                scrollWheelZoom={true}
                zoomControl={!hideSearch}
                className={radiusMode ? "radius-mode" : undefined}
                style={{
                    height: mapHeight,
                    width: "100%",
                    borderRadius: 18,
                    minHeight: isMobile() ? 300 : 350,
                    minWidth: 250,
                    touchAction: "auto",
                }}
                whenReady={(e) => {
                    setBoundsArr(packBounds(e.target.getBounds()));
                    try {
                        e.target.invalidateSize(true);
                    } catch { }
                    e.target.once("load", () => setTimeout(() => e.target.invalidateSize(true), 0));
                    runInitialFit(e.target);
                }}
                whenCreated={(m) => setLeafletMap(m)}
            >
                <TileLayer
                    key="osm"
                    attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapUpdater />
                <Pane name="your-halo" style={{ zIndex: 250, pointerEvents: "none" }}>{mainPin}</Pane>
                <Pane name="matches" style={{ zIndex: 400 }}><MarkersWithMap /></Pane>

                {(filters?.map_center && filters?.map_radius) && (
                    <Circle
                        center={filters.map_center}
                        radius={filters.map_radius * 1000}
                        pathOptions={{ color: "#43c8ff99", fillColor: "#43c8ff44", fillOpacity: 0.35 }}
                    />
                )}
                {radiusCenter && (
                    <Circle
                        center={radiusCenter}
                        radius={radius * 1000}
                        pathOptions={{ color: "#43c8ff99", fillColor: "#43c8ff44", fillOpacity: 0.35 }}
                    />
                )}

                {((isTransportsOnly || isMixed) && (filters?.map_center || radiusCenter)) && (
                    <>
                        {transportCircles.map((feature, idx) => (
                            <GeoJSON
                                key={`tr-radius-${idx}`}
                                data={feature}
                                style={{
                                    color: "#ffd600",
                                    weight: 2,
                                    fillColor: "#fff59d",
                                    fillOpacity: 0.1,
                                    dashArray: "7 10",
                                }}
                            />
                        ))}
                        {circleIntersections.map((feature, idx) => (
                            <GeoJSON
                                key={`intersection-${idx}`}
                                data={feature}
                                style={{
                                    color: "#ff4477",
                                    weight: 3,
                                    fillColor: "#ff7ea8",
                                    fillOpacity: 0.45,
                                    dashArray: "6 7",
                                }}
                            />
                        ))}
                    </>
                )}
            </MapContainer>


            {/* В режиме радиуса клики по иконкам пинов/теням проходят сквозь к карту */}
            {radiusMode && (
                <style>{`
                  .leaflet-container.radius-mode .leaflet-marker-icon,
                  .leaflet-container.radius-mode .leaflet-marker-shadow {
                    pointer-events: none !important;
                  }
                `}</style>
            )}

            {showLegend && (
                <div
                    style={{
                        position: "absolute",
                        top: isMobile() ? 10 : 16,
                        right: isMobile() ? 10 : 16,
                        zIndex: 1200,
                        display: "flex",
                        justifyContent: "flex-end",
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            background: "rgba(11,21,40,0.85)",
                            backdropFilter: "blur(8px)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 12,
                            padding: "8px 12px",
                            color: "#cfe3ff",
                            fontSize: 12,
                            lineHeight: "16px",
                            boxShadow: "0 4px 14px rgba(0,0,0,.35)",
                            pointerEvents: "auto",
                        }}
                    >
                        {/* Селектор стран — показываем именно на главной, где hideSearch = true */}
                        {hideSearch && (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    marginRight: 8,
                                }}
                            >
                                <span style={{ fontSize: 11, opacity: 0.8 }}>
                                    {t("map.country.label", "Быстрый выбор страны")}
                                </span>
                                <select
                                    value={selectedCountry}
                                    onChange={(e) => handleCountrySelect(e.target.value)}
                                    style={{
                                        minWidth: 150,
                                        maxWidth: 220,
                                        padding: "6px 10px",
                                        borderRadius: 8,
                                        border: "1px solid rgba(148,163,184,0.8)",
                                        background: "rgba(15,23,42,0.95)",
                                        color: "#e2e8f0",
                                        fontSize: 13,
                                        outline: "none",
                                        cursor: "pointer",
                                    }}
                                >
                                    <option value="">
                                        {t("map.country.placeholder", "Выберите страну")}
                                    </option>
                                    {COUNTRY_PRESETS.map((country) => (
                                        <option key={country.code} value={country.code}>
                                            {country.flag} {country.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Легенда Транспорт / Груз */}
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: 10,
                                        height: 10,
                                        borderRadius: 999,
                                        background: "#53b7ff",
                                    }}
                                />
                                {t("map.legend.transport", "Транспорт")}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: 10,
                                        height: 10,
                                        borderRadius: 999,
                                        background: "#ffb020",
                                    }}
                                />
                                {t("map.legend.cargo", "Груз")}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Overlay */}
            {/* Overlay — через портал, чтобы не пропадал на главной из-за stacking-context */}
            {hoveredItem && popupPos && typeof popupPos.x === "number" && typeof popupPos.y === "number" && (
                (typeof document !== "undefined") &&
                ReactDOM.createPortal(
                    <div
                        className="map-hover-overlay"
                        style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}
                    >
                        <MapPinOverlay
                            item={hoveredItem}
                            pos={popupPos}
                            type={hoveredItem?.__kind === "transport" ? "transport" : "order"}
                        />
                    </div>,
                    document.getElementById("modal-root") || document.body
                )
            )}
        </div>
    );
}
