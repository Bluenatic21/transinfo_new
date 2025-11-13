// src/app/components/mobile/MobileFilterSheet.jsx
"use client";

import ReactDOM from "react-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import DateInput from "../DateInput";
import LocationAutocomplete from "../LocationAutocomplete";
import { useLang } from "../../i18n/LangProvider";
import { normalize, denormalize, num, countActive } from "../../filters/shared";

// ----------------- ВНУТРЕННИЕ УТИЛИТЫ UI -----------------
const field = {
    display: "grid",
    gap: 6,
};
const label = {
    color: "#bcd1e6",
    fontSize: 12,
    fontWeight: 700,
};
const input = {
    width: "100%",
    background: "#16243c",
    border: "1px solid #2b4b75",
    borderRadius: 10,
    padding: "9px 12px",
    color: "#e3f2fd",
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
function NumberRange({ labelText, minValue, maxValue, onChange }) {
    const { t } = useLang(); // <-- FIX: чтобы не падало "t is not defined"
    return (
        <div style={field}>
            <span style={label}>{labelText}</span>
            <Row2>
                <input
                    inputMode="decimal"
                    placeholder={t("range.from", "от")}
                    value={minValue ?? ""}
                    onChange={(e) => onChange(num(e.target.value), maxValue)}
                    style={input}
                />
                <input
                    inputMode="decimal"
                    placeholder={t("range.to", "до")}
                    value={maxValue ?? ""}
                    onChange={(e) => onChange(minValue, num(e.target.value))}
                    style={input}
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
                background: "rgba(0,10,20,.45)",
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
                    background: "rgba(18,32,52,0.98)",
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
                            background: dragging ? "#57b5ff" : "#446b9e",
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
                        <span style={{ color: "#e3f2fd", fontWeight: 800, fontSize: 16 }}>
                            {t("filter.title", "Фильтры")}
                        </span>
                        {activeCount > 0 && (
                            <span
                                style={{
                                    background: "#1b3d66",
                                    color: "#9cd1ff",
                                    border: "1px solid #2e5a8e",
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
                            background: "#23395b",
                            color: "#9ad3ff",
                            border: "1px solid #2b4f85",
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
                        />
                    </div>
                    <div style={field}>
                        <span style={label}>{t("filter.to", "Куда")}</span>
                        <LocationAutocomplete
                            value={local.to || ""}
                            onChange={(v) => setLocal((s) => ({ ...s, to: v }))}
                            multiple={false}
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
                            />
                            <DateInput
                                value={local.dateTo || ""}
                                onChange={(v) => setLocal((s) => ({ ...s, dateTo: v }))}
                                placeholder={t("range.to", "до")}
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
                            />
                            <NumberRange
                                labelText={t("filter.volume", "Объём (м³)")}
                                minValue={local.volumeMin}
                                maxValue={local.volumeMax}
                                onChange={(a, b) => setLocal((s) => ({ ...s, volumeMin: a, volumeMax: b }))}
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
                            <span style={{ color: "#e3f2fd", fontSize: 14, userSelect: "none" }}>ADR</span>
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
                        background:
                            "linear-gradient(180deg, rgba(18,32,52,0) 0%, rgba(18,32,52,0.9) 30%, rgba(18,32,52,0.98) 80%)",
                    }}
                >
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            onClick={apply}
                            style={{
                                flex: 1,
                                background: "#1c65a5",
                                color: "#fff",
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
                                background: "#283e62",
                                color: "#c6e4ff",
                                border: "1px solid #355a8b",
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
