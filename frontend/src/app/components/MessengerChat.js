"use client";
// Хелпер: строим стабильный и уникальный ключ для React
// Берём несколько признаков (id, client_nonce, event_id, timestamp), а в крайнем случае индекс
// БАЗОВАЯ сигнатура сообщения (без индекса): может совпасть для двух call-ивентов.
const buildMsgKeyBase = (m) => {
    const id = m?.id ?? null;                                   // серверный id
    const loc = m?.client_nonce ?? m?.client_id ?? m?.localId ?? null; // локальный id, если есть
    const ev = m?.event_id ?? m?.call_event_id ?? null;         // id события звонка
    const ts = m?.ts ?? m?.sent_at ?? m?.created_at ?? m?.time ?? null; // метка времени
    return ["m", id, loc, ev, ts].filter(Boolean).join("-");
};
// FIX: используем React.use* => нужен явный импорт React
import * as React from "react";
import { api, abs } from "@/config/env";
import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from "react";
const fmtRemain = (iso, t) => !iso ? "" : (() => {
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return t("time.fewSeconds", "несколько секунд");
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} ${t("unit.min", "мин")}`;
    const h = Math.floor(m / 60);
    return `${h} ${t("unit.h", "ч")} ${m % 60} ${t("unit.min", "мин")}`;
})();
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { FaPaperPlane, FaGavel, FaSmile, FaPaperclip, FaEye, FaCheck, FaThumbsUp, FaHeart, FaThumbtack, FaTrash, FaLanguage } from "react-icons/fa";
import { useMessenger } from "./MessengerContext";
import { useUser } from "../UserContext";
import { useRouter } from "next/navigation";
import { FaMapMarkerAlt } from "react-icons/fa";
import EmojiPicker from 'emoji-picker-react';
import VoiceRecorder from "./VoiceRecorder";
import AudioMessageBubble from "./AudioMessageBubble";
// Нормализуем URL чат‑файлов: всегда ходим через /api/static/chat_files/...
function resolveChatFileUrl(raw = "") {
    if (!raw) return "";
    // убираем домен если прислан абсолютный URL
    let p = raw.replace(/^https?:\/\/[^/]+/i, "");
    if (!p.startsWith("/")) p = `/${p}`;
    // поддерживаем старые пути без /static
    if (p.startsWith("/chat_files/")) p = `/static${p}`;
    // обязательно через API‑префикс
    if (!p.startsWith("/api/")) p = `/api${p}`;
    return p;
}
// Карточка звонка (единственный импорт)
import CallCard from "./messages/CallCard";
import GroupMembersModal from "./GroupMembersModal";
import { Users2, Phone as PhoneIcon } from "lucide-react";
import { FaUserPlus, FaUserMinus, FaShieldAlt, FaEdit, FaInfoCircle, FaBell, FaBellSlash } from "react-icons/fa";
import { useAvatarFly } from "../../hooks/useAvatarFly";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useLang } from "../i18n/LangProvider"; // скорректируй путь
import { getTruckBodyTypes } from "./truckOptions"; // Централизованные типы кузова

// --- УБРАНО: самописные mapTruckTypeToKey/formatTruckType.
// Вместо них используем общий список из truckOptions.

function localizeTicketStatus(s, t) {
    const m = {
        NEW: t("support.statuses.NEW", "Новая"),
        PENDING: t("support.statuses.PENDING", "В ожидании"),
        ASSIGNED: t("support.statuses.ASSIGNED", "Назначена"),
        RESOLVED: t("support.statuses.RESOLVED", "Решено"),
        CLOSED: t("support.statuses.CLOSED", "Закрыта"),
    };
    return m[s] || s || "";
}

function SupportRatingPrompt({ ticketId, onSubmitted }) {
    const { t } = useLang();

    // Локализованный список типов кузова и хелпер для получения лейбла по value
    const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
    const typeLabel = (raw) => {
        if (!raw) return "";
        const v = String(raw).trim().toLowerCase();
        const hit = BODY_TYPES.find(o => String(o.value || "").toLowerCase() === v);
        return hit ? hit.label : raw;
    };

    const [score, setScore] = useState(0);
    const [comment, setComment] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!score) return;
        setBusy(true);
        try {
            await fetch(api(`/support/tickets/${ticketId}/rate`), {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("token")}` },
                body: JSON.stringify({ score, comment })
            });
            onSubmitted?.();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ padding: 12, border: "1px solid #444", borderRadius: 10, marginTop: 10 }}>
            <div>{t("support.ratePrompt", "Оцените качество поддержки:")}</div>
            {[1, 2, 3, 4, 5].map(i => (
                <span key={i} style={{ cursor: "pointer", color: i <= score ? "gold" : "#aaa", fontSize: 22 }}
                    onClick={() => setScore(i)}>★</span>
            ))}
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={t("support.commentPlaceholder", "Комментарий...")} rows={2}
                style={{ width: "100%", marginTop: 8, padding: 6 }} />
            <button onClick={submit} disabled={busy || !score}
                style={{ marginTop: 6, padding: "6px 12px", borderRadius: 6, background: "#0ea5e9", color: "#fff" }}>
                {busy ? t("common.sending", "Отправка...") : t("common.send", "Отправить")}
            </button>
        </div>
    );
}

// Абсолютные URL для статики/аватаров берём из централизованного abs()


