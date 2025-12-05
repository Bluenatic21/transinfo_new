"use client";
import React, { useEffect, useState, useMemo } from "react";
import ReactDOM from "react-dom";
import { useUser } from "@/app/UserContext";
import { AnimatePresence, motion } from "framer-motion";
import {
    FaWhatsapp,
    FaTelegramPlane,
    FaViber,
    FaFacebookF,
    FaTwitter,
    FaEnvelope,
    FaQuestionCircle,
} from "react-icons/fa";
import { useLang } from "../i18n/LangProvider";
import { api, abs, ws } from "@/config/env";

export default function ShareLocationModal({
    open,
    onClose,
    transportId = null,
    orderId = null,
    onShared,
    forceTargetUserId = null,
}) {
    const { authFetchWithRefresh, user, contacts = [], fetchContacts } = useUser();
    const { t } = useLang();
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [session, setSession] = useState(null);
    const [filter, setFilter] = useState("");

    // системный шаринг
    const [isSharing, setIsSharing] = useState(false);
    const [shareUrl, setShareUrl] = useState(""); // кеш публичной ссылки

    const [sharingId, setSharingId] = useState(null); // кому сейчас шарим/останавливаем
    const [sharedIds, setSharedIds] = useState(new Set()); // кому уже расшарено по текущей сессии

    // Аватар как в MiniUserCard
    const avatarSrcOf = (u) => {
        const p = u?.avatar_url || u?.avatar || null;
        if (!p) return "/default-avatar.png";
        return abs(p);
    };

    const roleToLabel = (role) => {
        const r = String(role || "").toUpperCase();
        switch (r) {
            case "MANAGER":
            case "EMPLOYEE": return t("role.manager", "Экспедитор");
            case "TRANSPORT": return t("role.transport", "Перевозчик");
            case "OWNER": return t("role.owner", "Грузовладелец");
            default: return t("common.user", "Пользователь");
        }
    };

    // Загружаем контакты при открытии
    useEffect(() => {
        if (open) fetchContacts();
    }, [open, fetchContacts]);

    // Кандидаты: поиск + исключаем себя.
    // Если задан forceTargetUserId — оставляем только его (и НЕ фильтруем роль).
    const filtered = useMemo(() => {
        const term = (filter || "").toLowerCase();
        const base = (Array.isArray(contacts) ? contacts : []).filter(
            (u) => u?.id !== user?.id
        );

        // Прицельный получатель из чата 1-к-1
        if (forceTargetUserId) {
            return base.filter((u) => u.id === forceTargetUserId);
        }

        // Обычный режим: поиск + (как было у вас) исключить роль TRANSPORT
        return base
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
            })
            .filter((u) => String(u.role || "").toUpperCase() !== "TRANSPORT");
    }, [contacts, filter, user?.id, forceTargetUserId]);

    // Гарантируем активную сессию
    const ensureSession = async () => {
        if (session) return session;
        setCreating(true);
        try {
            let url = transportId
                ? api(`/track/for_transport/${transportId}`)
                : api(`/track/for_order/${orderId}`);
            let res = await authFetchWithRefresh(url);
            let s = await res.json();
            if (!s || !s.id) {
                // создать
                const payload = {
                    transport_id: transportId || null,
                    order_id: orderId ? Number(orderId) : null,
                    visibility: "private",
                };
                res = await authFetchWithRefresh(
                    api(`/track/sessions`),
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    }
                );
                s = await res.json();
            }
            setSession(s);
            return s;
        } finally {
            setCreating(false);
        }
    };

    // Публичная ссылка (создаём/продлеваем и кешируем)
    const ensureShareUrl = async () => {
        if (shareUrl) return shareUrl;
        const s = await ensureSession();
        const res = await authFetchWithRefresh(
            api(`/track/sessions/${s.id}/share_link`),
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expires_in_hours: 24 * 7 }),
            }
        );
        if (!res.ok) throw new Error(t("live.share.createLinkError", "Не удалось создать ссылку"));
        const data = await res.json();
        setShareUrl(data?.url || "");
        return data?.url || "";
    };

    const revokeShareUrl = async () => {
        const s = await ensureSession();
        const res = await authFetchWithRefresh(
            api(`/track/sessions/${s.id}/revoke_share`),
            { method: "POST" }
        );
        if (res.ok) {
            setShareUrl("");
            alert(t("live.share.linkDisabled", "Публичная ссылка отключена"));
        } else {
            alert(t("live.share.linkDisableError", "Не удалось отключить ссылку"));
        }
    };

    const copyText = async (text) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch { }
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            return ok;
        } catch {
            return false;
        }
    };

    // Текущее состояние «кому уже расшарено»
    const refreshSharedFor = async (sid) => {
        try {
            const res = await authFetchWithRefresh(api(`/track/sessions/${sid}/shares`));
            const arr = res.ok ? await res.json() : [];
            setSharedIds(new Set(arr.map((x) => x.user_id)));
        } catch {
            setSharedIds(new Set());
        }
    };

    // При открытии: подготовить сессию и список расшаренных
    useEffect(() => {
        if (!open) return;
        (async () => {
            const s = await ensureSession();
            if (s?.id) await refreshSharedFor(s.id);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Live-обновления по WS
    useEffect(() => {
        if (!open || !session?.id) return;
        const token =
            (typeof window !== "undefined" && localStorage.getItem("token")) || "";
        const params = new URLSearchParams({ session_id: session.id, token });
        const ws = new WebSocket(ws(`/ws/track/shares_session?${params.toString()}`));
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === "snapshot") {
                    setSharedIds(new Set((msg.recipients || []).map((r) => r.user_id)));
                } else if (msg.type === "share") {
                    setSharedIds((prev) => new Set([...prev, msg.recipient_user_id]));
                } else if (msg.type === "unshare" || msg.type === "end") {
                    setSharedIds((prev) => {
                        const next = new Set(prev);
                        if (msg.recipient_user_id) next.delete(msg.recipient_user_id);
                        if (msg.type === "end") next.clear();
                        return next;
                    });
                }
            } catch { }
        };
        ws.onerror = () => { };
        return () => {
            try {
                ws.close();
            } catch { }
        };
    }, [open, session?.id]);

    const handleShareClick = async (recipientId) => {
        if (loading || creating) return;
        setSharingId(recipientId);
        setLoading(true);
        try {
            const s = await ensureSession();
            const res = await authFetchWithRefresh(
                api(`/track/sessions/${s.id}/share`),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ recipient_ids: [recipientId] }),
                }
            );
            if (!res.ok) {
                alert(t("live.share.failShare", "Не удалось поделиться"));
            } else {
                await refreshSharedFor(s.id);
                // 👇 важно для чата: сообщаем кто адресат
                onShared?.(s, recipientId);
            }
        } finally {
            setLoading(false);
            setSharingId(null);
        }
    };

    const handleUnshareClick = async (recipientId) => {
        if (loading || creating || !session?.id) return;
        setSharingId(recipientId);
        setLoading(true);
        try {
            const url = new URL(api(`/track/sessions/${session.id}/unshare`));
            url.searchParams.set("recipient_id", String(recipientId));
            await authFetchWithRefresh(url.toString(), { method: "POST" });
            await refreshSharedFor(session.id);
        } finally {
            setLoading(false);
            setSharingId(null);
        }
    };

    // Универсальная публичная ссылка → системный share / клипборд
    const shareNative = async () => {
        try {
            setIsSharing(true);
            const url = await ensureShareUrl();
            const text = t("live.share.nativeText", "Моё местоположение (LIVE):");
            if (navigator.share) {
                await navigator.share({ title: t("live.share.nativeTitle", "GPS мониторинг"), text, url });
            } else {
                const ok = await copyText(url);
                alert(ok ? t("common.linkCopied", "Ссылка скопирована")
                    : t("common.copyFailed", "Не удалось скопировать"));
            }
        } catch (e) {
            console.debug("share cancelled/failed", e);
        } finally {
            setIsSharing(false);
        }
    };

    // Быстрый шаринг в конкретные платформы
    const openShareTarget = async (target) => {
        try {
            const url = await ensureShareUrl();
            const message = encodeURIComponent(t("live.share.nativeTextShort", "Моё местоположение (LIVE)"));
            const link = encodeURIComponent(url);
            let href = "";
            switch (target) {
                case "whatsapp":
                    href = `https://wa.me/?text=${message}%20${link}`;
                    break;
                case "telegram":
                    href = `https://t.me/share/url?url=${link}&text=${message}`;
                    break;
                case "viber":
                    href = `viber://forward?text=${message}%20${link}`;
                    break;
                case "facebook":
                    href = `https://www.facebook.com/sharer/sharer.php?u=${link}`;
                    break;
                case "twitter":
                    href = `https://twitter.com/intent/tweet?url=${link}&text=${message}`;
                    break;
                case "email":
                    href = `mailto:?subject=${encodeURIComponent(
                        t("live.share.nativeTitleLive", "GPS мониторинг (LIVE)")
                    )}&body=${message}%20${link}`;
                    break;
                default:
                    return;
            }
            window.open(href, "_blank", "noopener,noreferrer");
        } catch (e) {
            alert(t("live.share.prepareFail", "Не удалось подготовить ссылку"));
        }
    };

    // Закрытие по Esc
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const backdropProps = {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        className: "fixed inset-0 z-[2147483647] flex items-center justify-center",
        role: "dialog",
        "aria-modal": "true",
        style: { background: "rgba(0,0,0,.45)", zIndex: 2147483647 },
        onMouseDown: (e) => {
            if (e.target === e.currentTarget) {
                e.stopPropagation();
                onClose?.();
            } else {
                e.stopPropagation();
            }
        },
        onClick: (e) => e.stopPropagation(),
    };

    const cardProps = {
        initial: { y: 30, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: 30, opacity: 0 },
        className: "w-full max-w-xl rounded-2xl p-4",
        style: { background: "#0B1622", border: "1px solid rgba(255,255,255,.08)" },
        onMouseDown: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation(),
    };

    const renderRecipientRow = (u) => {
        const isShared = sharedIds.has(u.id);
        return (
            <div
                key={u.id}
                className="flex items-center justify-between px-3 py-3 border-b border-[rgba(255,255,255,.06)]"
            >
                <div className="flex items-center gap-3">
                    <img
                        src={avatarSrcOf(u)}
                        alt={u.name || u.email || "avatar"}
                        className="w-8 h-8 rounded-full object-cover"
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
                <button
                    disabled={creating || loading}
                    onClick={(e) => {
                        e.stopPropagation();
                        isShared ? handleUnshareClick(u.id) : handleShareClick(u.id);
                    }}
                    className="px-3 py-2 rounded-xl flex items-center gap-2"
                    style={{
                        background: isShared ? "#382525" : "#0c3a26",
                        opacity: creating || loading ? 0.6 : 1,
                        cursor: creating || loading ? "default" : "pointer",
                    }}
                >
                    {sharingId === u.id ? (
                        <>
                            <svg viewBox="0 0 24 24" className="animate-spin" style={{ width: 16, height: 16 }}>
                                <circle
                                    cx="12"
                                    cy="12"
                                    r="9"
                                    fill="none"
                                    stroke="rgba(255,255,255,.25)"
                                    strokeWidth="3"
                                />
                                <path
                                    d="M21 12a9 9 0 0 0-9-9"
                                    fill="none"
                                    stroke="#fff"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                />
                            </svg>
                            <span>{isShared ? t("live.share.stoppingShort", "Останавливаем…")
                                : t("live.share.sharingShort", "Шарим…")}</span>
                        </>
                    ) : (
                        <span>{isShared ? t("live.share.stop", "Остановить")
                            : t("live.share.share", "Поделиться")}</span>
                    )}
                </button>
            </div>
        );
    };

    const modal = (
        <AnimatePresence>
            {open && (
                <motion.div {...backdropProps}>
                    <motion.div {...cardProps}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-lg font-semibold">{t("live.share.modalTitle", "Поделиться локацией")}</div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClose?.();
                                }}
                                className="px-3 py-1 rounded-xl"
                                style={{ background: "#1f2a37" }}
                            >
                                {t("common.close", "Закрыть")}
                            </button>
                        </div>

                        {/* Если forceTargetUserId задан — скрываем поиск, показываем титул «Получатель» */}
                        {!forceTargetUserId && (
                            <input
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder={t("search.userPlaceholder", "Поиск пользователя…")}
                                className="w-full mb-3 px-3 py-2 rounded-xl"
                                style={{ background: "#0f2130", border: "1px solid rgba(255,255,255,.06)" }}
                            />
                        )}

                        {(creating || sharingId) && (
                            <div className="mb-3 text-xs" style={{ color: "#b3d5fa", opacity: 0.9 }}>
                                {creating
                                    ? t("live.share.creating", "Создаём/проверяем сессию…")
                                    : sharedIds.has(sharingId)
                                        ? t("live.share.stopping", "Останавливаем шаринг…")
                                        : t("live.share.sendingInvite", "Отправляем приглашение на шаринг…")}
                            </div>
                        )}

                        {/* Список пользователей / одиночный получатель */}
                        <div
                            className="max-h-[360px] overflow-auto rounded-xl"
                            style={{ border: "1px solid rgba(255,255,255,.06)" }}
                        >
                            {forceTargetUserId ? (
                                filtered.length === 1 ? (
                                    renderRecipientRow(filtered[0])
                                ) : (
                                    <div className="p-6 text-center opacity-70">{t("live.share.recipientNotFound", "Получатель не найден")}</div>
                                )
                            ) : filtered.length > 0 ? (
                                filtered.map((u) => renderRecipientRow(u))
                            ) : (
                                <div className="p-6 text-center opacity-70">{t("live.share.usersNotFound", "Пользователи не найдены")}</div>
                            )}
                        </div>

                        {/* Нижняя панель внешнего шаринга */}
                        <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                            <div className="mb-2 text-xs opacity-70">{t("live.share.externalAccess", "Внешний общий доступ к локации")}</div>

                            <div className="mt-3 mb-1 flex items-center gap-8">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        ensureShareUrl()
                                            .then((url) => copyText(url))
                                            .then((ok) => alert(ok ? "Ссылка скопирована" : "Не удалось скопировать"));
                                    }}
                                    className="px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                    style={{ background: "#1f2a37", border: "1px solid rgba(255,255,255,.08)" }}
                                >
                                    {t("live.share.copyPublicLink", "Скопировать публичную ссылку")}
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            revokeShareUrl();
                                        }}
                                        className="px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                        style={{ background: "#382525", border: "1px solid rgba(255,255,255,.08)" }}
                                    >
                                        {t("live.share.deactivateLink", "Деактивировать ссылку")}
                                    </button>
                                    <FaQuestionCircle
                                        size={16}
                                        className="opacity-70 hover:opacity-100 cursor-help"
                                        title={t("live.share.helpTooltip", `Что такое публичная ссылка?
• Любой, у кого есть ссылка, сможет смотреть ваш LIVE-трек.
• Как только человек откроет ссылку, у вас загорится «LIVE».
• В любой момент вы можете деактивировать ссылку — она перестанет работать, а зрители будут отключены.
• Сейчас ссылка создаётся на 7 дней. При необходимости срок можно изменить.`)}
                                    />
                                </div>
                            </div>

                            {/* Быстрые платформы */}
                            <div className="grid grid-cols-3 gap-x-8 gap-y-6 mb-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openShareTarget("whatsapp");
                                    }}
                                    className="flex items-center gap-2 opacity-90 hover:opacity-100 px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                    style={{ background: "#1f2a37", border: "1px solid rgba(255,255,255,.08)" }}
                                >
                                    <FaWhatsapp /> WhatsApp
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openShareTarget("telegram");
                                    }}
                                    className="flex items-center gap-2 opacity-90 hover:opacity-100 px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                    style={{ background: "#1f2a37", border: "1px solid rgba(255,255,255,.08)" }}
                                >
                                    <FaTelegramPlane /> Telegram
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openShareTarget("viber");
                                    }}
                                    className="flex items-center gap-2 opacity-90 hover:opacity-100 px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                    style={{ background: "#1f2a37", border: "1px solid rgba(255,255,255,.08)" }}
                                >
                                    <FaViber /> Viber
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openShareTarget("facebook");
                                    }}
                                    className="flex items-center gap-2 opacity-90 hover:opacity-100 px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                    style={{ background: "#1f2a37", border: "1px solid rgba(255,255,255,.08)" }}
                                >
                                    <FaFacebookF /> Facebook
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openShareTarget("twitter");
                                    }}
                                    className="flex items-center gap-2 opacity-90 hover:opacity-100 px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                    style={{ background: "#1f2a37", border: "1px solid rgba(255,255,255,.08)" }}
                                >
                                    <FaTwitter /> X (Twitter)
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openShareTarget("email");
                                    }}
                                    className="flex items-center gap-2 opacity-90 hover:opacity-100 px-3 py-2 rounded-xl transition-transform duration-150 hover:-translate-y-0.5"
                                    style={{ background: "#1f2a37", border: "1px solid rgba(255,255,255,.08)" }}
                                >
                                    <FaEnvelope /> Email
                                </button>
                            </div>
                        </div>

                        {creating && <div className="mt-3 text-xs opacity-70">{t("live.share.creating", "Создаём/проверяем сессию…")}</div>}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    // Портал
    return ReactDOM.createPortal(modal, document.body);
}
