import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import LocationAutocomplete from "./LocationAutocomplete";
import { useMap, useMapEvents } from "react-leaflet";
import { useLang } from "../i18n/LangProvider";

// Dynamic imports для SSR
const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(mod => mod.Marker), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then(mod => mod.Circle), { ssr: false });


function ClickableMap({ onMapClick }) {
    useMapEvents({
        click(e) {
            onMapClick(e);
        },
    });
    return null;
}

function MapViewUpdater({ center, zoom }) {
    const map = useMap();

    useEffect(() => {
        if (!map || !Array.isArray(center) || center.length !== 2) return;
        try {
            map.setView(center, zoom, { animate: true });
        } catch { }
    }, [map, center?.[0], center?.[1], zoom]);

    return null;
}

// --- Хук для определения мобилки ---
function useIsMobile() {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 700;
}

/**
 * @param {{
 *   open: boolean,
 *   onSelect: function,
 *   onClose: function,
 *   pins?: { coords: [number, number], id?: string, label?: string }[]
 * }} props
 */
export default function MapFilterModal({ open, onSelect, onClose, onOpenChange, filters, setFilters, pins = [] }) {
    const { t } = useLang();
    useEffect(() => {
        // Импортируем fix только на клиенте
        import("../leaflet-fix");
    }, []);

    const isMobile = typeof window !== "undefined" && window.innerWidth < 700;
    const [center, setCenter] = useState([41.7151, 44.8271]); // Тбилиси
    const [radius, setRadius] = useState(200);
    const [selected, setSelected] = useState(null);

    if (!open) return null;

    function handleAutocompleteSelect(coords, name) {
        setSelected(coords);
        setCenter(coords);
    }

    function handleMapClick(e) {
        setSelected([e.latlng.lat, e.latlng.lng]);
        setCenter([e.latlng.lat, e.latlng.lng]);
    }

    // --- Стили, зависящие от устройства ---
    const modalWidth = isMobile ? "98vw" : 520;
    const mapHeight = isMobile ? "56vh" : 320; // x1.5 от ~320
    const mapWidth = isMobile ? "98vw" : 500;
    const radiusInputStyle = isMobile
        ? { width: 80, fontSize: 19, padding: "11px 14px", borderRadius: 12, border: "1.5px solid #234", background: "#202945", color: "#e3f2fd", marginRight: 7 }
        : { width: 80, fontSize: 15, padding: "7px 12px", borderRadius: 8, border: "1.2px solid #234", background: "#19223A", color: "#e3f2fd", marginRight: 7 };
    const buttonStyle = isMobile
        ? { background: "#222a38", color: "#e3f2fd", border: 0, borderRadius: 12, padding: "14px 26px", fontWeight: 700, fontSize: 18, marginLeft: 6, cursor: "pointer" }
        : { background: "#222a38", color: "#e3f2fd", border: 0, borderRadius: 8, padding: "7px 16px", fontWeight: 600, marginLeft: 6, cursor: "pointer" };

    return (
        <div style={{
            position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", zIndex: 10000,
            background: "rgba(15,25,40,0.88)", display: "flex", alignItems: "center", justifyContent: "center"
        }}>
            <div style={{
                width: modalWidth, background: "#16213a", borderRadius: isMobile ? 0 : 16, padding: 0, boxShadow: "0 4px 32px #001a345a",
                minHeight: isMobile ? "100vh" : undefined, maxHeight: isMobile ? "100vh" : undefined, overflow: "hidden"
            }}>
                <div style={{
                    padding: isMobile ? "14px 16px 7px 16px" : "17px 22px 8px 22px",
                    borderBottom: "1px solid #223b52",
                    fontWeight: 700, fontSize: isMobile ? 17 : 18, color: "#43c8ff"
                }}>
                    {t("map.filter.header", "Фильтр по радиусу — выберите локацию или кликните на карте")}
                </div>
                <div style={{ padding: isMobile ? "12px 16px 2px 16px" : "14px 22px 2px 22px" }}>
                    <LocationAutocomplete onSelect={handleAutocompleteSelect} />
                </div>
                <div style={{ width: mapWidth, height: mapHeight, margin: isMobile ? "0 auto" : undefined }}>
                    <MapContainer
                        center={center}
                        zoom={selected ? 10 : 6}
                        style={{ width: "100%", height: "100%", borderRadius: 16 }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <ClickableMap onMapClick={handleMapClick} />

                        {/* Отрисовываем все пины (заявки/транспорт) */}
                        {Array.isArray(pins) && pins.map(pin =>
                            pin.coords &&
                            <Marker
                                key={pin.id || (pin.coords[0] + "_" + pin.coords[1])}
                                position={pin.coords}
                            // можно popup добавить по желанию
                            />
                        )}

                        <MapViewUpdater center={center} zoom={selected ? 10 : 6} />

                        {selected && (
                            <>
                                <Marker position={selected} />
                                <Circle center={selected} radius={radius * 1000} pathOptions={{ color: "#43c8ff88" }} />
                            </>
                        )}
                    </MapContainer>
                </div>
                <div style={{
                    display: "flex", alignItems: "center", gap: isMobile ? 10 : 8,
                    padding: isMobile ? "13px 12px 19px 12px" : "12px 22px 18px 22px",
                    flexDirection: isMobile ? "column" : "row"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 13 : 8, width: isMobile ? "100%" : undefined }}>
                        <span style={{ color: "#e3f2fd", fontSize: isMobile ? 17 : undefined }}>
                            {t("map.radius.label", "Радиус:")}
                        </span>
                        {isMobile ? (
                            <input
                                type="range"
                                min={5}
                                max={1000}
                                step={5}
                                value={radius}
                                onChange={e => setRadius(Number(e.target.value))}
                                style={{
                                    width: 160, marginRight: 12,
                                    accentColor: "#43c8ff"
                                }}
                            />
                        ) : null}
                        <input
                            type="number"
                            min={5}
                            max={1000}
                            step={5}
                            value={radius}
                            onChange={e => setRadius(Number(e.target.value))}
                            style={radiusInputStyle}
                        />
                        <span style={{ color: "#8ecae6", fontSize: isMobile ? 17 : undefined }}>
                            {t("units.km", "км")}
                        </span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: "flex", gap: isMobile ? 0 : 6, width: isMobile ? "100%" : undefined }}>
                        <button
                            onClick={() => (onOpenChange ? onOpenChange(false) : onClose && onClose())}
                            style={buttonStyle}
                        >{t("common.cancel", "Отмена")}</button>
                        <button
                            disabled={!selected}
                            onClick={() => {
                                if (!selected) return;
                                // ✅ сразу применяем фильтр к глобальным фильтрам
                                try { setFilters && setFilters(prev => ({ ...prev, map_center: selected, map_radius: radius })); } catch { }
                                // обратная совместимость
                                try { onSelect && onSelect(selected, radius); } catch { }
                                // закрыть модалку
                                try { (onOpenChange ? onOpenChange(false) : onClose && onClose()); } catch { }
                            }}
                            style={{
                                ...buttonStyle,
                                background: selected
                                    ? "linear-gradient(90deg, #1e88e5 0%, #43c8ff 100%)"
                                    : "#234",
                                color: "#fff",
                                fontWeight: 700,
                                marginLeft: isMobile ? 0 : 6,
                                opacity: selected ? 1 : 0.8,
                                cursor: selected ? "pointer" : "not-allowed"
                            }}
                        >{t("common.save", "Сохранить")}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
