"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@/app/UserContext";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";

const PAGE_SIZE = 30;

export default function ContactsList() {
    const { authFetchWithRefresh, onNotification, removeContact } = useUser();
    const { t } = useLang();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [eof, setEof] = useState(false);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState(""); // <-- строка поиска


    // <=640px — мобильная вёрстка (1 колонка)
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(max-width: 640px)");
        const onChange = () => setIsMobile(mq.matches);
        onChange();
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    // нормализация строки
    const norm = (v) => String(v ?? "").toLowerCase();
    const matchesQuery = (u, q) => {
        if (!q) return true;
        const fields = [
            u?.name, u?.company, u?.organization, u?.username,
            u?.email, u?.phone, u?.tel, u?.phone_number,
        ];
        return fields.some((f) => norm(f).includes(q));
    };

    // --- helpers: ключ и дедупликация
    const contactKey = (u) =>
        String(u?.id ?? u?.user_id ?? u?.email ?? u?.phone ?? u?.tel ?? u?.phone_number ?? "");
    const dedupeByKey = (arr) => {
        const seen = new Set();
        const out = [];
        for (const u of arr) {
            const k = contactKey(u);
            if (k && seen.has(k)) continue;
            if (k) seen.add(k);
            out.push(u);
        }
        return out;
    };

    const sentinelRef = useRef(null);
    const firstLoadRef = useRef(false);

    const fetchPage = useCallback(async (reset = false) => {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const off = reset ? 0 : offset;
            const res = await authFetchWithRefresh(api(`/contacts?limit=${PAGE_SIZE}&offset=${off}`));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const page = await res.json();
            const arr = Array.isArray(page) ? page : [];
            if (reset) {
                const unique = dedupeByKey(arr);
                setItems(unique);
                setOffset(unique.length);
                setEof(unique.length < PAGE_SIZE);
            } else {
                setItems(prev => dedupeByKey([...prev, ...arr]));
                setOffset(off + arr.length);
                if (arr.length < PAGE_SIZE) setEof(true);
            }
        } catch (e) {
            console.error("[ContactsList] fetch error:", e);
            setError(t("contacts.loadError", "Не удалось загрузить контакты."));
        } finally {
            setLoading(false);
        }
    }, [authFetchWithRefresh, loading, offset]);

    // Первый запрос
    useEffect(() => {
        if (!firstLoadRef.current) {
            firstLoadRef.current = true;
            fetchPage(true);
        }
    }, [fetchPage]);

    // Автодогрузка при прокрутке
    useEffect(() => {
        if (!sentinelRef.current) return;
        const el = sentinelRef.current;
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !loading && !eof) {
                    fetchPage(false);
                }
            });
        }, { rootMargin: "200px" });
        io.observe(el);
        return () => io.disconnect();
    }, [fetchPage, loading, eof]);

    // Реакция на события — перезагрузка списка с нуля
    useEffect(() => {
        const off = onNotification((msg) => {
            const evt = msg?.event || msg?.type;
            if (evt === "contacts_update" ||
                evt === "contact_added" ||
                evt === "contact_removed" ||
                evt === "contact_request_accepted") {
                fetchPage(true);
            }
        });
        return off;
    }, [onNotification, fetchPage]);

    const handleRemove = async (id) => {
        try {
            await removeContact(id);
            // Локально выкидываем — чтобы мгновенно исчез
            setItems(prev => prev.filter(u => u.id !== id));
        } catch (e) {
            console.error("[ContactsList] removeContact error", e);
        }
    };

    const renderRow = (u, i) => {
        // ВЕРХНЯЯ СТРОКА: компания/организация (если указана)
        const company =
            u?.organization ||
            u?.company ||
            u?.company_name ||
            u?.org ||
            null;

        // НИЖНЯЯ СТРОКА: имя и фамилия (или контактное лицо / username / email)
        const fullName =
            (u?.contact_person && String(u.contact_person).trim()) ||
            [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
            u?.name ||
            u?.username ||
            u?.email ||
            null;

        // Если компании нет — крупно показываем fullName как основную строку
        const primaryTitle = company || fullName || ("user#" + u?.id);
        const secondaryName = company && fullName ? fullName : null;

        const avatarSrc = u?.avatar && /^https?:\/\//i.test(u.avatar)
            ? u.avatar
            : (u?.avatar ? abs(u.avatar) : "/default-avatar.png");

        const phone = u?.phone || u?.tel || u?.phone_number;

        return (
            <div key={`contact-${contactKey(u) || i}`}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    border: "1px solid #233a5a",
                    borderRadius: 16,
                    padding: 14,
                    width: "100%"
                }}>
                <Link href={`/profile/${u.id}`}
                    style={{ textDecoration: "none", color: "#e3f2fd", flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <Image src={avatarSrc} alt={primaryTitle} width={40} height={40} style={{ borderRadius: 999 }} />
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            {/* ВЕРХНЯЯ СТРОКА — компания ИЛИ имя, если компании нет */}
                            <div
                                style={{
                                    fontWeight: 800,
                                    color: "#e3f2fd",
                                    fontSize: 16,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}
                                title={primaryTitle}
                            >
                                {primaryTitle}
                            </div>
                            {/* НИЖНЯЯ СТРОКА — имя/фамилия поменьше (только если есть компания) */}
                            {secondaryName && (
                                <div
                                    style={{
                                        color: "#cfe9ff",
                                        fontSize: 13,
                                        lineHeight: 1.35,
                                        marginTop: 2,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis"
                                    }}
                                    title={secondaryName}
                                >
                                    {secondaryName}
                                </div>
                            )}
                            {/* Телефон остаётся третьей строкой (мелко) */}
                            {phone && (
                                <div style={{ color: "#9cc4e7", fontSize: 12, marginTop: 2 }}>{phone}</div>
                            )}
                        </div>
                    </div>
                </Link>
                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
                    <button
                        onClick={() => handleRemove(u.id)}
                        style={{
                            background: "transparent",
                            color: "#ff8a80",
                            border: "1px solid #ff8a80",
                            borderRadius: 10,
                            padding: "6px 10px",
                            cursor: "pointer",
                            width: isMobile ? "100%" : "auto"
                        }}>
                        {t("common.delete", "Удалить")}
                    </button>
                </div>
            </div>
        );
    };

    // применяем фильтр
    const q = norm(query.trim());
    const filtered = (items || []).filter((u) => matchesQuery(u, q));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Заголовок + Поиск (как в других секциях) */}
            <div
                style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: isMobile ? 8 : 0,
                    marginBottom: isMobile ? 10 : 14,
                }}
            >
                <div style={{ fontWeight: 800, color: "#e3f2fd", fontSize: 18 }}>
                    {t("contacts.my", "Мои контакты")}
                </div>
                <div
                    style={{
                        marginLeft: isMobile ? 0 : "auto",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        width: isMobile ? "100%" : "auto",
                        justifyContent: isMobile ? "space-between" : "initial",
                    }}
                >
                    <div
                        style={{
                            position: "relative",
                            display: isMobile ? "block" : "inline-flex",
                            width: isMobile ? "100%" : 380,
                            maxWidth: isMobile ? "100%" : "36vw",
                        }}
                    >
                        {/* иконка лупы */}
                        <span
                            aria-hidden
                            style={{
                                position: "absolute",
                                left: 12,
                                top: "50%",
                                transform: "translateY(-50%)",
                                opacity: 0.65,
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path d="M21 21l-4.2-4.2m1.2-5A7 7 0 1 1 7 4a7 7 0 0 1 11 7.8Z"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t("contacts.searchPlaceholder", "Поиск: имя, email, телефон")}
                            style={{
                                width: "100%",
                                padding: "10px 12px 10px 36px",
                                borderRadius: 12,
                                background: "#0f172a",
                                border: "1px solid #223350",
                                color: "#e3f2fd",
                                outline: "none",
                            }}
                        />
                    </div>
                </div>
            </div>

            {items.length === 0 && !loading && !error && (
                <div style={{ color: "#9cc4e7" }}>
                    {t("contacts.empty", "Пока пусто.")}
                </div>
            )}
            {error && <div style={{ color: "#ff8a80" }}>{error}</div>}

            {/* Ничего не найдено по запросу */}
            {q && filtered.length === 0 && items.length > 0 && (
                <div style={{ color: "#9cc4e7" }}>
                    {t("contacts.noResults", "Ничего не найдено по запросу")} «{query}».
                </div>
            )}

            {filtered.length > 0 && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                        alignItems: "stretch"
                    }}
                >
                    {filtered.map(renderRow)}
                </div>
            )}

            {/* Скелетон / прогресс */}
            {loading && (
                <div style={{ color: "#9cc4e7", textAlign: "center", padding: 12 }}>
                    {t("common.loading", "Загрузка...")}
                </div>
            )}

            {/* Кнопка-дублирование подгрузки (если IntersectionObserver не сработал) */}
            {!eof && !loading && items.length > 0 && (
                <button
                    onClick={() => fetchPage(false)}
                    style={{
                        alignSelf: "center",
                        background: "transparent",
                        color: "#90caf9",
                        border: "1px solid #90caf9",
                        borderRadius: 12,
                        padding: "8px 12px",
                        cursor: "pointer",
                        marginTop: 8
                    }}>
                    {t("common.showMore", "Показать ещё")}
                </button>
            )}

            {/* Сенсор бесконечной прокрутки */}
            <div ref={sentinelRef} style={{ height: 1 }} />
        </div>
    );
}
