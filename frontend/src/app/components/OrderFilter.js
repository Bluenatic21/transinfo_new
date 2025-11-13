import React, { useState, useRef, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import ModalPortal from "./ModalPortal";
import dynamic from "next/dynamic";
import LocationAutocomplete from "./LocationAutocomplete";
import {
    LOADING_TYPES,              // канонические (RU) для значения фильтра
    getLoadingTypes,            // локализованные подписи
    getTruckBodyTypes           // локализованные подписи + value = RU
} from "./truckOptions";
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
                onMouseDown={() => { onChange(opt.label); setOpen(false); setSearch(""); }}
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
        <div ref={ref} style={{ position: "relative", minWidth: 180, width: 180, marginBottom: 0, marginRight: 10 }}>
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
                    height: 38,
                    transition: "border 0.14s",
                    outline: "none",
                    userSelect: "none",
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
        <div ref={ref} style={{ position: "relative", minWidth: 180, width: 180, marginBottom: 0, marginRight: 10 }}>
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

export default function OrderFilter({ filters, setFilters, fetchOrders, handleResetFilters }) {
    const { t } = useLang();
    // Локализованные подписи, значения — на RU
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const LOADING_I18N_MAP = useMemo(() => {
        const kaList = getLoadingTypes(t);
        const map = new Map();
        LOADING_TYPES.forEach((ru, i) => map.set(ru, kaList[i] || ru));
        return map;
    }, [t]);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const debounceTimer = useRef();
    const [mapModalOpen, setMapModalOpen] = useState(false);
    const MapFilterModal = dynamic(() => import("./MapFilterModal"), { ssr: false });


    // детектор мобилки (без SSR)
    const isMobile = useMemo(() => {
        if (typeof window === "undefined") return false;
        return window.innerWidth < 768;
    }, []);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (!fetchOrders) return;
        clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            fetchOrders();
        }, 600);
        return () => clearTimeout(debounceTimer.current);
    }, [filters]); // eslint-disable-line

    function handleKeyDown(e) {
        if (e.key === "Enter" && fetchOrders) {
            fetchOrders();
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

    // вынесем содержимое панели фильтров в переменную,
    // чтобы переиспользовать и в «sheet», и в десктопном варианте
    const filterPanel = (
        <div className="order-filter-row" style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            background: "rgba(30,41,59,0.97)",
            borderRadius: 18,
            padding: "10px 10px 7px 10px",
            marginBottom: 22,
            minHeight: 56
        }}>
            <LocationAutocomplete
                value={filters.from_location || ""}
                onChange={val => setFilters(f => ({ ...f, from_location: val }))}
                onInputChange={() => setFilters(f => {
                    const n = { ...f }; delete n.from_location_lat; delete n.from_location_lng; delete n.from_radius; return n;
                })}
                onSelect={([lat, lng], name) =>
                    setFilters(f => ({ ...f, from_location: name, from_location_lat: lat, from_location_lng: lng, from_radius: f.from_radius ?? 120 }))
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
            <div className="filter-date-field" style={{
                minWidth: 148,
                maxWidth: 175,
                flex: "1 1 160px",
                height: 38,
                display: "flex",
                alignItems: "center",
                marginRight: 0
            }}>
                <DateInput
                    value={filters.load_date_from || ""}
                    onChange={v => setFilters(f => ({ ...f, load_date_from: v }))}
                    placeholder={t("filter.loadFrom", "Погрузка с")}
                    inputStyle={inputStyle}
                />
            </div>
            <span style={{ color: "#5da7e6", margin: "0 8px" }}>—</span>
            <div className="filter-date-field" style={{
                minWidth: 148,
                maxWidth: 175,
                flex: "1 1 160px",
                height: 38,
                display: "flex",
                alignItems: "center",
                marginRight: 10
            }}>
                <DateInput
                    value={filters.load_date_to || ""}
                    onChange={v => setFilters(f => ({ ...f, load_date_to: v }))}
                    placeholder={t("filter.loadTo", "Погрузка по")}
                    inputStyle={inputStyle}
                />
            </div>
            <TruckTypeDropdown
                value={filters.truck_type || ""}
                onChange={val => setFilters(f => ({ ...f, truck_type: val }))}
                options={BODY_TYPES}
            />
            <LoadingTypeDropdown
                value={filters.loading_types || []}
                onChange={val => setFilters(f => ({ ...f, loading_types: val }))}
                options={LOADING_TYPES}
                i18nMap={LOADING_I18N_MAP}
            />
            <input
                name="q"
                placeholder={t("filter.searchBar", "Поиск (номер, груз, комментарий...)")}
                value={filters.q || ""}
                onChange={handleFilterChange}
                style={{ ...inputStyle, minWidth: 140, width: 180 }}
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
                {t("common.reset", "Сбросить")}
            </button>
            {showAdvanced && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, width: "100%" }}>
                    <input
                        name="price_from"
                        type="number"
                        min="0"
                        placeholder={t("filter.priceFrom", "Цена от")}
                        value={filters.price_from || ""}
                        onChange={handleFilterChange}
                        style={{ ...inputStyle, width: 90 }}
                        onKeyDown={handleKeyDown}
                    />
                    <input
                        name="price_to"
                        type="number"
                        min="0"
                        placeholder={t("filter.priceTo", "до")}
                        value={filters.price_to || ""}
                        onChange={handleFilterChange}
                        style={{ ...inputStyle, width: 80 }}
                        onKeyDown={handleKeyDown}
                    />
                    <label style={labelStyle}>
                        <input
                            name="adr"
                            type="checkbox"
                            checked={!!filters.adr}
                            onChange={handleFilterChange}
                        />
                        <span style={{ marginLeft: 5 }}>ADR</span>
                    </label>
                    <label style={labelStyle}>
                        <input
                            name="gps_monitoring"
                            type="checkbox"
                            checked={!!filters.gps_monitoring}
                            onChange={handleFilterChange}
                        />
                        <span style={{ marginLeft: 5 }}>{t("filter.gpsMonitoring", "GPS-мониторинг")}</span>
                    </label>
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
                    <input
                        name="weight"
                        type="number"
                        min="0"
                        placeholder={t("filter.weightT", "Вес т")}
                        value={filters.weight || ""}
                        onChange={handleFilterChange}
                        style={{ ...inputStyle, width: 90 }}
                        onKeyDown={handleKeyDown}
                    />
                </div>
            )}
        </div>
    );

    // на десктопе показываем как раньше
    if (!isMobile) return filterPanel;

    // на мобилке: кнопка + шит с фильтрами
    return (
        <>
            <div className="flex items-center gap-2 mb-3">
                <button
                    className="rounded-xl px-4 py-2 bg-[#183151] text-white font-semibold border border-[#244e78]"
                    onClick={() => setMobileOpen(true)}
                >
                    {t("common.filters", "Фильтры")}
                </button>
                <button
                    className="rounded-xl px-4 py-2 bg-[#12263f] text-[#bfe6fa] border border-[#244e78]"
                    onClick={onReset}
                >
                    {t("common.reset", "Сбросить")}
                </button>
                {/* НОВОЕ: открытие полноэкранной карты отборов на мобилке */}
                <button
                    className="rounded-xl px-4 py-2 bg-[#0f2845] text-white font-semibold border border-[#244e78] ml-auto"
                    onClick={() => setMapModalOpen(true)}
                >
                    {t("common.map", "Карта")}
                </button>
            </div>

            {/* Мобильный sheet с фильтрами */}
            <ModalPortal
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                variant="sheet"
                title={t("common.filters", "Фильтры")}
                maxHeight="85vh"
            >
                <div className="pr-1 -mr-1">{filterPanel}</div>
            </ModalPortal>

            {/* НОВОЕ: реальный рендер модалки карты через портал */}
            {MapFilterModal && (
                <MapFilterModal
                    open={mapModalOpen}
                    onOpenChange={setMapModalOpen}
                    filters={filters}
                    setFilters={setFilters}
                    containerId="modal-root"
                />
            )}
        </>
    );
}

const inputStyle = {
    fontSize: 15,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1.2px solid #234",
    outline: "none",
    minWidth: 120,
    height: 38,
    background: "#19223A",
    color: "#e3f2fd",
    marginRight: 16, // Было 10, сделай 16 для всего!
    marginBottom: 0
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
