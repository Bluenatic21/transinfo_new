// app/components/MiniUserCard.js
import Link from "next/link";
import {
    FaCheckCircle, FaWhatsapp, FaTelegramPlane, FaViber, FaEnvelope, FaPhoneAlt
} from "react-icons/fa";
import RatingStars from "./RatingStars";
import { FaComments } from "react-icons/fa";
import { useMessenger } from "@/app/components/MessengerContext";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";
import { useTheme } from "../providers/ThemeProvider";

export default function MiniUserCard({ user, attachment = null }) {
    if (!user) return null;

    const {
        id,
        first_name,
        last_name,
        company,
        avatar_url,
        role,
        is_verified,
        rating,
        email,
        phone,
        telegram_username,
        telegram
    } = user;
    const { t } = useLang();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";
    const palette = {
        cardBg: isLight ? "var(--bg-card)" : "rgba(25, 34, 58, 0.95)",
        cardShadow: isLight ? "0 10px 24px rgba(15,23,42,0.07)" : "0 2px 16px #1e22361b",
        cardBorder: isLight ? "1px solid var(--border-subtle)" : "none",
        textPrimary: isLight ? "var(--text-primary)" : "#e3f2fd",
        textSecondary: isLight ? "var(--text-secondary)" : "#b6eaff",
        role: isLight ? "#1d4ed8" : "#7af4fd",
        avatarBg: isLight ? "var(--avatar-contrast-bg)" : "#182337",
        avatarBorder: isLight ? "1.4px solid var(--border-subtle)" : "1.6px solid #223350",
        messengerBg: isLight ? "var(--control-bg)" : "#192b4b",
        messengerText: isLight ? "#1d4ed8" : "#b2dbfb",
        contactBg: isLight ? "var(--bg-card-soft)" : "#233655",
        contactText: isLight ? "var(--text-primary)" : "#b7e7ff",
        phoneText: isLight ? "#0f172a" : "#b7e7ff",
    };
    // Итоговый рейтинг с дефолтом 10
    const ratingValue = (typeof rating === "number")
        ? rating
        : (typeof user?.final_rating === "number" ? user.final_rating : 10);

    // Универсально достаем аватар
    const avatarPath = user.avatar_url || user.avatar || null;
    const avatarSrc = avatarPath ? abs(avatarPath) : "/default-avatar.png";

    function getDisplayName() {
        // company/organization > name/first+last > contact_person > fallback
        return (
            user.company ||
            user.organization ||
            user.name ||
            ((user.first_name || "") + " " + (user.last_name || "")).trim() ||
            user.contact_person ||
            t("user.noName", "Имя не указано")
        );
    }
    function getInitials() {
        if (user.company) return user.company[0].toUpperCase();
        if (user.organization) return user.organization[0].toUpperCase();
        if (user.name) return user.name[0].toUpperCase();
        if (user.first_name) return user.first_name[0].toUpperCase();
        if (user.contact_person) return user.contact_person[0].toUpperCase();
        return "U";
    }

    // Перевод роли на русский
    function getRoleRu(r) {
        const key = (typeof r === "string" ? r : (r?.value || r?.name || ""))
            .toString()
            .toUpperCase();
        const map = {
            OWNER: t("role.owner", "Грузовладелец"),
            TRANSPORT: t("role.transport", "Перевозчик"),
            MANAGER: t("role.manager", "Экспедитор"),
            EMPLOYEE: t("role.employee", "Экспедитор"),
        };
        return map[key] || "";
    }


    // Мессенджеры
    const whatsappUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;
    const viberUrl = phone ? `viber://chat?number=${phone.replace(/\D/g, "")}` : null;
    // Telegram: берём из telegram_username ИЛИ telegram, убираем ведущий "@"
    const tg = (telegram_username || telegram || "").toString().trim();
    const telegramUrl = tg ? `https://t.me/${tg.replace(/^@/, "")}` : null;

    const { openMessenger } = useMessenger ? useMessenger() : { openMessenger: null };
    async function handleChatClick() {
        if (!user?.id) return;
        const token = localStorage.getItem("token");
        if (!token) {
            alert(t("common.loginRequired", "Необходимо войти в систему"));
            return;
        }
        const resp = await fetch(api(`/chat/by_user/${user.id}`), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
        });
        if (resp.status === 401) {
            alert(t("common.sessionExpired", "Сессия истекла, войдите снова"));
            return;
        }
        const data = await resp.json();
        if (openMessenger) {
            if (data?.chat_id) {
                openMessenger(data.chat_id, attachment ? { ...attachment } : { user });
            } else {
                openMessenger({ userId: user.id, user });
            }
        }
    }

    return (
        <div
            style={{
                background: palette.cardBg,
                borderRadius: 13,
                width: "auto",
                maxWidth: "100%",
                padding: "8px 14px",
                boxShadow: palette.cardShadow,
                border: palette.cardBorder,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginBottom: 2,
                alignItems: "flex-start"
            }}
        >
            {/* Верхняя строка: аватар, имя, роль, рейтинг */}
            <div style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 3
            }}>
                <Link href={`/profile/${id}`}>
                    <img
                        src={avatarSrc}
                        alt="avatar"
                        width={38}
                        height={38}
                        style={{
                            borderRadius: 10,
                            objectFit: "cover",
                            border: palette.avatarBorder,
                            background: palette.avatarBg,
                            display: "block"
                        }}
                        onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                    />
                </Link>
                <div>
                    <div style={{
                        display: "flex", alignItems: "center", gap: 8, fontWeight: 700,
                        fontSize: 16, color: palette.textPrimary, marginBottom: 0
                    }}>
                        <span>
                            <Link href={`/profile/${id}`} style={{ color: palette.textPrimary, textDecoration: "none" }}>
                                {getDisplayName()}
                            </Link>
                        </span>
                        {is_verified && (
                            <FaCheckCircle title={t("user.verified", "Верифицирован")} style={{ color: "#52e45a", fontSize: 16, marginLeft: 2 }} />
                        )}
                        <span style={{
                            fontWeight: 600,
                            fontSize: 12,
                            color: palette.role,
                            marginLeft: 7
                        }}>{getRoleRu(role)}</span>
                    </div>
                    {email && (
                        <div
                            style={{
                                fontSize: 13,
                                color: palette.textSecondary,
                                marginTop: 1,
                            }}
                        >
                            <a
                                href={`mailto:${email}`}
                                style={{
                                    color: palette.textSecondary,
                                    textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                            }}
                        >
                            <FaEnvelope />
                            {email}
                        </a>
                    </div>
                    )}
                    {/* ЗВЁЗДЫ СТАВИМ СТРОГО ПОД EMAIL */}
                    <div style={{ marginTop: 4 }}>
                        <RatingStars value={ratingValue} size={15} showNumber />
                    </div>
                </div>
            </div>
            {/* Мессенджеры и телефон — всё в одну строку */}
            <div style={{
                display: "flex", alignItems: "center", gap: 10, marginTop: 3,
                width: "100%", justifyContent: "flex-start"
            }}>
                <button
                    onClick={handleChatClick}
                    title={t("chat.open", "Чат")}
                    style={{
                        ...messengerIconStyle(palette),
                        color: "#43c8ff",
                        border: "none",
                        cursor: "pointer"
                    }}
                >
                    <FaComments />
                </button>
                {whatsappUrl &&
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                        style={{ ...messengerIconStyle(palette), color: "#43eb6a" }}>
                        <FaWhatsapp />
                    </a>
                }
                {viberUrl &&
                    <a href={viberUrl} target="_blank" rel="noopener noreferrer" title="Viber"
                        style={{ ...messengerIconStyle(palette), color: "#7954a1" }}>
                        <FaViber />
                    </a>
                }
                {telegramUrl &&
                    <a href={telegramUrl} target="_blank" rel="noopener noreferrer" title="Telegram"
                        style={{ ...messengerIconStyle(palette), color: "#37b8fe" }}>
                        <FaTelegramPlane />
                    </a>
                }
                {phone &&
                    <a href={`tel:${phone}`} style={{
                        ...contactIconStyle(palette),
                        fontWeight: 700,
                        marginLeft: 4,
                        fontSize: 15,
                        color: palette.phoneText
                    }}>
                        <FaPhoneAlt style={{ marginRight: 5 }} />
                        {phone}
                    </a>
                }
            </div>
        </div >
    );
}

const contactIconStyle = (palette) => ({
    background: palette.contactBg,
    color: palette.contactText,
    borderRadius: 8,
    padding: "3px 9px 3px 7px",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    transition: "background 0.14s, color 0.14s"
});

const messengerIconStyle = (palette) => ({
    background: palette.messengerBg,
    color: palette.messengerText,
    borderRadius: 7,
    padding: "5px 7px",
    fontSize: 17,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    transition: "background 0.16s, color 0.16s"
});
