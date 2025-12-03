"use client";
import { Users2 } from "lucide-react";
import { abs } from "@/config/env";
import { useLang } from "../i18n/LangProvider";
/**
 * Универсальный аватар пользователя или группы.
 * @param {object} user - объект пользователя или группы
 * @param {number} size - размер аватара (px)
 * @param {boolean} isGroup - если это группа (переопределяет логику)
 * @returns JSX
 */
export default function UserAvatar({ user, size = 36, isGroup = false, style = {}, className = "" }) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    let avatarUrl = null;
    // Явно передали, что это группа (например, в MessengerSidebar)
    if (isGroup) {
        avatarUrl = user?.group_avatar || null;
    } else {
        avatarUrl = user?.avatar || null;
    }
    // Преобразуем относительный путь в абсолютный домен API
    if (avatarUrl) {
        avatarUrl = abs(avatarUrl);
    }

    // Фоллбэк иконка (для групп)
    if ((isGroup && !avatarUrl) || (user?.is_group && !user?.group_avatar)) {
        return (
            <span
                className={className}
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: "#25375b",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid #38bcf8",
                    ...style,
                }}
                title={user?.group_name || t("common.group", "Группа")}
            >
                <Users2 size={size * 0.62} color="#8ecae6" />
            </span>
        );
    }

    // Обычный пользователь — fallback если нет аватара
    if (!avatarUrl) {
        return (
            <img
                src="/avatar.png"
                alt="avatar"
                className={className}
                width={size}
                height={size}
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    objectFit: "cover",
                    background: "#1c2842",
                    border: "1.5px solid #dde8f7",
                    ...style,
                }}
                onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = "/avatar.png"; }}
                title={user?.organization || user?.contact_person || user?.full_name || user?.name || user?.email || t("common.user", "Пользователь")}
            />
        );
    }

    // Картинка (аватар или group_avatar)
    return (
        <img
            src={avatarUrl}
            alt="avatar"
            className={className}
            width={size}
            height={size}
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                objectFit: "cover",
                background: "#1c2842",
                border: isGroup ? "2px solid #38bcf8" : "1.5px solid #dde8f7",
                ...style,
            }}
            onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = "/avatar.png"; }}
            title={user?.organization || user?.contact_person || user?.full_name || user?.name || user?.email || t("common.user", "Пользователь")}
        />
    );
}
