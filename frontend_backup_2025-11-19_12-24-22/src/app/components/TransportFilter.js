"use client";
import React, { useState, useRef, useEffect } from "react";
import LocationAutocomplete from "./LocationAutocomplete";
import { LOADING_TYPES, getLoadingTypes, getTruckBodyTypes, getTransportKindOptions } from "./truckOptions";
import DateInput from "./DateInput";
import { useLang } from "../i18n/LangProvider";


// --- КАСТОМНЫЙ ДРОПДАУН для типа кузова ---
function TruckTypeDropdown({ value, onChange, options }) {
    const { t } = useLang();
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const ref = React.useRef(null);

    React.useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    const filtered = React.useMemo(() => {
        if (!search) return options;
        const lower = search.toLowerCase();
        return options
            .map(opt => {
                if (opt.children) {
                    const ch = opt.children.filter(c => c.label.toLowerCase().includes(lower));
                    if (ch.length) return { ...opt, children: ch };
                    if (opt.label.toLowerCase().includes(lower)) return opt;
                    return null;
                }
                if (opt.label.toLowerCase().includes(lower)) return opt;
                return null;
            })
            .filter(Boolean);
    }, [search, options]);

    function renderOpt(opt) {
        if (opt.children) {
            return (
                <div key={opt.label}
                    style={{
                        fontWeight: 600,
                        margin: "6px 0 2px 0",
                        color: "#2dc7ff"
                    }}>
                    {opt.label}
                    <div style={{ marginLeft: 14 }}>
                        {opt.children.map(ch => renderOpt(ch))}
                    </div>
                </div>
            );
        }
        return (
            <div
                key={opt.value}
                onMouseDown={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                style={{
                    padding: "7px 12px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: value === opt.value ? "#1b4e81" : "none",
                    color: value === opt.value ? "#ffd600" : "#e3f2fd",
                    marginBottom: 2,
                    fontWeight: value === opt.value ? 600 : 400,
                    outline: "none",
                    border: "none"
                }}
            >
                {opt.label}
            </div>
        );
    }

    return (
        <div ref={ref} style={{ position: "relative", minWidth: 180, width: 180, marginBottom: 0 }}>
            <div
                tabIndex={0}
                style={{
                    border: "1.5px solid #244e78",
                    borderRadius: 8,
                    padding: "9px 15px",
                    fontSize: 16,
                    background: "#1e2746",
                    color: value ? "#ffd600" : "#b0bcdc",
                    cursor: "pointer",
                    minHeight: 38,
                    transition: "border 0.14s",
                    outline: "none",
                    userSelect: "none",
                    height: 38,
                    display: "flex",
                    alignItems: "center",
                    position: "relative"
                }}
                onClick={() => setOpen(v => !v)}
            >
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {options.find(o => o.value === value)?.label || t("order.selectTruckType", "Тип кузова")}
                </span>
                {value && (
                    <span
                        style={{
                            marginLeft: 8,
                            fontSize: 22,
                            color: "#fa7373",
                            cursor: "pointer",
                            fontWeight: 700,
                            userSelect: "none"
                        }}
                        onClick={e => {
                            e.stopPropagation(); // чтобы не открывал дропдаун!
                            onChange("");
                        }}
                        title={t("common.clear", "Сбросить")}
                    >
                        ×
                    </span>
                )}
            </div>
            {open && (
                <div style={{
                    position: "absolute",
                    zIndex: 99,
                    left: 0,
                    top: 41,
                    background: "#202e4a",
                    border: "1.5px solid #244e78",
                    borderRadius: 9,
                    minWidth: "100%",
                    maxHeight: 320,
                    overflowY: "auto",
                    padding: 7,
                }}>
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t("common.search", "Поиск...")}
                        style={{
                            width: "97%",
                            borderRadius: 6,
                            border: "1px solid #294c7a",
                            padding: "7px 10px",
                            fontSize: 15,
                            marginBottom: 8,
                            color: "#e3f2fd",
                            background: "#192337"
                        }}
                    />
                    {filtered.length
                        ? filtered.map(opt => renderOpt(opt))
                        : <div style={{ color: "#ffd600", padding: 6 }}>{t("common.noMatches", "Нет соответствий")}</div>
                    }
                </div>
            )}
        </div>
    );
}

