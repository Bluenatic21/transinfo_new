"use client";
import { useState, useEffect, useContext } from "react";
import { MessengerContext } from "./MessengerContext";
import { useUser } from "../UserContext";
import { getAvatarUrl } from "./getAvatarUrl";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

function getUserChatTitleAndSubtitle(user, fallbackUserTitle = "Пользователь") {
    let title = "";
    let subtitle = "";
    if (user.organization && (user.contact_person || user.full_name || user.name)) {
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
        title = fallbackUserTitle;
    }
    return { title, subtitle };
}

export default function GroupMembersModal({ chat, onClose, afterChange }) {
    const { user } = useUser();
    const { t } = useLang();
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [showRemoveModal, setShowRemoveModal] = useState(false);
    const [pendingRemoveUserId, setPendingRemoveUserId] = useState(null);
    const [search, setSearch] = useState("");
    const [showAll, setShowAll] = useState(false);

    // Новый: получаем ws-подключение из MessengerContext
    console.log("MessengerContext:", MessengerContext);
    const { notificationsSocket } = useContext(MessengerContext);

    // Роль в группе
    const myParticipant = participants.find(p => p.user_id === user.id);
    const myGroupRole = myParticipant?.role?.toLowerCase() || "member";
    const isGroupOwner = myGroupRole === "owner";
    const isGroupAdmin = myGroupRole === "admin";
    const canManageGroup = isGroupOwner || isGroupAdmin;

    useEffect(() => {
        setLoading(true);
        fetch(api(`/chat/${chat.chat_id}/participants`), {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        })
            .then(r => r.json())
            .then(arr => {
                if (!Array.isArray(arr)) {
                    alert(arr.detail || t("group.fetchError", "Ошибка получения участников группы"));
                    setParticipants([]);
                    return;
                }
                const norm = arr.map(p => ({
                    ...(p.user || {}),
                    role: p.role ? p.role.toLowerCase() : "member",
                    user_id: p.user_id || (p.user ? p.user.id : undefined),
                    joined_at: p.joined_at,
                }));
                setParticipants(norm);
            })
            .finally(() => setLoading(false));
    }, [chat?.chat_id]);

    // Новый эффект для авто-обновления по ws-событию
    useEffect(() => {
        if (!notificationsSocket) return;

        const handler = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Автообновление только если это обновление участников именно этой группы
                if (
                    data.event === "group_members_updated" &&
                    data.chat_id === chat.chat_id
                ) {
                    refetchParticipants();
                }
            } catch { }
        };

        notificationsSocket.addEventListener("message", handler);
        return () => {
            notificationsSocket.removeEventListener("message", handler);
        };
        // chat.chat_id чтобы при смене группы переподписывались
    }, [notificationsSocket, chat?.chat_id]);

    // Управление участниками
    const refetchParticipants = () => {
        setLoading(true);
        fetch(api(`/chat/${chat.chat_id}/participants`), {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        })
            .then(r => r.json())
            .then(arr => {
                if (!Array.isArray(arr)) {
                    alert(arr.detail || t("group.fetchError", "Ошибка получения участников группы"));
                    setParticipants([]);
                    return;
                }
                const norm = arr.map(p => ({
                    ...(p.user || {}),
                    role: p.role ? p.role.toLowerCase() : "member",
                    user_id: p.user_id || (p.user ? p.user.id : undefined),
                    joined_at: p.joined_at,
                }));
                setParticipants(norm);
            })
            .finally(() => setLoading(false));
    };

    const handleRemove = async (uid) => {
        await fetch(api(`/group/${chat.chat_id}/remove_member`), {
            method: "POST",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
            body: JSON.stringify(uid)
        });
        refetchParticipants();
    };
    const handleSetRole = async (uid, role) => {
        await fetch(api(`/group/${chat.chat_id}/set_role`), {
            method: "POST",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: uid, role })
        });
        refetchParticipants();
    };
    const handleLeaveGroup = async () => {
        await fetch(api(`/group/${chat.chat_id}/leave`), {
            method: "POST",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        afterChange && afterChange();
    };

    // Фильтрация участников по поиску
    const searchLower = search.trim().toLowerCase();
    const filteredParticipants = searchLower
        ? participants.filter(p => {
            const fields = [
                p.organization, p.name, p.full_name, p.contact_person, p.email, p.id
            ].filter(Boolean).join(" ").toLowerCase();
            return fields.includes(searchLower);
        })
        : participants;

    // Ограничение по "Показать всех"
    const limitedParticipants =
        !showAll && !searchLower && filteredParticipants.length > 10
            ? filteredParticipants.slice(0, 10)
            : filteredParticipants;

    function MemberRow({ u }) {
        const isMyself = user.id === u.user_id;
        const avatarUrl = getAvatarUrl(isMyself ? user : u);
        const { title, subtitle } = getUserChatTitleAndSubtitle(
            isMyself ? user : u,
            t("common.user", "Пользователь")
        );

        const isOwnerUser = u.user_id === chat?.owner_id;
        const role = isOwnerUser ? "owner" : (u.role ? u.role.toLowerCase() : "member");

        return (
            <div className="flex items-center gap-4 py-3 px-3 rounded hover:bg-[#e7f6ff] dark:hover:bg-[#2a3344] group transition" style={{ marginBottom: 1 }}>
                <img
                    src={avatarUrl}
                    alt="avatar"
                    className="w-9 h-9 rounded-full object-cover border"
                    style={{
                        border: "1.5px solid #4b89da",
                        background: "#202c44"
                    }}
                    onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                />
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-center gap-2 truncate">
                        <span className="break-words font-semibold text-base text-[#11263c] dark:text-white">{title}</span>
                        {isMyself && <span className="ml-1 px-2 py-0.5 rounded bg-[#54efaa] text-[#1d4746] text-xs font-semibold">
                            {t("common.you", "Вы")}
                        </span>}
                        {role === "owner" && (
                            <span className="ml-1 px-2 py-0.5 rounded bg-[#e3f7ff] text-[#26a8e3] text-xs font-semibold">{t("group.role.owner", "Владелец")}</span>
                        )}
                        {role === "admin" && role !== "owner" && (
                            <span className="ml-1 px-2 py-0.5 rounded bg-[#e8ecff] text-[#2367cb] text-xs font-semibold">{t("group.role.admin", "Админ")}</span>
                        )}
                    </div>
                    {subtitle && (
                        <span className="truncate text-xs text-[#6691a7] dark:text-[#a3bad7]">{subtitle}</span>
                    )}
                    <span className="text-xs text-gray-400 mt-0.5">
                        {role === "owner" ? t("group.role.owner", "Владелец") : (role === "admin" ? t("group.role.adminFull", "Администратор") : t("group.role.member", "Участник"))}
                    </span>
                </div>
                {canManageGroup && !isMyself && (
                    <div className="flex flex-wrap gap-1 opacity-70 group-hover:opacity-100 min-w-[120px]">
                        {isGroupOwner && role !== "admin" && (
                            <button
                                className="px-2 py-1 text-xs bg-[#46c6d9] text-white rounded hover:bg-[#1f87ab]"
                                onClick={() => handleSetRole(u.user_id, "admin")}
                                title={t("group.makeAdmin", "Сделать админом")}
                            >{t("group.makeAdmin", "Сделать админом")}</button>
                        )}
                        {isGroupOwner && role === "admin" && (
                            <button
                                className="px-2 py-1 text-xs bg-[#f48f4f] text-white rounded hover:bg-[#bb571e]"
                                onClick={() => handleSetRole(u.user_id, "member")}
                                title={t("group.removeAdmin", "Снять админа")}
                            >{t("group.removeAdminShort", "Снять")}</button>
                        )}
                        {(isGroupOwner || isGroupAdmin) && role !== "owner" && (
                            <button
                                className="px-2 py-1 text-xs bg-[#ea4a57] text-white rounded hover:bg-[#a9132d] transition"
                                onClick={() => {
                                    setPendingRemoveUserId(u.user_id);
                                    setShowRemoveModal(true);
                                }}
                                title={t("group.remove", "Удалить из группы")}
                            >
                                {t("common.delete", "Удалить")}
                            </button>
                        )}
                        {showRemoveModal && pendingRemoveUserId === u.user_id && (
                            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#1a2235cc]">
                                <div className="bg-white dark:bg-[#273142] rounded-2xl p-6 w-[95vw] max-w-xs shadow-2xl text-center">
                                    <div className="mb-4 font-bold text-lg text-[#e74c3c]">{t("group.remove.confirmTitle", "Удалить участника?")}</div>
                                    <div className="mb-5 text-gray-700 dark:text-[#b9c8d4] text-sm">
                                        {t("group.remove.confirmText", "Вы уверены, что хотите удалить участника из группы?")}
                                    </div>
                                    <div className="flex gap-3 justify-center">
                                        <button
                                            className="px-4 py-2 rounded-lg bg-[#d43c3c] hover:bg-[#b92a2a] text-white font-semibold transition"
                                            onClick={async () => {
                                                setShowRemoveModal(false);
                                                if (pendingRemoveUserId) {
                                                    await handleRemove(pendingRemoveUserId);
                                                }
                                                setPendingRemoveUserId(null);
                                            }}
                                        >
                                            {t("common.delete", "Удалить")}
                                        </button>
                                        <button
                                            className="
                                                px-4 py-2 rounded-lg
                                                bg-gray-200 hover:bg-gray-300
                                                dark:bg-[#313e52] dark:hover:bg-[#475575]
                                                text-[#222] dark:text-white
                                                font-semibold transition
                                            "
                                            onClick={() => {
                                                setShowRemoveModal(false);
                                                setPendingRemoveUserId(null);
                                            }}
                                        >
                                            {t("common.cancel", "Отмена")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#191c22cc]">
            <div className="bg-white dark:bg-[#222b37] rounded-2xl p-7 min-w-[430px] w-[99vw] max-w-[520px] shadow-xl relative">
                <button
                    className="absolute right-5 top-5 text-3xl text-[#444] dark:text-[#ddd] hover:text-[#53ee5c] transition"
                    onClick={onClose}
                >
                    ×
                </button>
                <div className="mb-4 font-bold text-lg text-[#222b37] dark:text-white flex items-center gap-2">
                    {t("group.title", "Участники группы")}
                    <span className="text-xs text-[#77b1ec]">
                        ({participants.length})
                    </span>
                </div>

                {/* ---- Поиск по участникам ---- */}
                <input
                    type="text"
                    className="w-full px-3 py-2 mb-2 border border-gray-200 dark:border-[#313e52] rounded-lg outline-none focus:border-[#4995d5] bg-gray-50 dark:bg-[#273142] text-[#16283c] dark:text-white transition"
                    placeholder={t("group.searchPlaceholder", "Поиск по участникам...")}
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value);
                        setShowAll(false);
                    }}
                />

                {/* ---- Список участников с прокруткой ---- */}
                {loading ? (
                    <div className="py-10 text-center text-gray-500">{t("common.loading", "Загрузка...")}</div>
                ) : (
                    <div
                        className="overflow-y-auto"
                        style={{ maxHeight: 370, minHeight: 60 }}
                    >
                        {limitedParticipants.length === 0 ? (
                            <div className="text-gray-500 text-sm py-4">{t("group.empty", "Не найдено участников")}</div>
                        ) : (
                            <>
                                {limitedParticipants.map(u => (
                                    <MemberRow u={u} key={u.user_id || u.id} />
                                ))}
                                {!showAll && !searchLower && filteredParticipants.length > 10 && (
                                    <div className="flex justify-center py-2">
                                        <button
                                            className="px-4 py-1 rounded bg-[#eff6ff] hover:bg-[#d8eaff] text-[#2773be] font-medium transition text-sm"
                                            onClick={() => setShowAll(true)}
                                        >
                                            {t("group.showAll", "Показать всех")}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div className="mt-6 flex flex-col gap-2">
                    <button
                        className="px-4 py-2 rounded-lg bg-[#d43c3c] hover:bg-[#b92a2a] text-white font-semibold transition"
                        onClick={() => setShowLeaveModal(true)}
                    >
                        {t("group.leave", "Выйти из группы")}
                    </button>
                    {showLeaveModal && (
                        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#1a2235cc]">
                            <div className="bg-white dark:bg-[#273142] rounded-2xl p-6 w-[95vw] max-w-xs shadow-2xl text-center">
                                <div className="mb-4 font-bold text-lg text-[#e74c3c]">
                                    {t("group.leave.confirmTitle", "Выйти из группы?")}
                                </div>
                                <div className="mb-5 text-gray-700 dark:text-[#b9c8d4] text-sm">
                                    {t("group.leave.confirmText", "Вы уверены, что хотите выйти из группы? Вы потеряете доступ к переписке и участникам.")}
                                </div>
                                <div className="flex gap-3 justify-center">
                                    <button
                                        className="px-4 py-2 rounded-lg bg-[#d43c3c] hover:bg-[#b92a2a] text-white font-semibold transition"
                                        onClick={async () => {
                                            setShowLeaveModal(false);
                                            await handleLeaveGroup();
                                        }}
                                    >
                                        {t("group.leaveShort", "Выйти")}
                                    </button>
                                    <button
                                        className="
                                            px-4 py-2 rounded-lg
                                            bg-gray-200 hover:bg-gray-300
                                            dark:bg-[#313e52] dark:hover:bg-[#475575]
                                            text-[#222] dark:text-white
                                            font-semibold transition
                                        "
                                        onClick={() => setShowLeaveModal(false)}
                                    >
                                        {t("common.cancel", "Отмена")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
