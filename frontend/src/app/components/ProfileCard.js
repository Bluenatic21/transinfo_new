"use client";

import { useState, useEffect } from "react";
import { FaUserShield, FaTruck, FaUser, FaUserCog, FaRegEdit, FaStar, FaRegStar, FaLock } from "react-icons/fa";
import EditProfileForm from "./EditProfileForm";
import {
    FaComments,
    FaWhatsapp,
    FaTelegramPlane,
    FaViber,
    FaEnvelope,
    FaPhoneAlt,
    FaMapMarkerAlt,
} from "react-icons/fa";
import BlockUserButton from "./BlockUserButton";
import AddContactButton from "./AddContactButton";
import { useIsMobile } from "../../hooks/useIsMobile"; // единый breakpoint 768px
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";
import { abs } from "@/config/env";

/* -------------------- helpers -------------------- */
function getMessengerLinks(user) {
    const phone = (user?.phone || "").replace(/\D/g, "");
    const telegram_username = user?.telegram_username || user?.telegram || "";
    return {
        whatsapp: phone ? `https://wa.me/${phone}` : null,
        viber: phone ? `viber://chat?number=${phone}` : null,
        telegram: telegram_username ? `https://t.me/${String(telegram_username).replace(/^@/, "")}` : null,
        phone: phone ? `tel:+${phone}` : null,
        email: user?.email ? `mailto:${user.email}` : null,
    };
}

const TenStars = ({ value = 0, t, theme = "dark" }) => {
    const v = Math.max(0, Math.min(10, Number(value) || 0));
    const full = Math.floor(v);
    const frac = v - full;
    // 0 -> красный, 10 -> зелёный; между ними — плавный градиент по тону
    const hue = (v / 10) * 120; // 0..120
    const lightness = theme === "light" ? 38 : 45;
    const color = `hsl(${hue}, 90%, ${lightness}%)`;
    const emptyColor = theme === "light" ? "#d3dbe6" : "#273040";

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {Array.from({ length: 10 }).map((_, i) => {
                const index = i + 1;
                if (index <= full) {
                    return <FaStar key={i} color={color} size={18} />;
                }
                if (index === full + 1 && frac > 0) {
                    return (
                        <span
                            key={i}
                            style={{ position: "relative", width: 18, height: 18, display: "inline-block" }}
                        >
                            <FaRegStar size={18} color={emptyColor} style={{ position: "absolute", inset: 0 }} />
                            <span
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    width: `${Math.round(frac * 100)}%`,
                                    overflow: "hidden",
                                    display: "inline-block",
                                }}
                            >
                                <FaStar size={18} color={color} />
                            </span>
                        </span>
                    );
                }
                return <FaRegStar key={i} size={18} color={emptyColor} />;
            })}
            <span style={{ color, fontWeight: 700, marginLeft: 8 }}>{v.toFixed(1)} {t?.("reviews.max10", "/ 10")}</span>
        </div>
    );
};

function getDisplayName(user, t) {
    return (
        user?.company ||
        user?.organization ||
        user?.name ||
        (`${user?.first_name || ""} ${user?.last_name || ""}`.trim() || user?.contact_person) ||
        t("user.noName", "Имя не указано")
    );
}

/* small UI */
const palette = {
    card: "var(--bg-card)",
    cardSoft: "var(--bg-card-soft)",
    text: "var(--text-primary)",
    muted: "var(--text-secondary)",
    border: "var(--border-subtle)",
    control: "var(--control-bg)",
    controlHover: "var(--control-bg-hover)",
    shadow: "var(--shadow-soft)",
};

const cardContainerStyle = {
    background: palette.card,
    borderRadius: 18,
    boxShadow: palette.shadow,
    border: `1px solid ${palette.border}`,
};

const Box = ({ children, style }) => (
    <div
        style={{
            background: palette.cardSoft,
            borderRadius: 14,
            padding: 12,
            boxShadow: palette.shadow,
            color: palette.text,
            ...style,
        }}
    >
        {children}
    </div>
);

const InfoRow = ({ icon, children }) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 28,
            lineHeight: "22px",
            color: palette.text,
            overflow: "hidden",
        }}
    >
        <span style={{ opacity: 0.9, flex: "0 0 auto" }}>{icon}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </div>
);

