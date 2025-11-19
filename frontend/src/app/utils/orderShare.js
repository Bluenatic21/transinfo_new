import { abs } from "@/config/env";
import { getTruckBodyTypes } from "@/app/components/truckOptions";

const defaultT = (key, fallback) => fallback || key;

function flattenTruckBodyTypes(options = []) {
    const flat = [];
    for (const opt of options) {
        if (!opt) continue;
        if (opt.children) {
            flat.push(...flattenTruckBodyTypes(opt.children));
        } else {
            flat.push(opt);
        }
    }
    return flat;
}

export function resolveTruckBodyLabel(value, t = defaultT) {
    if (!value) return "";
    const bodies = getTruckBodyTypes(t) || [];
    const flat = flattenTruckBodyTypes(bodies);
    const needle = String(value).trim().toLowerCase();
    const found = flat.find((opt) => String(opt?.value || "").trim().toLowerCase() === needle);
    return found?.label || value;
}

function pickMainCargo(order) {
    if (!order) return {};
    if (Array.isArray(order.cargo_items) && order.cargo_items.length > 0) {
        return order.cargo_items[0] || {};
    }
    if (order.cargo || order.weight || order.volume) {
        return { name: order.cargo, tons: order.weight, volume: order.volume };
    }
    return {};
}

function joinLocations(raw) {
    if (!raw) return "";
    if (Array.isArray(raw)) {
        return raw.filter(Boolean).join(", ");
    }
    return String(raw);
}

export function buildOrderSharePayload(order, { t = defaultT } = {}) {
    const safeOrder = order || {};
    const id = safeOrder.id || safeOrder.order_id || "";
    const baseUrl = id ? abs(`/orders/${id}`) : abs("/orders");
    const titlePrefix = t("share.orderPrefix", "Заявка №");
    const fallbackTitle = t("share.orderTitleShort", "Заявка на Transinfo");
    const title = id ? `${titlePrefix}${id}` : fallbackTitle;

    const from = joinLocations(
        Array.isArray(safeOrder.from_locations) && safeOrder.from_locations.length
            ? safeOrder.from_locations
            : safeOrder.from_location
    );
    const to = joinLocations(
        Array.isArray(safeOrder.to_locations) && safeOrder.to_locations.length
            ? safeOrder.to_locations
            : safeOrder.to_location
    );

    const truckLabel = safeOrder.truck_type ? resolveTruckBodyLabel(safeOrder.truck_type, t) : "";
    const mainCargo = pickMainCargo(safeOrder);
    const tons = mainCargo?.tons || safeOrder.weight || safeOrder.tons;
    const tonUnit = t("unit.t", "т");
    const weight = tons ? `${tons} ${tonUnit}` : "";

    const summaryParts = [];
    if (from) summaryParts.push(`${t("share.origin", "Откуда")}: ${from}`);
    if (to) summaryParts.push(`${t("share.destination", "Куда")}: ${to}`);
    if (truckLabel) summaryParts.push(`${t("share.bodyType", "Тип кузова")}: ${truckLabel}`);
    if (weight) summaryParts.push(`${t("share.weight", "Вес")}: ${weight}`);

    const text = summaryParts.join(" • ");
    const description = text || t("share.defaultDescription", "Заявка на Transinfo со всеми деталями");
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