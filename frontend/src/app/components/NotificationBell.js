"use client";
import { useState, useRef, useEffect } from "react";
// мобильная раскладка поповера — класс .notif-popover см. globals.css
import { FaBell } from "react-icons/fa";
import { useUser } from "../UserContext";
import { useRouter } from "next/navigation";
import {
    FiDollarSign,
    FiCheckCircle,
    FiXCircle,
    FiAlertTriangle,
    FiAlertCircle,
    FiBell,
    FiPackage,
    FiMessageCircle,
    FiSearch,
    FiUserPlus,
    FiStar,
} from "react-icons/fi";
import { useLang } from "../i18n/LangProvider";
import { renderNotif as renderNotifLocal } from "../i18n/renderNotif";
import { api } from "@/config/env";

// Локальный рендерер: принимает строку в формате "key|{json}|RU"
// и возвращает локализованный текст; если формат старый (просто RU) — вернёт как есть.

function getNotifIconAndColor(type) {
    switch (type) {
        case "ORDER_OVERDUE_1":
            return { icon: <FiAlertTriangle />, color: "#ffd600" };
        case "ORDER_OVERDUE_4":
            return { icon: <FiAlertTriangle />, color: "#ffa600" };
        case "ORDER_OVERDUE_7":
            return { icon: <FiAlertCircle />, color: "#ff6868" };
        case "ORDER_AUTO_DISABLED":
            return { icon: <FiXCircle />, color: "#ff1111" };
        case "TRANSPORT_OVERDUE_1":
            return { icon: <FiAlertTriangle />, color: "#ffd600" };
        case "TRANSPORT_OVERDUE_4":
            return { icon: <FiAlertTriangle />, color: "#ffa600" };
        case "TRANSPORT_OVERDUE_7":
            return { icon: <FiAlertCircle />, color: "#ff6868" };
        case "TRANSPORT_AUTO_DISABLED":
            return { icon: <FiXCircle />, color: "#ff1111" };
        case "BID":
            return { icon: <FiDollarSign />, color: "#43c8ff" };
        case "BID_ACCEPTED":
            return { icon: <FiCheckCircle />, color: "#47e47b" };
        case "BID_DECLINED":
            return { icon: <FiXCircle />, color: "#fa5b5b" };
        case "ORDER":
            return { icon: <FiPackage />, color: "#43c8ff" };
        case "ORDER_REMOVED":
            return { icon: <FiAlertCircle />, color: "#ff4141" };
        case "CHAT":
            return { icon: <FiMessageCircle />, color: "#43c8ff" };
        case "AUTO_MATCH":
            return { icon: <FiSearch />, color: "#52e07d" };
        case "CONTACT_REQUEST":
            return { icon: <FiUserPlus />, color: "#8bc6fc" };
        case "CONTACT_ACCEPTED":
            return { icon: <FiCheckCircle />, color: "#34c759" };
        case "CONTACT_DECLINED":
            return { icon: <FiXCircle />, color: "#ff6868" };
        case "REVIEW_RECEIVED":
            return { icon: <FiStar />, color: "#ffd54f" };
        default:
            return { icon: <FiBell />, color: "#43c8ff" };
    }
}