function ChatHeader({
    chat, peerUser, chatId, onGroupClick,
    showSearch, setShowSearch,
    searchMsg, setSearchMsg,
    forceUpdate,
    matchRefs,
    onClose,
    onBack
}) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const searchInputRef = useRef(null);
    const { fetchMessages, messages, pinChat, pinnedChats, unpinChat, getSupportTyping, getSupportQueue, wsRef } = useMessenger();
    // Берём функцию с рефрешем токена из контекста
    const { user, authFetchWithRefresh } = useUser();
    const [participants, setParticipants] = useState([]);
    const isSupport = !!chat?.support;
    // В саппорт-чате принудительно скрываем поле поиска, если оно было открыто
    useEffect(() => {
        if (isSupport && showSearch) setShowSearch(false);
    }, [isSupport, showSearch, setShowSearch]);
    const isSupportAgent = ((user?.role || "") + "").toUpperCase() === "SUPPORT";
    const supportStatus = (chat?.support_status || "").toString().replace("TicketStatus.", "");
    const eta = chat?.autoclose_eta_iso || null;
    const isGroup = isSupport ? false : !!chat?.is_group; // саппорт НЕ отображаем как группу
    // --- ephemeral support state ---
    const isTyping = getSupportTyping?.(chatId);
    const queueInfo = getSupportQueue?.(chatId); // {position, eta_minutes} | null

    // peer = chat.peer (если есть) иначе peerUser (предпросмотр)
    // Берём того, у кого реально есть аватар (приоритет — peerUser, т.к. он приходит полнее после запроса)
    const hasAvatar = (u) => !!(u && (u.avatar || u.avatar_url || u.photo));
    const peer = !isGroup
        ? (hasAvatar(peerUser) ? { ...(chat?.peer || {}), ...peerUser } : (chat?.peer || peerUser || null))
        : null;

    // Теперь можно безопасно вычислить заголовок
    const titleText = isSupport
        ? t("support.title", chat?.display_title || "Поддержка")
        : (isGroup
            ? (chat?.group_name || t("chat.groupFallback", "Группа"))
            : (
                peer?.organization
                || peer?.contact_person
                || peer?.full_name
                || peer?.name
                || peer?.email
                || (peer?.id ? `ID:${peer.id}` : t("chat.userFallback", "Пользователь"))
            ));

    const isMobile = useIsMobile(800);

    // Нормализуем поле и путь к аватару
    function resolveAvatar(u) {
        if (!u) return null;
        const raw = u.avatar ?? u.avatar_url ?? u.photo ?? null;
        if (!raw) return null;
        if (raw.startsWith("http") || raw.startsWith("blob:")) return raw;
        return abs(raw);
    }

    // Аккуратный cache-bust (не трогаем дефолтные картинки)
    function withCacheBust(url) {
        if (!url) return url;
        if (/default-avatar|group-default/.test(url)) return url;
        if (url.startsWith("blob:")) return url;
        return url; // кэшируем нормально, без постоянных перезагрузок
    }

    const avatarUrl = isSupport
        ? abs(chat?.support_logo_url || chat?.group_avatar || "/static/support-logo.svg")
        : (isGroup
            ? (chat?.group_avatar || "/group-default.png")
            : (resolveAvatar(peer) || "/default-avatar.png"));
    const { mutedGroups, muteGroup, unmuteGroup } = useMessenger();
    const isMuted = isGroup && mutedGroups.includes(chat.chat_id);
    const avatarRef = useRef(null);

    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true); }, []);

    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    useEffect(() => {
        if (isGroup && chat?.chat_id) {
            authFetchWithRefresh(api(`/chat/${chat.chat_id}/participants`))
                .then(r => r.json())
                .then(setParticipants)
                .catch(() => setParticipants([]));
        }
    }, [isGroup, chat?.chat_id, forceUpdate]);

    // Utility function for polling DOM
    function waitForElement(selector, maxTries = 14, delay = 30) {
        return new Promise((resolve, reject) => {
            let tries = 0;
            function check() {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (++tries > maxTries) return reject(new Error("Element not found"));
                setTimeout(check, delay);
            }
            check();
        });
    }

    function handleAvatarClick() {
        if (isGroup) {
            if (typeof onGroupClick === "function") onGroupClick();
        } else if (peer?.id) {
            window.location.href = `/profile/${peer.id}`;
        }
    }

    return (
        <div
            className={`${isMobile ? "sticky top-0" : "relative"} z-20 flex items-center gap-4 px-5 py-3 border-b border-[#e7eaf1] dark:border-[#232c39] bg-[#f7fafe] dark:bg-[#1c2231]`}
            style={{
                position: isMobile ? "sticky" : "relative",
                top: 0,
                background: isMobile ? "#1c2231" : undefined,
                borderBottom: isMobile ? "1px solid #232c39" : undefined,
                zIndex: 25
            }}
        >
            {/* Кнопка "назад" (только мобилка), слева от аватарки */}
            {isMobile && typeof onBack === "function" && (
                <button
                    onClick={onBack}
                    className="-ml-1 mr-1 md:hidden flex items-center justify-center rounded-xl px-2 py-2 text-white/85 hover:text-white hover:bg-white/10 active:bg-white/20 transition"
                    aria-label={t("chat.backToList", "Назад к списку")}
                    title={t("chat.back", "Назад")}
                    style={{ minWidth: 36, minHeight: 36 }}
                >
                    {/* chevron-left */}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M15 19L8 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            )}
            {/* Аватар */}
            <div
                ref={avatarRef}
                style={{ cursor: isGroup ? "default" : "pointer" }}
                onClick={handleAvatarClick}
            >
                {isSupport ? (
                    <img
                        src={withCacheBust(avatarUrl)}
                        alt="support"
                        className="w-11 h-11 rounded-full object-cover"
                        onError={e => { e.currentTarget.src = withCacheBust(abs("/static/support-logo.svg")); }}
                    />
                ) : isGroup ? (
                    avatarUrl && avatarUrl !== "/group-default.png" ? (
                        <img
                            src={withCacheBust(avatarUrl)}
                            alt="group"
                            className="w-11 h-11 rounded-full object-cover"
                            style={{ border: "2px solid #38bcf8", background: "#202c44" }}
                        />
                    ) : (
                        <div className="w-11 h-11 flex items-center justify-center bg-[#e2f0fa] rounded-full border-2 border-[#38bcf8]">
                            <Users2 size={30} color="#38bcf8" />
                        </div>
                    )
                ) : (
                    <img
                        src={withCacheBust(avatarUrl)}
                        alt="avatar"
                        className="w-11 h-11 rounded-full object-cover"
                        style={{ background: "#202c44" }}
                        onError={e => { if (e.currentTarget.src !== window.location.origin + "/default-avatar.png") e.currentTarget.src = "/default-avatar.png"; }}
                    />
                )}
            </div>
            {/* Инфо: имя + колокольчик */}
            <div className="flex-1 min-w-0 flex flex-col" style={{ position: "relative" }}>
                <div className="flex items-center gap-2">
                    <span
                        className="font-semibold text-lg text-[#232a36] dark:text-white truncate"
                        /* На мобилке поверх тёмного хедера цвет уходит в тёмный — форсим светлый */
                        style={{
                            cursor: (!isGroup && !isSupport) ? "pointer" : "default",
                            color: isMobile ? "#e6f0ff" : undefined
                        }}
                        onClick={(e) => {
                            if (!isGroup && !isSupport && peer?.id) {
                                e.stopPropagation();
                                window.location.href = `/profile/${peer.id}`;
                            }
                        }}
                    >
                        {titleText}
                    </span>
                    {isGroup && !isSupport && (
                        <button
                            style={{
                                background: "none", border: "none", cursor: "pointer", marginLeft: 4,
                                padding: 2, display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                            title={isMuted ? t("chat.unmute", "Включить уведомления") : t("chat.mute", "Отключить уведомления")}
                            onClick={e => {
                                e.stopPropagation();
                                if (isMuted) unmuteGroup(chat.chat_id);
                                else muteGroup(chat.chat_id);
                            }}
                        >
                            {isMuted
                                ? <FaBellSlash style={{ color: "#38bcf8", fontSize: 19, verticalAlign: "middle" }} />
                                : <FaBell style={{ color: "#38bcf8", fontSize: 19, verticalAlign: "middle" }} />}
                        </button>
                    )}
                </div>
                <span className="text-xs text-[#7c8ca7] dark:text-[#91a6be] mt-1 truncate">
                    {isSupport
                        ? (
                            chat?.display_subtitle
                                ? t(chat.display_subtitle, chat.display_subtitle)
                                : (chat?.support_status
                                    ? `${t("support.status", "Статус")}: ${localizeTicketStatus(String(chat.support_status).replace("TicketStatus.", ""), t)}`
                                    : "")
                        )
                        : (isGroup
                            ? `${t("chat.members", "Участников")}: ${participants.length || "—"}`
                            : (peer?.organization ? peer?.contact_person : peer?.email || "")
                        )
                    }
                </span>
            </div>
            {/* ПОИСК и КНОПКА "закрыть" */}
            <div className="flex items-center ml-auto gap-1">
                {/* Кнопки для агента поддержки */}
                {isSupport && isSupportAgent && chat?.support_ticket_id && supportStatus !== "CLOSED" && (
                    <div className="hidden md:flex items-center gap-2 mr-2">
                        {supportStatus === "RESOLVED" && eta && (
                            <span className="px-2 py-1 text-xs rounded bg-emerald-600/20 border border-emerald-500/40">
                                {t("support.resolvedAutoClose", "Решено • автозакрытие через")} {fmtRemain(eta, t)}
                            </span>
                        )}
                        <button
                            className="px-2 py-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-xs"
                            onClick={async () => {
                                await authFetchWithRefresh(api(`/support/tickets/${chat.support_ticket_id}/resolve`), {
                                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: 24 })
                                });
                                window.dispatchEvent(new CustomEvent("support_meta_changed", { detail: { chatId } }));
                            }}
                        >{t("support.markResolved", "Отметить решённым")}</button>
                        <button
                            className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white text-xs"
                            onClick={async () => {
                                await authFetchWithRefresh(api(`/support/tickets/${chat.support_ticket_id}/close`), { method: "POST" });
                                window.dispatchEvent(new CustomEvent("support_meta_changed", { detail: { chatId } }));
                            }}
                        >{t("support.closeTicket", "Закрыть")}</button>
                    </div>
                )}
                {/* Телефон (WebRTC) — скрыт для саппорт-чата */}
                {!isSupport && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            try { window.dispatchEvent(new CustomEvent("call_start", { detail: { chatId } })); } catch { }
                        }}
                        className="w-9 h-9 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 active:scale-[0.98] transition"
                        title={t("chat.call", "Позвонить")}
                        aria-label={t("chat.call", "Позвонить")}
                    >
                        <PhoneIcon size={18} className="opacity-80 hover:opacity-100" />
                    </button>
                )}
                {/* Лупа + поиск */}
                {!isSupport && !showSearch && (
                    <button
                        onClick={e => { e.stopPropagation(); setShowSearch(true); }}
                        style={{
                            background: "none",
                            border: "none",
                            color: "#38bcf8",
                            fontSize: 20,
                            cursor: "pointer",
                            padding: 4
                        }}
                        title={t("chat.searchInMessages", "Поиск по сообщениям")}
                    >
                        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </button>
                )}
                {!isSupport && showSearch && (
                    <div style={{
                        position: "relative",
                        width: 220,
                        display: "flex",
                        alignItems: "center"
                    }}>
                        {/* Лупа слева ВНУТРИ поля */}
                        <span style={{
                            position: "absolute",
                            left: 10,
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                            color: "#38bcf8",
                            fontSize: 18,
                            opacity: 0.8
                        }}>
                            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="8" cy="8" r="7" />
                                <line x1="16" y1="16" x2="12.5" y2="12.5" />
                            </svg>
                        </span>
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={t("chat.searchPlaceholder", "Поиск по сообщениям...")}
                            value={searchMsg}
                            onChange={e => setSearchMsg(e.target.value)}
                            onBlur={() => { if (!searchMsg) setShowSearch(false); }}
                            onKeyDown={e => {
                                if (e.key === "Escape") {
                                    setShowSearch(false);
                                    setSearchMsg("");
                                }
                                if (e.key === "Enter" && matchRefs && matchRefs.current[0]) {
                                    matchRefs.current[0].scrollIntoView({ behavior: "smooth", block: "center" });
                                }
                            }}
                            style={{
                                width: 220,
                                padding: "7px 32px 7px 34px",
                                borderRadius: 7,
                                border: "1.5px solid #364869",
                                background: "#232b3c",
                                color: "#e8f1ff",
                                fontSize: 15
                            }}
                        />

                    </div>
                )}
                {/* Кнопка "закрепить чат" — скрыта для саппорт-чата; на мобилке скрываем полностью */}
                {!isSupport && !isMobile && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const isPinned = Array.isArray(pinnedChats) && pinnedChats.some(c => c.chat_id === chat?.chat_id);
                            if (isPinned) {
                                if (typeof unpinChat === "function") unpinChat(chat.chat_id);
                            } else {
                                if (typeof pinChat === "function") pinChat(chat);
                            }
                        }}
                        style={{
                            background: "none",
                            border: "none",
                            color: "#38bcf8",
                            fontSize: 22,
                            cursor: "pointer",
                            margin: "0 6px"
                        }}
                        title={(Array.isArray(pinnedChats) && pinnedChats.some(c => c.chat_id === chat?.chat_id)) ? t("chat.unpin", "Открепить чат") : t("chat.pin", "Закрепить чат")}
                        aria-label={(Array.isArray(pinnedChats) && pinnedChats.some(c => c.chat_id === chat?.chat_id)) ? t("chat.unpin", "Открепить чат") : t("chat.pin", "Закрепить чат")}
                    >
                        <FaThumbtack
                            style={{
                                display: "inline-block",
                                transform: (Array.isArray(pinnedChats) && pinnedChats.some(c => c.chat_id === chat?.chat_id)) ? "rotate(0deg)" : "rotate(-25deg)",
                                filter: (Array.isArray(pinnedChats) && pinnedChats.some(c => c.chat_id === chat?.chat_id)) ? "none" : "brightness(1.1)",
                                opacity: 0.95
                            }}
                            size={18}
                        />
                    </button>
                )}

                {/* Кнопка "закрыть чат" — ТОЛЬКО на десктопе (на мобилке крестик у MobileBottomSheet) */}
                {!isMobile && (
                    <button
                        onClick={() => {
                            if (onClose) onClose();
                            else window.history.back();
                        }}
                        className="close-btn"
                        style={{
                            marginLeft: 18,
                            background: "none",
                            border: "none",
                            color: "#8eb5e3",
                            fontSize: 22,
                            cursor: "pointer",
                        }}
                        title={t("chat.close", "Закрыть чат")}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}

// === Tiny "cursor toast" (мини-сообщение у курсора) =====================
function CursorToast({ item }) {
    if (!item) return null;
    const { x, y, text, variant } = item;
    const bg =
        variant === "warn" ? "#8b1d2c" :
            variant === "ok" ? "#0f634a" :
                "#334155";
    return (
        <div style={{
            position: "fixed", left: x, top: y,
            transform: "translate(-50%, -100%)",
            background: bg, color: "#fff",
            padding: "8px 12px", borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
            fontWeight: 700, zIndex: 9999, pointerEvents: "none",
            animation: "ti-cursor-toast .9s ease-out forwards"
        }}>
            {text}
            <style jsx>{`
        @keyframes ti-cursor-toast {
          0% { opacity: 0; transform: translate(-50%, -40%); }
          15% { opacity: 1; transform: translate(-50%, -100%); }
          100% { opacity: 0; transform: translate(-50%, -160%); }
        }
      `}</style>
        </div>
    );
}

function useCursorToast() {
    const [toast, setToast] = useState(null);
    const show = useCallback((eOrPos, text, variant = "info") => {
        const pos = (eOrPos && typeof eOrPos.clientX === "number")
            ? { x: eOrPos.clientX, y: eOrPos.clientY }
            : (eOrPos || { x: window.innerWidth - 40, y: window.innerHeight - 40 });
        setToast({ ...pos, text, variant });
        setTimeout(() => setToast(null), 1000);
    }, []);
    return { toast, show };
}

// === GPS helper cards (status-aware) ===
function GpsRequestCard({ msg, user, chatId, API, authFetchWithRefresh, fetchMessages, router, showToast }) {
    const { t } = useLang();
    let payload = null;
    try { payload = JSON.parse(msg.content || "{}"); } catch { payload = {}; }
    const rId = Array.isArray(payload?.request_ids) ? payload.request_ids[0] : null;
    const isTarget = payload?.target_user_id && payload.target_user_id === user?.id;
    const [status, setStatus] = useState("PENDING"); // PENDING | ACCEPTED | DECLINED | ENDED
    const [sessionId, setSessionId] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!rId) return;
        setLoading(true);
        try {
            const [rIn, rOut] = await Promise.all([
                authFetchWithRefresh(`${API}/track/requests/incoming`),
                authFetchWithRefresh(`${API}/track/requests/outgoing`),
            ]);
            const pick = async (resp) => {
                if (!resp?.ok) return null;
                const data = await resp.json();
                const arr = Array.isArray(data) ? data : [];
                const found = arr.find((it) => (it?.request?.id || it?.id) === rId);
                return found ? (found.request || found) : null;
            };
            let item = await pick(rIn);
            if (!item) item = await pick(rOut);
            if (item) {
                setStatus(item.status || "PENDING");
                setSessionId(item.session_id || null);
            }
        } finally {
            setLoading(false);
        }
    }, [rId, authFetchWithRefresh]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (status !== "PENDING") return;
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [status, load]);

    const accept = async (e) => {
        if (!rId) return;
        await authFetchWithRefresh(`${API}/track/requests/${rId}/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accept: true }),
        });
        await load();
        if (chatId) fetchMessages(chatId);
        showToast?.(e, t("toast.shareStarted", "Шеринг запущен"), "ok");
    };
    const decline = async (e) => {
        if (!rId) return;
        await authFetchWithRefresh(`${API}/track/requests/${rId}/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accept: false }),
        });
        await load();
        if (chatId) fetchMessages(chatId);
        showToast?.(e, t("toast.requestDeclined", "Запрос отклонён"), "warn");
    };
    const stopShare = async (e) => {
        if (!sessionId) return;
        await authFetchWithRefresh(`${API}/track/sessions/${sessionId}/end`, { method: "POST" });
        setStatus("ENDED");
        setSessionId(null);
        showToast?.(e, t("toast.shareStopped", "Шеринг остановлен"), "warn");
    };

    return (
        <div
            style={{
                background: "#1e2a44",
                border: "1px solid rgba(134,239,172,.18)",
                borderRadius: 12,
                padding: "10px 14px",
                color: "#e2f3ff",
                marginBottom: 9,
                maxWidth: 520,
                alignSelf: msg.sender_id === user?.id ? "flex-end" : "flex-start",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 800, color: "#86efac" }}>{t("gps.requestTitle", "Запрос GPS-мониторинга")}</div>
                {status === "ACCEPTED" && sessionId && (
                    <span style={{ fontSize: 11, color: "#22d3ee", background: "#0b3a55", borderRadius: 999, padding: "2px 8px" }}>
                        {t("gps.active", "АКТИВНО")}
                    </span>
                )}
                {status === "ENDED" && (
                    <span style={{ fontSize: 11, color: "#fbbf24", background: "#3a2a0b", borderRadius: 999, padding: "2px 8px" }}>
                        {t("gps.stopped", "ОСТАНОВЛЕНО")}
                    </span>
                )}
                {status === "DECLINED" && (
                    <span style={{ fontSize: 11, color: "#fca5a5", background: "#3a0b0b", borderRadius: 999, padding: "2px 8px" }}>
                        {t("gps.declined", "ОТКЛОНЕНО")}
                    </span>
                )}
            </div>

            {status === "PENDING" && (
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                    {isTarget ? t("gps.pendingTarget", "С вами хотят поделиться геолокацией. Принять запрос?") : t("gps.pendingOut", "Запрос отправлен. Ожидаем ответа.")}
                </div>
            )}

            {status === "ACCEPTED" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                        {sessionId ? t("gps.accepted.userShares", "Пользователь делится локацией.") : t("gps.accepted.preparing", "Запрос принят. Сессия готовится…")}
                    </div>
                    <button
                        onClick={() => router?.push?.("/profile?monitoring=1")}
                        style={{ padding: "8px 12px", borderRadius: 10, background: "#2a7bb7", color: "#fff", fontWeight: 800 }}
                    >
                        {t("gps.openMonitoring", "Открыть мониторинг")}
                    </button>
                    {isTarget && sessionId && (
                        <button
                            onClick={(e) => stopShare(e)}
                            style={{ padding: "8px 12px", borderRadius: 10, background: "#8b1d2c", color: "#fff", fontWeight: 800 }}
                        >
                            {t("gps.stopShare", "Остановить шеринг")}
                        </button>
                    )}
                </div>
            )}

            {status === "PENDING" && isTarget && (
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        onClick={(e) => accept(e)}
                        disabled={loading}
                        style={{ padding: "8px 12px", borderRadius: 10, background: "#0f634a", color: "#e9fffa", fontWeight: 800 }}
                    >{t("common.accept", "Принять")}</button>
                    <button
                        onClick={(e) => decline(e)}
                        disabled={loading}
                        style={{ padding: "8px 12px", borderRadius: 10, background: "#3b4257", color: "#fff" }}
                    >{t("common.decline", "Отклонить")}</button>
                </div>
            )}

            {status === "DECLINED" && <div style={{ opacity: 0.75 }}>{t("toast.requestDeclined", "Запрос отклонён")}</div>}
            {status === "ENDED" && <div style={{ opacity: 0.75 }}>{t("toast.shareStopped", "Шеринг остановлен")}</div>}
        </div>
    );
}