/* -------------------- component -------------------- */
export default function ProfileCard({ user: initialUser, readOnly, onUserUpdate, showMobileLogout = true, onChangePasswordClick, onEdit }) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const [editMode, setEditMode] = useState(false);
    const handleOpenChangePassword = onChangePasswordClick || (() => { });
    const [user, setUser] = useState(initialUser);
    const isMobile = useIsMobile(768); // <- вместо локального matchMedia на 480px

    const handleLogout = () => {
        try {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("role");
        } finally {
            window.location.href = "/";
        }
    };

    useEffect(() => setUser(initialUser), [initialUser]);

    const roleValue = (user?.role || "").toUpperCase();
    const roleIcons = {
        ADMIN: <FaUserShield style={{ color: "#2acaff" }} title={t("role.admin", "Админ")} />,
        TRANSPORT: <FaTruck style={{ color: "#ffd600" }} title={t("role.transport", "Перевозчик")} />,
        OWNER: <FaUser style={{ color: "#4ecdc4" }} title={t("role.owner", "Грузовладелец")} />,
        MANAGER: <FaUserCog style={{ color: "#c6dafc" }} title={t("role.manager", "Экспедитор")} />,
        EMPLOYEE: <FaUserCog style={{ color: "#c6dafc" }} title={t("role.employee", "Экспедитор")} />,
    };
    const roleLabels = {
        ADMIN: t("role.admin", "Админ"),
        TRANSPORT: t("role.transport", "Перевозчик"),
        OWNER: t("role.owner", "Грузовладелец"),
        MANAGER: t("role.manager", "Экспедитор"),
        EMPLOYEE: t("role.employee", "Экспедитор"),
    };

    const avatarUrl = user?.avatar ? abs(user.avatar) : "/default-avatar.png";

    const handleProfileSave = (updatedUser) => {
        setUser(updatedUser);
        setEditMode(false);
        onUserUpdate?.(updatedUser);
    };

    if (editMode) {
        return (
            <div
                className="profile-block"
                style={{
                    ...cardContainerStyle,
                    padding: isMobile ? "18px 14px" : "28px 32px",
                    width: "100%",
                    maxWidth: "100%",
                }}
            >
                <EditProfileForm user={user} onClose={() => setEditMode(false)} onSave={handleProfileSave} />
            </div>
        );
    }

    const title = getDisplayName(user, t);
    const place = [user?.city, user?.country].filter(Boolean).join(", ") || user?.location || "";
    const ratingValue = Number(user?.final_rating) || 0;
    const isLight = resolvedTheme === "light";

    const themeColors = {
        cardBg: isLight ? "var(--bg-card)" : "#172135",
        cardShadow: isLight ? "0 8px 24px rgba(15,23,42,0.08)" : "0 2px 8px rgba(60,130,255,0.08)",
        cardBorder: isLight ? `1px solid var(--border-subtle)` : "none",
        title: isLight ? "#0f172a" : "#e4f1ff",
        roleBg: isLight ? "#edf2ff" : "#0f2449",
        roleBorder: isLight ? "1px solid #d4ddf6" : "1px solid #254985",
        roleText: isLight ? "#1d4ed8" : "#a7ccff",
        avatarBg: isLight ? "var(--bg-card-soft)" : "#21304d",
        avatarRing: isLight ? "0 0 0 3px #e2e8f0 inset" : "0 0 0 3px #243a62 inset",
        controlBg: isLight ? "var(--control-bg)" : "#11284e",
        controlBorder: isLight ? `1px solid var(--border-subtle)` : "1px solid #27539a",
        controlText: isLight ? "#1d4ed8" : "#acd2ff",
        logoutBg: isLight ? "#d92d20" : "#c62828",
        logoutShadow: isLight ? "0 4px 14px rgba(217,45,32,0.25)" : "0 2px 8px rgba(198,40,40,0.35)",
    };

    const messengerColors = {
        chat: isLight ? "#1d4ed8" : "#43c8ff",
        whatsapp: isLight ? "#1e8c46" : "#74e07e",
        viber: isLight ? "#5b2f94" : "#7954a1",
        telegram: isLight ? "#1a9cf3" : "#5abdf0",
        email: isLight ? "#2b4f8c" : "#d2e4ff",
    };

    const handleEditClick = () => {
        if (onEdit) {
            onEdit();
        } else {
            setEditMode(true);
        }
    };

    return (
        <div
            className="profile-block"
            style={{
                background: themeColors.cardBg,
                borderRadius: 18,
                boxShadow: themeColors.cardShadow,
                border: themeColors.cardBorder,
                padding: isMobile ? "14px 12px" : "18px 20px",
                width: "100%",
            }}
        >
            {/* grid: avatar | content */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "160px 1fr",
                    gap: isMobile ? 10 : 18,
                    alignItems: "start",
                }}
            >
                {/* left: avatar */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div
                        style={{
                            width: isMobile ? 88 : 108,
                            height: isMobile ? 88 : 108,
                            borderRadius: "50%",
                            background: themeColors.avatarBg,
                            boxShadow: themeColors.avatarRing,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                        }}
                    >
                        <img
                            src={avatarUrl}
                            alt={title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => { e.currentTarget.src = "/default-avatar.png"; }}
                        />
                    </div>
                </div>

                {/* right: header + details */}
                <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 14, minWidth: 0 }}>
                    {/* header */}
                    {!isMobile ? (
                        // desktop: name + rating on the right
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 14, alignItems: "center" }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                                    <span
                                        title={roleLabels[roleValue] || user?.role}
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 8,
                                            background: themeColors.roleBg,
                                            border: themeColors.roleBorder,
                                            color: themeColors.roleText,
                                            borderRadius: 999,
                                            padding: "4px 9px",
                                            fontSize: 12,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {roleIcons[roleValue] || null}
                                        {roleLabels[roleValue] || user?.role || t("common.dash", "—")}
                                    </span>
                                    <h2
                                        title={title}
                                        style={{
                                            margin: 0,
                                            fontSize: 20,
                                            fontWeight: 800,
                                            color: themeColors.title,
                                            letterSpacing: ".01em",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {title}
                                    </h2>
                                    {!readOnly && (
                                        <>
                                            <button
                                                onClick={handleEditClick}
                                                title={t("profile.edit", "Редактировать профиль")}
                                                style={{
                                                    marginLeft: 6,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 8,
                                                    background: themeColors.controlBg,
                                                    border: themeColors.controlBorder,
                                                    color: themeColors.controlText,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <FaRegEdit size={16} />
                                            </button>
                                            <button
                                                onClick={handleOpenChangePassword}
                                                title={t("profile.changePassword", "Сменить пароль")}
                                                style={{
                                                    marginLeft: 6,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 8,
                                                    background: themeColors.controlBg,
                                                    border: themeColors.controlBorder,
                                                    color: themeColors.controlText,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <FaLock size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                                {place && <InfoRow icon={<FaMapMarkerAlt />}>{place}</InfoRow>}
                            </div>

                            <Box style={{ alignSelf: "start" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: palette.text }}>
                                    <FaStar />
                                    <span style={{ fontWeight: 700 }}>{t("profile.rating", "Рейтинг")}</span>
                                </div>
                                <TenStars value={ratingValue} t={t} theme={resolvedTheme} />
                            </Box>
                        </div>
                    ) : (
                        // mobile: name, role chip, place; rating goes as block below
                        <>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                    <span
                                        title={roleLabels[roleValue] || user?.role}
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 8,
                                            background: themeColors.roleBg,
                                            border: themeColors.roleBorder,
                                            color: themeColors.roleText,
                                            borderRadius: 999,
                                            padding: "4px 10px",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            flex: "0 0 auto",
                                        }}
                                    >
                                        {roleIcons[roleValue] || null}
                                        {roleLabels[roleValue] || user?.role || t("common.dash", "—")}
                                    </span>
                                    <h2
                                        title={title}
                                        style={{
                                            margin: 0,
                                            fontSize: 18,
                                            lineHeight: "24px",
                                            fontWeight: 900,
                                            color: palette.text,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {title}
                                    </h2>
                                    {!readOnly && (
                                        <>
                                            <button
                                                onClick={handleEditClick}
                                                title={t("profile.edit", "Редактировать профиль")}
                                                style={{
                                                    marginLeft: 6,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    width: 30,
                                                    height: 30,
                                                    borderRadius: 8,
                                                    background: themeColors.controlBg,
                                                    border: themeColors.controlBorder,
                                                    color: themeColors.controlText,
                                                }}
                                            >
                                                <FaRegEdit size={16} />
                                            </button>
                                            <button
                                                onClick={handleOpenChangePassword}
                                                title={t("profile.changePassword", "Сменить пароль")}
                                                style={{
                                                    marginLeft: 6,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    width: 30,
                                                    height: 30,
                                                    borderRadius: 8,
                                                    background: themeColors.controlBg,
                                                    border: themeColors.controlBorder,
                                                    color: themeColors.controlText,
                                                }}
                                            >
                                                <FaLock size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                                {place && <InfoRow icon={<FaMapMarkerAlt />}>{place}</InfoRow>}
                            </div>

                            <Box>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: palette.text }}>
                                    <FaStar />
                                    <span style={{ fontWeight: 700 }}>{t("profile.rating", "Рейтинг")}</span>
                                </div>
                                <TenStars value={ratingValue} t={t} theme={resolvedTheme} />
                            </Box>
                        </>
                    )}

                    {/* contacts + messengers (на мобайле одной колонкой) */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: isMobile ? 12 : 16,
                        }}
                    >
                        <Box>
                            <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700, marginBottom: 8 }}>{t("profile.contacts", "Контакты")}</div>
                            {user?.email && <InfoRow icon={<FaEnvelope />}>{user.email}</InfoRow>}
                            {user?.phone && <InfoRow icon={<FaPhoneAlt />}>{user.phone}</InfoRow>}
                            {user?.phone2 && <InfoRow icon={<FaPhoneAlt />}>{user.phone2}</InfoRow>}
                        </Box>

                        <Box>
                            <div style={{ fontSize: 12, color: palette.muted, fontWeight: 700, marginBottom: 8 }}>{t("profile.messengers", "Мессенджеры")}</div>
                            {user?.whatsapp && <InfoRow icon={<FaWhatsapp />}>{user.whatsapp}</InfoRow>}
                            {user?.viber && <InfoRow icon={<FaViber />}>{user.viber}</InfoRow>}
                            {user?.telegram && <InfoRow icon={<FaTelegramPlane />}>{user.telegram}</InfoRow>}
                            {user?.contact_person && <InfoRow icon={<FaUserCog />}>{user.contact_person}</InfoRow>}
                        </Box>
                    </div>

                    {/* --- Мобильный выход под личным профилем --- */}
                    {!readOnly && isMobile && showMobileLogout && (
                        <div style={{ marginTop: 8 }}>
                            <button
                                type="button"
                                onClick={handleLogout}
                                style={{
                                    width: "100%",
                                    height: 48,
                                    borderRadius: 14,
                                    border: "none",
                                    background: themeColors.logoutBg,
                                    color: "#fff",
                                    fontWeight: 800,
                                    boxShadow: themeColors.logoutShadow,
                                    cursor: "pointer",
                                }}
                            >
                                {t("profile.logout", "Выйти из аккаунта")}
                            </button>
                        </div>
                    )}

                    {/* действия показываем ТОЛЬКО на чужом профиле */}
                    {readOnly && (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                            <AddContactButton targetId={user.id} />
                            <BlockUserButton targetId={user.id} />
                            <button
                                onClick={() => {
                                    if (typeof window !== "undefined") {
                                        window.dispatchEvent(new CustomEvent("profileCardChatClick", { detail: { userId: user.id } }));
                                    }
                                }}
                                title={t("chat.open", "Чат")}
                                style={{
                                    background: palette.control,
                                    color: messengerColors.chat,
                                    borderRadius: 7,
                                    border: `1px solid ${palette.border}`,
                                    padding: "8px 10px",
                                    fontSize: 20,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                }}
                            >
                                <FaComments />
                            </button>
                            {(() => {
                                const links = getMessengerLinks(user);
                                const pad = isMobile ? "8px 10px" : "8px 12px";
                                return (
                                    <>
                                        {links.whatsapp && (
                                            <a
                                                href={links.whatsapp}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={t("messenger.whatsapp", "WhatsApp")}
                                                style={{
                                                    background: palette.control,
                                                    color: messengerColors.whatsapp,
                                                    borderRadius: 7,
                                                    border: `1px solid ${palette.border}`,
                                                    padding: pad,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    fontSize: 20,
                                                }}
                                            >
                                                <FaWhatsapp />
                                            </a>
                                        )}
                                        {links.viber && (
                                            <a
                                                href={links.viber}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={t("messenger.viber", "Viber")}
                                                style={{
                                                    background: palette.control,
                                                    color: messengerColors.viber,
                                                    borderRadius: 7,
                                                    border: `1px solid ${palette.border}`,
                                                    padding: pad,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    fontSize: 20,
                                                }}
                                            >
                                                <FaViber />
                                            </a>
                                        )}
                                        {links.telegram && (
                                            <a
                                                href={links.telegram}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={t("messenger.telegram", "Telegram")}
                                                style={{
                                                    background: palette.control,
                                                    color: messengerColors.telegram,
                                                    borderRadius: 7,
                                                    border: `1px solid ${palette.border}`,
                                                    padding: pad,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    fontSize: 20,
                                                }}
                                            >
                                                <FaTelegramPlane />
                                            </a>
                                        )}
                                        {links.email && (
                                            <a
                                                href={links.email}
                                                title={t("messenger.email", "Эл. почта")}
                                                style={{
                                                    background: palette.control,
                                                    color: messengerColors.email,
                                                    borderRadius: 7,
                                                    border: `1px solid ${palette.border}`,
                                                    padding: pad,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    fontSize: 20,
                                                }}
                                            >
                                                <FaEnvelope />
                                            </a>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
