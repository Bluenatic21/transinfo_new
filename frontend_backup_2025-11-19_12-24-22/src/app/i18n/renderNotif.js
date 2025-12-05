import { getTruckBodyTypes, getTransportKindOptions, localizeRegularity, localizeRegularityMode } from "../components/truckOptions";

function localizeTruckBody(t, val) {
    const list = getTruckBodyTypes(t) || [];
    const flat = [];
    for (const opt of list) {
        if (opt?.children) flat.push(...opt.children);
        else flat.push(opt);
    }
    const v = String(val || "").trim().toLowerCase();
    const found = flat.find(o => String(o?.value || "").trim().toLowerCase() === v);
    if (found?.label) return found.label;
    // эвристики на случай синонимов
    if (v.includes("тент")) return t("truck.body.tent", "Тентованный");
    if (v.includes("реф")) return t("truck.body.refrigerator", "Рефрижератор");
    if (v.includes("изотерм")) return t("truck.body.isotherm", "Изотермический");
    if (v.includes("борт")) return t("truck.body.board", "Бортовой");
    return val ?? "";
}

function localizeKind(t, val) {
    const list = getTransportKindOptions(t) || [];
    const v = String(val || "").trim().toLowerCase();
    const found = list.find(o => String(o?.value || "").trim().toLowerCase() === v);
    return found?.label || val || "";
}

function localizePeriodText(t, raw) {
    if (!raw) return "";
    const s = String(raw).trim();
    if (/^none\s*[—-]\s*none$/i.test(s)) return ""; // скрыть мусор
    const parts = s.split(",").map(p => p.trim()).filter(Boolean);
    const loc = (p) => {
        const m = localizeRegularityMode(t, p);
        if (m && m !== p) return m;
        const r = localizeRegularity(t, p);
        return r || p;
    };
    return parts.length > 1 ? parts.map(loc).join(", ") : loc(s);
}

export function renderNotif(raw, t) {
    if (!raw) return "";
    const s = String(raw);
    const parts = s.split("|");
    const key = parts[0] || "";
    if (parts.length === 1) {
        return t(key, key);
    }
    let params = {};
    let fallback = parts.slice(1).join("|");
    try {
        params = JSON.parse(parts[1] || "{}");
        fallback = parts[2] || "";
    } catch (_) { /* совместимость со старым форматом */ }

    // локализация значений, приходящих в параметрах
    if (params) {
        const k1 = params.truckType ?? params.truck_type ?? params.body ?? params.body_type;
        if (k1) params.truckType = localizeTruckBody(t, k1);
        const k2 = params.transportKind ?? params.kind ?? params.transport_kind;
        if (k2) params.transportKind = localizeKind(t, k2);
        if (typeof params.period === "string") {
            params.period = localizePeriodText(t, params.period);
        }
    }

    const template = t(key, fallback || key);
    return template.replace(/\{(\w+)\}/g, (_, k) => (params?.[k] ?? `{${k}}`));
}
