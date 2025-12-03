"use client";
import React from "react";
import ReactCountryFlag from "react-country-flag";
import { useLang } from "../i18n/LangProvider";

type LangCode = "ka" | "ru" | "en" | "tr" | "az" | "hy" | "uk";
type Variant = "full" | "compact";

const LANGS: Array<{
    code: LangCode;
    key: string;
    fallback: string;
    countryCode: string;
}> = [
        { code: "ka", key: "lang.ka", fallback: "Georgian", countryCode: "GE" },
        { code: "ru", key: "lang.ru", fallback: "Russian", countryCode: "RU" },
        { code: "en", key: "lang.en", fallback: "English", countryCode: "GB" }, // можно 🇺🇸
        { code: "tr", key: "lang.tr", fallback: "Turkish", countryCode: "TR" },
        { code: "az", key: "lang.az", fallback: "Azerbaijani", countryCode: "AZ" },
        { code: "hy", key: "lang.hy", fallback: "Armenian", countryCode: "AM" },
        { code: "uk", key: "lang.uk", fallback: "Ukrainian", countryCode: "UA" },
    ];

export default function LangSwitcher({ variant = "full" }: { variant?: Variant }) {
    const { lang, setLang, t } = useLang();
    const [open, setOpen] = React.useState(false);
    const wrapRef = React.useRef<HTMLDivElement>(null);

    const current = LANGS.find((l) => l.code === (lang as LangCode)) ?? LANGS[0];

    React.useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onEsc);
        };
    }, []);

    const choose = (code: LangCode) => {
        setLang(code as any);
        setOpen(false);
    };

    const baseBtnStyle: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        color: "inherit",
        border: "1px solid #3a475e",
        borderRadius: 8,
        padding: variant === "compact" ? "6px 8px" : "6px 10px",
        cursor: "pointer",
        justifyContent: "space-between",
        minWidth: variant === "compact" ? 0 : 140
    };

    return (
        <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t("lang.title", "Language")}
                onClick={() => setOpen((v) => !v)}
                style={baseBtnStyle}
            >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <ReactCountryFlag
                        countryCode={current.countryCode}
                        svg
                        aria-label={t(current.key, current.fallback)}
                        style={{
                            width: 20,
                            height: 14,
                            borderRadius: 4,
                            objectFit: "cover",
                        }}
                    />
                    {variant === "full" && (
                        <span style={{ whiteSpace: "nowrap" }}>{t(current.key, current.fallback)}</span>
                    )}
                </span>
                {variant === "full" && <span aria-hidden>▾</span>}
            </button>

            {open && (
                <ul
                    role="listbox"
                    aria-label={t("lang.title", "Language")}
                    style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 6,
                        background: "rgba(20,24,33,0.98)",
                        color: "inherit",
                        border: "1px solid #3a475e",
                        borderRadius: 8,
                        padding: 6,
                        width: 220,
                        maxHeight: 280,
                        overflowY: "auto",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                        zIndex: 50
                    }}
                >
                    {LANGS.map((l) => {
                        const selected = l.code === current.code;
                        return (
                            <li
                                key={l.code}
                                role="option"
                                aria-selected={selected}
                                onClick={() => choose(l.code)}
                                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && choose(l.code)}
                                tabIndex={0}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 10px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    background: selected ? "rgba(58,71,94,0.35)" : "transparent",
                                    outline: "none"
                                }}
                            >
                                <ReactCountryFlag
                                    countryCode={l.countryCode}
                                    svg
                                    aria-label={t(l.key, l.fallback)}
                                    style={{
                                        width: 20,
                                        height: 14,
                                        borderRadius: 4,
                                        objectFit: "cover",
                                    }}
                                />
                                <span style={{ flex: 1 }}>{t(l.key, l.fallback)}</span>
                                {selected && <span aria-hidden>✓</span>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