export default function NotificationBell() {
    const { t } = useLang();
    const {
        user,
        notifications,
        setNotifications,
        markNotificationsRead,
        authFetchWithRefresh,
        fetchContactRequests,
        respondContactRequest,
        fetchNotifications,
        fetchContacts,
        contacts,
        contactReq,
    } = useUser();

    const [open, setOpen] = useState(false);
    const [contactActionBusyId, setContactActionBusyId] = useState(null);
    const router = useRouter();

    const unreadNotifications = notifications.filter((n) => !n.read);
    const unreadCount = unreadNotifications.length;

    const popoverStyles = {
        surface: "var(--bg-card)",
        border: "var(--border-subtle)",
        shadow: "var(--shadow-soft)",
        readBg: "transparent",
        unreadBg: "color-mix(in srgb, var(--brand-blue) 10%, var(--control-bg))",
        hoverBg: "color-mix(in srgb, var(--brand-blue) 16%, var(--control-bg-hover))",
        muted: "var(--text-muted)",
        secondary: "var(--text-secondary)",
    };

    // --- Показывать ли кнопки для CONTACT_REQUEST (только если заявка всё ещё pending)
    const getNotifSenderId = (n) => (
        (n?.from_user && n.from_user.id) ||
        n?.sender_id ||
        (typeof n?.payload?.sender_id === "number" ? n.payload.sender_id : null)
    );

    const getNotifRequestId = (n) => {
        const ridRaw = n?.related_id ?? n?.payload?.related_id ?? null;
        return ridRaw && /^\d+$/.test(String(ridRaw)) ? Number(ridRaw) : null;
    };

    const isInContacts = (uid) => {
        if (!uid) return false;
        try {
            return Array.isArray(contacts) &&
                contacts.some(c => String(c.id) === String(uid) || String(c.user_id) === String(uid));
        } catch {
            return false;
        }
    };

    const isPendingContactRequestFrom = (n) => {
        const rid = getNotifRequestId(n);
        const sid = getNotifSenderId(n);
        const incoming = contactReq?.incoming || [];

        if (rid) {
            const match = incoming.find(r => String(r.id) === String(rid));
            if (match) return String(match.status || "").toLowerCase() === "pending";
        }
        if (sid) {
            const myId = user?.id;
            const match = incoming.find(r =>
                String(r.sender_id) === String(sid) &&
                String(r.receiver_id) === String(myId)
            );
            if (match) return String(match.status || "").toLowerCase() === "pending";
        }
        return false;
    };

    const shouldShowContactButtons = (n) => {
        if (n?.type !== "CONTACT_REQUEST") return false;
        const sid = getNotifSenderId(n);
        if (isInContacts(sid)) return false;         // уже в контактах -> кнопки не показываем
        return isPendingContactRequestFrom(n);        // показываем только пока pending
    };

    const handleOpen = async () => {
        setOpen((v) => !v);

        // Обновляем контакты и pending-заявки, чтобы корректно решить, показывать ли кнопки
        try { await fetchContacts?.(); } catch { }
        try { await fetchContactRequests?.(true); } catch { }

        if (!open && unreadCount > 0) {
            try {
                await markNotificationsRead(unreadNotifications.map((n) => n.id));
            } catch (err) {
                console.error("Error marking notifications as read!", err);
            }
        }
    };

    // --- принять / отклонить запрос в контакты прямо из уведомления
    const respondContactFromNotify = async (notif, action /* "accept" | "decline" */) => {
        try {
            setContactActionBusyId(notif.id);

            // helper: подтянуть входящие заявки (pending), без троттлинга
            const pullIncoming = async () => {
                try {
                    if (typeof fetchContactRequests === "function") {
                        const data = await fetchContactRequests(true);
                        return data?.incoming || [];
                    }
                    const res = await authFetchWithRefresh(api(`/contacts/requests?direction=in&status=pending`));
                    return res?.ok ? await res.json() : [];
                } catch {
                    return [];
                }
            };

            let incoming = await pullIncoming();
            if (!Array.isArray(incoming) || incoming.length === 0) {
                try {
                    const res = await authFetchWithRefresh(api(`/contacts/requests?direction=in`));
                    incoming = res?.ok ? await res.json() : [];
                } catch {
                    incoming = [];
                }
            }

            // 1) Пытаемся получить requestId из всех возможных источников
            const ridRaw = notif.related_id ?? notif.payload?.related_id ?? null;
            const ridNum =
                ridRaw && /^\d+$/.test(String(ridRaw)) ? Number(ridRaw) : null;

            // Старые уведомления могли нести sender_id
            const senderId =
                notif.from_user?.id ??
                notif.sender_id ??
                (typeof notif.payload?.sender_id === "number"
                    ? notif.payload.sender_id
                    : null);

            let requestId =
                notif.request_id ??
                notif.payload?.request_id ??
                ridNum ??
                null;

            // Если всё ещё нет — ищем в pending
            if (!requestId) {
                let match = null;

                // если related_id был id заявки — найдём по нему
                if (ridNum) {
                    match = (incoming || []).find(
                        (r) => String(r.id) === String(ridNum)
                    );
                }

                // иначе попробуем по sender_id (совсем старые уведомления)
                if (!match && senderId) {
                    const myId = user?.id;
                    match = (incoming || []).find(
                        (r) =>
                            String(r.sender_id) === String(senderId) &&
                            String(r.receiver_id) === String(myId) &&
                            String(r.status || "").toLowerCase() === "pending"
                    );
                }

                requestId = match?.id ?? null;
            }

            if (!requestId) {
                try {
                    window?.toast?.error?.(
                        t("notifications.cantFindRequest", "Не удалось найти заявку. Обновите страницу или откройте профиль отправителя.")
                    );
                } catch { }
                return;
            }

            // 2) Отправляем действие на бэкенд
            if (typeof respondContactRequest === "function") {
                await respondContactRequest(requestId, action);
            } else {
                const url =
                    action === "accept"
                        ? api(`/contacts/requests/${requestId}/accept`)
                        : api(`/contacts/requests/${requestId}/decline`);
                await authFetchWithRefresh(url, { method: "POST" });
            }

            // 3) Оптимистично патчим уведомление в списке
            const patched = {
                type: action === "accept" ? "CONTACT_ACCEPTED" : "CONTACT_DECLINED",
                message: action === "accept"
                    ? t("notifications.contact.accepted", "Запрос на добавление в контакты принят")
                    : t("notifications.contact.declined", "Запрос на добавление в контакты отклонён"),
                read: true,
            };
            setNotifications((prev) =>
                prev.map((x) => (String(x.id) === String(notif.id) ? { ...x, ...patched } : x))
            );

            // 4) Фоновая синхронизация + локальный эвент для других компонентов
            try {
                await fetchContactRequests?.(true);
            } catch { }
            try {
                await fetchContacts?.();
            } catch { }
            try {
                await fetchNotifications?.();
            } catch { }
            window.dispatchEvent(new CustomEvent("contacts_update"));
        } catch (e) {
            console.error("respondContactFromNotify error", e);
        } finally {
            setContactActionBusyId(null);
        }
    };

    // --- переходы по уведомлениям
    const handleNotificationClick = (notif) => {
        setOpen(false);

        if (notif.type === "ORDER_REMOVED") {
            const raw = notif?.message ?? notif?.text ?? notif?.content ?? notif?.msg ?? "";
            const msg = renderNotifLocal(raw, t) || t("notifications.orderRemoved", "Заявка, на которую вы делали ставку, была удалена.");
            alert(msg);
            return;
        }

        if (notif.type === "BID_ACCEPTED" || notif.type === "BID_DECLINED") {
            if (notif.related_id) {
                const url = new URL(window.location.origin + "/profile");
                url.searchParams.set("mybids", "1");
                url.searchParams.set("highlight_bid", String(notif.related_id));
                url.searchParams.delete("highlight_order");
                url.searchParams.delete("highlight_transport");
                router.push(url.pathname + url.search);
            }
            return;
        }

        if (notif.type === "CONTACT_REQUEST") {
            const url = new URL(window.location.origin + "/profile");
            url.searchParams.set("contact_requests", "1");
            router.push(url.pathname + url.search);
            return;
        }

        if (notif.type === "CONTACT_ACCEPTED") {
            const url = new URL(window.location.origin + "/profile");
            url.searchParams.set("contacts", "1");
            router.push(url.pathname + url.search);
            return;
        }

        if (notif.type === "AUTO_MATCH") {
            if (notif.payload && notif.payload.target_url) { router.push(notif.payload.target_url); return; }
            if (notif.related_id) {
                const msg = (notif.message || "").toLowerCase();
                const hintTransport = t("notifications.autoMatch.transportHint", "найден новый транспорт").toLowerCase();
                // предпочитаем метаданные, если есть
                const payloadEntity = (notif.payload?.entity || notif.payload?.entity_type || "").toLowerCase();
                const isTransport =
                    payloadEntity === "transport" ||
                    msg.includes(hintTransport) ||
                    msg.includes("transport") ||        // EN
                    msg.includes("транспорт") ||        // RU
                    msg.includes("ტრანსპორტ");          // KA
                router.push((isTransport ? "/transport/" : "/orders/") + notif.related_id);
            }
            return;
        }

        if (notif.type === "REVIEW_RECEIVED") {
            const url = new URL(window.location.origin + "/profile");
            url.searchParams.set("reviews", "1"); // открыть вкладку «Отзывы»
            if (notif.related_id) {
                url.searchParams.set("highlight_review", String(notif.related_id)); // на будущее (если захотите подсветку)
            }
            router.push(url.pathname + url.search);
            return;
        }

        if (notif.type === "BID" || notif.type === "bid") {
            const msg = (notif.message || "").toLowerCase();
            const myBidHint = t("notifications.myBidHint", "ваша ставка").toLowerCase();
            const isMyBid =
                notif.payload?.is_my_bid === true ||
                msg.includes(myBidHint) ||
                msg.includes("your bid") ||           // EN
                msg.includes("თქვენი წინადადება");    // KA (общая формулировка)
            if (isMyBid) {
                if (notif.related_id) {
                    const url = new URL(window.location.origin + "/profile");
                    url.searchParams.set("mybids", "1");
                    url.searchParams.set("highlight_bid", String(notif.related_id));
                    url.searchParams.delete("highlight_order");
                    url.searchParams.delete("highlight_transport");
                    router.push(url.pathname + url.search);
                }
            } else if (notif.related_id) {
                const url = new URL(window.location.origin + "/profile");
                url.searchParams.set("highlight_order", String(notif.related_id));
                url.searchParams.set("orders", "1");
                url.searchParams.delete("highlight_bid");
                url.searchParams.delete("highlight_transport");
                router.push(url.pathname + url.search);
            }
            return;
        }

        if (
            notif.type === "ORDER_OVERDUE_1" ||
            notif.type === "ORDER_OVERDUE_4" ||
            notif.type === "ORDER_OVERDUE_7" ||
            notif.type === "ORDER_AUTO_DISABLED" ||
            notif.type === "ORDER" ||
            notif.type === "order"
        ) {
            if (notif.related_id) {
                const url = new URL(window.location.origin + "/profile");
                url.searchParams.set("highlight_order", String(notif.related_id));
                url.searchParams.set("orders", "1");
                url.searchParams.delete("highlight_bid");
                url.searchParams.delete("highlight_transport");
                router.push(url.pathname + url.search);
            }
            return;
        }

        if (
            notif.type === "TRANSPORT_OVERDUE_1" ||
            notif.type === "TRANSPORT_OVERDUE_4" ||
            notif.type === "TRANSPORT_OVERDUE_7" ||
            notif.type === "TRANSPORT_AUTO_DISABLED"
        ) {
            if (notif.related_id) {
                const url = new URL(window.location.origin + "/profile");
                url.searchParams.set("highlight_transport", String(notif.related_id));
                url.searchParams.set("transports", "1");
                url.searchParams.delete("highlight_order");
                url.searchParams.delete("highlight_bid");
                router.push(url.pathname + url.search);
            }
            return;
        }
    };

    // --- закрытие по клику вне
    const bellRef = useRef(null);
    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (bellRef.current && !bellRef.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    return (
        <div ref={bellRef} style={{ position: "relative", cursor: "pointer" }}>
            <FaBell size={25} onClick={handleOpen} />
            {unreadCount > 0 && (
                <span
                    className="notif-badge"
                    style={{
                        position: "absolute",
                        top: -5,
                        right: -5,
                        background: "#e45b5b",
                        color: "#fff",
                        borderRadius: "50%",
                        width: 18,
                        height: 18,
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                    }}
                >
                    {unreadCount}
                </span>
            )}

            {open && (
                <div
                    className="notif-popover"
                    style={{
                        position: "absolute",
                        right: 0,
                        top: 34,
                        background: popoverStyles.surface,
                        color: "var(--text-primary)",
                        boxShadow: popoverStyles.shadow,
                        borderRadius: 13,
                        border: `1px solid ${popoverStyles.border}`,
                        zIndex: 120,
                        minWidth: 290,
                        maxWidth: 400,
                        maxHeight: 460,
                        overflowY: "auto",
                        padding: "6px 0",
                    }}
                >
                    {notifications.length === 0 && (
                        <div style={{ padding: 18, color: popoverStyles.muted }}>
                            {t("notifications.none", "Нет уведомлений")}
                        </div>
                    )}

                    {notifications.slice(0, 16).map((n) => {
                        const { icon, color } = getNotifIconAndColor(n.type);
                        const created =
                            n.created_at && typeof n.created_at === "string"
                                ? n.created_at.slice(0, 19).replace("T", " ")
                                : "";
                        const rawMessage = n?.message ?? n?.text ?? n?.content ?? n?.msg ?? "";

                        return (
                            <div
                                key={n.id || `${n.type}-${n.created_at}`}
                                style={{
                                    padding: "12px 18px 11px 17px",
                                    borderBottom: `1px solid ${popoverStyles.border}`,
                                    background: n.read ? popoverStyles.readBg : popoverStyles.unreadBg,
                                    fontWeight: n.read ? 400 : 700,
                                    cursor: n.related_id ? "pointer" : "default",
                                    fontSize: 15,
                                    transition: "background 0.13s",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 10,
                                }}
                                onClick={() => handleNotificationClick(n)}
                                onMouseOver={(e) => (e.currentTarget.style.background = popoverStyles.hoverBg)}
                                onMouseOut={(e) =>
                                    (e.currentTarget.style.background = n.read ? popoverStyles.readBg : popoverStyles.unreadBg)
                                }
                            >
                                <span
                                    style={{
                                        fontSize: 18,
                                        color: color,
                                        marginTop: 2,
                                        minWidth: 22,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    {icon}
                                </span>

                                <div style={{ flex: 1 }}>
                                    <div style={{ marginBottom: 3 }}>
                                        {renderNotifLocal(rawMessage, t) || t("notifications.generic", "Уведомление")}
                                    </div>
                                    {n.type === "CONTACT_REQUEST" && !shouldShowContactButtons(n) && (
                                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                                            {isInContacts(getNotifSenderId(n))
                                                ? t("notifications.contact.added", "Добавлен в контакты")
                                                : t("notifications.contact.alreadyHandled", "Заявка уже обработана")}
                                        </div>
                                    )}

                                    {n.type === "CONTACT_REQUEST" && shouldShowContactButtons(n) && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                type="button"
                                                disabled={contactActionBusyId === n.id}
                                                className="px-2.5 py-1 rounded-md text-xs bg-sky-700 hover:bg-sky-600 text-white disabled:opacity-50"
                                                onClick={(e) => { e.stopPropagation(); respondContactFromNotify(n, "accept"); }}
                                            >
                                                {t("common.accept", "Принять")}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={contactActionBusyId === n.id}
                                                className="px-2.5 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 text-white/90 disabled:opacity-50"
                                                onClick={(e) => { e.stopPropagation(); respondContactFromNotify(n, "decline"); }}
                                            >
                                                {t("common.decline", "Отклонить")}
                                            </button>
                                        </div>
                                    )}

                                    <div style={{ fontSize: 12, color: popoverStyles.secondary }}>{created}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