function GpsShareCard({ msg, user, API, authFetchWithRefresh, router, showToast }) {
    // локализатор для подписи кнопок/бейджей и текстов
    const { t } = useLang();
    let payload = null;
    try { payload = JSON.parse(msg.content || "{}"); } catch { payload = {}; }
    const url = payload?.link || (payload?.token ? `${window.location.origin}/track/link/${payload.token}` : null);
    const isMine = msg.sender_id === user?.id;
    const [sessionId, setSessionId] = useState(payload?.session_id || null);
    const [active, setActive] = useState(true);
    const rootRef = useRef(null);
    const seenOnce = useRef(false);

    useEffect(() => {
        const orderId = payload?.order_id;
        if (!sessionId && orderId) {
            authFetchWithRefresh(`${API}/track/for_order/${orderId}`)
                .then(r => r.ok ? r.json() : null)
                .then(s => { if (s?.id) setSessionId(s.id); });
        }
    }, [sessionId, payload?.order_id, API, authFetchWithRefresh]);

    const stopShare = async (e) => {
        if (!sessionId) return;
        await authFetchWithRefresh(`${API}/track/sessions/${sessionId}/end`, { method: "POST" });
        setActive(false);
        setSessionId(null);
        showToast?.(e, t("toast.shareStopped", "Шеринг остановлен"), "warn");
    };

    // Входящий шаринг: показать разовое мини-сообщение возле карточки
    useEffect(() => {
        if (seenOnce.current) return;
        if (!isMine && active && rootRef.current) {
            const r = rootRef.current.getBoundingClientRect();
            showToast?.({ x: r.right - 10, y: r.top + 10 }, t("toast.userSharesHint", "Пользователь делится локацией"), "ok");
            seenOnce.current = true;
        }
    }, [isMine, active, showToast]);

    return (
        <div
            ref={rootRef}
            style={{
                background: "#20314f",
                border: "1px solid rgba(66,194,255,.22)",
                borderRadius: 12, padding: "10px 14px",
                color: "#dff6ff", marginBottom: 9, maxWidth: 520,
                alignSelf: isMine ? "flex-end" : "flex-start"
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 800, color: "#42c2ff" }}>{t("gps.sharedTitle", "Поделились GPS-локацией")}</div>
                {!active && (
                    <span style={{ fontSize: 11, color: "#fbbf24", background: "#3a2a0b", borderRadius: 999, padding: "2px 8px" }}>
                        {t("gps.stopped", "ОСТАНОВЛЕНО")}
                    </span>
                )}
            </div>
            <div style={{ fontSize: 13, opacity: .85, marginBottom: 10 }}>
                {t("gps.sharedHint", "Используйте ссылку, чтобы посмотреть перемещение на карте.")}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {url ? (
                    <button
                        onClick={() => window.open(url, "_blank")}
                        style={{ padding: "8px 12px", borderRadius: 10, background: "#2a7bb7", color: "#fff", fontWeight: 800 }}
                    >{t("common.open", "Открыть")}</button>
                ) : (
                    <div style={{ opacity: .7 }}>{t("gps.linkLater", "Ссылка будет доступна позже")}</div>
                )}
                {isMine && sessionId && active && (
                    <button
                        onClick={(e) => stopShare(e)}
                        style={{ padding: "8px 12px", borderRadius: 10, background: "#8b1d2c", color: "#fff", fontWeight: 800 }}
                    >{t("gps.stopShare", "Остановить шеринг")}</button>
                )}
                <button
                    onClick={() => router?.push?.("/profile?monitoring=1")}
                    style={{ padding: "8px 12px", borderRadius: 10, background: "#3b4257", color: "#fff" }}
                >{t("gps.monitoring", "Мониторинг")}</button>
            </div>
        </div>
    );
}

