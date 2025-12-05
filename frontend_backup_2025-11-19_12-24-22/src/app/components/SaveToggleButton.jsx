/* src/app/components/SaveToggleButton.jsx */
"use client";
import { FaRegBookmark, FaBookmark } from "react-icons/fa";
import { useUser } from "@/app/UserContext";
import React, { useMemo, useState, useEffect } from "react";
import { useLang } from "../i18n/LangProvider";
/**
 * Переключатель с надёжным оптимистичным UI.
 * Теперь текст — это ДЕЙСТВИЕ:
 * - сохранено → «Убрать из сохранённых» (в bar-версии — «Убрать»)
 * - не сохранено → «Сохранить»
 */
export default function SaveToggleButton({
    type,               // "order" | "transport"
    id,                 // ID сущности
    size = 18,
    onChanged,
    variant = "default" // "default" | "bar"
}) {
    const { t } = useLang();
    const {
        user,
        savedOrders = [],
        savedTransports = [],
        saveOrder,
        unsaveOrder,
        saveTransport,
        unsaveTransport,
    } = useUser();

    // Истинное состояние из контекста
    const isSavedFromCtx = useMemo(() => {
        if (type === "order") return savedOrders.some(o => String(o.id) === String(id));
        return savedTransports.some(t => String(t.id) === String(id));
    }, [type, id, savedOrders, savedTransports]);

    // Оптимистичное состояние до подтверждения контекстом
    const [localSaved, setLocalSaved] = useState(null);            // null -> берем из контекста
    const [pendingExpected, setPendingExpected] = useState(null);  // чего ждём от контекста: true/false
    const [busy, setBusy] = useState(false);

    const effectiveSaved = (localSaved ?? isSavedFromCtx);

    // Снимаем локальный оверрайд только когда контекст подтвердит ожидаемое
    useEffect(() => {
        if (pendingExpected === null) return;
        if (isSavedFromCtx === pendingExpected) {
            setLocalSaved(null);
            setPendingExpected(null);
        }
    }, [isSavedFromCtx, pendingExpected]);

    // При смене сущности — сброс локальных флагов
    useEffect(() => {
        setLocalSaved(null);
        setPendingExpected(null);
        setBusy(false);
    }, [id, type]);

    const toggle = async () => {
        if (busy) return;

        const next = !effectiveSaved;
        setLocalSaved(next);      // мгновенный визуальный отклик
        setPendingExpected(next); // ждём подтверждения от контекста
        setBusy(true);

        try {
            if (type === "order") {
                if (next) await saveOrder(id);
                else await unsaveOrder(id);
            } else {
                if (next) await saveTransport(id);
                else await unsaveTransport(id);
            }
            onChanged?.(next);
            // ничего не сбрасываем тут — дождёмся апдейта контекста в useEffect
        } catch (e) {
            console.error("[SaveToggleButton] toggle error:", e);
            setLocalSaved(null);
            setPendingExpected(null);
        } finally {
            setBusy(false);
        }
    };

    // Подсказка по ролям
    let titleHint = effectiveSaved
        ? t("saved.titleHint.in", "Сейчас: в сохранённых. Нажмите, чтобы убрать.")
        : t("saved.titleHint.add", "Нажмите, чтобы добавить в сохранённые.");
    if (user?.role === "OWNER" && type === "order") titleHint += " " + t("saved.hint.visibleToTransportManagers", "Доступно перевозчикам/менеджерам.");
    if (user?.role === "TRANSPORT" && type === "transport") titleHint += " " + t("saved.hint.visibleToOwnersManagers", "Доступно владельцам/менеджерам.");

    // Тексты действия
    const actionLabel =
        effectiveSaved
            ? (variant === "bar" ? t("saved.removeShort", "Убрать") : t("saved.removeLong", "Убрать из сохранённых"))
            : t("saved.save", "Сохранить");

    // Нижняя панель карточки (компактная)
    if (variant === "bar") {
        const color = effectiveSaved ? "#ffd600" : "#43c8ff";
        return (
            <button
                aria-pressed={effectiveSaved}
                aria-label={actionLabel}
                title={titleHint}
                onClick={(e) => { e.stopPropagation(); toggle(); }}
                disabled={busy}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    color,
                    border: 0,
                    cursor: busy ? "default" : "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    padding: "0 9px",
                    borderRadius: 7,
                    borderBottom: `2px solid ${color}`,
                    minHeight: "22px",
                    opacity: busy ? 0.6 : 1,
                    transition: "opacity .15s ease, color .15s ease, border-color .15s ease"
                }}
            >
                {effectiveSaved ? <FaBookmark size={size} /> : <FaRegBookmark size={size} />}
                <span>{actionLabel}</span>
            </button>
        );
    }

    // Обычный вариант
    return (
        <button
            aria-pressed={effectiveSaved}
            aria-label={actionLabel}
            title={titleHint}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            disabled={busy}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                color: "inherit",
                border: 0,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
                transition: "opacity .15s ease"
            }}
        >
            {effectiveSaved ? <FaBookmark size={size} /> : <FaRegBookmark size={size} />}
            <span style={{ fontSize: 14 }}>{actionLabel}</span>
        </button>
    );
}
