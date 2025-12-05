// components/PinnedChatsBar.js
import { useMessenger } from "./MessengerContext";
import { useEffect, useLayoutEffect, useState } from "react";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import { abs } from "@/config/env";

export default function PinnedChatsBar() {
    const { t } = useLang();
    const { pinnedChats, pendingPinned, unpinChat, openMessenger, chatList } = useMessenger();
    const [isClient, setIsClient] = useState(false);
    const { user } = useUser();

    // единый размер круглого пина (px)
    const PIN_SIZE = 56;

    // отступ от FAB поддержки (кнопки помощи)
    const [dockBottom, setDockBottom] = useState(16);

    useLayoutEffect(() => {
        const sel = "[data-support-fab]";
        const calc = () => {
            const fab = document.querySelector(sel);
            if (!fab) { setDockBottom(16); return; }
            const r = fab.getBoundingClientRect();
            const distFromBottom = window.innerHeight - r.top; // px
            const gap = 12; // зазор между FAB и пинами
            setDockBottom(Math.round(distFromBottom + gap));
        };
        calc();
        let ro;
        const fab = document.querySelector(sel);
        if (fab && "ResizeObserver" in window) {
            ro = new ResizeObserver(calc);
            ro.observe(fab);
        }
        window.addEventListener("resize", calc);
        return () => {
            ro && ro.disconnect && ro.disconnect();
            window.removeEventListener("resize", calc);
        };
    }, []);


    useEffect(() => { setIsClient(true); }, []);

    if (!isClient) return null; // SSR-safe!
    if (typeof window !== "undefined" && window.innerWidth < 900) return null;
    if (!pinnedChats.length && (!pendingPinned || !pendingPinned.length)) return null;

    // Геометрия: док стоит над кнопкой Support
    const BOTTOM_PAD = 16;      // отступ контейнера от края
    const SUPPORT_HEIGHT = 56;  // высота кнопки Support (≈)
    const GAP_TO_SUPPORT = 12;  // зазор над Support
    const SAFE_TOP = 16;        // "потолок" — оставим небольшой верхний отступ
    const MAX_H_CSS = `calc(100vh - ${BOTTOM_PAD + SUPPORT_HEIGHT + GAP_TO_SUPPORT + SAFE_TOP}px)`;

    console.log('chatList:', chatList);
    console.log('pinnedChats:', pinnedChats);
    return (
        <div
            style={{
                position: "fixed",
                right: 16,
                bottom: dockBottom,
                zIndex: 950,
                display: "flex",
                flexDirection: "column-reverse", // растём вверх от кнопки
                gap: 12,
                alignItems: "flex-end",          // правый край ровный
                pointerEvents: "none",            // кликаются только сами кружки
            }}
        >
            {pinnedChats.map((chat) => {
                const isGroup = chat.is_group;
                const avatar = isGroup
                    ? (
                        chat.group_avatar
                            ? abs(chat.group_avatar)
                            : "/group-default.png"
                    )
                    : (
                        chat.peer?.avatar
                            ? abs(chat.peer.avatar)
                            : "/default-avatar.png"
                    );
                const name = isGroup
                    ? (chat.group_name || t("common.group", "Группа"))
                    : (chat.peer?.name || t("common.user", "Пользователь"));

                // Получаем chat объект из chatList
                const chatObj = chatList.find(c => c.chat_id === chat.chat_id) || {};
                let unreadCount = 0;
                if (typeof chatObj.unread === "number") {
                    unreadCount = chatObj.unread;
                } else if (Array.isArray(chatObj.messages)) {
                    unreadCount = chatObj.messages.filter(m =>
                        !m.is_own && !m.is_read && m.sender_id !== user?.id
                    ).length;
                }

                return (
                    <div
                        key={chat.chat_id}
                        data-chat-id={chat.chat_id}
                        style={{
                            position: "relative",
                            pointerEvents: "auto",
                            width: PIN_SIZE,              // фиксируем геометрию элемента
                            height: PIN_SIZE,
                            flex: "0 0 auto",
                            display: "grid",
                            overflow: "visible",
                            placeItems: "center"
                        }}
                    >
                        <div
                            title={name}
                            onClick={() => openMessenger(chat.chat_id)}
                            style={{
                                width: PIN_SIZE, height: PIN_SIZE,
                                borderRadius: "50%",
                                overflow: "hidden",
                                background: "#26364a",
                                border: "2.5px solid #38bcf8",
                                boxShadow: "0 2px 10px #202e42a9",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "box-shadow 0.18s",
                                position: "relative"
                            }}
                        >
                            <img
                                src={avatar}
                                alt={name}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                }}
                                onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                            />
                        </div>
                        {/* Индикатор непрочитанных */}
                        {unreadCount > 0 && (
                            <span style={{
                                position: "absolute",
                                top: -6,
                                left: -6,               // ← переносим бейдж на левую сторону
                                zIndex: 20,
                                pointerEvents: "none",
                                background: "#ff3535",
                                color: "#fff",
                                borderRadius: "50%",
                                minWidth: 22,
                                height: 22,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                fontWeight: 700,
                                padding: "0 6px",
                                boxShadow: "0 2px 6px rgba(0,0,0,.35)",
                            }}>
                                {unreadCount}
                            </span>
                        )}
                        {/* Крестик для удаления */}
                        <button
                            title="Убрать из закрепленных"
                            onClick={e => {
                                e.stopPropagation();
                                unpinChat(chat.chat_id);
                            }}
                            style={{
                                position: "absolute",
                                top: -8,
                                right: -8,
                                width: 24, height: 24,
                                borderRadius: "50%",
                                background: "#253040",
                                color: "#fff",
                                border: "2px solid #38bcf8",
                                fontWeight: 900,
                                fontSize: 16,
                                cursor: "pointer",
                                zIndex: 15,
                                boxShadow: "0 2px 10px #222e44a3"
                            }}
                        >×</button>
                    </div>
                );
            })}
        </div>
    );
}
