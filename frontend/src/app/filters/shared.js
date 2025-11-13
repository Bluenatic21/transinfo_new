// Общие функции нормализации/денормализации фильтров
// Используются и на мобильной, и на десктопной версиях.

export function place(p) {
    if (!p) return "";
    if (typeof p === "string") return p;
    return p.formatted || [p.city, p.region, p.country].filter(Boolean).join(", ");
}

export function num(x) {
    if (x === "" || x == null) return null;
    const n = Number(String(x).replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

// Приводим дату к YYYY-MM-DD (поддержка dd.mm.yyyy, dd/mm/yyyy, mm/dd/yyyy)
export function isoDate(v) {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    let m = String(v).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) {
        const [, d, mo, y] = m;
        const pad = (x) => String(x).padStart(2, "0");
        return `${y}-${pad(mo)}-${pad(d)}`;
    }
    m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const [, mo, d, y] = m;
        const pad = (x) => String(x).padStart(2, "0");
        return `${y}-${pad(mo)}-${pad(d)}`;
    }
    const dt = new Date(v);
    return isNaN(dt) ? String(v) : dt.toISOString().slice(0, 10);
}

// Приводим разные входные ключи к единому локальному виду
export function normalize(raw = {}, type) {
    const isTransport = type === "transport";
    const fromValue = raw.from_location || raw.from || raw.origin || raw.start || raw.source || null;
    const toCandidate = Array.isArray(raw.to_locations) ? raw.to_locations[0] : (raw.to_location || raw.to || null);
    return {
        from: place(fromValue),
        to: place(toCandidate),
        dateFrom: isTransport ? (raw.ready_date_from || raw.dateFrom || "") : (raw.load_date_from || raw.dateFrom || ""),
        dateTo: isTransport ? (raw.ready_date_to || raw.dateTo || "") : (raw.load_date_to || raw.dateTo || ""),
        weightMin: isTransport ? (raw.weight ?? raw.capacity_weight_min ?? null) : (raw.weightMin ?? null),
        weightMax: isTransport ? null : (raw.weightMax ?? null),
        volumeMin: isTransport ? (raw.volume ?? raw.capacity_volume_min ?? null) : (raw.volumeMin ?? null),
        volumeMax: isTransport ? null : (raw.volumeMax ?? null),
        vehicleType: isTransport ? (raw.transport_kind || raw.vehicleType || "") : "",
        bodyType: raw.truck_type || raw.bodyType || "",
        loadType: !isTransport ? (Array.isArray(raw.loading_types) ? raw.loading_types.join(", ") : (raw.loadType || "")) : "",
        adr: !!(raw.adr || raw.ADR || raw.danger),
    };
}

// Переводим локальные значения к тем, что ждёт API
export function denormalize(n, type) {
    const out = {};
    const isTransport = type === "transport";

    if (n.from) out.from_location = n.from;
    if (n.to) out.to_location = n.to;

    const R = 120; // км, дефолтный радиус
    if (Array.isArray(n.fromCoords)) {
        out.from_location_lat = n.fromCoords[0];
        out.from_location_lng = n.fromCoords[1];
        out.from_radius = out.from_radius ?? R;
    }
    if (Array.isArray(n.toCoords)) {
        out.to_location_lat = n.toCoords[0];
        out.to_location_lng = n.toCoords[1];
        out.to_radius = out.to_radius ?? R;
    }

    if (n.dateFrom) out[isTransport ? "ready_date_from" : "load_date_from"] = isoDate(n.dateFrom);
    if (n.dateTo) out[isTransport ? "ready_date_to" : "load_date_to"] = isoDate(n.dateTo);

    if (isTransport) {
        if (n.weightMin != null) out.weight = n.weightMin;
        if (n.volumeMin != null) out.volume = n.volumeMin;
        if (n.vehicleType) out.transport_kind = n.vehicleType;
        if (n.bodyType) out.truck_type = n.bodyType;
        if (n.adr != null) out.adr = n.adr;
    } else {
        if (n.bodyType) out.truck_type = n.bodyType;
        if (n.loadType) out.loading_types = n.loadType;
        if (n.priceMin != null) out.price_from = n.priceMin;
        if (n.priceMax != null) out.price_to = n.priceMax;
    }
    return out;
}

export function countActive(n) {
    let c = 0;
    Object.entries(n).forEach(([k, v]) => {
        if (["vehicleType", "bodyType", "cargoType", "loadType", "currency", "from", "to"].includes(k)) {
            if (v && String(v).trim() !== "") c++;
        } else if (typeof v === "boolean") {
            if (v) c++;
        } else if (v != null && v !== "") {
            c++;
        }
    });
    return c;
}
