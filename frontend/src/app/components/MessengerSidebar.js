"use client";
import { useMessenger } from "./MessengerContext";
import { useState, useEffect, useRef, useMemo } from "react";
import { useUser } from "../UserContext";
import GroupMembersModal from "./GroupMembersModal";
import CreateGroupModal from "./CreateGroupModal";
import { Users2, Phone } from "lucide-react";
import { FaBellSlash } from "react-icons/fa";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";

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

function getUserChatTitleAndSubtitle(user, fallbackUserTitle = "") {
  let title = "";
  let subtitle = "";
  if (
    user.organization &&
    (user.contact_person || user.full_name || user.name)
  ) {
    title = user.organization;
    subtitle = user.contact_person || user.full_name || user.name;
  } else if (user.organization) {
    title = user.organization;
  } else if (user.contact_person || user.full_name || user.name) {
    title = user.contact_person || user.full_name || user.name;
  } else if (user.email) {
    title = user.email;
  } else if (user.id) {
    title = "ID: " + user.id;
  } else {
    // В модульной функции недоступен хук useLang → используем переданный фолбэк
    title = fallbackUserTitle;
  }
  return { title, subtitle };
}

function getUserDisplayName(
  user,
  { idPrefix = "ID:", userTitle = "Пользователь" } = {}
) {
  return (
    user.organization ||
    user.contact_person ||
    user.full_name ||
    user.name ||
    user.email ||
    (user.id ? idPrefix + " " + user.id : "") ||
    userTitle
  );
}

function getUserInitial(user) {
  return (
    (user.organization && String(user.organization)[0].toUpperCase()) ||
    (user.contact_person && String(user.contact_person)[0].toUpperCase()) ||
    (user.full_name && String(user.full_name)[0].toUpperCase()) ||
    (user.name && String(user.name)[0].toUpperCase()) ||
    "U"
  );
}

