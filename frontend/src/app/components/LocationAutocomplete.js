"use client";
import React, { useState, useRef, forwardRef } from "react";
import { useLang } from "../i18n/LangProvider";

// Формируем латинскую подпись по данным Nominatim (EN-транслитерация) без дублей
function makeLatinLabel(sug) {
    const nd = sug?.namedetails || {};
    const addr = sug?.address || {};
    const primary =
        nd["name:en"] ||
        nd["name:latin"] ||
        nd["name:int"] ||
        nd["name"] ||
        sug.display_name ||
        "";

    const city = addr?.city || addr?.town || addr?.village || addr?.hamlet;
    const region = addr?.state || addr?.region || addr?.county;
    const country = addr?.country;

    // Нормализация для сравнения (регистронезависимо, без диакритики, убираем "city/state/region/province of")
    const norm = (s) =>
        String(s || "")
            .toLowerCase()
            .replace(/^(city|state|region|province)\s+of\s+/g, "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const parts = [];
    const seen = new Set();
    const pushUniq = (v) => {
        const raw = String(v || "").trim();
        if (!raw) return;
        const n = norm(raw);
        if (!n || seen.has(n)) return;
        seen.add(n);
        parts.push(raw);
    };

    pushUniq(primary);
    pushUniq(city);
    pushUniq(region);
    pushUniq(country);

    return parts.join(", ");
}

const LocationAutocomplete = forwardRef(function LocationAutocomplete({
    value,
    onSelect,
    onChange,
    onInputChange,
    lang,
    latin = true,
    placeholder = "",
    style = {}
}, ref) {
    const { lang: uiLang, t } = useLang?.() || { lang: "en", t: (_k, f) => f };
    const [query, setQuery] = useState(value || "");
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(""); // Для ошибок/лимита
    const lastRequestTime = useRef(0);
    const debounceTimer = useRef();

    async function fetchSuggestions(val) {
        // Throttle: запрещаем чаще 1 раза в 1 секунду
        const now = Date.now();
        if (now - lastRequestTime.current < 1000) {
            return;
        }
        lastRequestTime.current = now;

        setLoading(true);
        setError("");
        try {
            const apiLang = latin ? "en" : (lang || uiLang || "en");
            const url =
                `https://nominatim.openstreetmap.org/search` +
                `?format=jsonv2` +
                `&q=${encodeURIComponent(val)}` +
                `&accept-language=${apiLang}` +
                `&addressdetails=1` +
                `&namedetails=1`;
            const res = await fetch(url, {
                headers: { "User-Agent": "transinfo/1.0" }
            });
            if (res.status === 429) {
                setError(t("location.tooManyRequests", "Слишком много запросов, попробуйте чуть позже"));
                setSuggestions([]);
                return;
            }
            if (!res.ok) {
                setError(t("location.suggestError", "Ошибка получения подсказок"));
                setSuggestions([]);
                return;
            }
            const data = await res.json();
            setSuggestions(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(t("location.networkError", "Ошибка сети"));
            setSuggestions([]);
        } finally {
            setLoading(false);
        }
    }

    function handleChange(e) {
        const val = e.target.value;
        setQuery(val);
        onChange && onChange(val);

        // ВАЖНО: если добавили проп onInputChange — вызываем его всегда!
        if (typeof onInputChange === "function") onInputChange(val);

        clearTimeout(debounceTimer.current);
        if (val.length > 2) {
            debounceTimer.current = setTimeout(() => {
                fetchSuggestions(val);
            }, 900);
        } else {
            setSuggestions([]);
            setError("");
        }
    }

    return (
        <div style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            width: style?.width || undefined,
            minWidth: style?.minWidth || undefined,
            flex: style?.flex || undefined
        }}>
            <input
                ref={ref}
                value={query}
                onChange={handleChange}
                placeholder={placeholder || t("location.placeholder", "Город, адрес...")}
                className="ti-control"
                style={{
                    ...style,
                    width: style?.width || "100%",
                    minWidth: style?.minWidth,
                    height: style?.height,
                    fontSize: style?.fontSize || 15,
                    marginBottom: style?.marginBottom ?? 0,
                    padding: style?.padding || undefined,
                    borderRadius: style?.borderRadius || undefined,
                    border: style?.border || undefined,
                    background: style?.background || undefined,
                    color: style?.color || undefined,
                    marginRight: style?.marginRight ?? 2,
                    boxSizing: "border-box",
                    outline: style?.outline ?? "none"
                }}
            />
            {loading && <div style={{ color: "#8ecae6", fontSize: 13, marginTop: -3, marginBottom: 5 }}>
                {t("common.searching", "Поиск...")}
            </div>}
            {error && <div style={{ color: "#ff6868", fontSize: 13, marginTop: -3, marginBottom: 5 }}>{error}</div>}
            {suggestions.length > 0 && (
                <ul style={{
                    position: "absolute",
                    top: style?.height ? style.height : 36,
                    left: 0,
                    width: "100%",
                    background: "var(--ctl-bg)",
                    border: "var(--ctl-border)",
                    borderRadius: 8,
                    maxHeight: 180,
                    overflowY: "auto",
                    zIndex: 1201,
                    margin: 0,
                    padding: 0,
                    listStyle: "none"
                }}>
                    {suggestions.map(sug => {
                        const label = latin ? makeLatinLabel(sug) : (sug.display_name || "");
                        return (
                            <li
                                key={sug.place_id}
                                onClick={() => {
                                    setQuery(label);
                                    setSuggestions([]);
                                    onSelect([parseFloat(sug.lat), parseFloat(sug.lon)], label, sug);
                                }}
                                style={{
                                    padding: "7px 11px",
                                    color: "var(--ctl-fg)",
                                    cursor: "pointer",
                                    borderBottom: "1px solid color-mix(in oklab, var(--border, #233655) 65%, transparent)",
                                    fontSize: 15
                                }}
                            >
                                {label}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
});

export default LocationAutocomplete;
