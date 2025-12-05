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
                background: "rgba(25, 34, 58, 0.95)",
                borderRadius: 13,
                width: "auto",
                maxWidth: "100%",
                padding: "10px 18px",
                boxShadow: "0 2px 16px #1e22361b",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                marginBottom: 2,
                alignItems: "flex-start"
            }}
        >
            {/* Верхняя строка: аватар, имя, роль, рейтинг */}
            <div style={{
                display: "flex", alignItems: "center", gap: 13, marginBottom: 3
            }}>
                <Link href={`/profile/${id}`}>
                    <img
                        src={avatarSrc}
                        alt="avatar"
                        width={42}
                        height={42}
                        style={{
                            borderRadius: 10,
                            objectFit: "cover",
                            border: "1.6px solid #223350",
                            background: "#182337",
                            display: "block"
                        }}
                        onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                    />
                </Link>
                <div>
                    <div style={{
                        display: "flex", alignItems: "center", gap: 8, fontWeight: 700,
                        fontSize: 17, color: "#e3f2fd", marginBottom: 0
                    }}>
                        <span>
                            <Link href={`/profile/${id}`} style={{ color: "#e3f2fd", textDecoration: "none" }}>
                                {getDisplayName()}
                            </Link>
                        </span>
                        {is_verified && (
                            <FaCheckCircle title={t("user.verified", "Верифицирован")} style={{ color: "#52e45a", fontSize: 16, marginLeft: 2 }} />
                        )}
                        <span style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: "#7af4fd",
                            marginLeft: 7
                        }}>{getRoleRu(role)}</span>
                    </div>
                    {email &&
                        <div style={{
                            fontSize: 14,
                            color: "#b6eaff",
                            marginTop: 1
                        }}>
                            <a href={`mailto:${email}`} style={{ color: "#b6eaff", textDecoration: "none" }}>
                                <FaEnvelope style={{ marginRight: 5 }} />
                                {email}
                            </a>
                        </div>
                    }
                    {/* ЗВЁЗДЫ СТАВИМ СТРОГО ПОД EMAIL */}
                    <div style={{ marginTop: 6 }}>
                        <RatingStars value={ratingValue} size={16} showNumber />
                    </div>
                </div>
            </div>
            {/* Мессенджеры и телефон — всё в одну строку */}
            <div style={{
                display: "flex", alignItems: "center", gap: 12, marginTop: 4,
                width: "100%", justifyContent: "flex-start"
            }}>
                <button
                    onClick={handleChatClick}
                    title={t("chat.open", "Чат")}
                    style={{
                        ...messengerIconStyle,
                        color: "#43c8ff",
                        border: "none",
                        cursor: "pointer"
                    }}
                >
                    <FaComments />
                </button>
                {whatsappUrl &&
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                        style={{ ...messengerIconStyle, color: "#43eb6a" }}>
                        <FaWhatsapp />
                    </a>
                }
                {viberUrl &&
                    <a href={viberUrl} target="_blank" rel="noopener noreferrer" title="Viber"
                        style={{ ...messengerIconStyle, color: "#7954a1" }}>
                        <FaViber />
                    </a>
                }
                {telegramUrl &&
                    <a href={telegramUrl} target="_blank" rel="noopener noreferrer" title="Telegram"
                        style={{ ...messengerIconStyle, color: "#37b8fe" }}>
                        <FaTelegramPlane />
                    </a>
                }
                {phone &&
                    <a href={`tel:${phone}`} style={{
                        ...contactIconStyle,
                        fontWeight: 700,
                        marginLeft: 5,
                        fontSize: 16
                    }}>
                        <FaPhoneAlt style={{ marginRight: 5 }} />
                        {phone}
                    </a>
                }
            </div>
        </div >
    );
}

const contactIconStyle = {
    background: "#233655",
    color: "#b7e7ff",
    borderRadius: 8,
    padding: "4px 10px 4px 8px",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    transition: "background 0.14s"
};

const messengerIconStyle = {
    background: "#192b4b",
    color: "#b2dbfb",
    borderRadius: 7,
    padding: "6px 8px",
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    transition: "background 0.16s, color 0.16s"
};