export default function MessengerChat({ chatId, peerUser, closeMessenger, goBack }) {
    // ---- суффиксатор коллизий ключей на один рендер ----␊
    const { t, lang } = useLang();
    // Локализованные типы кузова + хелпер лейбла для использования ниже (tr.truck_type)
    // Используем общий источник правды из truckOptions.js
    const BODY_TYPES_FLAT = useMemo(() => {
        const base = getTruckBodyTypes(t) || [];
        return base.flatMap(o => Array.isArray(o?.children) ? o.children : [o]);
    }, [t]);

    const typeLabel = useCallback((raw) => {
        if (!raw) return "";
        const v = String(raw).trim().toLowerCase();
        const hit = BODY_TYPES_FLAT.find(o => String(o.value || "").toLowerCase() === v);
        return hit ? hit.label : raw;
    }, [BODY_TYPES_FLAT]);
    const __seenBases = new Map();
    const makeUniqueKey = (base, idx) => {
        const b = base || `m-idx-${idx}`;
        const n = (__seenBases.get(b) || 0) + 1;
        __seenBases.set(b, n);
        return n > 1 ? `${b}~${n}` : b;
    };
    const fileInputRef = useRef(null);
    const router = useRouter();
    const { user, API, authFetchWithRefresh } = useUser();
    const [searchMsg, setSearchMsg] = useState(""); // ← уже есть
    const [showSearch, setShowSearch] = useState(false); // ← уже есть
    const {
        messages,
        sendMessage,
        fetchMessages,
        markChatRead,
        pendingAttachment,
        setPendingAttachment,
        setChatId,
        connectWS,
        getSupportQueue,
        getSupportTyping,      // ← добавлено: селектор «саппорт печатает»
        fetchChatList,         // ← добавлено: нужно обновлять список чатов/сайдбар
        wsRef,
        deleteChatForMe,    // ← добавили
        clearLocalChat      // ← добавили
    } = useMessenger();

    const [openReactionFor, setOpenReactionFor] = useState(null);

    const { toast, show: showToast } = useCursorToast();

    // Управление GPS-модалками
    const [showRequestGps, setShowRequestGps] = useState(false);
    const [showShareGps, setShowShareGps] = useState(false);
    const GPS_DISABLED = true;
    const [gpsMenuOpen, setGpsMenuOpen] = useState(false);
    const gpsMenuRef = useRef(null);
    // Не читаем chat?.support напрямую в коллбэках (TDZ). Держим флаг в ref:
    const isSupportRef = useRef(false);

    // Коллбэки из модалок → создаём спец-сообщения в чат
    const handleGpsRequested = useCallback(async (createdList = []) => {
        // В саппорт-чате запрещаем создание запросов локации
        if (!!chat?.support) { setShowRequestGps(false); return; }
        try {
            const ids = (Array.isArray(createdList) ? createdList : [])
                .map(x => x?.id ?? x?.request?.id)
                .filter(Boolean);
            await sendMessage({
                message_type: "gps_request",
                content: JSON.stringify({
                    request_ids: ids,
                    order_id: null,
                    target_user_id: peerUser?.id ?? null,
                }),
            });
        } finally {
            setShowRequestGps(false);
        }
    }, [sendMessage, authFetchWithRefresh, API, peerUser]);

    const handleGpsShared = useCallback(async (session, recipientId) => {
        // В саппорт-чате запрещаем делиться геолокацией
        if (isSupportRef.current) { setShowShareGps(false); return; }
        try {
            // Делаем (или продлеваем) публичную ссылку, чтобы в чате была кликабельная
            let link = null, token = null;
            try {
                const res = await authFetchWithRefresh(`${API}/track/sessions/${session?.id}/share_link`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ expires_in_hours: 24 * 7 }),
                });
                const data = await res.json().catch(() => null);
                token = data?.token ?? null;
                link = data?.url || (token ? `${window.location.origin}/track/link/${token}` : null);
            } catch (_) { }
            await sendMessage({
                message_type: "gps_share",
                content: JSON.stringify({
                    session_id: session?.id,
                    token,
                    link,
                    to_user_id: recipientId ?? peerUser?.id ?? null,
                }),
            });
        } finally {
            setShowShareGps(false);
        }
    }, [sendMessage, authFetchWithRefresh, API, peerUser]);
    // === Быстрые действия GPS без модалок ===
    // Создаём (если нужно) сессию трекинга без привязки к заявке/транспорту
    const ensureChatTrackSession = useCallback(async () => {
        try {
            // создаём "общую" сессию (order_id=null, transport_id=null)
            const res = await authFetchWithRefresh(`${API}/track/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: null, transport_id: null, visibility: "link" }),
            });
            if (!res?.ok) return null;
            const data = await res.json().catch(() => null);
            return data && data.id ? data : null;
        } catch {
            return null;
        }
    }, [API, authFetchWithRefresh]);

    // Поделиться геолокацией мгновенно адресату этого чата
    const quickShareGps = useCallback(async (e) => {
        e?.preventDefault?.();
        if (GPS_DISABLED) { showToast(e, t("gps.soon.short", "Скоро: GPS-мониторинг"), "info"); return; }
        if (!!chat?.support) return; // в саппорте запрещено
        const recipientId = peerUser?.id;
        if (!recipientId) { showToast(e, t("toast.noRecipient", "Нет адресата"), "error"); return; }
        // создаём/гарантируем сессию -> share -> сообщение в чат
        const s = await ensureChatTrackSession();
        if (!s?.id) { showToast(e, t("toast.sessionCreateError", "Не удалось создать GPS-сессию"), "error"); return; }
        try {
            const resp = await authFetchWithRefresh(
                `${API}/track/sessions/${s.id}/share`,
                {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ recipient_ids: [recipientId] })
                }
            );
            if (!resp?.ok) { showToast(e, t("toast.shareError", "Не удалось поделиться"), "error"); return; }
            await handleGpsShared(s, recipientId);
            showToast(e, t("toast.locationSent", "Локация отправлена"), "ok");
        } catch {
            showToast(e, t("toast.locationSendError", "Ошибка при отправке локации"), "error");
        } finally {
            setGpsMenuOpen(false);
        }
    }, [API, authFetchWithRefresh, ensureChatTrackSession, peerUser?.id, handleGpsShared, showToast]);


    // Запросить геолокацию у адресата этого чата
    const quickRequestGps = useCallback(async (e) => {
        e?.preventDefault?.();
        if (GPS_DISABLED) { showToast(e, t("gps.soon.short", "Скоро: GPS-мониторинг"), "info"); return; }
        if (!!chat?.support) return; // в саппорте запрещено
        const targetId = peerUser?.id;
        if (!targetId) { showToast(e, t("toast.noRecipient", "Нет адресата"), "error"); return; }

        // проверяем активные запросы, чтобы не дублировать
        try {
            const [rIn, rOut] = await Promise.all([
                authFetchWithRefresh(`${API}/track/requests/incoming`),
                authFetchWithRefresh(`${API}/track/requests/outgoing`),
            ]);
            const pick = async (resp) => {
                if (!resp?.ok) return [];
                const data = await resp.json();
                return Array.isArray(data) ? data.map(x => (x.request || x)) : [];
            };
            const incoming = await pick(rIn);
            const outgoing = await pick(rOut);
            const activeLike = (s) => s === "PENDING" || s === "ACCEPTED";
            const outToPeer = outgoing.find(it => it?.target_user_id === targetId && activeLike(it?.status));
            const inFromPeer = incoming.find(it => it?.user_id === targetId && activeLike(it?.status));
            if (outToPeer?.status === "ACCEPTED") { showToast(e, t("toast.alreadySharing", "Вы уже делитесь с этим пользователем"), "ok"); setGpsMenuOpen(false); return; }
            if (outToPeer?.status === "PENDING") { showToast(e, t("toast.requestAlreadySent", "Запрос уже отправлен — ждём ответа"), "info"); setGpsMenuOpen(false); return; }
            if (inFromPeer?.status === "ACCEPTED") { showToast(e, t("toast.userAlreadyShares", "Пользователь уже делится с вами"), "ok"); setGpsMenuOpen(false); return; }
            if (inFromPeer?.status === "PENDING") { showToast(e, t("toast.incomingExists", "Есть входящий запрос — проверьте чат"), "info"); setGpsMenuOpen(false); return; }
        } catch { /* не блокируем */ }

        try {
            const res = await authFetchWithRefresh(`${API}/track/requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: null, target_ids: [targetId], message: null }),
            });
            const data = await res.json().catch(() => []);
            await handleGpsRequested(data);
            showToast(e, t("toast.requestSent", "Запрос отправлен"), "ok");
        } catch {
            showToast(e, t("toast.requestSendError", "Не удалось отправить запрос"), "error");
        } finally {
            setGpsMenuOpen(false);
        }
    }, [authFetchWithRefresh, peerUser?.id, handleGpsRequested, showToast]);


    useEffect(() => {
        if (!chatId) return;
        // 1) подтянуть историю
        fetchMessages(chatId);
        // 2) убедиться, что сокет чата поднят (нужен для реакций и прочего real-time)
        const ws = wsRef?.current;
        if (!ws || ws.readyState !== 1) {
            connectWS(chatId);
        }
        // сбрасываем флаги для новой беседы
        setOlderEOF(false);
        setLoadingOlder(false);
    }, [chatId, fetchMessages, connectWS]);

    const [input, setInput] = useState("");
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [sending, setSending] = useState(false);
    const [autoTranslate, setAutoTranslate] = useState(false);
    const [translatingMessages, setTranslatingMessages] = useState(false);
    const [translationCache, setTranslationCache] = useState({});
    const translationCacheRef = useRef({});
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showTranslateHint, setShowTranslateHint] = useState(false);
    const translateHintTimerRef = useRef(null);
    const targetLang = useMemo(() => (lang || "en").split("-")[0], [lang]);
    const messagesEndRef = useRef(null);
    // Первый скролл при входе в чат — без анимации
    const didInitialScrollRef = useRef(false);
    // ⬇️ Сбрасываем флаг при смене чата, чтобы первый скролл был без анимации
    useEffect(() => {
        didInitialScrollRef.current = false;
        try { initialJumpDoneRef.current = false; } catch { }
    }, [chatId]);
     const textareaRef = useRef(null);
    const [messagesLimit, setMessagesLimit] = useState(30);

    useEffect(() => {
        translationCacheRef.current = translationCache;
    }, [translationCache]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const saved = localStorage.getItem("ti-auto-translate-enabled");
            if (saved === "1") setAutoTranslate(true);
        } catch { }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            localStorage.setItem("ti-auto-translate-enabled", autoTranslate ? "1" : "0");
        } catch { }
    }, [autoTranslate]);

    useEffect(() => {
        if (typeof window === "undefined") return () => { };
        let timer = null;
        try {
            const shown = localStorage.getItem("ti-translate-hint-shown");
            if (!shown) {
                setShowTranslateHint(true);
                localStorage.setItem("ti-translate-hint-shown", "1");
                if (translateHintTimerRef.current) clearTimeout(translateHintTimerRef.current);
                timer = setTimeout(() => setShowTranslateHint(false), 8000);
                translateHintTimerRef.current = timer;
            } else {
                setShowTranslateHint(false);
            }
        } catch { }
        return () => {
            if (translateHintTimerRef.current) clearTimeout(translateHintTimerRef.current);
            if (timer) clearTimeout(timer);
        };
    }, [chatId]);

    // --- Дедупликация GPS-запросов: оставляем самый свежий на каждое направление
    const dedupedMessages = useMemo(() => {
        if (!Array.isArray(messages)) return messages;
        const seen = new Set();
        const res = [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m?.message_type === "gps_request") {
                let payload = {};
                try { payload = JSON.parse(m.content || "{}"); } catch { }
                const to = payload?.target_user_id || m?.target_user_id;
                const from = m?.sender_id;
                const key = `rq:${from}->${to}`;
                if (seen.has(key)) continue; // пропускаем более старые дубликаты
                seen.add(key);
            }
            res.push(m);
        }
        return res.reverse();
    }, [messages]);

    const guardOpenGps = React.useCallback(async (e) => {
        e?.preventDefault?.();
        try {
            const [rIn, rOut] = await Promise.all([
                authFetchWithRefresh(api(`/track/requests/incoming`)),
                authFetchWithRefresh(api(`/track/requests/outgoing`)),
            ]);
            const pick = async (resp) => {
                if (!resp?.ok) return [];
                const data = await resp.json();
                return Array.isArray(data) ? data.map(x => (x.request || x)) : [];
            };
            const incoming = await pick(rIn);
            const outgoing = await pick(rOut);
            const peerId = peerUser?.id; // у тебя уже есть peerUser в чате
            const meId = user?.id;
            const activeLike = (s) => s === "PENDING" || s === "ACCEPTED";

            const outToPeer = outgoing.find(it => it?.target_user_id === peerId && activeLike(it?.status));
            const inFromPeer = incoming.find(it => it?.user_id === peerId && activeLike(it?.status));

            if (outToPeer?.status === "ACCEPTED") {
                showToast(e, t("toast.alreadySharing", "Вы уже делитесь с этим пользователем"), "ok");
                return;
            }
            if (outToPeer?.status === "PENDING") {
                showToast(e, t("toast.requestAlreadySent", "Запрос уже отправлен — ждём ответа"), "info");
                return;
            }
            if (inFromPeer?.status === "ACCEPTED") {
                showToast(e, t("toast.userAlreadyShares", "Пользователь уже делится с вами"), "ok");
                return;
            }
            if (inFromPeer?.status === "PENDING") {
                showToast(e, t("toast.incomingExists", "Есть входящий запрос — посмотрите в чате"), "info");
                return;
            }
            // ничего активного нет — можно открывать модалку
            await quickRequestGps(e);
        } catch {
            await quickRequestGps(e); // на всякий случай не блокируем
        }
    }, [API, authFetchWithRefresh, peerUser?.id, user?.id, showToast]);

           

    // Быстрый прыжок в самый низ перед первой отрисовкой, без "прокрутки" длинного списка
    const initialJumpDoneRef = useRef(false);
    useLayoutEffect(() => {
        const c = messagesContainerRef.current;
        if (!c) return;
        if (initialJumpDoneRef.current) return;
        if (!Array.isArray(messages) || messages.length === 0) return;
        // временно отключаем плавный скролл, чтобы исключить анимацию
        const prev = c.style.scrollBehavior;
        c.style.scrollBehavior = 'auto';
        c.scrollTop = c.scrollHeight; // мгновенно в самый низ
        initialJumpDoneRef.current = true;
        // на всякий случай "дергаем" якорь внизу без анимации
        try { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); } catch { }
        // возвращаем поведение назад после кадра
        requestAnimationFrame(() => { c.style.scrollBehavior = prev || ''; });
        // помечаем что стартовый скролл уже выполнен
        didInitialScrollRef.current = true;
        // после стартового прыжка считаем, что находимся внизу
        try { stickToBottomRef.current = true; setIsNearBottom(true); } catch { }
    }, [chatId, messages?.length]);
    const messagesContainerRef = useRef(null);
    // --- автофиксация к низу и отключение автоскролла, когда читаем историю ---
    const stickToBottomRef = useRef(true);              // по умолчанию прилипать к низу
    const [isNearBottom, setIsNearBottom] = useState(true); // для UI «К последним»
    const SCROLL_EPS = 40; // px — насколько близко к низу считаем «внизу»
    const handleScroll = useCallback(() => {
        const c = messagesContainerRef.current;
        if (!c) return;
        const { scrollTop, scrollHeight, clientHeight } = c;
        const distFromBottom = scrollHeight - (scrollTop + clientHeight);
        const near = distFromBottom <= SCROLL_EPS;
        setIsNearBottom(near);
        // если ушли далеко от низа — выключаем автоприлипание
        stickToBottomRef.current = near;
    }, []);

    // helper: прокрутка в самый низ, уважающая первый «жёсткий» скролл
    const scrollToBottom = useCallback((behavior = "smooth") => {
        const c = messagesContainerRef.current;
        if (!c || !messagesEndRef.current) return;
        // если пользователь читает историю — не трогаем
        if (!stickToBottomRef.current) return;
        const prev = c.style.scrollBehavior;
        if (behavior === "auto") c.style.scrollBehavior = "auto";
        try { messagesEndRef.current.scrollIntoView({ behavior }); }
        finally {
            if (behavior === "auto") requestAnimationFrame(() => { c.style.scrollBehavior = prev || ""; });
        }
    }, []);
    // ↑ подгрузка старых сообщений
    const topSentinelRef = useRef(null);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [olderEOF, setOlderEOF] = useState(false);
    const PAGE_SIZE_DEBUG = Number(process.env.NEXT_PUBLIC_PAGE_SIZE_DEBUG) || 30;
    const [pendingVoice, setPendingVoice] = useState(null); // { blob, url }
    const [hoveredMsgId, setHoveredMsgId] = useState(null);

    // Функция подгрузки старых сообщений (до первого загруженного id).
    // Не используем filteredMessages, чтобы избежать TDZ и не грузить во время поиска.
    const loadOlder = useCallback(async () => {
        if (loadingOlder || olderEOF || searchMsg) return;
        const container = messagesContainerRef.current;
        if (!container) return;
        // Берём самый "старый" среди уже загруженных сообщений
        const first = Array.isArray(messages) && messages.length > 0 ? messages[0]?.id : null;
        if (!first || !chatId) return;
        setLoadingOlder(true);
        const prevScrollHeight = container.scrollHeight;
        const prevScrollTop = container.scrollTop;
        const older = await fetchOlderMessagesRef.current?.(chatId, first, PAGE_SIZE_DEBUG);
        if (Array.isArray(older) && older.length > 0) {
            // Сохраняем позицию скролла, чтобы не было "прыжка"
            requestAnimationFrame(() => {
                const newScrollHeight = container.scrollHeight;
                const delta = newScrollHeight - prevScrollHeight;
                container.scrollTop = prevScrollTop + delta;
            });
        } else {
            setOlderEOF(true);
        }
        setLoadingOlder(false);
    }, [loadingOlder, olderEOF, searchMsg, messages, chatId, PAGE_SIZE_DEBUG]);

    // Автодогрузка при попадании верхнего «маяка» в область видимости
    useEffect(() => {
        const container = messagesContainerRef.current;
        const sentinel = topSentinelRef.current;
        if (!container || !sentinel) return;
        // Во время поиска не подгружаем "старые"
        if (searchMsg) return;
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting && !loadingOlder && !olderEOF) {
                        loadOlder();
                    }
                });
            },
            { root: container, rootMargin: "200px" } // подгружаем заранее
        );
        io.observe(sentinel);
        return () => io.disconnect();
    }, [loadOlder, loadingOlder, olderEOF, searchMsg]);

    const handleShowMore = () => {
        // Найдём id самого первого (верхнего) отображаемого сообщения
        const firstMsg = displayedMessages[0];
        const firstMsgEl = firstMsg ? document.getElementById(`msg-${firstMsg.id || firstMsg.idx}`) : null;
        const prevTop = firstMsgEl?.getBoundingClientRect().top;

        setMessagesLimit(l => l + 30);

        setTimeout(() => {
            // После увеличения лимита, найдём этот же элемент (он сдвинется вниз)
            if (firstMsg && document.getElementById(`msg-${firstMsg.id || firstMsg.idx}`)) {
                const newEl = document.getElementById(`msg-${firstMsg.id || firstMsg.idx}`);
                if (newEl && prevTop !== undefined) {
                    const delta = newEl.getBoundingClientRect().top - prevTop;
                    messagesContainerRef.current.scrollTop += delta;
                }
            }
        }, 100); // чуть задержим, чтобы рендер прошёл
    };


    // ===== ВАЖНО: filteredMessages объявляем ДО matchRefs и useEffect =====
    const base = dedupedMessages;
    const filteredMessages = searchMsg.trim()
        ? base.filter(
            m => (m.content || "").toLowerCase().includes(searchMsg.trim().toLowerCase())
        )
        : base;

    const matchRefs = useRef([]);
    // Сброс refs при каждом новом поиске или изменении списка найденных
    useEffect(() => { matchRefs.current = []; }, [filteredMessages]);
 // Показываем весь уже загруженный список.
    // Лимитированная выдача контролируется бэкендом и ленивой подгрузкой "вверх".
    const displayedMessages = filteredMessages;

    const buildTranslationKey = useCallback((msg, target) => {
        const base = buildMsgKeyBase(msg)
            || msg?.id
            || msg?.client_nonce
            || msg?.localId
            || msg?.idx
            || msg?.sent_at
            || msg?.created_at
            || msg?.ts
            || msg?.time
            || (msg?.content ? String(msg.content).slice(0, 24) : "");
        return [chatId, base, target].filter(Boolean).join("::");
    }, [chatId]);

    const translateText = useCallback(async (payload, target) => {
        const resp = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(payload)}&langpair=auto|${encodeURIComponent(target)}`
        );
        if (!resp.ok) throw new Error("translate_failed");
        const data = await resp.json();
        return data?.responseData?.translatedText || null;
    }, []);

    useEffect(() => {
        if (!autoTranslate) return;
        const target = targetLang;
        const recent = (displayedMessages || [])
            .filter(m => !m?.message_type || m.message_type === "text" || m.message_type === "message")
            .slice(-20);

        const missing = recent.filter(m => {
            if (typeof m?.content !== "string" || !m.content.trim()) return false;
            const key = buildTranslationKey(m, target);
            return key && !translationCacheRef.current[key];
        });

        if (missing.length === 0) return;

        let cancelled = false;
        setTranslatingMessages(true);

        (async () => {
            for (const msg of missing) {
                if (cancelled) break;
                const payload = (msg?.content || "").trim();
                if (!payload || payload.length > 2000) {
                    const skipKey = buildTranslationKey(msg, target);
                    if (skipKey && !translationCacheRef.current[skipKey]) {
                        setTranslationCache(prev => {
                            if (prev[skipKey]) return prev;
                            const next = { ...prev, [skipKey]: payload || msg?.content || "" };
                            translationCacheRef.current = next;
                            return next;
                        });
                    }
                    continue;
                }
                try {
                    const translated = await translateText(payload, target);
                    if (translated && !cancelled) {
                        const key = buildTranslationKey(msg, target);
                        setTranslationCache(prev => {
                            if (prev[key]) return prev;
                            const next = { ...prev, [key]: translated };
                            translationCacheRef.current = next;
                            return next;
                        });
                    }
                } catch (err) {
                    console.error("translate error", err);
                }
            }
            if (!cancelled) setTranslatingMessages(false);
        })();

        return () => {
            cancelled = true;
            setTranslatingMessages(false);
        };
    }, [autoTranslate, targetLang, displayedMessages, translateText, buildTranslationKey]);

    // ВАЖНО: берём из контекста до использования ниже, чтобы не поймать TDZ
    const { chatList = [], fetchOlderMessages, getAutoclose } = useMessenger();
    // Стабильная ссылка на функцию из контекста (без зависимости от порядка объявления)
    const fetchOlderMessagesRef = useRef(fetchOlderMessages);
    useEffect(() => { fetchOlderMessagesRef.current = fetchOlderMessages; }, [fetchOlderMessages]);
    let chat = chatList.find(c => c.chat_id === chatId) || {};
    // Если peer прилетел отдельно, аккуратно подольём его в chat
    if (!chat.peer && peerUser) { chat = { ...chat, peer: peerUser }; }

    // Локальная мета по конкретному чату (support, display_title и пр.)
    const [chatMeta, setChatMeta] = useState(null);
    // ВАЖНО: при переключении чата сбрасываем прошлую мету,
    // чтобы флаг support не "утекал" в другой чат
    useEffect(() => { setChatMeta(null); }, [chatId]);
    useEffect(() => {
        let aborted = false;
        async function loadMeta() {
            try {
                if (!chatId) return;
                const res = await authFetchWithRefresh(`${API}/chat/${chatId}/meta`);
                if (res.ok) {
                    const data = await res.json();
                    if (!aborted) setChatMeta(data);
                }
            } catch { }
        }
        // Если в локальном chat нет support-инфы — подгружаем метаданные
        if (!chat?.support) loadMeta();
        return () => { aborted = true; };
    }, [chatId, chat?.support, authFetchWithRefresh]);
    // Слушатель, чтобы после "решить/закрыть" сразу обновить мету
    useEffect(() => {
        function onMetaChanged(e) {
            if (e.detail?.chatId === chatId) {
                (async () => {
                    try {
                        const res = await authFetchWithRefresh(`${API}/chat/${chatId}/meta`);
                        if (res.ok) { setChatMeta(await res.json()); }
                    } catch { }
                })();
            }
        }
        window.addEventListener("support_meta_changed", onMetaChanged);
        return () => window.removeEventListener("support_meta_changed", onMetaChanged);
    }, [chatId, authFetchWithRefresh]);

    // Если мета пришла и относится К ЭТОМУ чату — объединяем
    if (chatMeta && (chatMeta.chat_id === chatId || chatMeta.id === chatId)) {
        chat = { ...chat, ...chatMeta };
    }
    if (!chat.peer && peerUser) {
        chat = { ...chat, peer: peerUser };
    }
    // Единый флаг «это чат поддержки» (мета может прилететь позже),
    // но учитываем её только если она для текущего chatId
    const isSupport = !!(
        chat?.support ||
        (chatMeta?.support && (chatMeta?.chat_id === chatId || chatMeta?.id === chatId))
    );
    useEffect(() => { isSupportRef.current = isSupport; }, [isSupport]);
    const supportStatus = (chat?.support_status || "").toString().replace("TicketStatus.", "");
    const eta = chat?.autoclose_eta_iso || null;
    // Если сервер прислал эфемерный отсчёт — он приоритетнее (содержит until_iso)
    const auto = getAutoclose?.(chatId);
    const countdownUntilIso = (auto?.until_iso || eta || null);
    const [secLeft, setSecLeft] = useState(null);
    useEffect(() => {
        if (!countdownUntilIso) { setSecLeft(null); return; }
        const deadline = new Date(countdownUntilIso).getTime();
        const tick = () => {
            const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setSecLeft(Number.isFinite(s) ? s : null);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [countdownUntilIso]);
    const isSupportAgent = ((user?.role || "") + "").toUpperCase() === "SUPPORT";


    // --- NEW: эфемерная информация об очереди/наборе (обновляется по WS) ---
    // Баннер «В очереди поддержки ...» и индикатор «Поддержка печатает…»
    const queueInfo = getSupportQueue?.(chatId);
    const isTyping = getSupportTyping?.(chatId);

    const lastSystem = [...messages].reverse().find(m => m.meta?.rating_request);
    const showRating = !!lastSystem?.meta?.rating_request;
    const ratingTicketId = lastSystem?.meta?.ticket_id;
    const [rated, setRated] = useState(false);

    // Локальный таймер: когда у RESOLVED наступит ETA — визуально закрываем чат и дёргаем обновление меты
    const [forceClosed, setForceClosed] = useState(false);
    useEffect(() => {
        setForceClosed(false);
        // проверяем флаг поддержки прямо из chat (без зависимости от него, чтобы не ловить TDZ)
        if (!!chat?.support && supportStatus === "RESOLVED" && eta) {
            const tick = () => {
                if (Date.now() >= Date.parse(eta)) {
                    setForceClosed(true);
                    // подтянем свежую мету с бэка
                    window.dispatchEvent(new CustomEvent("support_meta_changed", { detail: { chatId } }));
                }
            };
            tick();
            const id = setInterval(tick, 30000); // проверяем каждые 30 сек
            return () => clearInterval(id);
        }
    }, [supportStatus, eta, chatId]);

    // Блокировка ввода: только для сотрудников поддержки, пользователю писать всегда можно
    const inputLocked = (isSupportAgent && (supportStatus === "CLOSED" || forceClosed));

    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [groupForceUpdate, setGroupForceUpdate] = useState(0); // счетчик для форс-апдейта участников

    // --- Слушаем событие "group_members_updated" чтобы обновлять список участников в GroupMembersModal ---
    useEffect(() => {
        function onMembersUpdate(e) {
            if (e.detail?.chat_id == chatId) {
                setGroupForceUpdate(x => x + 1);
            }
        }
        window.addEventListener("group_members_updated", onMembersUpdate);
        return () => window.removeEventListener("group_members_updated", onMembersUpdate);
    }, [chatId]);

    useEffect(() => {
        if (chatId) {
            markChatRead(chatId);
        }
    }, [chatId]);

    // ДОБАВЬ ВЕРХОМ MessengerChat
    useEffect(() => {
        if (!showEmojiPicker) return;
        function handleClickOutside(e) {
            if (
                !e.target.closest('.emoji-picker-popup') &&
                !e.target.closest('.emoji-picker-button')
            ) {
                setShowEmojiPicker(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showEmojiPicker]);


    // Закрытие мини-меню GPS по клику вне
    useEffect(() => {
        if (!gpsMenuOpen) return;
        function onDocClick(e) {
            if (!gpsMenuRef.current) return;
            if (!gpsMenuRef.current.contains(e.target)) setGpsMenuOpen(false);
        }
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [gpsMenuOpen]);

    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        try { setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)); } catch { }
    }, []);

    // === ВСТАВИТЬ СЮДА! ===
    // Собираем все картинки (image type) из сообщений для Lightbox
    const images = messages
        ?.filter(m => m.message_type === "image" && m.file?.file_url)
        .map(m => ({
            src: abs(m.file.file_url),
            key: m.id
        })) || [];
    // === КОНЕЦ ВСТАВКИ ===

    useEffect(() => {
        // не мешаем подгрузке "вверх" — там вручную удерживаем позицию
        if (!messagesEndRef.current || loadingOlder) return;
        const isInitial = !didInitialScrollRef.current;
        const shouldAuto = isInitial || stickToBottomRef.current;
        if (!shouldAuto) return;
        const behavior = isInitial ? "auto" : "smooth";
        scrollToBottom(behavior);
        didInitialScrollRef.current = true;
    }, [messages, loadingOlder, scrollToBottom]);

    useEffect(() => {
        if (chatId) {
            markChatRead(chatId, { silent: false }); // теперь поддерживаем опцию silent для форс-обновления
            window._lastReadChats = window._lastReadChats || {};
            window._lastReadChats[chatId] = Date.now(); // запоминаем момент когда заходили в чат
        }
    }, [chatId]);

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        // Ограничение размера файла 50 МБ
        const MAX_SIZE_MB = 50;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            alert(`${t("upload.tooLarge", "Файл слишком большой! Максимальный размер файла:")} ${MAX_SIZE_MB} ${t("unit.mb", "МБ")}`);
            e.target.value = "";
            return;
        }
        setPendingAttachment({ file });
        e.target.value = "";
    }

    async function sendAttachment(targetId) {
        if (!pendingAttachment?.file) return;
        const file = pendingAttachment.file;
        const fd = new FormData();
        fd.append("file", file, file.name);

        const chatTarget = targetId || chatId;
        const res = await fetch(`${API}/chat/${chatTarget}/upload`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`,
            },
            body: fd,
        });
        if (res.ok) {
            const data = await res.json();
            const payload = {
                message_type: file.type.startsWith("image/") ? "image" : "file",
                file_id: data.file_id,
                content: file.name,
            };
            await apiSendWith409(chatTarget, payload);
            setPendingAttachment(null);
        } else {
            alert(t("upload.error", "Ошибка загрузки файла"));
        }
    }

    // Создаёт (или возвращает существующий) чат в режиме предпросмотра
    const ensureChat = useCallback(async () => {
        if (chatId) return chatId;
        if (!peerUser?.id) return null;

        // Создаём/получаем личный чат с пользователем
        const res = await authFetchWithRefresh(`${API}/chat/by_user/${peerUser.id}`, { method: "POST" });
        if (!res.ok) return null;

        const data = await res.json(); // { chat_id: number }
        const newId = data?.chat_id;
        if (!newId) return null;

        setChatId(newId);
        connectWS(newId);
        // не блокируем UI ожиданием истории и сайдбара
        Promise.resolve(fetchMessages(newId)).catch(() => { });
        try { fetchChatList(); } catch { }
        try { window.dispatchEvent(new CustomEvent("inbox_update")); } catch { }
        return newId;
    }, [chatId, peerUser, setChatId, connectWS, fetchMessages]);

    async function apiSendWith409(targetChatId, payload) {
        let cid = targetChatId;
        // первая попытка отправки
        let res = await authFetchWithRefresh(`${API}/chat/${cid}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (res.status === 409) {
            // создаём новый тикет и повторяем отправку
            try {
                const create = await authFetchWithRefresh(`${API}/support/tickets`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subject: (chat?.subject || "Support request") }),
                });
                if (create.ok) {
                    const d = await create.json();
                    const newChatId = d?.chat_id;
                    if (newChatId && newChatId !== cid) {
                        setChatId(newChatId);
                        connectWS(newChatId);
                        Promise.resolve(fetchMessages(newChatId)).catch(() => { });
                        cid = newChatId;

                        res = await authFetchWithRefresh(`${API}/chat/${cid}/send`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload),
                        });
                    }
                }
            } catch { }
        }

        // если бэкенд сам создал новый чат и вернул redirect_chat_id
        if (res.ok) {
            try {
                const data = await res.clone().json();
                if (data?.redirect_chat_id && data.redirect_chat_id !== cid) {
                    setChatId(data.redirect_chat_id);
                    connectWS(data.redirect_chat_id);
                    Promise.resolve(fetchMessages(data.redirect_chat_id)).catch(() => { });
                    cid = data.redirect_chat_id;
                }
            } catch { }
        }
        if (!res.ok) throw new Error("send_failed");
        // успешная отправка — форсируем обновление боковой панели и счётчиков
        try { fetchChatList(); } catch { }
        try { window.dispatchEvent(new CustomEvent("inbox_update")); } catch { }
        return cid;
    }


    const handleSend = useCallback(
        async (e) => {
            e.preventDefault();
            if (sending) return;
            let msg = input.trim();
            if (!msg && !pendingAttachment && !pendingVoice) return;

            setSending(true);

            // если чата ещё нет (режим предпросмотра) — создаём
            let effectiveChatId = chatId;
            // Если это саппорт-чат, текущий тикет закрыт, и мы НЕ агент поддержки — создаём новый тикет
            if (isSupport && !isSupportAgent && (supportStatus === "CLOSED" || forceClosed)) {
                try {
                    const res = await authFetchWithRefresh(api(`/support/tickets`), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        // subject берём из чата или дефолтный локализованный
                        body: JSON.stringify({ subject: chat?.subject || t("support.subject", "Support request") })
                    });
                    if (res.ok) {
                        const data = await res.json(); // ожидаем { id, chat_id, ... }
                        if (data?.chat_id) {
                            effectiveChatId = data.chat_id;
                            // переключаемся на новый чат и подтягиваем историю (обычно пусто)
                            setChatId(effectiveChatId);
                            connectWS(effectiveChatId);
                            Promise.resolve(fetchMessages(effectiveChatId)).catch(() => { });
                            try { fetchChatList(); } catch { }
                            try { window.dispatchEvent(new CustomEvent("inbox_update")); } catch { }
                        }
                    } else {
                        // Если создать новый тикет не вышло — лучше не пытаться слать в закрытый
                        setSending(false);
                        return;
                    }
                } catch {
                    setSending(false);
                    return;
                }
            }
            if (!effectiveChatId) {
                effectiveChatId = await ensureChat();
                if (!effectiveChatId) {
                    setSending(false);
                    return;
                }
            }

            // === Voice draft send ===
            if (pendingVoice) {
                try {
                    const fd = new FormData();
                    const ext = pendingVoice.blob.type.includes("webm") ? "webm"
                        : pendingVoice.blob.type.includes("ogg") ? "ogg"
                            : pendingVoice.blob.type.includes("mp4") ? "m4a"
                                : "webm";
                    fd.append("file", pendingVoice.blob, `voice.${ext}`);
                    const res = await fetch(api(`/chat/${effectiveChatId}/upload`), {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
                        body: fd,
                    });
                    if (res.ok) {
                        const data = await res.json();
                        await apiSendWith409(effectiveChatId, {
                            message_type: "voice",
                            file_id: data.file_id,
                            content: "",
                        });
                        await fetchMessages(effectiveChatId, { force: true });
                        setPendingVoice(null);
                        setSending(false);
                        return;
                    }
                } catch (err) {
                    console.error("voice send error", err);
                }
            }

            if (pendingAttachment?.file) {
                await sendAttachment(effectiveChatId);
                setSending(false);
                return;
            }

            if (pendingAttachment?.order && !pendingAttachment.order.id) {
                alert(t("error.missingField", "Ошибка: заявка не содержит id!"));
                setPendingAttachment(null);
                setSending(false);
                return;
            }
            if (pendingAttachment?.transport && !pendingAttachment.transport.id) {
                alert(t("error.missingField", "Ошибка: транспорт не содержит id!"));
                setPendingAttachment(null);
                setSending(false);
                return;
            }

            if (pendingAttachment) {
                let content = "";
                let message_type = "order_info";
                let orderId = null;
                let transportId = null;

                if (pendingAttachment.bid && pendingAttachment.order) {
                    const o = pendingAttachment.order;
                    const b = pendingAttachment.bid;
                    message_type = "bid_info";
                    orderId = b.order_id;
                    content =
                        `${t("msg.yourBidOnOrder", "Ваша ставка на заявку")} #${b.order_id}\n` +
                        `${t("msg.route", "Маршрут")}: ${(o.from_locations && o.from_locations.length ? o.from_locations[0] : o.from_location || "-")} → ` +
                        `${(o.to_locations && o.to_locations.length ? o.to_locations[0] : o.to_location || "-")}\n` +
                        `${t("msg.cargo", "Груз")}: ${o.cargo_items && o.cargo_items.length ? o.cargo_items[0].name : "-"}, ` +
                        `${t("msg.weight", "Вес")}: ${o.cargo_items && o.cargo_items.length ? o.cargo_items[0].tons : "-"} ${t("unit.t", "т")}\n` +
                        `${t("msg.price", "Цена")}: ${o.rate_with_vat || o.price || "-"} ${o.rate_currency || ""}\n` +
                        `${t("msg.loadDate", "Дата загрузки")}: ${o.load_date || "-"}\n` +
                        `${t("info.bidAmount", "Сумма ставки")}: ${b.amount}\n` +
                        `${t("info.comment", "Комментарий")}: ${b.comment || "-"}`;
                }
                else if (pendingAttachment.order) {
                    const o = pendingAttachment.order;
                    message_type = "order_info";
                    orderId = o.id;
                    content =
                        `📦 ${t("msg.order", "Заявка")} #${o.id}\n` +
                        `${t("msg.route", "Маршрут")}: ${(o.from_locations && o.from_locations.length ? o.from_locations[0] : o.from_location || "-")} → ` +
                        `${(o.to_locations && o.to_locations.length ? o.to_locations[0] : o.to_location || "-")}\n` +
                        `${t("msg.cargo", "Груз")}: ${o.cargo_items && o.cargo_items.length ? o.cargo_items[0].name : "-"}, ` +
                        `${t("msg.weight", "Вес")}: ${o.cargo_items && o.cargo_items.length ? o.cargo_items[0].tons : "-"} ${t("unit.t", "т")}\n` +
                        `${t("msg.loadDate", "Дата загрузки")}: ${o.load_date || "-"}\n` +
                        `${t("msg.price", "Цена")}: ${o.rate_with_vat || o.price || "-"} ${o.rate_currency || ""}`;
                }
                else if (pendingAttachment.bid) {
                    const b = pendingAttachment.bid;
                    message_type = "bid_info";
                    orderId = b.order_id;
                    content =
                        `${t("info.yourBidOnOrder", "Ваша ставка на заявку")} #${b.order_id}\n` +
                        `${t("info.sum", "Сумма")}: ${b.amount}\n` +
                        `${t("info.comment", "Комментарий")}: ${b.comment || "-"}`;
                }
                else if (pendingAttachment.transport) {
                    const tr = pendingAttachment.transport;
                    message_type = "transport_info";
                    transportId = tr.id;
                    content =
                        `🚚 ${t("info.transportLabel", "Транспорт")} #${tr.id}\n` +
                        `${t("info.type", "Тип")}: ${typeLabel(tr.truck_type) || "-"}\n` +
                        `${t("info.route", "Маршрут")}: ${tr.from_location || "-"} → ${Array.isArray(tr.to_locations)
                            ? tr.to_locations.map((l) => (typeof l === "string" ? l : l.location)).join(", ")
                            : tr.to_location || "-"
                        }` +
                        (tr.ready_date ? `\n${t("info.readyToLoad", "Готов к загрузке")}: ${new Date(tr.ready_date).toLocaleDateString()}` : "") +
                        (tr.weight ? `\n${t("transport.capacity", "Грузоподъемность")}: ${tr.weight} ${t("unit.t", "т")}` : "") +
                        (tr.volume ? `\n${t("transport.volume", "Объем")}: ${tr.volume} ${t("unit.m3", "м³")}` : "");
                }

                await apiSendWith409(effectiveChatId, {
                    content,
                    message_type,
                    order_id: orderId,
                    transport_id: transportId,
                });
                // без WS «протолкнём» обновление сразу
                await fetchMessages(effectiveChatId, { force: true });
                setPendingAttachment(null);
            }

            if (msg) {
                const payload = { content: msg, message_type: "text" };
                // мгновенно очищаем поле, чтобы UI не «висел»
                setInput("");
                // отправляем без await — затем сразу форс-обновляем историю
                apiSendWith409(effectiveChatId, payload)
                    .then(() => fetchMessages(effectiveChatId, { force: true }))
                    .catch(() => { }) // ошибки обработаются уведомлением/стейтом
                    .finally(() => setSending(false));
            } else {
                setSending(false);
            }
        },
        [input, pendingAttachment, sendMessage, pendingVoice, setPendingAttachment, sending]
    );

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend(e);
        }
    };

    const addEmoji = (emojiObject) => {
        if (!textareaRef.current) return;
        const cursorPos = textareaRef.current.selectionStart ?? input.length;
        const emojiChar = emojiObject.emoji || emojiObject.native || emojiObject.unicode || "";
        if (!emojiChar) return;
        setInput(prev => {
            const before = prev.slice(0, cursorPos);
            const after = prev.slice(cursorPos);
            setTimeout(() => {
                textareaRef.current.focus();
                textareaRef.current.selectionStart = cursorPos + emojiChar.length;
                textareaRef.current.selectionEnd = cursorPos + emojiChar.length;
            }, 0);
            return before + emojiChar + after;
        });
    };

    let preview = null;
    if (pendingAttachment?.file) {
        const file = pendingAttachment.file;
        const isImage = file.type.startsWith("image/");
        preview = (
            <div style={{
                background: "#e9f4ff",
                borderRadius: 13,
                padding: "10px 15px",
                color: "#163d56",
                marginBottom: 10,
                boxShadow: "0 1px 7px #22535b16",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                gap: 15,
            }}>
                {isImage ? (
                    <img
                        src={URL.createObjectURL(file)}
                        alt={t("files.preview", "Предпросмотр")}
                        style={{ width: 62, height: 62, borderRadius: 8, objectFit: "cover" }}
                    />
                ) : (
                    <FaPaperclip size={32} color="#4262cc" />
                )}
                <span style={{ fontWeight: 600, fontSize: 15, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {file.name}
                </span>
                <button
                    onClick={() => setPendingAttachment(null)}
                    aria-label={t("common.remove", "Убрать")}
                    style={{
                        background: "#fff", color: "#ff4d4d", border: "none", borderRadius: 7, padding: "0 13px", fontWeight: 700, cursor: "pointer", marginLeft: 8
                    }}
                >✖</button>
                <button
                    onClick={sendAttachment}
                    style={{
                        background: "#32d474", color: "#fff", border: "none", borderRadius: 7, padding: "0 13px", fontWeight: 700, cursor: "pointer"
                    }}
                >{t("common.send", "Отправить")}</button>
            </div>
        );
    } else if (pendingAttachment) {
        if (pendingAttachment.bid && pendingAttachment.order) {
            const o = pendingAttachment.order;
            const b = pendingAttachment.bid;
            preview = (
                <div style={{
                    background: "#18325a",
                    borderRadius: 13,
                    padding: "12px 14px",
                    color: "#caf7e4",
                    marginBottom: 10,
                    boxShadow: "0 1px 7px #22535b16",
                    fontSize: 15,
                }}>
                    <b>{t("info.yourBidOnOrder", "Ваша ставка на заявку")} #{b.order_id}</b>
                    <div>
                        <b>{t("info.route", "Маршрут")}:</b> {(o.from_locations && o.from_locations.length ? o.from_locations[0] : o.from_location || "-")} → {(o.to_locations && o.to_locations.length ? o.to_locations[0] : o.to_location || "-")}
                    </div>
                    <div>
                        <b>{t("info.cargo", "Груз")}:</b> {o.cargo_items && o.cargo_items.length ? o.cargo_items[0].name : "-"} — {o.cargo_items && o.cargo_items.length ? o.cargo_items[0].tons : "-"} {t("unit.t", "т")}
                    </div>
                    <div>
                        <b>{t("info.price", "Цена")}:</b> {o.rate_with_vat || o.price || "-"} {o.rate_currency || ""}
                    </div>
                    <div>
                        <b>{t("info.loadDate", "Дата загрузки")}:</b> {o.load_date || "-"}
                    </div>
                    <div>
                        <b>{t("info.bidAmount", "Сумма ставки")}:</b> {b.amount}
                    </div>
                    <div>
                        <b>{t("info.comment", "Комментарий")}:</b> {b.comment || "-"}
                    </div>
                    <button
                        onClick={() => setPendingAttachment(null)}
                        style={{
                            marginTop: 7, background: "#295acb", border: 0, color: "#fff", borderRadius: 7, padding: "2px 12px", fontWeight: 700, cursor: "pointer"
                        }}
                    >{t("common.remove", "Убрать")}</button>
                </div>
            );
        } else if (pendingAttachment.order) {
            const o = pendingAttachment.order;
            preview = (
                <div style={{
                    background: "#18325a",
                    borderRadius: 13,
                    padding: "12px 14px",
                    color: "#caf7e4",
                    marginBottom: 10,
                    boxShadow: "0 1px 7px #22535b16",
                    fontSize: 15,
                }}>
                    <b>📦 {t("info.orderLabel", "Заявка")} #{o.id}</b>
                    <div>
                        <b>{t("info.route", "Маршрут")}:</b> {(o.from_locations && o.from_locations.length ? o.from_locations[0] : o.from_location || "-")} → {(o.to_locations && o.to_locations.length ? o.to_locations[0] : o.to_location || "-")}
                    </div>
                    <div>
                        <b>{t("info.cargo", "Груз")}:</b> {o.cargo_items && o.cargo_items.length ? o.cargo_items[0].name : "-"}, {o.cargo_items && o.cargo_items.length ? o.cargo_items[0].tons : "-"} {t("unit.t", "т")}
                    </div>
                    <div>
                        <b>{t("info.price", "Цена")}:</b> {o.rate_with_vat || o.price || "-"} {o.rate_currency || ""}
                    </div>
                    <div>
                        <b>{t("info.loadDate", "Дата загрузки")}:</b> {o.load_date || "-"}
                    </div>
                    <button
                        onClick={() => setPendingAttachment(null)}
                        style={{
                            marginTop: 7, background: "#295acb", border: 0, color: "#fff", borderRadius: 7, padding: "2px 12px", fontWeight: 700, cursor: "pointer"
                        }}
                    >{t("common.remove", "Убрать")}</button>
                </div>
            );
        } else if (pendingAttachment.bid) {
            const b = pendingAttachment.bid;
            preview = (
                <div style={{
                    background: "#18325a",
                    borderRadius: 13,
                    padding: "12px 14px",
                    color: "#caf7e4",
                    marginBottom: 10,
                    boxShadow: "0 1px 7px #22535b16",
                    fontSize: 15,
                }}>
                    <b>{t("info.yourBidOnOrder", "Ваша ставка на заявку")} #{b.order_id}</b>
                    <div>
                        <b>{t("info.sum", "Сумма")}:</b> {b.amount}
                    </div>
                    <div>
                        <b>{t("info.comment", "Комментарий")}:</b> {b.comment || "-"}
                    </div>
                    <button
                        onClick={() => setPendingAttachment(null)}
                        style={{
                            marginTop: 7, background: "#295acb", border: 0, color: "#fff", borderRadius: 7, padding: "2px 12px", fontWeight: 700, cursor: "pointer"
                        }}
                    >{t("common.remove", "Убрать")}</button>
                </div>
            );
        } else if (pendingAttachment.transport) {
            const tr = pendingAttachment.transport; // не перекрываем i18n t()
            preview = (
                <div style={{
                    background: "#18325a",
                    borderRadius: 13,
                    padding: "12px 14px",
                    color: "#caf7e4",
                    marginBottom: 10,
                    boxShadow: "0 1px 7px #22535b16",
                    fontSize: 15,
                }}>
                    <b>🚚 {t("info.transportLabel", "Транспорт")} #{tr.id}</b>
                    <div><b>{t("info.type", "Тип")}:</b> {typeLabel(tr.truck_type) || "-"}</div>
                    <div><b>{t("info.route", "Маршрут")}:</b> {tr.from_location || "-"} → {Array.isArray(tr.to_locations)
                        ? tr.to_locations.map(l => (typeof l === "string" ? l : l.location)).join(", ")
                        : tr.to_location || "-"}</div>
                    <div>
                        <b>{t("info.readyToLoad", "Готов к загрузке")}:</b> {tr.ready_date ? new Date(tr.ready_date).toLocaleDateString() : "-"}
                    </div>
                    <div>
                        <b>{t("transport.capacity", "Грузоподъемность")}:</b> {tr.weight ? `${tr.weight} ${t("unit.t", "т")}` : "-"}
                    </div>
                    <div>
                        <b>{t("transport.volume", "Объем")}:</b> {tr.volume ? `${tr.volume} ${t("unit.m3", "м³")}` : "-"}
                    </div>
                    <button
                        onClick={() => setPendingAttachment(null)}
                        style={{
                            marginTop: 7, background: "#295acb", border: 0, color: "#fff", borderRadius: 7, padding: "2px 12px", fontWeight: 700, cursor: "pointer"
                        }}
                    >{t("common.remove", "Убрать")}</button>
                </div>
            );
        }
    }

    // Найти последнее своё сообщение
    const lastMyMsgIdx = messages
        ? [...messages].reverse().findIndex(m => m.sender_id === user?.id)
        : -1;
    const lastMyMsgId = lastMyMsgIdx !== -1 && messages.length > 0
        ? messages[messages.length - 1 - lastMyMsgIdx]?.id
        : null;

    function highlightText(text, highlight) {
        if (!highlight) return text;
        const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        return text.split(regex).map((part, i) =>
            part.toLowerCase() === highlight.toLowerCase()
                ? <span key={i} style={{ background: "#38bcf8", color: "#fff", borderRadius: 4, padding: "1px 2px" }}>{part}</span>
                : part
        );
    }

    function renderMessage(msg, idx, arr) {
       const isMine = user?.id === msg.sender_id;
        const __baseKey = buildMsgKeyBase(msg);
        const mkey = makeUniqueKey(__baseKey, idx);
        const translationKey = autoTranslate ? buildTranslationKey(msg, targetLang) : null;
        const translatedText = translationKey ? translationCache[translationKey] : null;
        const hasTranslation = !!translatedText;
        const displayContent = msg.content;


        // ---- CALL (карточка звонка) ----
        if (msg.message_type === "call") {
            // content прилетает JSON-ом: {status, direction, duration?}
            let payload = {};
            try { payload = JSON.parse(msg.content || "{}"); } catch { payload = {}; }
            const pretty = msg.sent_at ? new Date(msg.sent_at).toLocaleString() : "";
            return (
                <CallCard
                    key={mkey}
                    isOwn={isMine}
                    msg={{ ...msg, payload, pretty_time: pretty, chat_id: msg.chat_id || chatId }}
                />
            );
        }


        // === ДОБАВЛЕНО: системные сообщения группы ===
        if (msg.message_type === "system" || msg.message_type === "group_event") {
            let Icon = FaInfoCircle;

            if (msg.content.includes("добавлен")) Icon = FaUserPlus;
            else if (msg.content.includes("удалён")) Icon = FaUserMinus;
            else if (msg.content.includes("стал администратором")) Icon = FaShieldAlt;
            else if (msg.content.includes("больше не администратор")) Icon = FaShieldAlt;
            else if (msg.content.includes("изменено")) Icon = FaEdit;

            // Если content похож на ключ i18n (a.b.c), пробуем перевести.
            // Fallback — показать исходный content.
            const looksLikeKey = typeof msg.content === "string" && /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(msg.content);
            const text = looksLikeKey ? t(msg.content, msg.content) : msg.content;


            return (
                <div
                    key={mkey}
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        margin: "16px 0",
                        userSelect: "none"
                    }}
                >
                    <div
                        style={{
                            background: "#e9eff5",
                            color: "#667a90",
                            fontSize: 12.5,
                            padding: "6px 12px",
                            borderRadius: 20,
                            fontWeight: 500,
                            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6
                        }}
                        className="dark:bg-[#2a3546] dark:text-[#b7c9dd]"
                    >
                        <Icon style={{ fontSize: 13, opacity: 0.85 }} />
                        {text}
                    </div>
                </div>
            );
        }
        const grouped = {};
        if (msg.reactions && Array.isArray(msg.reactions)) {
            for (const r of msg.reactions) {
                grouped[r.reaction] = grouped[r.reaction] || [];
                grouped[r.reaction].push(r);
            }
        }
        const myReaction = msg.reactions?.find(r => r.user_id === user?.id);
        const handleReact = async (emoji) => {
            if (!msg.id) return;

            const wsOpen = wsRef.current && wsRef.current.readyState === 1;

            if (!wsOpen) {
                try {
                    if (myReaction?.reaction === emoji) {
                        const res = await authFetchWithRefresh(`${API}/chat/${chatId}/messages/${msg.id}/reactions`, { method: "DELETE" });
                        if (!res.ok) throw new Error("DELETE reaction failed");
                    } else {
                        const res = await authFetchWithRefresh(`${API}/chat/${chatId}/messages/${msg.id}/reactions`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reaction: emoji })
                        });
                        if (!res.ok) throw new Error("POST reaction failed");
                    }
                    // Обновим список, чтобы подтянуть актуальные reactions
                    fetchMessages(chatId);
                } catch (e) {
                    console.warn("[FRONT] HTTP fallback for reactions failed:", e);
                } finally {
                    setOpenReactionFor(null);
                }
                return;
            }

            // WS-вариант
            try {
                if (myReaction?.reaction === emoji) {
                    wsRef.current.send(JSON.stringify({
                        action: "remove_reaction",
                        message_id: msg.id
                    }));
                } else {
                    wsRef.current.send(JSON.stringify({
                        action: "add_reaction",
                        message_id: msg.id,
                        reaction: emoji
                    }));
                }
            } catch (e) {
                console.warn("[FRONT] wsRef.send failed, trying HTTP fallback:", e);
                try {
                    if (myReaction?.reaction === emoji) {
                        await authFetchWithRefresh(`${API}/chat/${chatId}/messages/${msg.id}/reactions`, { method: "DELETE" });
                    } else {
                        await authFetchWithRefresh(`${API}/chat/${chatId}/messages/${msg.id}/reactions`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ reaction: emoji })
                        });
                    }
                    fetchMessages(chatId);
                } catch (e2) {
                    console.error("[FRONT] Both WS and HTTP fallback failed:", e2);
                }
            } finally {
                setOpenReactionFor(null);
            }
        };

        if (msg.message_type === "voice" && (msg.file_id || msg.file)) {
            return (
                <div
                    key={mkey}
                    style={{
                        background: isMine ? "#2361ae" : "#233655",
                        borderRadius: 13,
                        padding: "8px 14px",
                        marginBottom: 9,
                        maxWidth: 480,
                        color: isMine ? "#dff5fa" : "#e4eaf5",
                        alignSelf: isMine ? "flex-end" : "flex-start",
                        position: "relative",
                    }}
                >
                    <AudioMessageBubble
                        src={resolveChatFileUrl(msg.file?.file_url ?? "")}
                        accent={isMine ? "#2e5c8a" : "#264267"}
                    />
                    <div
                        style={{
                            fontSize: 11,
                            color: "#a6bde6",
                            textAlign: "right",
                            marginTop: 5,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            justifyContent: "flex-end",
                        }}
                    >
                        {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ""}
                        {isMine && msg.id === lastMyMsgId && (
                            <span
                                style={{
                                    marginLeft: 8,
                                    fontSize: 15,
                                    color: msg.is_read ? "#48ff78" : "#95b0d2",
                                    verticalAlign: "middle",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                }}
                            >
                                {msg.is_read ? (
                                    <>
                                        <FaEye title={t("chat.read", "Прочитано")} />{" "}
                                        <span style={{ fontSize: 12 }}>
                                            {t("chat.seen", "Просмотрено")}
                                        </span>
                                    </>
                                ) : (
                                    <FaCheck title={t("chat.delivered", "Доставлено")} />
                                )}
                            </span>
                        )}
                    </div>
                </div>
            );
        }
        if (
            msg.message_type === "order_info" ||
            msg.message_type === "bid_info" ||
            msg.message_type === "transport_info"
        ) {
            return (
                <div
                    key={mkey}
                    style={{
                        background: "#29395b",
                        borderRadius: 13,
                        padding: "10px 16px",
                        marginBottom: 9,
                        maxWidth: 480,
                        color: "#caf7e4",
                        boxShadow: "0 1px 7px #22535b16",
                        fontSize: 16,
                        alignSelf: isMine ? "flex-end" : "flex-start",
                        position: "relative",
                        cursor: "pointer"
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        let url = "#";
                        if (msg.message_type === "transport_info" && msg.transport_id)
                            url = `/transport/${msg.transport_id}`;
                        else if ((msg.message_type === "order_info" || msg.message_type === "bid_info") && msg.order_id)
                            url = `/orders/${msg.order_id}`;
                        if (url !== "#") {
                            window.location.href = url;
                        }
                    }}
                >
                    <div style={{ fontWeight: 700, color: "#43c8ff", fontSize: 16, marginBottom: 4, display: "flex", alignItems: "center" }}>
                        <FaGavel style={{ marginRight: 8 }} />
                        {msg.message_type === "transport_info"
                            ? t("info.transport", "Инфо о транспорте")
                            : msg.message_type === "bid_info"
                                ? t("info.orderAndBid", "Инфо по заявке и ставке")
                                : t("info.order", "Инфо по заявке")}
                    </div>
                    <div style={{ color: "#fff", whiteSpace: "pre-line", fontWeight: 500 }}>
                        {msg.content}
                    </div>
                </div>
            );
        }


        // ---- GPS REQUEST (карточка с действиями / статусом) ----
        if (msg.message_type === "gps_request") {
            return (
                <GpsRequestCard
                    key={mkey}
                    msg={msg}
                    user={user}
                    chatId={chatId}
                    API={API}
                    authFetchWithRefresh={authFetchWithRefresh}
                    fetchMessages={fetchMessages}
                    router={router}
                    showToast={showToast}
                />
            );
        }

        // ---- GPS SHARE (карточка со ссылкой/управлением) ----
        if (msg.message_type === "gps_share") {
            return (
                <GpsShareCard
                    key={mkey}
                    msg={msg}
                    user={user}
                    API={API}
                    authFetchWithRefresh={authFetchWithRefresh}
                    router={router}
                    showToast={showToast}
                />
            );
        }

        if (msg.message_type === "voice" && (msg.file_id || msg.file)) {
            return (
                <div
                    key={mkey}
                    style={{
                        background: isMine ? "#2361ae" : "#233655",
                        borderRadius: 13,
                        padding: "8px 14px",
                        marginBottom: 9,
                        maxWidth: 480,
                        color: isMine ? "#dff5fa" : "#e4eaf5",
                        alignSelf: isMine ? "flex-end" : "flex-start",
                        position: "relative",
                    }}
                >
                    <AudioMessageBubble
                        src={resolveChatFileUrl(msg.file?.file_url ?? "")}
                        accent={isMine ? "#2e5c8a" : "#264267"}
                    />
                    <div style={{
                        fontSize: 11,
                        color: "#a6bde6",
                        textAlign: "right",
                        marginTop: 5,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        justifyContent: "flex-end"
                    }}>
                        {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ""}
                        {/* Индикатор "seen" только для последнего своего сообщения */}
                        {isMine && msg.id === lastMyMsgId && (
                            <span style={{
                                marginLeft: 8,
                                fontSize: 15,
                                color: msg.is_read ? "#48ff78" : "#95b0d2",
                                verticalAlign: "middle",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3
                            }}>
                                {msg.is_read
                                    ? <><FaEye title={t("chat.read", "Прочитано")} /> <span style={{ fontSize: 12 }}>{t("chat.seen", "Просмотрено")}</span></>
                                    : <FaCheck title={t("chat.delivered", "Доставлено")} />}
                            </span>
                        )}
                    </div>
                </div>
            );
        }
        return (
            <div
                key={mkey}
                className="msg-container"
                id={`msg-${mkey}`}
                ref={el => { if (el && searchMsg) matchRefs.current[idx] = el; }}
                style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    marginBottom: 18,
                    maxWidth: 480,
                    position: "relative",
                    display: "flex",
                    flexDirection: isMine ? "row-reverse" : "row",
                    alignItems: "flex-start",
                }}
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={e => {
                    // Если уходим не на popover или кнопку — скрываем
                    if (
                        e.relatedTarget &&
                        (e.relatedTarget.classList?.contains("msg-reaction-btn") ||
                            e.relatedTarget.classList?.contains("msg-reactions-block"))
                    ) return;
                    setHoveredMsgId(null);
                }}
            >
                <div
                    style={{
                        background: isMine ? "#2361ae" : "#233655",
                        borderRadius: 13,
                        padding: "8px 14px",
                        color: isMine ? "#dff5fa" : "#e4eaf5",
                        position: "relative",
                        minHeight: 40,
                        wordBreak: "break-word"
                    }}
                >  {searchMsg ? highlightText(displayContent, searchMsg) : displayContent}
                    {hasTranslation && (
                        <div style={{
                            marginTop: 8,
                            padding: "6px 8px",
                            borderRadius: 8,
                            background: "rgba(0,0,0,0.12)",
                            color: "#d7e8ff",
                            fontSize: 13.5,
                            lineHeight: 1.35,
                        }}>
                            <div style={{ fontWeight: 700, marginBottom: 4, opacity: 0.9 }}>
                                {t("chat.autoTranslatedLabel", "Переведено автоматически")}
                            </div>
                            <div style={{ fontSize: 12.5, opacity: 0.85 }}>
                                {translatedText}
                            </div>
                        </div>
                    )}

                    {/* --- РЕАКЦИИ НА БАЛЛОНЕ --- */}
                    {(msg.reactions && msg.reactions.length > 0) && (
                        <div
                            className="msg-reactions-placed"
                            style={{
                                position: "absolute",
                                bottom: -14, // "прилипает" к краю, чуть ниже облака
                                zIndex: 5,
                                // --- МЕНЯЕМ сторону! ---
                                left: isMine ? -14 : "auto",   // теперь свои реакции слева!
                                right: !isMine ? -14 : "auto", // чужие реакции справа!
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                zIndex: 11,
                                background: "none",
                                pointerEvents: "auto",
                                minHeight: 24,
                                minWidth: 24,
                                padding: 0,
                                boxShadow: "0 2px 12px #0002",
                            }}
                        >
                            {Object.keys(grouped).map(emoji => (
                                <span
                                    key={emoji}
                                    style={{
                                        fontSize: 21,
                                        cursor: "pointer",
                                        userSelect: "none",
                                        fontWeight: 500,
                                        lineHeight: 1,
                                        border: "none",
                                        padding: "0 2px",
                                        background: "none",
                                        boxShadow: "none",
                                    }}
                                    onClick={() => handleReact(emoji)}
                                    title={grouped[emoji].map(r => r.user_id === user?.id ? "Вы" : r.user_id).join(", ")}
                                >
                                    {emoji} {grouped[emoji].length > 1 && <b style={{ fontSize: 15, marginLeft: 2 }}>{grouped[emoji].length}</b>}
                                </span>
                            ))}
                        </div>
                    )}
                    {/* ВРЕМЯ сообщения всегда под текстом */}
                    <div style={{
                        fontSize: 11,
                        color: "#a6bde6",
                        marginTop: 7,
                        textAlign: isMine ? "right" : "left"
                    }}>
                        {msg.sent_at ? new Date(msg.sent_at).toLocaleString() : ""}
                    </div>
                </div>

                {/* --- Кнопка добавления реакции сбоку баллона, появляется при наведении --- */}
                {(hoveredMsgId === msg.id) && (
                    <div
                        className="msg-reaction-btn"
                        style={{
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            height: "100%",
                            marginLeft: isMine ? 0 : 8,
                            marginRight: isMine ? 8 : 0,
                            minWidth: 40, // Увеличили невидимую область вокруг иконки!
                            minHeight: 44,
                            padding: "0 6px",
                            zIndex: 12,
                        }}
                        onMouseEnter={() => setHoveredMsgId(msg.id)}
                        onMouseLeave={e => {
                            if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
                                setHoveredMsgId(null);
                            }
                        }}
                    >
                        <button
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                opacity: 0.97,
                                padding: "7px 6px",     // Сделали больше hit-area, не только сама иконка!
                                margin: 0,
                                pointerEvents: "auto",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 16, // Чтобы был мягче
                            }}
                            onClick={e => { e.stopPropagation(); setOpenReactionFor(msg.id); }}
                            title={t("chat.addReaction", "Поставить реакцию")}
                            tabIndex={-1}
                            type="button"
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffb140" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11v1a10 10 0 1 1-9-10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" x2="9.01" y1="9" y2="9" />
                                <line x1="15" x2="15.01" y1="9" y2="9" />
                                <path d="M16 5h6" />
                                <path d="M19 2v6" />
                            </svg>
                        </button>
                        {openReactionFor === msg.id && (
                            <div
                                className="emoji-picker-popup"
                                style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: !isMine ? "30px" : "auto",
                                    right: isMine ? "30px" : "auto",
                                    transform: "translateY(-50%)",
                                    zIndex: 150
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <EmojiPicker
                                    onEmojiClick={(emojiObject) => {
                                        const ch = emojiObject?.emoji || emojiObject?.native || emojiObject?.unicode || "";
                                        if (ch) handleReact(ch);
                                        setOpenReactionFor(null);
                                    }}
                                    skinTonePickerProps={{ skinTone: false }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",       // ← было 100dvh
            maxHeight: "100%",    // ← было 100dvh
            minHeight: 0,         // важно для корректного скролла во flex
            width: "100%",
            background: "#1a2946",
            borderRadius: "inherit", // чтобы совпадали скругления
            overflow: "hidden"       // чтобы ничего не «выпирало» за рамки
        }}>
            {/* --- ШАПКА ЧАТА --- */}
            <ChatHeader
                chat={chat}
                peerUser={peerUser}
                chatId={chatId}
                onGroupClick={() => setShowGroupInfo(true)}
                forceUpdate={groupForceUpdate}
                showSearch={showSearch}
                matchRefs={matchRefs}
                setShowSearch={setShowSearch}
                searchMsg={searchMsg}
                setSearchMsg={setSearchMsg}
                onClose={closeMessenger}
                onBack={goBack}
            />
            {showGroupInfo && (
                <GroupMembersModal
                    chat={chat}
                    onClose={() => setShowGroupInfo(false)}
                    afterChange={() => setGroupForceUpdate(x => x + 1)}
                    forceUpdate={groupForceUpdate}
                />
            )}

            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                style={{
                    position: "relative",
                    flex: "1 1 0%",      // ← вместо просто 1
                    minHeight: 0,        // ← обязательно для корректного скролла
                    overflowY: "auto",
                    padding: "26px 22px 15px 22px",
                    display: "flex",
                    flexDirection: "column"
                }}
                className="pb-24 lg:pt-2"
            >
                {/* Верхний сенсор для автодогрузки старых сообщений */}
                <div ref={topSentinelRef} style={{ height: 1 }} />
                {/* ⏳ Обратный отсчёт авто-закрытия (последняя минута) */}
                {typeof secLeft === "number" && secLeft > 0 && (
                    <div
                        className="mx-3 my-2 px-3 py-2 rounded-xl border text-sm flex items-center justify-between"
                        style={{ background: "rgba(255,240,200,0.55)", borderColor: "rgba(255,200,120,0.6)" }}>
                        <span>
                            {t("chat.autoclose.inactivity", "Чат закроется из-за бездействия через")} <b>{secLeft}</b> {t("unit.sec", "сек.")}
                        </span>
                    </div>
                )}
                {/* Кнопка «К последним» — видна, если вы не у конца */}
                {!isNearBottom && (
                    <button
                        onClick={() => { stickToBottomRef.current = true; scrollToBottom("smooth"); }}
                        style={{
                            position: "sticky",
                            bottom: 10,
                            alignSelf: "flex-end",
                            marginTop: "auto",
                            zIndex: 2,
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: "1px solid #2d4b6a",
                            background: "#0e1e33",
                            color: "#d6f3ff",
                            boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
                            fontSize: 13
                        }}
                    >
                        {t("chat.toLatest", "К последним ↓")}
                    </button>
                )}
                {/* LIVE баннер очереди (эфемерный), только для клиента */}
                   {((chat?.support || chatMeta?.support) &&
                    String((user?.role || "")).toUpperCase() !== "SUPPORT" &&
                    queueInfo) && (
                        <div style={{
                            background: "linear-gradient(180deg, #173b5b 0%, #10263a 100%)",
                            border: "1px solid #264766",
                            color: "#d6f3ff",
                            borderRadius: 12,
                            padding: "10px 12px",
                            marginBottom: 10,
                            fontSize: 14.5,
                            lineHeight: 1.35
                        }}>
                            <b>{t("support.queueTitle", "В очереди поддержки:")}</b>{" "}
                            {
                                t("support.queueBody", "ваша позиция #{position}, ориентировочно {eta} мин.")
                                    .replace("#{position}", String((queueInfo.position ?? 0) + 1))
                                    .replace("{eta}", String(queueInfo.eta_minutes ?? "—"))
                              }
                        </div>
                    )}

                {showTranslateHint && (
                    <div
                        style={{
                            background: "linear-gradient(180deg, #1f2e4a 0%, #1a2640 100%)",
                            border: "1px solid #29446b",
                            color: "#dbeafe",
                            borderRadius: 12,
                            padding: "10px 12px",
                            marginBottom: 10,
                            fontSize: 14,
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                        }}
                    >
                        <div style={{ flex: 1 }}>
                            {t(
                                "chat.autoTranslateHint",
                                "Подсказка: включите автоперевод, чтобы видеть последние 20 сообщений на языке интерфейса."
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowTranslateHint(false)}
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "#9fb8da",
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: 16,
                                lineHeight: 1,
                                padding: "2px 6px",
                            }}
                            aria-label={t("common.close", "Закрыть")}
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Если локально перевалили ETA — покажем явное уведомление о закрытии */}
                {((chat?.support || chatMeta?.support) && (supportStatus === "CLOSED" || forceClosed)) && (
                    <div className="mb-3 text-sm px-3 py-2 rounded border border-slate-600/50 bg-slate-800/60 text-slate-100">
                        {t("support.closed", "Диалог закрыт.")}{" "}
                        {t("support.thanks", "Спасибо за обращение! Если появятся новые вопросы — создайте новую заявку в разделе «Поддержка».")}
                    </div>
                )}
                {/* Доп. кнопка для ручной подгрузки (если нужно), показываем когда не идёт поиск */}
                {!searchMsg && !olderEOF && !loadingOlder && (
                    <button
                        onClick={loadOlder}
                        style={{
                            margin: "0 auto 15px auto",
                            padding: "5px 18px",
                            borderRadius: 8,
                            background: "#243960",
                            color: "#b6e4fc",
                            border: "none",
                            fontWeight: 500,
                            cursor: "pointer",
                            fontSize: 14,
                            opacity: 0.85
                        }}
                    >
                        {t("chat.loadOlder", "Загрузить старые сообщения")}
                    </button>
                )}
                {loadingOlder && (
                    <div style={{ color: "#9cc4e7", textAlign: "center", marginBottom: 8 }}>
                        {t("chat.loadingOlder", "Загружаем старые сообщения…")}
                    </div>
                )}
                {displayedMessages && displayedMessages.length > 0 ? displayedMessages.map(renderMessage) : (
                    <div style={{ color: "#a7badc", fontStyle: "italic", marginTop: 32, textAlign: "center" }}>
                        {t("chat.noMessages", "Нет сообщений. Напишите что-нибудь!")}
                    </div>
                )}

                {((chat?.support || chatMeta?.support) && !isSupportAgent && showRating && !rated && !!ratingTicketId) && (
                    <SupportRatingPrompt
                        ticketId={ratingTicketId}
                        onSubmitted={() => setRated(true)}
                    />
                )}

                <div ref={messagesEndRef} />
            </div>
            {preview}
            <form
                onSubmit={handleSend}
                style={{
                    background: "#203154",
                    padding: "18px 16px",
                    paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
                    borderTop: "1px solid #234",
                    display: "flex",
                    alignItems: "center",
                    position: "sticky",   // ← фиксируем панель
                    bottom: 0,            // ← у нижнего края
                    zIndex: 20,           // ← поверх контента
                    gap: 10,
                }}
            >
                {/* Эфемерный индикатор набора для саппорта */}
                {((chat?.support || chatMeta?.support) && String((user?.role || "")).toUpperCase() !== "SUPPORT" && isTyping) && (
                    <div style={{ position: "absolute", top: -22, left: 16, fontSize: 12.5, opacity: 0.85, color: "#a7badc" }}>
                        {t("chat.supportTyping", "Поддержка печатает…")}
                    </div>
                )}
                <div
                    className="chat-input-actions"
                    style={{
                        display: "flex",
                        gap: 7,
                        alignItems: "center",
                        marginRight: 10,
                        position: "relative",
                    }}
                >
                    {/* Скрепка */}
                    <button
                        type="button"
                        title={t("chat.attachFile", "Прикрепить файл")}
                        className="action-btn"
                        onClick={() => !inputLocked && fileInputRef.current && fileInputRef.current.click()}
                        disabled={inputLocked}
                        aria-label={t("chat.attachFile", "Прикрепить файл")}
                    >
                        <FaPaperclip />
                    </button>
                    <input
                        type="file"
                        style={{ display: "none" }}
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        multiple={false}
                    />


                    {/* Кнопки и мини-меню GPS — скрыты в саппорт-чате */}
                    {!chat?.support && (
                        <div ref={gpsMenuRef} style={{ position: "relative", display: "inline-block" }}>
                            <button
                                type="button"
                                onClick={(e) => {
                                    if (GPS_DISABLED) { showToast(e, t("gps.soon.short", "Скоро: GPS-мониторинг"), "info"); return; }
                                    setGpsMenuOpen(v => !v);
                                }}
                                title="GPS"
                                aria-haspopup="menu"
                                aria-expanded={gpsMenuOpen ? "true" : "false"}
                                className={`action-btn ${gpsMenuOpen ? "action-btn--accent" : ""}`}
                                style={{ color: "#bbf7d0" }}
                            >
                                <FaMapMarkerAlt />
                            </button>
                            {gpsMenuOpen && !GPS_DISABLED && (
                                <div
                                    role="menu"
                                    style={{
                                        position: "absolute",
                                        bottom: "46px",
                                        left: 0,
                                        background: "#1e2a44",
                                        border: "1px solid rgba(59,130,246,.25)",
                                        borderRadius: 12,
                                        padding: 6,
                                        minWidth: 160,
                                        boxShadow: "0 12px 30px rgba(0,0,0,.35)",
                                        zIndex: 200,
                                    }}
                                >
                                    <button
                                        role="menuitem"
                                        onClick={(e) => { quickShareGps(e); }}
                                        style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, background: "transparent", color: "#e2f3ff", border: "none", cursor: "pointer" }}
                                    >
                                        {t("gps.share", "Поделиться GPS")}
                                    </button>
                                    <button
                                        role="menuitem"
                                        onClick={(e) => { quickRequestGps(e); }}
                                        style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, background: "transparent", color: "#e2f3ff", border: "none", cursor: "pointer" }}
                                    >
                                        {t("gps.request", "Запросить GPS")}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Смайлик */}
                    {!isMobile && (
                        <button
                            type="button"
                            onClick={e => { e.preventDefault(); if (!inputLocked) setShowEmojiPicker(v => !v); }}
                            className={`action-btn ${showEmojiPicker ? "action-btn--accent" : ""}`}
                            title={t("chat.insertEmoji", "Вставить эмодзи")}
                            disabled={inputLocked}
                            aria-label={t("chat.insertEmoji", "Вставить эмодзи")}
                        >
                            <FaSmile />
                        </button>
                    )}

                     <button
                        type="button"
                        onClick={() => setAutoTranslate(v => !v)}
                        className={`action-btn ${autoTranslate ? "action-btn--accent" : ""} ${translatingMessages ? "opacity-80" : ""}`}
                        title={autoTranslate
                            ? t("chat.autoTranslateToggleOn", "Автоперевод включён (последние 20 сообщений)")
                            : t("chat.autoTranslateToggleOff", "Включить автоперевод последних 20 сообщений")}
                        aria-pressed={autoTranslate}
                    >
                        {translatingMessages ? <span style={{ fontSize: 12, fontWeight: 700 }}>…</span> : <FaLanguage />}
                    </button>

                    {/* Микрофон — кастомная иконка */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                        <VoiceRecorder
                            onReady={(blob, url) => setPendingVoice({ blob, url })}
                            disabled={sending || inputLocked}
                        />
                    </div>
                </div>

                {pendingVoice && (
                    <div style={{ flexGrow: 1, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--background)" }}>
                        <audio src={pendingVoice.url} controls style={{ flex: 1 }} />
                        <button type="button" title={t("chat.deleteVoice", "Удалить голосовое")} onClick={() => setPendingVoice(null)}
                            style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer" }}>🗑</button>
                    </div>
                )}
                {!pendingVoice && (

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={inputLocked ? "Диалог закрыт..." : "Напишите сообщение..."}
                        disabled={inputLocked}
                        style={{
                            flexGrow: 1,
                            minHeight: 44,            // удобнее палец
                            maxHeight: 120,
                            resize: "none",
                            padding: "10px 12px",
                            fontSize: 16,             // убирает авто-зум на iOS
                            borderRadius: 7,
                            border: "1.5px solid var(--border)",
                            background: "var(--background)",
                            color: "#e3f2fd",
                            outline: "none",
                            boxShadow: "none",
                        }}
                    />
                )}
                <button
                    type="submit"
                    disabled={inputLocked || sending || (!input.trim() && !pendingAttachment && !pendingVoice)}
                    className="action-btn action-btn--accent"
                    style={{ marginLeft: 6 }}
                    title={t("common.send", "Отправить")}
                >
                    <FaPaperPlane />
                </button>
                {inputLocked && (
                    <div className="text-xs text-slate-300/80 pt-2 pb-1" style={{ marginLeft: 6 }}>
                        {t("chat.inputLocked", "Ввод сообщений недоступен: диалог закрыт.")}
                    </div>
                )}
                {showEmojiPicker && (
                    <div
                        className="emoji-picker-popup"
                        style={{ position: "absolute", bottom: "56px", left: "16px", zIndex: 150 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <EmojiPicker
                            onEmojiClick={(emojiObject, event) => addEmoji(emojiObject, event)}
                            skinTonePickerProps={{ skinTone: false }}
                            lazyLoadEmojis={true}
                            disableSearchBar={true}
                            disableSkinTonePicker={true}
                            pickerStyle={{ width: "280px" }}
                        />
                    </div>
                )}
                <CursorToast item={toast} />
            </form>
            {/* Новый Lightbox */}
            <Lightbox
                open={lightboxOpen}
                close={() => setLightboxOpen(false)}
                slides={images}
                index={lightboxIndex}
                styles={{ container: { background: "rgba(8,17,32,0.98)" } }}
            />
        </div>
    );
}
