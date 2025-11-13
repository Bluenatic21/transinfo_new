"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useUser } from "@/app/UserContext";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";

// Модалка "Запросить GPS-мониторинг"
export default function RequestGpsModal({
    open,
    onClose,
    orderId,
    onRequested,
    forceTargetUserId = null,
}) {
    const { authFetchWithRefresh, user, contacts = [], fetchContacts } = useUser();
    const { t } = useLang();
    // --- Локальные стейты ---
    const [filter, setFilter] = useState("");
    const [selectedIds, setSelectedIds] = useState([]);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState("");

    // Портал-рут безопасно (безусловный хук => порядок хуков стабилен)
    const [portalRoot, setPortalRoot] = useState(null);
    useEffect(() => {
        if (typeof window !== "undefined") setPortalRoot(document.body);
    }, []);

    // Если модалка открыта из чата 1-к-1 — зафиксировать получателя
    useEffect(() => {
        if (open && forceTargetUserId) setSelectedIds([forceTargetUserId]);
    }, [open, forceTargetUserId]);

    // Подтянуть контакты при открытии
    useEffect(() => {
        if (open) fetchContacts?.();
    }, [open, fetchContacts]);

    // Сброс полей при закрытии (кроме фиксированного id)
    useEffect(() => {
        if (!open) {
            setFilter("");
            setMessage("");
            setSending(false);
            if (!forceTargetUserId) setSelectedIds([]);
        }
    }, [open, forceTargetUserId]);

    // Закрытие по Esc — хук безусловный, логика условная
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // --- Утилиты UI ---
    const avatarSrcOf = (u) => {
        const p = u?.avatar_url || u?.avatar || null;
        if (!p) return "/default-avatar.png";
        return abs(p);
    };
    const roleToLabel = (role) => {
        const r = String(role || "").toUpperCase();
        switch (r) {
            case "TRANSPORT": return t("role.transport", "Перевозчик");
            case "OWNER": return t("role.owner", "Грузовладелец");
            case "MANAGER":
            case "EMPLOYEE": return t("role.manager", "Экспедитор");
            default: return t("common.user", "Пользователь");
        }
    };

    // Фильтрация кандидатов
    const candidates = useMemo(() => {
        const me = user?.id;
        const term = (filter || "").trim().toLowerCase();
        const pool = Array.isArray(contacts) ? contacts : [];
        const base = pool
            .filter((u) => u.id !== me)
            .filter((u) => {
                if (!term) return true;
                const hay = [
                    u.organization,
                    u.contact_person,
                    u.name,
                    u.email,
                    u.phone,
                    u.whatsapp,
                    u.telegram,
                    u.viber,
                    u.city,
                    u.country,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return hay.includes(term);
            });
        return forceTargetUserId ? base.filter((u) => u.id === forceTargetUserId) : base;
    }, [contacts, user?.id, filter, forceTargetUserId]);

    const toggle = useCallback((id) => {
        setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    }, []);

    const send = useCallback(async () => {
        if (selectedIds.length === 0 || sending) return;
        setSending(true);
        try {
            const res = await authFetchWithRefresh(
                api(`/track/requests`),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        order_id: orderId ?? null,
                        target_ids: selectedIds,
                        message: message || null,
                    }),
                }
            );
            if (!res.ok) throw new Error("failed");
            const data = await res.json().catch(() => []);
            onRequested && onRequested(Array.isArray(data) ? data : []);

            // Сигнализируем разделу мониторинга/чату обновиться
            try {
                window.dispatchEvent(new CustomEvent("ti:gps:refresh"));
            } catch { }

            onClose && onClose();
            alert(t("gps.requestSent", "Запрос отправлен"));
        } catch (e) {
            console.error(e);
            alert(t("gps.requestSendFailed", "Не удалось отправить запрос"));
        } finally {
            setSending(false);
        }
    }, [selectedIds, sending, authFetchWithRefresh, orderId, message, onRequested, onClose]);

    // До портала — проверяем только готовность рут-элемента; все хуки уже отработали
    if (!portalRoot) return null;

    return ReactDOM.createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0"
                    style={{
                        background: "rgba(0,0,0,.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        // максимально высокий слой, как в ShareLocationModal
                        zIndex: 2147483647,
                    }}
                    // Закрываем только при клике ИМЕННО по подложке
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) onClose?.();
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <motion.div
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 30, opacity: 0 }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 720,
                            maxWidth: "92vw",
                            background: "#1b2a44",
                            border: "1px solid #223b64",
                            borderRadius: 16,
                            padding: 16,
                            color: "#e3f2fd",
                            boxShadow: "0 10px 28px rgba(0,0,0,.5)",
                        }}
                    >
                        {/* Заголовок */}
                        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                            <div style={{ fontWeight: 800, fontSize: 18, color: "#43c8ff" }}>
                                {t("gps.request", "Запросить GPS")}
                            </div>
                            <div style={{ marginLeft: 10, fontSize: 13, color: "#9bc7ff" }}>
                                {orderId
                                    ? `${t("gps.forOrderShort", "для заявки")} #${orderId}`
                                    : t("gps.withoutOrder", "без привязки к заявке")}
                            </div>
                            <button
                                onClick={onClose}
                                style={{
                                    marginLeft: "auto",
                                    background: "transparent",
                                    color: "#9bc7ff",
                                    border: 0,
                                    fontSize: 22,
                                    cursor: "pointer",
                                    lineHeight: 1,
                                }}
                                aria-label={t("common.close", "Закрыть")}
                                title={t("common.close", "Закрыть")}
                            >
                                ×
                            </button>
                        </div>

                        {/* Поиск */}
                        <input
                            placeholder={t("search.userPlaceholder", "Поиск пользователя…")}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: "1px solid #2a4572",
                                background: "#0f1b2e",
                                color: "#e3f2fd",
                                outline: "none",
                            }}
                        />

                        {/* Список пользователей */}
                        <div
                            className="max-h-[360px] overflow-auto rounded-xl"
                            style={{
                                border: "1px solid rgba(255,255,255,.06)",
                                marginTop: 10,
                            }}
                        >
                            {candidates.length === 0 ? (
                                <div className="px-3 py-3 text-sm opacity-70">
                                    {t("common.noMatches", "Ничего не найдено…")}
                                </div>
                            ) : (
                                candidates.map((u) => {
                                    const selected = selectedIds.includes(u.id);
                                    return (
                                        <div
                                            key={u.id}
                                            onClick={() => toggle(u.id)}
                                            className="flex items-center justify-between px-3 py-3 border-b border-[rgba(255,255,255,.06)] cursor-pointer"
                                            style={{
                                                background: selected ? "#102844" : "transparent",
                                                transition: "background .15s ease",
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={avatarSrcOf(u)}
                                                    alt={u.name || u.email || "avatar"}
                                                    className="w-9 h-9 rounded-full object-cover"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        e.currentTarget.src = "/default-avatar.png";
                                                    }}
                                                    style={{ background: "#122232", border: "1px solid #223350" }}
                                                />
                                                <div>
                                                    <div className="text-sm">{u.name || u.email}</div>
                                                    <div className="text-xs opacity-70">{roleToLabel(u.role)}</div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {selected && (
                                                    <span
                                                        className="text-xs px-2 py-1 rounded-lg"
                                                        style={{ background: "#193c66" }}
                                                    >
                                                        {t("common.selected", "Выбрано")}
                                                    </span>
                                                )}
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        toggle(u.id);
                                                    }}
                                                    aria-label={t("common.choose", "Выбрать")}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Сообщение */}
                        <textarea
                            placeholder={t("gps.messageOptional", "Сообщение (необязательно)")}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            style={{
                                width: "100%",
                                marginTop: 12,
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: "1px solid #2a4572",
                                background: "#0f1b2e",
                                color: "#e3f2fd",
                                minHeight: 72,
                                outline: "none",
                            }}
                        />

                        {/* Кнопки */}
                        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                            <button
                                onClick={send}
                                disabled={sending || selectedIds.length === 0}
                                style={{
                                    background:
                                        sending || selectedIds.length === 0 ? "#1d7f5f80" : "#1d7f5f",
                                    border: "1px solid #0f634a",
                                    color: "#e9fffa",
                                    fontWeight: 800,
                                    borderRadius: 10,
                                    padding: "10px 18px",
                                    cursor:
                                        sending || selectedIds.length === 0 ? "not-allowed" : "pointer",
                                    boxShadow: "inset 0 -2px 0 rgba(0,0,0,.18)",
                                }}
                            >
                                {t("gps.sendRequest", "Отправить запрос")}
                            </button>
                            <button
                                onClick={onClose}
                                style={{
                                    background: "#253a5e",
                                    color: "#9bc7ff",
                                    fontWeight: 700,
                                    border: "1px solid #20365a",
                                    borderRadius: 10,
                                    padding: "10px 16px",
                                    cursor: "pointer",
                                }}
                            >
                                {t("common.cancel", "Отмена")}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        portalRoot
    );
}
