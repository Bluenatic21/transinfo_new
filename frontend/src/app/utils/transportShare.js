import { abs } from "@/config/env";
import { resolveTruckBodyLabel } from "@/app/utils/orderShare";

const defaultT = (key, fallback) => fallback || key;

function joinLocations(raw) {
    if (!raw) return "";
    if (Array.isArray(raw)) {
        return raw
            .map((item) => {
                if (!item) return "";
                if (typeof item === "string") return item;
                if (typeof item === "object") return item.location || item.name || "";
                return String(item);
            })
            .filter(Boolean)
            .join(", ");
    }
    if (typeof raw === "object") return raw.location || raw.name || "";
    return String(raw);
}

export function buildTransportSharePayload(transport, { t = defaultT } = {}) {
    const safe = transport || {};
    const id = safe.id || safe.transport_id || "";
    const baseUrl = id ? abs(`/transport/${id}`) : abs("/transport");
    const titlePrefix = t("share.transportPrefix", "Транспорт №");
    const fallbackTitle = t("share.transportTitleShort", "Транспорт на Transinfo");
    const title = id ? `${titlePrefix}${id}` : fallbackTitle;

    const from = joinLocations(
        Array.isArray(safe.from_locations) && safe.from_locations.length
            ? safe.from_locations
            : safe.from_location
    );
    const to = joinLocations(
        Array.isArray(safe.to_locations) && safe.to_locations.length
            ? safe.to_locations
            : safe.to_location
    );

    const truckLabel = safe.truck_type ? resolveTruckBodyLabel(safe.truck_type, t) : "";
    const tons = safe.weight || safe.tons;
    const tonUnit = t("unit.t", "т");
    const weight = tons ? `${tons} ${tonUnit}` : "";

    const summaryParts = [];
    if (from) summaryParts.push(`${t("share.origin", "Откуда")}: ${from}`);
    if (to) summaryParts.push(`${t("share.destination", "Куда")}: ${to}`);
    if (truckLabel) summaryParts.push(`${t("share.bodyType", "Тип кузова")}: ${truckLabel}`);
    if (weight) summaryParts.push(`${t("share.weight", "Вес")}: ${weight}`);

    const text = summaryParts.join(" • ");
    const description = text || t("share.transportDefaultDescription", "Транспорт на Transinfo со всеми деталями");
    const copyText = [title, text, baseUrl].filter(Boolean).join("\n");
    const message = [title, text].filter(Boolean).join(" – ");

    return {
        url: baseUrl,
        title,
        text,
        summaryParts,
        copyText,
        description,
        metaDescription: description,
        from,
        to,
        truckLabel,
        weight,
        message,
    };
}