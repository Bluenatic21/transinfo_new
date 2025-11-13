"use client";
import { useState, useRef, useEffect } from "react";
import { useLang } from "../i18n/LangProvider";

export default function CustomSelect({
    value,
    onChange,
    options,
    placeholder = "",
    style = {},
    optionStyle = {},
    disabled = false,
    name = undefined,
}) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef();

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const filtered = !search
        ? options
        : options.filter(o => (typeof o === "string" ? o : o.label).toLowerCase().includes(search.toLowerCase()));

    const selectedLabel = options.find(o =>
        (typeof o === "object" ? o.value : o) === value
    );
    const shownValue = typeof selectedLabel === "object" ? selectedLabel.label : selectedLabel;

    return (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
            <div
                tabIndex={0}
                className="ti-control ti-select"
                style={{
                    display: "flex",
                    alignItems: "center",
                    border: style?.border || undefined,
                    borderRadius: style?.borderRadius || undefined,
                    padding: style?.padding || undefined,
                    fontSize: style?.fontSize || 15,
                    background: style?.background || undefined,
                    color: value ? "var(--ctl-fg)" : "var(--ctl-placeholder)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    height: style?.height || undefined,
                    lineHeight: "normal",
                    ...style
                }}
                onClick={() => !disabled && setOpen(v => !v)}
            >
                {shownValue || (placeholder || t("common.selectPlaceholder", "Выберите..."))}
            </div>
            {open && (
                <div style={{
                    position: "absolute", zIndex: 99, left: 0, top: 42,
                    background: "var(--ctl-bg)",
                    border: "var(--ctl-border)",
                    borderRadius: 10,
                    minWidth: "100%",
                    maxHeight: 270,
                    overflowY: "auto",
                    boxShadow: "0 6px 24px #18315366",  // глубокая тень
                    padding: 7
                }}>
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={t("common.search", "Поиск...")}
                        style={{
                            width: "97%",
                            borderRadius: 8,
                            border: "var(--ctl-border)",
                            padding: "7px 12px",
                            fontSize: 15,
                            marginBottom: 8,
                            color: "var(--ctl-fg)",
                            background: "var(--ctl-bg)"
                        }}
                    />
                    {filtered.length
                        ? filtered.map((o, i) => {
                            const val = typeof o === "object" ? o.value : o;
                            const label = typeof o === "object" ? o.label : o;
                            return (
                                <div
                                    key={val ?? label}
                                    onMouseDown={() => {
                                        if (onChange) onChange(val, name);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                    style={{
                                        padding: "8px 12px",
                                        borderRadius: style?.borderRadius || undefined,
                                        cursor: "pointer",
                                        background: value === val ? "#244e7855" : "none",  // полу-прозрачный синий
                                        color: value === val ? "#ffd600" : "#e3f2fd",      // акцент и светлый текст
                                        fontWeight: value === val ? 700 : 400,
                                        marginBottom: 2,
                                        transition: "background .17s, color .17s",
                                        ...optionStyle
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#244e7822"}
                                    onMouseLeave={e => e.currentTarget.style.background = value === val ? "#244e7855" : "none"}
                                >
                                    {label}
                                </div>
                            );
                        })
                        : <div style={{ color: "#ffd600a0", padding: 8 }}>
                            {t("common.noMatches", "Нет соответствий")}
                        </div>
                    }
                </div>
            )}
        </div>
    );
}
