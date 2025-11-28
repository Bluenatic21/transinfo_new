// src/app/components/mobile/MobileFilterSheet.jsx
"use client";

import ReactDOM from "react-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import DateInput from "../DateInput";
import LocationAutocomplete from "../LocationAutocomplete";
import { useLang } from "../../i18n/LangProvider";
import { useTheme } from "../../providers/ThemeProvider";
import { normalize, denormalize, num, countActive } from "../../filters/shared";

// ----------------- ВНУТРЕННИЕ УТИЛИТЫ UI -----------------
const field = {
    display: "grid",
    gap: 6,
};
const labelBase = {
    fontSize: 12,
    fontWeight: 700,
};
const inputBase = {
    width: "100%",
    borderRadius: 10,
    padding: "9px 12px",
    outline: "none",
};

// Лейаут для двух инпутов «от/до»
function Row2({ children }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {children}
        </div>
    );
}

// Числовой диапазон (фикс: берём t из useLang здесь!)
function NumberRange({ labelText, minValue, maxValue, onChange, labelStyle, inputStyle }) {
    const { t } = useLang(); // <-- FIX: чтобы не падало "t is not defined"
    return (
        <div style={field}>
            <span style={labelStyle}>{labelText}</span>
            <Row2>
                <input
                    inputMode="decimal"
                    placeholder={t("range.from", "от")}
                    value={minValue ?? ""}
                    onChange={(e) => onChange(num(e.target.value), maxValue)}
                    style={inputStyle}
                />
                <input
                    inputMode="decimal"
                    placeholder={t("range.to", "до")}
                    value={maxValue ?? ""}
                    onChange={(e) => onChange(minValue, num(e.target.value))}
                    style={inputStyle}
                />
            </Row2>
        </div>
    );
}

