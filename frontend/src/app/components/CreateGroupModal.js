import { useState, useEffect } from "react";
import { useMessenger } from "./MessengerContext";
import { useUser } from "../UserContext";
import { getAvatarUrl } from "./getAvatarUrl";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";
import { useTheme } from "../providers/ThemeProvider";

export default function CreateGroupModal({ onClose }) {
    const { chatList, fetchChatList } = useMessenger();
    const { user, contacts, fetchContacts } = useUser();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";
    const [name, setName] = useState("");
    const [selected, setSelected] = useState([]);
    const [users, setUsers] = useState([]);
    const [showNameWarning, setShowNameWarning] = useState(false);
    const { t } = useLang();

    // 1) Подтягиваем мои чаты и контакты (если ещё не загружены)
    useEffect(() => {
        if (!chatList?.length) {
            // reset=true чтобы гарантированно получить свежий список
            fetchChatList?.({ force: true, reset: true });
        }
        // подтянуть список контактов
        fetchContacts?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 2) Строим список доступных участников: личные собеседники из чатов + контакты
    useEffect(() => {
        const fromChats = (chatList || [])
            .filter(c => !c.is_group && c?.peer?.id && c.peer.id !== user?.id)
            .map(c => c.peer);
        const fromContacts = (contacts || [])
            .filter(u => u?.id && u.id !== user?.id);
        // дедуп по id
        const map = new Map();
        for (const u of [...fromChats, ...fromContacts]) {
            if (!map.has(u.id)) map.set(u.id, u);
        }
        setUsers(Array.from(map.values()));
    }, [chatList, contacts, user?.id]);

    function toggleUser(id) {
        setSelected(sel => sel.includes(id) ? sel.filter(i => i !== id) : [...sel, id]);
    }

    async function handleCreate() {
        if (!name.trim()) {
            setShowNameWarning(true);
            return;
        }
        setShowNameWarning(false);
        if (selected.length < 1) return;
        const user_ids = selected; // выбранные участники (текущий пользователь добавится на сервере как владелец/участник)

        await fetch(api(`/group/create`), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({
                name,
                user_ids,
                avatar: "", // файл реализуешь потом, если надо
            }),
        });
        fetchChatList && fetchChatList();
        onClose();
    }

    const palette = {
        overlay: isLight
            ? "color-mix(in srgb, #0f172a 32%, transparent)"
            : "rgba(33, 47, 70, 0.85)",
        shellBg: isLight
            ? "linear-gradient(150deg, #ffffff 0%, #f2f6fd 100%)"
            : "linear-gradient(120deg, #212f46 70%, #203154 100%)",
        shellBorder: isLight ? "var(--border-subtle)" : "#223650",
        shellShadow: isLight ? "0 18px 48px rgba(15, 23, 42, 0.14)" : "0 22px 48px rgba(0,0,0,0.55)",
        headerBg: isLight
            ? "linear-gradient(150deg, #ffffff 0%, #e8edf7 100%)"
            : "linear-gradient(120deg, #222f44 60%, #25375e 100%)",
        heading: isLight ? "#0e8fd2" : "#35b6ff",
        inputBg: isLight ? "var(--control-bg)" : "#1e2840",
        inputBorder: isLight ? "var(--border-subtle)" : "#355481",
        inputText: isLight ? "var(--text-primary)" : "#e4f0ff",
        rowSelected: isLight ? "var(--surface-soft)" : "#232c42",
        rowBorder: isLight ? "var(--border-subtle)" : "transparent",
        avatarBorder: isLight ? "var(--border-subtle)" : "#4b89da",
        avatarBg: isLight ? "var(--avatar-contrast-bg)" : "#202c44",
        subtitle: isLight ? "var(--text-secondary)" : "#7c8ca7",
        footerBg: isLight ? "var(--bg-card-soft)" : "#23385a",
        footerBorder: isLight ? "var(--border-subtle)" : "#264068",
        cta: "#35b6ff",
        ctaHover: isLight ? "#0f9ad6" : "#2092d8",
        cancel: isLight ? "var(--text-secondary)" : "#b9c5d8",
    };

    return (
        <div
            className="fixed inset-0 z-[11000] flex items-center justify-center backdrop-blur-[2px] px-3"
            style={{ background: palette.overlay }}
        >
            <div
                className="w-full max-w-lg rounded-2xl"
                style={{
                    background: palette.shellBg,
                    padding: 0,
                    border: `1.5px solid ${palette.shellBorder}`,
                    boxShadow: palette.shellShadow,
                    color: "var(--text-primary)",
                }}
            >
                <div
                    style={{
                        padding: "34px 34px 24px 34px",
                        borderRadius: "22px 22px 0 0",
                        background: palette.headerBg,
                    }}
                >
                    <h2
                        className="text-xl font-bold mb-3 tracking-tight"
                        style={{ color: palette.heading }}
                    >
                        {t("group.create.title", "Создать группу")}
                    </h2>
                    <div className="mb-4">
                        <input
                            className="w-full border p-2 rounded"
                            style={{
                                background: palette.inputBg,
                                border: `1px solid ${palette.inputBorder}`,
                                color: palette.inputText,
                                fontSize: 17,
                            }}
                            value={name}
                            onChange={e => {
                                setName(e.target.value);
                                if (showNameWarning && e.target.value.trim()) setShowNameWarning(false);
                            }}
                            placeholder={t("group.name.placeholder", "Название группы")}
                        />
                        {showNameWarning && (
                            <div style={{ color: "#ffae2a", fontSize: 13, marginTop: 4, paddingLeft: 2, letterSpacing: 0.2, opacity: 0.85 }}>
                                {t("group.name.required", "Введите название группы")}
                            </div>
                        )}
                    </div>
                    <div className="max-h-56 overflow-y-auto mb-4 space-y-1">
                        {users.map(u => {
                            // логика красивого title/subtitle (можно вынести отдельно)
                            let title = "", subtitle = "";
                            if (u.organization && (u.contact_person || u.full_name || u.name)) {
                                title = u.organization;
                                subtitle = u.contact_person || u.full_name || u.name;
                            } else if (u.organization) {
                                title = u.organization;
                            } else if (u.contact_person || u.full_name || u.name) {
                                title = u.contact_person || u.full_name || u.name;
                            } else if (u.email) {
                                title = u.email;
                            } else if (u.id) {
                                title = "ID: " + u.id;
                            } else {
                                title = t("common.user", "Пользователь");
                            }
                            const avatarUrl = getAvatarUrl(u);
                            const isSelected = selected.includes(u.id);
                            return (
                                <label
                                    key={u.id}
                                    className={`flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer font-medium transition ${!isSelected ? "hover:bg-[var(--control-bg-hover)]" : ""}`}
                                    style={{
                                        userSelect: "none",
                                        background: isSelected ? palette.rowSelected : undefined,
                                        border: `1px solid ${palette.rowBorder}`,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleUser(u.id)}
                                        className="mr-1 accent-[#35b6ff]"
                                        style={{ width: 17, height: 17 }}
                                    />
                                    <img
                                        src={avatarUrl}
                                        alt="avatar"
                                        className="w-9 h-9 rounded-full object-cover border"
                                        style={{
                                            border: `1.5px solid ${palette.avatarBorder}`,
                                            background: palette.avatarBg,
                                        }}
                                        onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                                    />
                                    <div className="flex-1 min-w-0 flex flex-col">
                                        <span className="truncate font-semibold text-base" style={{ color: "var(--text-primary)" }}>{title}</span>
                                        {subtitle && <span className="truncate text-xs" style={{ color: palette.subtitle }}>{subtitle}</span>}
                                    </div>
                                </label>
                            )
                        })}
                    </div>
                </div>
                <div
                    className="flex gap-2 px-8 py-4 rounded-b-2xl justify-end"
                    style={{ borderTop: `1px solid ${palette.footerBorder}`, background: palette.footerBg }}
                >
                    <button
                        className="text-white px-5 py-2 rounded font-semibold transition"
                        onClick={handleCreate}
                        disabled={selected.length === 0}
                        style={{
                            background: palette.cta,
                            boxShadow: "0 2px 12px #3bc7ff24",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = palette.ctaHover}
                        onMouseLeave={e => e.currentTarget.style.background = palette.cta}
                    >
                        {t("common.create", "Создать")}
                    </button>
                    <button
                        className="font-semibold px-4 transition"
                        style={{ color: palette.cancel }}
                        onClick={onClose}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
                        onMouseLeave={e => e.currentTarget.style.color = palette.cancel}
                    >
                        {t("common.cancel", "Отмена")}
                    </button>
                </div>
            </div>
        </div>
    );
}
