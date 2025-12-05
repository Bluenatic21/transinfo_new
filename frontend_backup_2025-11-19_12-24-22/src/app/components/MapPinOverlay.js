// components/MapPinOverlay.js
"use client";
import { motion } from "framer-motion";
import { useLang } from "../i18n/LangProvider";
import {
    getTruckBodyTypes,
    getTransportKindOptions,
    localizeRegularity,
    localizeRegularityMode
} from "./truckOptions";
import { useMemo } from "react";

export default function MapPinOverlay({ item, pos, type }) {
    if (!item || !pos) return null;
    const { t } = useLang();

    // Централизованные словари (локализованные)
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const KIND_OPTS = useMemo(() => getTransportKindOptions(t), [t]);
    const labelByValue = (opts, raw) => {
        if (!raw) return "";
        const v = String(raw).trim().toLowerCase();
        const hit = (opts || []).find(o => String(o.value || "").toLowerCase() === v);
        return hit ? hit.label : raw;
    };


    // --- Локация (откуда)
    // Для транспорта: from_location или from_locations[0] или item.from
    // Для груза: from_location или from_locations[0] или item.from
    const location =
        item.from_location ||
        (Array.isArray(item.from_locations) && item.from_locations[0]) ||
        item.from ||
        (item.from_locations && typeof item.from_locations === "string" ? item.from_locations : null);

    // Данные для транспорта
    const transportBody = item.truck_type
        ? labelByValue(BODY_TYPES, item.truck_type)                      // «тентованный» → локализованный лейбл
        : (item.transport_kind ? labelByValue(KIND_OPTS, item.transport_kind) : null);
    const transportReady = (item.ready_date_from || item.ready_date_to)
        ? [
            item.ready_date_from && `${t("date.from.short", "с")} ${item.ready_date_from}`,
            item.ready_date_to && `${t("date.to.short", "до")} ${item.ready_date_to}`
        ].filter(Boolean).join(" ")
        : (item.mode ? localizeRegularityMode(t, item.mode) : null);

    // Данные для груза
    const cargoName = (item.cargo_items && item.cargo_items[0]?.name) || item.title || null;
    const cargoBody = item.truck_type ? labelByValue(BODY_TYPES, item.truck_type) : null;
    const cargoDate = item.load_date || null;

    // Тип определяем по prop type (transport/order) или по структуре
    const isTransport = type === "transport" || item.transport_kind || item.ready_date_from || item.mode;

    // Стилизация — fixed, огромный z-index, не мешает мыши
    const overlay = (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 340, damping: 22 }}
            style={{
                position: "fixed",
                left: pos.x + 42,
                top: pos.y - 64,
                background: "rgba(29,34,48,0.94)",
                border: "1.3px solid #43c8ff",
                borderRadius: 16,
                minWidth: 202,
                maxWidth: 320,
                padding: "16px 22px 13px 18px",
                boxShadow: "0 8px 36px #222a",
                color: "#fff",
                zIndex: 2147483647, // максимальный
                pointerEvents: "none", // чтобы не мешать мыши!
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.48,
                userSelect: "none",
                backdropFilter: "blur(2px)",
            }}
        >
            {isTransport ? (
                <>
                    {transportBody && (
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#ffe77a", marginBottom: 4 }}>
                            {transportBody}
                        </div>
                    )}
                    {transportReady && (
                        <div style={{ color: "#8ecae6", fontWeight: 600, fontSize: 15 }}>
                            {transportReady}
                        </div>
                    )}
                    {location && (
                        <div style={{ color: "#ccd2e6", fontWeight: 500, fontSize: 14, marginTop: 5, opacity: 0.84 }}>
                            <span style={{ marginRight: 5, opacity: 0.7 }}>📍</span>
                            {location}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {cargoName && (
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#43c8ff", marginBottom: 4 }}>
                            {cargoName}
                        </div>
                    )}
                    {cargoBody && (
                        <div style={{ color: "#ffe77a", fontWeight: 600, fontSize: 15 }}>{cargoBody}</div>
                    )}
                    {cargoDate && (
                        <div style={{ color: "#8ecae6", fontWeight: 600, fontSize: 15 }}>
                            {cargoDate}
                        </div>
                    )}
                    {location && (
                        <div style={{ color: "#ccd2e6", fontWeight: 500, fontSize: 14, marginTop: 5, opacity: 0.84 }}>
                            <span style={{ marginRight: 5, opacity: 0.7 }}>📍</span>
                            {location}
                        </div>
                    )}
                </>
            )}
        </motion.div>
    );
    // Рендерим инлайн: SimpleMap уже даёт фиксированный слой поверх карты
    return overlay;
}