export default function MessengerSidebar({ onSelectChat, selectedChat }) {
  const { t } = useLang();
  const { user } = useUser();
  const avatarUrl = user?.avatar ? abs(user.avatar) : "/default-avatar.png";
  const {
    chatList = [],
    fetchChatList,
    mutedGroups = [],
    fetchMoreChats,
    chatListEOF,
    chatListLoading,
    deleteChatForMe, // ← добавили
    clearLocalChat, // ← добавили
  } = useMessenger();

  const [search, setSearch] = useState("");
  const [forceUpdate, setForceUpdate] = useState(Date.now());
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupModalChat, setGroupModalChat] = useState(null);
  const [groupCounts, setGroupCounts] = useState({});
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    chatId: null,
  });
  const [closingIds, setClosingIds] = useState(new Set());
  useEffect(() => {
    const onClose = (e) => {
      const id = e?.detail?.chatId;
      if (!id) return;
      setClosingIds((prev) => new Set([...prev, id]));
    };
    window.addEventListener("support_chat_closing", onClose);
    return () => window.removeEventListener("support_chat_closing", onClose);
  }, []);

  const menuRef = useRef();
  // Сенсор для автодогрузки чатов
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!contextMenu.visible) return;
    function onDown(e) {
      // Если клик не по меню и не по его дочерним элементам — закрываем
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [contextMenu.visible]);

  useEffect(() => {
    const groupChats = chatList.filter((c) => c.is_group && c.chat_id);
    groupChats.forEach((chat) => {
      if (typeof groupCounts[chat.chat_id] === "number") return;
      fetch(api(`/chat/${chat.chat_id}/participants`), {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
        .then((r) => r.json())
        .then((arr) =>
          setGroupCounts((gc) => ({ ...gc, [chat.chat_id]: arr.length }))
        )
        .catch(() => {});
    });
    // eslint-disable-next-line
  }, [chatList.length]);

  useEffect(() => {
    function handleGroupMembersUpdated(e) {
      const chatId = e.detail?.chat_id;
      if (!chatId) return;
      fetch(api(`/chat/${chatId}/participants`), {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
        .then((r) => r.json())
        .then((arr) =>
          setGroupCounts((gc) => ({ ...gc, [chatId]: arr.length }))
        )
        .catch(() => {});
    }
    window.addEventListener("group_members_updated", handleGroupMembersUpdated);
    return () =>
      window.removeEventListener(
        "group_members_updated",
        handleGroupMembersUpdated
      );
  }, []);

  useEffect(() => {
    function hideMenu() {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    }
    if (contextMenu.visible) {
      window.addEventListener("click", hideMenu);
      window.addEventListener("scroll", hideMenu);
    }
    return () => {
      window.removeEventListener("click", hideMenu);
      window.removeEventListener("scroll", hideMenu);
    };
  }, [contextMenu.visible]);

  useEffect(() => {
    function handler() {
      setForceUpdate(Date.now());
    }
    window.addEventListener("inbox_update", handler);
    return () => window.removeEventListener("inbox_update", handler);
  }, []);

  // Автодогрузка: когда "дно" списка попадает в видимую область
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !chatListLoading && !chatListEOF) {
            fetchMoreChats?.();
          }
        });
      },
      { rootMargin: "200px" } // подгружаем заранее
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchMoreChats, chatListLoading, chatListEOF]);

  const filteredChats = !search.trim()
    ? chatList
    : chatList.filter((chat) => {
        const peer = chat.peer || chat.last_message?.sender || {};
        const val = [
          peer.organization,
          peer.contact_person,
          peer.full_name,
          peer.name,
          peer.email,
          peer.id,
          chat.chat_id,
          chat.group_name,
        ]
          .map((x) => x || "")
          .join(" ");
        return val.toLowerCase().includes(search.trim().toLowerCase());
      });

  // Делаем список уникальным по chat_id (с фолбэком на id/uid)
  const uniqueFilteredChats = useMemo(() => {
    const seen = new Set();
    return (filteredChats || []).filter((c) => {
      const id = c?.chat_id ?? c?.id ?? c?.uid;
      if (id == null) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [filteredChats]);

  return (
    <div key={forceUpdate}>
      {/* Кнопка "Создать группу" */}
      <div
        className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-opacity-90 flex justify-between items-center px-3 pt-2 pb-2 border-b"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <input
          type="text"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("sidebar.searchChats", "Поиск по чатам…")}
          className="w-full p-2 rounded-lg mr-2"
          style={{
            fontSize: 16, // ← убираем авто-зум на iOS
            background: "var(--control-bg)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            marginBottom: 0,
            outline: "none",
            transition: "border 0.2s",
          }}
          onFocus={(e) =>
            (e.target.style.border = "1.5px solid var(--border-strong)")
          }
          onBlur={(e) =>
            (e.target.style.border = "1px solid var(--border-subtle)")
          }
        />
        <button
          className="ml-2 px-3 py-1 bg-[#38bcf8] text-white rounded-lg text-sm font-semibold shadow tap"
          onClick={() => setShowCreateGroup(true)}
          title={t("sidebar.createGroup", "Создать группу")}
          style={{ minWidth: 44, height: 36 }} // крупная зона тапа
          aria-label={t("sidebar.createGroup", "Создать группу")}
        >
          <Users2 size={18} aria-hidden="true" />
          <span className="sr-only">
            {t("sidebar.createGroup", "Создать группу")}
          </span>
        </button>
      </div>
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          afterCreate={() => {
            setShowCreateGroup(false);
            fetchChatList && fetchChatList();
          }}
        />
      )}

      {!Array.isArray(chatList) || chatList.length === 0 ? (
        <div className="p-6 text-gray-500">
          {t("sidebar.noChats", "Нет чатов")}
        </div>
      ) : (
        uniqueFilteredChats
          .slice()
          .sort((a, b) => {
            function getTime(chat) {
              if (chat.last_message?.sent_at)
                return new Date(chat.last_message.sent_at).getTime();
              if (chat.created_at) return new Date(chat.created_at).getTime();
              return Date.now();
            }
            return getTime(b) - getTime(a);
          })
          .map((chat) => {
            const isSupport = !!chat.support;
            const isGroup = isSupport ? false : !!chat.is_group; // саппорт НЕ отображаем как группу
            const isSelected = chat.chat_id === selectedChat;
            let title,
              subtitle,
              avatarUrl,
              membersCount = "—";
            // NEW: помечаем карточки, которые уходим на авто-закрытие
            const isClosing = closingIds.has(chat.chat_id);

            const textColors = {
              title: isSelected
                ? "var(--chat-item-selected-title)"
                : "var(--text-primary)",
              subtitle: isSelected
                ? "var(--chat-item-selected-subtitle)"
                : "var(--text-secondary)",
              preview: isSelected
                ? "var(--chat-item-selected-preview)"
                : "var(--text-secondary)",
              timestamp: isSelected
                ? "var(--chat-item-selected-timestamp)"
                : "var(--text-secondary)",
            };

            const cardStyle = {
              overflow: "hidden",
              background: isSelected
                ? "var(--chat-item-selected-bg)"
                : "var(--control-bg)",
              border: isSelected
                ? "1px solid var(--chat-item-selected-border)"
                : "1px solid var(--border-subtle)",
              boxShadow: isSelected ? "var(--shadow-soft)" : "none",
              color: textColors.title,
              transition:
                "background-color var(--transition-normal), color var(--transition-fast), border-color var(--transition-normal), box-shadow var(--transition-normal), opacity 200ms ease",
            };

            if (isSupport) {
              // --- Саппорт: всегда через i18n ---
              const statusRaw = String(chat.support_status || "").replace(
                "TicketStatus.",
                ""
              );
              const statusLbl = localizeTicketStatus(statusRaw, t);
              title = t("support.title", chat.display_title || "Поддержка");
              subtitle = chat.display_subtitle
                ? t(chat.display_subtitle, chat.display_subtitle)
                : statusRaw
                ? `${t("support.status", "Статус")}: ${statusLbl}`
                : "";
              avatarUrl = abs(
                chat.support_logo_url || "/static/support-logo.svg"
              );
            } else if (isGroup) {
              title = chat.group_name || t("chat.group", "Группа");
              avatarUrl = chat.group_avatar || "/group-default.png";
              if (typeof groupCounts[chat.chat_id] === "number") {
                membersCount = groupCounts[chat.chat_id];
              } else if (
                Array.isArray(chat.participants) &&
                chat.participants.length > 0
              ) {
                membersCount = chat.participants.length;
              } else if (
                typeof chat.members_count === "number" &&
                chat.members_count > 0
              ) {
                membersCount = chat.members_count;
              } else if (
                chat.group_members_count &&
                typeof chat.group_members_count === "number" &&
                chat.group_members_count > 0
              ) {
                membersCount = chat.group_members_count;
              } else {
                membersCount = "—";
              }
              subtitle = `${t("chat.members", "Участников")}: ${membersCount}`;
            } else {
              const peer = chat.peer || chat.last_message?.sender || {};
              const { title: peerTitle, subtitle: peerSubtitle } =
                getUserChatTitleAndSubtitle(
                  peer,
                  t("common.user", "Пользователь")
                );
              title = peerTitle;
              avatarUrl = peer.avatar
                ? abs(peer.avatar)
                : "/default-avatar.png";
              subtitle = peerSubtitle;
            }

            return (
              <div
                key={chat.chat_id ?? chat.id ?? chat.uid}
                className={`flex items-center gap-3 p-3 cursor-pointer rounded-lg mb-1
                                            hover:bg-[var(--chat-item-hover-bg)]
                                            ${
                                              isSelected
                                                ? "hover:bg-[var(--chat-item-selected-bg)]"
                                                : ""
                                            }
                                            ${
                                              isClosing
                                                ? "opacity-0 max-h-0 -my-2 pointer-events-none"
                                                : "opacity-100 max-h-40"
                                            }
                                            transition-[background-color,border-color,box-shadow,opacity] duration-300`}
                style={cardStyle}
                onClick={() => onSelectChat(chat.chat_id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    visible: true,
                    x: e.clientX,
                    y: e.clientY,
                    chat,
                  });
                }}
              >
                {isSupport ? (
                  <img
                    src={avatarUrl || abs("/static/support-logo.svg")}
                    alt="support"
                    className="w-10 h-10 rounded-full object-cover"
                    style={{
                      background: "#0f2237",
                      border: "2px solid #38bcf8",
                    }}
                    onError={(e) => {
                      e.currentTarget.src = abs("/static/support-logo.svg");
                    }}
                  />
                ) : isGroup ? (
                  avatarUrl && avatarUrl !== "/group-default.png" ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      className="w-10 h-10 rounded-full object-cover"
                      style={{ background: "#202c44" }}
                      onError={(e) => {
                        e.currentTarget.src = "/default-avatar.png";
                      }}
                    />
                  ) : (
                    <div className="w-10 h-10 flex items-center justify-center bg-[#e2f0fa] rounded-full border-2 border-[#38bcf8]">
                      <Users2 size={28} color="#38bcf8" />
                    </div>
                  )
                ) : (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="w-10 h-10 rounded-full object-cover"
                    style={{ background: "#202c44" }}
                    onError={(e) => {
                      e.currentTarget.src = "/default-avatar.png";
                    }}
                  />
                )}
                <div className="flex-1 min-w-0 flex flex-col">
                  <span
                    className="truncate font-semibold"
                    style={{ color: textColors.title }}
                  >
                    {title ||
                      (isSupport ? t("support.title", "Поддержка") : "")}
                  </span>
                  {subtitle && (
                    <span
                      className="truncate text-xs mt-1"
                      style={{ color: textColors.subtitle }}
                    >
                      {subtitle}
                    </span>
                  )}
                  <div
                    className="text-xs truncate mt-1"
                    style={{ color: textColors.preview }}
                  >
                    {chat.last_message
                      ? chat.last_message.content
                      : t("chat.noMessagesShort", "Нет сообщений")}
                  </div>
                  {isSupport && (
                    <div className="text-[10px] mt-1 text-[#80d1ff] uppercase tracking-wide">
                      🛟 {t("support.badge", "Поддержка")}
                      {chat.support_status
                        ? ` • ${String(chat.support_status).replace(
                            "TicketStatus.",
                            ""
                          )}`
                        : ""}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  {chat.last_message?.sent_at && (
                    <div
                      className="text-xs"
                      style={{ color: textColors.timestamp }}
                    >
                      {new Date(chat.last_message.sent_at).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" }
                      )}
                    </div>
                  )}
                  {chat.unread > 0 && chat.chat_id !== selectedChat && (
                    <span className="inline-block bg-[#e45b5b] text-white text-xs rounded-full px-2 mt-1">
                      {chat.unread}
                    </span>
                  )}
                  {isGroup && !isSupport && (
                    <button
                      className="mt-2 flex items-center justify-center p-1 rounded-full transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGroupModalChat(chat);
                      }}
                      title={t(
                        "sidebar.manageMembers",
                        "Управлять участниками"
                      )}
                      style={{
                        width: 32,
                        height: 32,
                        background: "var(--chat-item-hover-bg)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <Users2 size={20} color="#90e1ff" />
                    </button>
                  )}
                  {/* MUTE INDICATOR */}
                  {isGroup &&
                    !isSupport &&
                    mutedGroups.includes(chat.chat_id) && (
                      <FaBellSlash
                        style={{
                          color: "#e2a941",
                          fontSize: 15,
                          marginLeft: 6,
                        }}
                        title={t("sidebar.muted", "Уведомления выключены")}
                      />
                    )}
                </div>
              </div>
            );
          })
      )}

      {/* Load more / progress for chat list */}
      {!chatListEOF && !chatListLoading && filteredChats.length > 0 && (
        <button
          onClick={() => fetchMoreChats && fetchMoreChats()}
          style={{
            display: "block",
            background: "transparent",
            color: "#90caf9",
            border: "1px solid #90caf9",
            borderRadius: 12,
            padding: "8px 12px",
            cursor: "pointer",
            margin: "8px auto 8px",
          }}
        >
          {t("sidebar.showMore", "Показать ещё")}
        </button>
      )}
      {chatListLoading && (
        <div style={{ padding: 12, color: "#9cc4e7", textAlign: "center" }}>
          {t("sidebar.loading", "Загружаем…")}
        </div>
      )}

      {/* Сенсор для IntersectionObserver (автодогрузка) */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {/* Модалка участников группы */}
      {groupModalChat && (
        <GroupMembersModal
          chat={groupModalChat}
          onClose={() => setGroupModalChat(null)}
          afterChange={() => {
            setGroupModalChat(null);
            fetchChatList && fetchChatList();
          }}
        />
      )}
      {contextMenu.visible && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            boxShadow: "var(--shadow-soft)",
            borderRadius: 10,
            minWidth: 140,
            padding: "7px 0",
            userSelect: "none",
            border: "1px solid var(--border-subtle)",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="w-full text-left px-5 py-2 hover:bg-[var(--control-bg-hover)] transition"
            style={{
              background: "none",
              border: "none",
              color: "#f76a6a",
              fontWeight: 500,
              cursor: "pointer",
            }}
            onClick={async (e) => {
              e.stopPropagation();
              setContextMenu({ ...contextMenu, visible: false });
              // локально запускаем анимацию схлопывания
              try {
                window.dispatchEvent(
                  new CustomEvent("support_chat_closing", {
                    detail: { chatId: contextMenu.chat.chat_id },
                  })
                );
              } catch {}
              const cid = contextMenu.chat.chat_id;
              // личное удаление: сервер проставит cleared_at,
              // локально чистим и обновляем список
              await deleteChatForMe?.(cid);
              try {
                clearLocalChat?.(cid);
              } catch {}
              setTimeout(() => {
                fetchChatList?.({ force: true });
              }, 300);
            }}
          >
            {contextMenu.chat.is_group
              ? t("sidebar.leaveGroup", "Выйти из группы")
              : t("sidebar.deleteChat", "Удалить чат")}
          </button>
        </div>
      )}
    </div>
  );
}
