"use client";
import React, { useRef, useState, forwardRef, useEffect } from "react";
import Calendar from "react-calendar";
import 'react-calendar/dist/Calendar.css';
import { useLang } from "../i18n/LangProvider";

// Языковая карта для react-calendar
const CAL_LOCALE = { ru: "ru-RU", ka: "ka-GE", en: "en-US", az: "az-AZ", tr: "tr-TR" };

// Маска даты дд.мм.гггг
function formatDate(val) {
    let digits = val.replace(/\D/g, "").slice(0, 8);
    let res = "";
    if (digits.length > 0) res += digits.slice(0, 2);
    if (digits.length > 2) res += "." + digits.slice(2, 4);
    if (digits.length > 4) res += "." + digits.slice(4, 8);
    return res;
}

function parseDMY(str) {
    const m = String(str || "").match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
    if (!m) return null;
    const d = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    const dt = new Date(y, mm - 1, d);
    return (dt.getFullYear() === y && dt.getMonth() === mm - 1 && dt.getDate() === d) ? dt : null;
}
function isValidDate(str) {
    return !!parseDMY(str);
}

const DateInput = forwardRef(function DateInput({
    value, onChange, label = "", placeholder = "", required = false, style = {}, name = "",
    inputStyle = {},
}, ref) {
    const { t, lang } = useLang();
    const calLocale = CAL_LOCALE[lang] || "ru-RU";
    const [open, setOpen] = useState(false);
    const inputRef = useRef();
    const [hovered, setHovered] = useState(false);
    const wrapperRef = useRef(null);

    // Обработка ручного ввода
    function handleInput(e) {
        let v = formatDate(e.target.value);
        if (v.length > 10) v = v.slice(0, 10);

        // Проверка на дату до сегодня
        if (isValidDate(v)) {
            const [d, m, y] = v.split(".").map(Number);
            const inputDate = new Date(y, m - 1, d);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (inputDate < today) {
                onChange("");
                return;
            }
        }
        onChange(v);
    }

    function handleDatePick(date) {
        const d = date.getDate().toString().padStart(2, "0");
        const m = (date.getMonth() + 1).toString().padStart(2, "0");
        const y = date.getFullYear();
        const val = `${d}.${m}.${y}`;
        onChange(val);
        setOpen(false);
        setTimeout(() => (ref ? ref.current : inputRef.current)?.blur(), 120);
    }

    useEffect(() => {
        if (!open) return;
        const handleClick = e => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    // Не закрывать календарь при переходе между месяцами (фикс)
    function handleCalendarClick(e) {
        // блокируем закрытие только если это кнопки переключения месяца
        if (e.target.closest(".react-calendar__navigation")) {
            e.stopPropagation();
        }
    }

    return (
        <div
            ref={wrapperRef}
            style={{ position: "relative", ...style, display: "inline-block", width: "100%" }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <input
                ref={ref || inputRef}
                className="ti-control"
                name={name}
                autoComplete="off"
                value={(() => {
                    if (!value) return "";
                    // ISO → дд.мм.гггг
                    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        const [Y, M, D] = value.split("-");
                        return `${D}.${M}.${Y}`;
                    }
                    // старый слешевый формат → точки
                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value.replace(/\//g, ".");
                    return value;
                })()}
                placeholder={placeholder || t("date.placeholder", "дд.мм.гггг")}
                onChange={handleInput}
                onFocus={() => setOpen(true)}
                maxLength={10}
                style={Object.keys(inputStyle).length ? inputStyle : {
                    width: "100%",
                    borderRadius: inputStyle?.borderRadius || undefined,
                    border: inputStyle?.border || undefined,
                    background: inputStyle?.background || undefined,
                    color: inputStyle?.color || undefined,
                    padding: value ? "7px 32px 7px 12px" : "7px 12px",
                    fontSize: 15,
                    outline: "none"
                }}
                inputMode="numeric"
                pattern="\d{2}[.]\d{2}[.]\d{4}"  // фикс паттерна под дд.мм.гггг
            />
            {value && hovered && (
                <button
                    type="button"
                    aria-label={t("date.clear", "Очистить дату")}
                    onClick={() => onChange("")}
                    style={{
                        position: "absolute",
                        top: "50%",
                        right: 7,
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "#bfc5db",
                        fontSize: 19,
                        cursor: "pointer",
                        padding: 0,
                        opacity: 0.86,
                        zIndex: 12,
                    }}
                    tabIndex={-1}
                >×</button>
            )}
            {open && (
                <div
                    style={{
                        position: "absolute",
                        zIndex: 100,
                        left: 0,
                        right: 0,
                        top: "calc(100% + 2px)",
                        background: "#232A39",
                        border: "1.5px solid var(--accent)",
                        borderRadius: 11,
                        boxShadow: "0 4px 28px #11204266",
                    }}
                    onMouseDown={handleCalendarClick}
                >
                    <Calendar
                        locale={calLocale}
                        onChange={handleDatePick}
                        value={parseDMY(value) || null}
                        tileContent={null}
                        next2Label={null}
                        prev2Label={null}
                        minDate={new Date()}
                    />
                </div>
            )}
        </div>
    );
});

export default DateInput;