// ----------------- ОСНОВНАЯ МОДАЛЬНАЯ ШТОРКА -----------------
export default function MobileFilterSheet({
    type = "orders",          // "orders" | "transport"
    open,
    initialFilters = {},
    onApply,                  // (normalizedPayload) => void
    onReset,                  // () => void
    onClose,                  // () => void
    estimatedCount,           // number | undefined
    onPreview,                // (normalizedPayload) => void
}) {
    const { t } = useLang();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";

    const palette = {
        label: isLight ? "var(--text-secondary)" : "#bcd1e6",
        inputBg: isLight ? "var(--control-bg)" : "#16243c",
        inputBorder: isLight ? "var(--border-subtle)" : "#2b4b75",
        inputText: isLight ? "var(--text-primary)" : "#e3f2fd",
        sheetBg: isLight ? "var(--bg-card)" : "rgba(18,32,52,0.98)",
        overlayBg: isLight ? "rgba(0,0,0,0.35)" : "rgba(0,10,20,.45)",
        handle: isLight ? "var(--border-strong)" : "#446b9e",
        handleActive: isLight ? "var(--brand-blue)" : "#57b5ff",
        headerText: isLight ? "var(--text-primary)" : "#e3f2fd",
        badgeBg: isLight ? "color-mix(in srgb, var(--brand-blue) 16%, #ffffff)" : "#1b3d66",
        badgeBorder: isLight ? "var(--border-strong)" : "#2e5a8e",
        badgeFg: isLight ? "var(--text-primary)" : "#9cd1ff",
        resetBg: isLight ? "var(--control-bg)" : "#23395b",
        resetBorder: isLight ? "var(--border-strong)" : "#2b4f85",
        resetText: isLight ? "var(--text-primary)" : "#9ad3ff",
        footerGradient: isLight
            ? "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 40%, rgba(255,255,255,0.95) 85%)"
            : "linear-gradient(180deg, rgba(18,32,52,0) 0%, rgba(18,32,52,0.9) 30%, rgba(18,32,52,0.98) 80%)",
        primaryBtnBg: isLight ? "var(--brand-blue)" : "#1c65a5",
        secondaryBtnBg: isLight ? "var(--control-bg)" : "#283e62",
        secondaryBtnBorder: isLight ? "var(--border-strong)" : "#355a8b",
        secondaryBtnText: isLight ? "var(--text-primary)" : "#c6e4ff",
    };

    const label = { ...labelBase, color: palette.label };
    const input = {
        ...inputBase,
        background: palette.inputBg,
        border: `1px solid ${palette.inputBorder}`,
        color: palette.inputText,
    };

    // локальное состояние полей (в "человеческом" виде)
    const [local, setLocal] = useState(normalize(initialFilters, type));
    useEffect(() => {
        if (!open) return;
        setLocal(normalize(initialFilters, type));
    }, [open, initialFilters, type]);

    // блокировка скролла подложки
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    // дебаунс-предпросчёт количества (на хедере кнопки)
    const previewTimerRef = useRef(null);
    useEffect(() => {
        if (!open || !onPreview) return;
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        const payload = denormalize(local, type);
        previewTimerRef.current = setTimeout(() => {
            try {
                onPreview(payload);
            } catch { }
        }, 450);
        return () => {
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        };
    }, [open, local, type, onPreview]);

    const activeCount = useMemo(() => countActive(local), [local]);

    // нижняя «шторка» — перетаскивание
    const backdropRef = useRef(null);
    const sheetRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [offset, setOffset] = useState(0);
    const startRef = useRef({ y: 0, t: 0, start: 0 });

    const [SNAP, setSNAP] = useState({ HALF: 300, CLOSED: 700 });
    useEffect(() => {
        function recalc() {
            const vh = window.innerHeight || 800;
            setSNAP({ HALF: Math.round(vh * 0.45), CLOSED: Math.round(vh * 0.92) });
        }
        recalc();
        window.addEventListener("resize", recalc);
        return () => window.removeEventListener("resize", recalc);
    }, []);
    useEffect(() => {
        if (open) setOffset(0);
    }, [open]);

    const onPointerDown = (e) => {
        const handle = e.target.closest?.('[data-handle="true"]');
        if (!handle) return;
        setDragging(true);
        startRef.current = { y: e.clientY, t: Date.now(), start: offset };
        sheetRef.current?.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        if (!dragging) return;
        const dy = e.clientY - startRef.current.y;
        const next = Math.max(0, Math.min(SNAP.CLOSED, startRef.current.start + dy));
        setOffset(next);
    };
    const onPointerUp = (e) => {
        if (!dragging) return;
        setDragging(false);
        const dy = e.clientY - startRef.current.y;
        const dt = Math.max(1, Date.now() - startRef.current.t);
        const v = dy / dt; // px/ms

        // выбор снапа
        let target = 0;
        if (offset > (SNAP.HALF + SNAP.CLOSED) / 2 || v > 0.6) target = SNAP.CLOSED;
        else if (offset > (0 + SNAP.HALF) / 2 || v > 0.35) target = SNAP.HALF;
        else target = 0;

        setOffset(target);
        if (target === SNAP.CLOSED) setTimeout(() => onClose?.(), 180);
    };

    const closeOnBackdrop = (e) => {
        if (e.target === backdropRef.current) onClose?.();
    };

    const apply = () => onApply?.(denormalize(local, type));
    const reset = () => onReset?.();

    if (!open) return null;

    const portalTarget = (typeof document !== "undefined" && document.body) || null;

    const overlay = (
        <div
            ref={backdropRef}
            onClick={closeOnBackdrop}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: palette.overlayBg,
                backdropFilter: "blur(2px)",
            }}
            aria-modal="true"
            role="dialog"
        >
            <div
                ref={sheetRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    maxHeight: "90vh",
                    height: "88vh",
                    overflow: "auto",
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    background: palette.sheetBg,
                    boxShadow: "0 -10px 30px rgba(0,0,0,.35)",
                    transform: `translateY(${offset}px)`,
                    transition: dragging ? "none" : "transform 180ms cubic-bezier(.2,.8,.2,1)",
                    willChange: "transform",
                    padding: "8px 12px 14px",
                }}
            >
                {/* хэндл */}
                <div data-handle="true" style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
                    <div
                        style={{
                            width: 36,
                            height: 4,
                            borderRadius: 999,
                            background: dragging ? palette.handleActive : palette.handle,
                            transition: "background 160ms",
                        }}
                    />
                </div>

                {/* заголовок */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        margin: "6px 2px 10px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: palette.headerText, fontWeight: 800, fontSize: 16 }}>
                            {t("filter.title", "Фильтры")}
                        </span>
                        {activeCount > 0 && (
                            <span
                                style={{
                                    background: palette.badgeBg,
                                    color: palette.badgeFg,
                                    border: `1px solid ${palette.badgeBorder}`,
                                    padding: "2px 7px",
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 700,
                                }}
                            >
                                {activeCount}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={reset}
                        style={{
                            background: palette.resetBg,
                            color: palette.resetText,
                            border: `1px solid ${palette.resetBorder}`,
                            padding: "7px 12px",
                            borderRadius: 10,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        {t("common.reset", "Сбросить")}
                    </button>
                </div>

                {/* ПОЛЯ */}
                <div style={{ display: "grid", gap: 12 }}>
                    {/* Откуда / Куда */}
                    <div style={field}>
                        <span style={label}>{t("filter.from", "Откуда")}</span>
                        <LocationAutocomplete
                            value={local.from || ""}
                            onChange={(v) => setLocal((s) => ({ ...s, from: v }))}
                            style={{
                                ...input,
                                padding: "9px 12px",
                            }}
                        />
                    </div>
                    <div style={field}>
                        <span style={label}>{t("filter.to", "Куда")}</span>
                        <LocationAutocomplete
                            value={local.to || ""}
                            onChange={(v) => setLocal((s) => ({ ...s, to: v }))}
                            multiple={false}
                            style={{
                                ...input,
                                padding: "9px 12px",
                            }}
                        />
                    </div>

                    {/* Даты: груз — load_date_from/to; транспорт — ready_date_from/to */}
                    <div style={field}>
                        <span style={label}>
                            {type === "transport"
                                ? t("filter.readyDates", "Готовность транспорта")
                                : t("filter.loadDates", "Даты погрузки")}
                        </span>
                        <Row2>
                            <DateInput
                                value={local.dateFrom || ""}
                                onChange={(v) => setLocal((s) => ({ ...s, dateFrom: v }))}
                                placeholder={t("range.from", "от")}
                                inputStyle={{
                                    ...input,
                                    padding: local.dateFrom ? "9px 32px 9px 12px" : "9px 12px",
                                }}
                            />
                            <DateInput
                                value={local.dateTo || ""}
                                onChange={(v) => setLocal((s) => ({ ...s, dateTo: v }))}
                                placeholder={t("range.to", "до")}
                                inputStyle={{
                                    ...input,
                                    padding: local.dateTo ? "9px 32px 9px 12px" : "9px 12px",
                                }}
                            />
                        </Row2>
                    </div>

                    {/* Вес / Объём */}
                    {type === "orders" ? (
                        <>
                            <NumberRange
                                labelText={t("filter.weight", "Вес (тонн)")}
                                minValue={local.weightMin}
                                maxValue={local.weightMax}
                                onChange={(a, b) => setLocal((s) => ({ ...s, weightMin: a, weightMax: b }))}
                                labelStyle={label}
                                inputStyle={input}
                            />
                            <NumberRange
                                labelText={t("filter.volume", "Объём (м³)")}
                                minValue={local.volumeMin}
                                maxValue={local.volumeMax}
                                onChange={(a, b) => setLocal((s) => ({ ...s, volumeMin: a, volumeMax: b }))}
                                labelStyle={label}
                                inputStyle={input}
                            />
                        </>
                    ) : (
                        <>
                            <div style={field}>
                                <span style={label}>{t("filter.capacityWeight", "Грузоподъёмность (т)")}</span>
                                <input
                                    inputMode="decimal"
                                    placeholder={t("range.from", "от")}
                                    value={local.weightMin ?? ""}
                                    onChange={(e) => setLocal((s) => ({ ...s, weightMin: num(e.target.value) }))}
                                    style={input}
                                />
                            </div>
                            <div style={field}>
                                <span style={label}>{t("filter.capacityVolume", "Объём кузова (м³)")}</span>
                                <input
                                    inputMode="decimal"
                                    placeholder={t("range.from", "от")}
                                    value={local.volumeMin ?? ""}
                                    onChange={(e) => setLocal((s) => ({ ...s, volumeMin: num(e.target.value) }))}
                                    style={input}
                                />
                            </div>
                        </>
                    )}

                    {/* Типы/флаги */}
                    <div style={{ display: "grid", gap: 8 }}>
                        {/* Тип ТС / Тип кузова / Виды загрузки */}
                        {type === "transport" ? (
                            <div style={field}>
                                <span style={label}>{t("filter.vehicleType", "Вид транспорта")}</span>
                                <input
                                    placeholder={t("order.selectTransportKind", "Например: фура")}
                                    value={local.vehicleType || ""}
                                    onChange={(e) => setLocal((s) => ({ ...s, vehicleType: e.target.value }))}
                                    style={input}
                                />
                            </div>
                        ) : null}

                        <div style={field}>
                            <span style={label}>{t("filter.bodyType", "Тип кузова")}</span>
                            <input
                                placeholder={t("order.selectTruckType", "Например: тент")}
                                value={local.bodyType || ""}
                                onChange={(e) => setLocal((s) => ({ ...s, bodyType: e.target.value }))}
                                style={input}
                            />
                        </div>

                        {type === "orders" ? (
                            <div style={field}>
                                <span style={label}>{t("filter.loadingTypes", "Виды загрузки")}</span>
                                <input
                                    placeholder={t("filter.loadingTypesPlaceholder", "Боковая, верхняя, задняя…")}
                                    value={local.loadType || ""}
                                    onChange={(e) => setLocal((s) => ({ ...s, loadType: e.target.value }))}
                                    style={input}
                                />
                            </div>
                        ) : null}

                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                            <input
                                type="checkbox"
                                checked={!!local.adr}
                                onChange={(e) => setLocal((s) => ({ ...s, adr: !!e.target.checked }))}
                            />
                            <span style={{ color: palette.headerText, fontSize: 14, userSelect: "none" }}>ADR</span>
                        </label>
                    </div>
                </div>

                {/* футер */}
                <div
                    style={{
                        position: "sticky",
                        bottom: 0,
                        marginTop: 14,
                        paddingTop: 12,
                        background: palette.footerGradient,
                    }}
                >
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            onClick={apply}
                            style={{
                                flex: 1,
                                background: palette.primaryBtnBg,
                                color: "var(--text-on-brand)",
                                border: "none",
                                padding: "12px 14px",
                                borderRadius: 12,
                                fontSize: 15,
                                fontWeight: 800,
                                cursor: "pointer",
                            }}
                        >
                            {estimatedCount != null
                                ? t("filter.showResults", "Показать результаты: {n}", { n: estimatedCount })
                                : t("filter.apply", "Применить")}
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                background: palette.secondaryBtnBg,
                                color: palette.secondaryBtnText,
                                border: `1px solid ${palette.secondaryBtnBorder}`,
                                padding: "12px 14px",
                                borderRadius: 12,
                                fontSize: 15,
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            {t("common.close", "Закрыть")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return portalTarget ? ReactDOM.createPortal(overlay, portalTarget) : overlay;
}
