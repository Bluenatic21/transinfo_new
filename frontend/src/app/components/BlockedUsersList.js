"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@/app/UserContext";
import { FiSearch } from "react-icons/fi";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";

// Упрощённые хелперы под стиль EmployeeList
function getDisplayName(u) {
    return (
        u?.organization?.trim() ||
        u?.contact_person?.trim() ||
        u?.name?.trim() ||
        [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
        u?.username ||
        u?.email ||
        ("user#" + u?.id)
    );
}
function roleToRu(role) {
    const map = {
        ADMIN: "Админ",
        TRANSPORT: "Перевозчик",
        OWNER: "Грузовладелец",
        MANAGER: "Экспедитор",
        EMPLOYEE: "Экспедитор",
    };
    return map[(role || "").toString().toUpperCase()] || (role || "");
}

export default function BlockedUsersList() {
    const { blocked, authFetchWithRefresh, unblockUser } = useUser();
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);
    const [q, setQ] = useState("");
    const { t } = useLang();

    const colors = {
        surface: "var(--surface)",
        surfaceSoft: "var(--surface-soft)",
        border: "var(--border-subtle)",
        textPrimary: "var(--text-primary)",
        textSecondary: "var(--text-secondary)",
        textMuted: "var(--text-muted)",
        controlBg: "var(--control-bg)",
        controlBorder: "var(--border-subtle)",
        shadow: "var(--shadow-soft)",
        accent: "var(--brand-blue)",
    };

    const isMobile = useIsMobile();


    // Локализованный лейбл роли (используем t в скоупе компонента)
    function roleLabel(role) {
        const key = (role || "").toString().toUpperCase();
        const map = {
            ADMIN: t("role.admin", "Админ"),
            TRANSPORT: t("role.transport", "Перевозчик"),
            OWNER: t("role.owner", "Грузовладелец"),
            MANAGER: t("role.manager", "Экспедитор"),
            EMPLOYEE: t("role.employee", "Экспедитор"),
        };
        return map[key] || (role || "");
    }

    // контейнер секции: на мобилке добавляем внутренние отступы и запас под нижнюю навигацию
    const containerStyle = isMobile
        ? {
            width: "100%",
            maxWidth: "100%",
            margin: 0,
            padding: "16px 12px 72px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
        } : { display: "flex", flexDirection: "column", gap: 12 };

    // список ID тех, КОГО Я заблокировал
    const ids = blocked?.blocked_by_me_ids || [];

    // подгрузка полных профилей по ID
    useEffect(() => {
        let canceled = false;
        const load = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem("token");
                const headers = token ? { Authorization: "Bearer " + token } : {};
                const results = await Promise.all(
                    ids.map(async (id) => {
                        const r = await fetch(api(`/users/${id}`), { headers });
                        if (!r.ok) return null;
                        return await r.json();
                    })
                );
                if (!canceled) setItems(results.filter(Boolean));
            } finally {
                if (!canceled) setLoading(false);
            }
        };
        if (ids.length > 0) load();
        else setItems([]);
        return () => { canceled = true; };
    }, [JSON.stringify(ids)]);

    const filtered = useMemo(() => {
        const norm = (s) => (s ?? "").toString().toLowerCase();
        const nq = norm(q);
        return items.filter((u) => {
            const hay = [
                getDisplayName(u),
                u?.email, u?.phone, u?.city, u?.country, u?.role,
            ].filter(Boolean).join(" ").toLowerCase();
            return !nq || hay.includes(nq);
        });
    }, [items, q]);

    return (
        <div style={containerStyle}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    ...(isMobile
                        ? {
                            position: "sticky",
                            top: 0,
                            zIndex: 5,
                            padding: "8px 0 12px",
                            background: "color-mix(in srgb, var(--surface) 92%, transparent)",
                            backdropFilter: "blur(4px)",
                        }
                        : {}),
                }}
            >
                <span style={{ fontWeight: 800, color: colors.textPrimary, fontSize: 18 }}>
                    {t("users.blocked.title", "Заблокированные пользователи")}
                </span>
                <div style={{
                    marginLeft: isMobile ? 0 : "auto",
                    display: "flex", alignItems: "center", gap: 8,
                    background: colors.controlBg,
                    border: `1px solid ${colors.controlBorder}`,
                    padding: "8px 10px",
                    borderRadius: 10,
                    width: isMobile ? "100%" : 340,
                    maxWidth: isMobile ? "100%" : "40vw"
                }}>
                    <FiSearch size={18} color={colors.textSecondary} />
                    <input
                        placeholder={t("search.placeholder.person", "Поиск по имени/почте/телефону")}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        style={{
                            background: "transparent",
                            color: colors.textPrimary,
                            border: "none",
                            outline: "none",
                            width: "100%",
                        }}
                    />
                </div>
            </div>

            {loading && <div style={{ padding: 12, color: colors.textSecondary }}>{t("common.loading", "Загрузка…")}</div>}
            {!loading && filtered.length === 0 && (
                <div style={{ padding: 12, color: colors.textSecondary }}>{t("users.blocked.empty", "Список пуст.")}</div>
            )}

            {!loading && filtered.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {filtered.map((u) => {
                        const name = getDisplayName(u);
                        const roleText = roleLabel(u?.role);
                        const avatarSrc = u?.avatar ? abs(u.avatar) : "/default-avatar.png";
                        const phone = u?.phone || u?.tel || u?.phone_number;

                        return (
                            <div key={u.id}
                                style={{
                                    width: "100%",
                                    background: colors.surface,
                                    border: `1px solid ${colors.border}`,
                                    borderRadius: 16,
                                    padding: 14,
                                    display: "flex",
                                    gap: 14,
                                    alignItems: "center",
                                    transition: "transform .08s ease, box-shadow .08s ease",
                                }}>
                                {/* как в EmployeeList: слева — клика в профиль */}
                                <Link href={`/profile/${u.id}`} style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", color: colors.textPrimary, flex: 1, minWidth: 0 }}>
                                    <Image
                                        src={avatarSrc}
                                        alt={name}
                                        width={64}
                                        height={64}
                                        style={{
                                            width: 64, height: 64, borderRadius: 10, objectFit: "cover",
                                            border: `1.6px solid ${colors.border}`,
                                            background: colors.surfaceSoft,
                                            display: "block", flexShrink: 0,
                                        }}
                                        onError={(e) => { e.currentTarget.src = "/default-avatar.png"; }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div style={{
                                                fontWeight: 800, fontSize: 16, color: colors.textPrimary,
                                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                            }}>
                                                {name}
                                            </div>
                                            {roleText && (
                                                <span style={{
                                                    marginLeft: "auto", fontSize: 12, fontWeight: 800, padding: "4px 8px",
                                                    borderRadius: 999,
                                                    background: colors.surfaceSoft,
                                                    border: `1px solid ${colors.border}`,
                                                    color: colors.textSecondary, whiteSpace: "nowrap",
                                                }}>
                                                    {roleText}
                                                </span>
                                            )}
                                        </div>
                                        {(u?.email || phone) && (
                                            <div style={{ marginTop: 4, display: "flex", gap: 12, color: colors.textSecondary, fontSize: 13, flexWrap: "wrap" }}>
                                                {u?.email && <div>{u.email}</div>}
                                                {phone && <div>{phone}</div>}
                                            </div>
                                        )}
                                    </div>
                                </Link>

                                {/* действия справа */}
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        onClick={async () => { await unblockUser(u.id); }}
                                        style={{ padding: "8px 12px", borderRadius: 8, background: colors.accent, color: "var(--text-on-brand)", border: "none", cursor: "pointer", boxShadow: colors.shadow }}
                                    >
                                        {t("users.blocked.unblock", "Разблокировать")}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