function TransportKindDropdown({ value, onChange, options }) {
    const { t } = useLang();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    return (
        <div ref={ref} style={{ position: "relative", minWidth: 180, width: 180, marginBottom: 0 }}>
            <div
                tabIndex={0}
                style={{
                    border: "1.5px solid #244e78",
                    borderRadius: 8,
                    padding: "9px 15px",
                    fontSize: 16,
                    background: "#1e2746",
                    color: value ? "#ffd600" : "#b0bcdc",
                    cursor: "pointer",
                    minHeight: 38,
                    transition: "border 0.14s",
                    outline: "none",
                    userSelect: "none",
                    height: 38,
                    display: "flex",
                    alignItems: "center",
                    position: "relative"
                }}
                onClick={() => setOpen(v => !v)}
            >
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {options.find(o => o.value === value)?.label || t("transport.kind", "Тип транспорта")}
                </span>
                {value && (
                    <span
                        style={{
                            marginLeft: 8,
                            fontSize: 22,
                            color: "#fa7373",
                            cursor: "pointer",
                            fontWeight: 700,
                            userSelect: "none"
                        }}
                        onClick={e => {
                            e.stopPropagation();
                            onChange("");
                        }}
                        title={t("common.clear", "Сбросить")}
                    >
                        ×
                    </span>
                )}
            </div>
            {open && (
                <div style={{
                    position: "absolute",
                    zIndex: 99,
                    left: 0,
                    top: 41,
                    background: "#202e4a",
                    border: "1.5px solid #244e78",
                    borderRadius: 9,
                    minWidth: "100%",
                    maxHeight: 320,
                    overflowY: "auto",
                    padding: 7,
                }}>
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            onMouseDown={() => { onChange(opt.value); setOpen(false); }}
                            style={{
                                padding: "7px 12px",
                                borderRadius: 7,
                                cursor: "pointer",
                                background: value === opt.value ? "#1b4e81" : "none",
                                color: value === opt.value ? "#ffd600" : "#e3f2fd",
                                marginBottom: 2,
                                fontWeight: value === opt.value ? 600 : 400,
                                outline: "none",
                                border: "none"
                            }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// --- МУЛЬТИСЕЛЕКТ ДЛЯ ВИДОВ ЗАГРУЗКИ ---
function LoadingTypeDropdown({ value, onChange, options, i18nMap }) {
    const { t } = useLang();
    const [opened, setOpened] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const ref = React.useRef(null);

    React.useEffect(() => {
        const close = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpened(false);
        };
        if (opened) document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [opened]);

    const list = options.map(opt => ({ value: opt, label: (i18nMap?.get(opt) || opt) }));
    const filtered = list.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));

    return (
        <div ref={ref} style={{ position: "relative", minWidth: 180, width: 180, marginBottom: 0 }}>
            <div
                style={{
                    minHeight: 38,
                    height: 38,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 7,
                    alignItems: "center",
                    background: "#1e2746",
                    border: "1.5px solid #244e78",
                    borderRadius: 7,
                    padding: "7px 12px",
                    cursor: "pointer"
                }}
                onClick={() => setOpened(v => !v)}
            >
                {(!value || value.length === 0) && <span style={{ color: "#a8b9d7" }}>{t("order.loadingTypes", "Вид(ы) загрузки")}</span>}
                {value && value.length > 0 && (
                    <div style={{
                        display: "flex",
                        flexWrap: "nowrap",
                        overflowX: "auto",
                        gap: 7,
                        maxWidth: 320,
                        minHeight: 30,
                        alignItems: "center",
                        padding: "1px 0"
                    }}>
                        {value.map(v => (
                            <span key={v} style={{
                                background: "#265b9c",
                                color: "#b4e1fd",
                                borderRadius: 7,
                                padding: "2px 10px 2px 9px",
                                fontSize: 15,
                                display: "flex",
                                alignItems: "center",
                                whiteSpace: "nowrap"
                            }}>
                                {i18nMap?.get(v) || v}
                                <span
                                    style={{
                                        marginLeft: 7,
                                        cursor: "pointer",
                                        color: "#b6b6b6",
                                        fontSize: 16
                                    }}
                                    onClick={e => {
                                        e.stopPropagation();
                                        onChange(value.filter(x => x !== v));
                                    }}
                                >×</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>
            {opened && (
                <div
                    style={{
                        position: "absolute",
                        zIndex: 20,
                        background: "#202e4a",
                        border: "1.5px solid #244e78",
                        borderRadius: 10,
                        boxShadow: "0 2px 20px #193364cc",
                        marginTop: 3,
                        width: "100%",
                        maxHeight: 230,
                        overflowY: "auto"
                    }}
                >
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t("common.search", "Поиск…")}
                        style={{
                            width: "100%",
                            background: "#192337",
                            color: "#b6d0e8",
                            border: "none",
                            outline: "none",
                            borderRadius: "10px 10px 0 0",
                            fontSize: 15,
                            padding: "8px 12px",
                            boxSizing: "border-box"
                        }}
                    />
                    {filtered.length === 0 && (
                        <div style={{ color: "#b6b6b6", padding: 10 }}>{t("common.noOptions", "Нет вариантов")}</div>
                    )}
                    {filtered.map(opt => (
                        <label key={opt.value} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "8px 12px",
                            cursor: "pointer",
                            background: value && value.includes(opt.value) ? "#265b9c44" : "",
                            fontWeight: value && value.includes(opt.value) ? 700 : 400,
                            color: value && value.includes(opt.value) ? "#b4e1fd" : "#e3f2fd"
                        }}>
                            <input
                                type="checkbox"
                                checked={!!(value && value.includes(opt.value))}
                                style={{ accentColor: "#2dc7ff" }}
                                onChange={() => {
                                    if (value && value.includes(opt.value)) onChange(value.filter(x => x !== opt.value));
                                    else onChange([...(value || []), opt.value]);
                                }}
                            />
                            {opt.label}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function TransportFilter({ filters, setFilters, fetchTransports, handleResetFilters }) {
    // i18n
    const { t } = useLang();
    // Локализованные подписи, значения — RU
    const TRUCK_BODY_OPTS = React.useMemo(() => getTruckBodyTypes(t), [t]);
    const TRANSPORT_KIND_OPTS = React.useMemo(() => getTransportKindOptions(t), [t]);
    const LOADING_I18N_MAP = React.useMemo(() => {
        const kaList = getLoadingTypes(t);
        const map = new Map();
        LOADING_TYPES.forEach((ru, i) => map.set(ru, kaList[i] || ru));
        return map;
    }, [t]);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const debounceTimer = useRef();

    useEffect(() => {
        if (!fetchTransports) return;
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            fetchTransports();
        }, 600);
        return () => clearTimeout(debounceTimer.current);
    }, [filters]);

    function handleKeyDown(e) {
        if (e.key === "Enter" && fetchTransports) {
            fetchTransports();
        }
    }

    function handleFilterChange(e) {
        const { name, value, type, checked } = e.target;
        setFilters(f => ({
            ...f,
            [name]: type === "checkbox" ? checked : value
        }));
    }

    function onReset() {
        setFilters({});
        handleResetFilters && handleResetFilters();
    }

    return (
        <div style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            background: "rgba(30,41,59,0.97)",
            borderRadius: 18,
            padding: "10px 10px 7px 10px",
            marginBottom: 22,
            gap: 10,
            minHeight: 56
        }}>
            <LocationAutocomplete
                value={filters.from_location || ""}
                onChange={val => setFilters(f => ({ ...f, from_location: val }))}
                onInputChange={() =>
                    setFilters(f => {
                        const n = { ...f };
                        delete n.from_location_lat;
                        delete n.from_location_lng;
                        delete n.from_radius;
                        return n;
                    })
                }
                onSelect={([lat, lng], name) =>
                    setFilters(f => ({
                        ...f,
                        from_location: name,
                        from_location_lat: lat,
                        from_location_lng: lng,
                        from_radius: f.from_radius ?? 120,
                    }))
                }
                placeholder={t("filter.from", "Откуда")}
                style={inputStyle}
            />
            <LocationAutocomplete
                value={filters.to_location || ""}
                onChange={val => setFilters(f => ({ ...f, to_location: val }))}
                onInputChange={() =>
                    setFilters(f => {
                        const n = { ...f };
                        delete n.to_location_lat;
                        delete n.to_location_lng;
                        delete n.to_radius;
                        return n;
                    })
                }
                onSelect={([lat, lng], name) =>
                    setFilters(f => ({
                        ...f,
                        to_location: name,
                        to_location_lat: lat,
                        to_location_lng: lng,
                        to_radius: f.to_radius ?? 120,
                    }))
                }
                placeholder={t("filter.to", "Куда")}
                style={inputStyle}
            />
            <div className="filter-date-field">
                <DateInput
                    value={filters.ready_date_from || ""}
                    onChange={v => setFilters(f => ({ ...f, ready_date_from: v }))}
                    placeholder={t("filter.availableFrom", "Доступен с")}
                    inputStyle={inputStyle} // ← обязательно использовать inputStyle!
                />
            </div>
            <span style={{ color: "#5da7e6", margin: "0 7px" }}>—</span>
            <div className="filter-date-field">
                <DateInput
                    value={filters.ready_date_to || ""}
                    onChange={v => setFilters(f => ({ ...f, ready_date_to: v }))}
                    placeholder={t("filter.availableTo", "Доступен по")}
                    inputStyle={{ ...inputStyle, minWidth: 130, width: 140 }}
                />
            </div>
            <TruckTypeDropdown
                value={filters.truck_type || ""}
                onChange={val => setFilters(f => ({ ...f, truck_type: val }))}
                options={TRUCK_BODY_OPTS}
            />
            <LoadingTypeDropdown
                value={filters.load_types || []}
                onChange={val => setFilters(f => ({ ...f, load_types: val }))}
                options={LOADING_TYPES}
                i18nMap={LOADING_I18N_MAP}
            />
            <TransportKindDropdown
                value={filters.transport_kind || ""}
                onChange={val => setFilters(f => ({ ...f, transport_kind: val }))}
                options={TRANSPORT_KIND_OPTS}
            />
            <input
                name="q"
                placeholder={t("filter.searchTransport", "Поиск (госномер, водитель, особ.)")}
                value={filters.q || ""}
                onChange={handleFilterChange}
                style={{ ...inputStyle, minWidth: 160, width: 180 }}
                onKeyDown={handleKeyDown}
            />

            <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                style={buttonMoreStyle}
                tabIndex={-1}
            >
                {showAdvanced
                    ? t("filter.less", "▲ Меньше фильтров")
                    : t("filter.more", "▼ Больше фильтров")}
            </button>

            <button
                type="button"
                onClick={onReset}
                style={buttonResetStyle}
                tabIndex={-1}
            >
                {t("common.clear", "Сбросить")}
            </button>

            {showAdvanced && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, width: "100%" }}>
                    <label style={labelStyle}>
                        <input
                            name="gps_monitor"
                            type="checkbox"
                            checked={!!filters.gps_monitor}
                            onChange={handleFilterChange}
                        />
                        <span style={{ marginLeft: 5 }}>{t("filter.gpsMonitoring", "GPS-мониторинг")}</span>
                    </label>
                    <label style={labelStyle}>
                        <input
                            name="adr"
                            type="checkbox"
                            checked={!!filters.adr}
                            onChange={handleFilterChange}
                        />
                        <span style={{ marginLeft: 5 }}>ADR</span>
                    </label>
                    <input
                        name="body_length"
                        type="number"
                        min="0"
                        placeholder={t("filter.bodyLengthM", "Длина кузова (м)")}
                        value={filters.body_length || ""}
                        onChange={handleFilterChange}
                        style={{ ...inputStyle, width: 120 }}
                        onKeyDown={handleKeyDown}
                    />
                    <input
                        name="weight"
                        type="number"
                        min="0"
                        placeholder={t("filter.weightTons", "Грузоподъемность т")}
                        value={filters.weight || ""}
                        onChange={handleFilterChange}
                        style={{ ...inputStyle, width: 120 }}
                        onKeyDown={handleKeyDown}
                    />
                    <input
                        name="volume"
                        type="number"
                        min="0"
                        placeholder={t("filter.volumeM3", "Объём м³")}
                        value={filters.volume || ""}
                        onChange={handleFilterChange}
                        style={{ ...inputStyle, width: 100 }}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            )}
        </div>
    );
}

const inputStyle = {
    fontSize: 15,
    padding: "7.5px 13px 7.5px 13px",
    borderRadius: 8,
    border: "1.5px solid #244e78",
    outline: "none",
    minWidth: 120,
    width: 150,
    height: 38,
    background: "#16233a",
    color: "#e3f2fd",
    marginRight: 4,
    marginBottom: 0,
    boxShadow: "0 1px 5px #18264718",
    transition: "border 0.17s, background 0.13s"
};
const buttonResetStyle = {
    padding: "6px 17px",
    background: "#1e2d3d",
    color: "#e3f2fd",
    fontWeight: 600,
    fontSize: 15,
    border: "1.2px solid #284f67",
    borderRadius: 8,
    cursor: "pointer",
    height: 38,
    marginLeft: 0
};
const buttonMoreStyle = {
    ...buttonResetStyle,
    background: "#183256",
    border: "1.2px solid #245085",
    color: "#8ecae6"
};
const labelStyle = {
    fontSize: 15,
    color: "#e3f2fd",
    background: "none",
    padding: 0,
    display: "flex",
    alignItems: "center",
    border: "none",
    fontWeight: 500,
    cursor: "pointer",
    marginRight: 8
};
