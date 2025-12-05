// src/app/components/ContactRequests.js
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@/app/UserContext";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";

const PAGE_SIZE = 30;            // безопасная пачка
const STATUS = "pending";        // показываем «ожидающие» запросы как и раньше

export default function ContactRequests() {
    const { t } = useLang();
    const { authFetchWithRefresh, respondContactRequest, onNotification } = useUser();

    // ---------- helpers ----------
    const joinName = (a, b) => [a, b].filter((v) => v && String(v).trim().length).join(" ");

    const displayNameFromUser = (u) => {
        if (!u) return null;
        return (
            (u.organization && String(u.organization).trim()) ||
            (u.contact_person && String(u.contact_person).trim()) ||
            joinName(u.first_name, u.last_name) ||
            u.full_name || u.name || u.display_name || u.username || u.email || null
        );
    };

    const avatarFromUser = (u) => {
        if (u?.avatar && /^https?:\/\//i.test(u.avatar)) return u.avatar;
        if (u?.avatar) return abs(u.avatar);
        return "/default-avatar.png";
    };

    const displayNameFromRequest = (r, dir) => {
        const nested = dir === "in"
            ? r.sender || r.user || r.from || r.author
            : r.receiver || r.to || r.target;

        const nestedName = displayNameFromUser(nested);
        if (nestedName) return nestedName;

        const pick = (...keys) =>
            keys.map((k) => r?.[k]).find((v) => v && String(v).trim && String(v).trim().length);

        const org = pick("sender_organization", "receiver_organization", "organization");
        const cp = pick("sender_contact_person", "receiver_contact_person", "contact_person");
        const first = pick("sender_first_name", "receiver_first_name", "first_name");
        const last = pick("sender_last_name", "receiver_last_name", "last_name");
        const full = pick("sender_full_name", "receiver_full_name", "full_name", "name", "display_name");
        const username = pick("sender_username", "receiver_username", "username");
        const email = pick("sender_email", "receiver_email", "email");
        return org || cp || joinName(first, last) || full || username || email || null;
    };

    const avatarFromRequest = (r, dir) => {
        const nested = dir === "in"
            ? r.sender || r.user || r.from || r.author
            : r.receiver || r.to || r.target;
        if (nested) return avatarFromUser(nested);
        const avatar = dir === "in" ? r.sender_avatar || r.avatar : r.receiver_avatar || r.avatar;
        if (avatar && /^https?:\/\//i.test(avatar)) return avatar;
        if (avatar) return abs(avatar);
        return "/default-avatar.png";
    };

    // ---------- локальные сторы для IN / OUT ----------
    const [usersById, setUsersById] = useState({});

    const [inItems, setInItems] = useState([]);
    const [inOffset, setInOffset] = useState(0);
    const [inEOF, setInEOF] = useState(false);
    const [inLoading, setInLoading] = useState(false);
    const [inError, setInError] = useState(null);
    const inSentinelRef = useRef(null);
    const inFirstLoadRef = useRef(false);

    const [outItems, setOutItems] = useState([]);
    const [outOffset, setOutOffset] = useState(0);
    const [outEOF, setOutEOF] = useState(false);
    const [outLoading, setOutLoading] = useState(false);
    const [outError, setOutError] = useState(null);
    const outSentinelRef = useRef(null);
    const outFirstLoadRef = useRef(false);

    const inEndpoint = useMemo(
        () => api(`/contacts/requests?direction=in&status=${STATUS}`),
        []
    );
    const outEndpoint = useMemo(
        () => api(`/contacts/requests?direction=out&status=${STATUS}`),
        []
    );

    // ---------- подкачка страниц ----------
    const fetchPage = useCallback(
        async (dir, reset = false) => {
            const isIn = dir === "in";
            if ((isIn && inLoading) || (!isIn && outLoading)) return;

            isIn ? setInLoading(true) : setOutLoading(true);
            isIn ? setInError(null) : setOutError(null);

            try {
                const off = reset ? 0 : (isIn ? inOffset : outOffset);
                const base = isIn ? inEndpoint : outEndpoint;
                const url = `${base}&limit=${PAGE_SIZE}&offset=${off}`;
                const res = await authFetchWithRefresh(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const page = await res.json();
                const arr = Array.isArray(page) ? page : [];

                if (reset) {
                    isIn ? setInItems(arr) : setOutItems(arr);
                    isIn ? setInOffset(arr.length) : setOutOffset(arr.length);
                    if (arr.length < PAGE_SIZE) (isIn ? setInEOF(true) : setOutEOF(true));
                    else (isIn ? setInEOF(false) : setOutEOF(false));
                } else {
                    isIn ? setInItems((p) => [...p, ...arr]) : setOutItems((p) => [...p, ...arr]);
                    isIn ? setInOffset(off + arr.length) : setOutOffset(off + arr.length);
                    if (arr.length < PAGE_SIZE) (isIn ? setInEOF(true) : setOutEOF(true));
                }
            } catch (e) {
                console.error("[ContactRequests] fetch error:", e);
                isIn
                    ? setInError(t("contacts.loadInFailed", "Не удалось загрузить входящие."))
                    : setOutError(t("contacts.loadOutFailed", "Не удалось загрузить исходящие."));
            } finally {
                isIn ? setInLoading(false) : setOutLoading(false);
            }
        },
        [authFetchWithRefresh, inEndpoint, outEndpoint, inLoading, outLoading, inOffset, outOffset]
    );

    const reloadBoth = useCallback(() => {
        inFirstLoadRef.current = false;
        outFirstLoadRef.current = false;
        fetchPage("in", true);
        fetchPage("out", true);
    }, [fetchPage]);

    // первая загрузка
    useEffect(() => {
        if (!inFirstLoadRef.current) { inFirstLoadRef.current = true; fetchPage("in", true); }
        if (!outFirstLoadRef.current) { outFirstLoadRef.current = true; fetchPage("out", true); }
    }, [fetchPage]);

    // авто-догрузка по скроллу (in)
    useEffect(() => {
        if (!inSentinelRef.current) return;
        const el = inSentinelRef.current;
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting && !inLoading && !inEOF) fetchPage("in", false);
            });
        }, { rootMargin: "200px" });
        io.observe(el);
        return () => io.disconnect();
    }, [fetchPage, inLoading, inEOF]);

    // авто-догрузка по скроллу (out)
    useEffect(() => {
        if (!outSentinelRef.current) return;
        const el = outSentinelRef.current;
        const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting && !outLoading && !outEOF) fetchPage("out", false);
            });
        }, { rootMargin: "200px" });
        io.observe(el);
        return () => io.disconnect();
    }, [fetchPage, outLoading, outEOF]);

    // live-обновления → перезагрузка с нуля
    useEffect(() => {
        const off = onNotification((msg) => {
            const evt = msg?.event || msg?.type;
            if (
                evt === "CONTACT_REQUEST" ||
                evt === "CONTACT_ACCEPTED" ||
                evt === "CONTACT_DECLINED" ||
                evt === "contact_request" ||
                evt === "contact_request_accepted" ||
                evt === "contact_request_declined" ||
                evt === "contact_removed"
            ) {
                reloadBoth();
            }
        });
        return () => { try { off && off(); } catch { } };
    }, [onNotification, reloadBoth]);

    // подкачка профилей только для текущих элементов
    useEffect(() => {
        const loadUsers = async () => {
            const ids = new Set([
                ...inItems.map((r) => r.sender_id || r.user_id || r?.sender?.id).filter(Boolean),
                ...outItems.map((r) => r.receiver_id || r.user_id || r?.receiver?.id).filter(Boolean),
            ]);
            const unknown = [...ids].filter((id) => !usersById[id]);
            if (unknown.length === 0) return;

            const entries = await Promise.all(
                unknown.map(async (id) => {
                    try {
                        const res = await authFetchWithRefresh(api(`/users/${id}`));
                        const u = res.ok ? await res.json() : null;
                        return [id, u];
                    } catch {
                        return [id, null];
                    }
                })
            );
            const m = Object.fromEntries(entries.filter(([_, u]) => !!u));
            if (Object.keys(m).length) setUsersById((prev) => ({ ...prev, ...m }));
        };
        loadUsers();
    }, [authFetchWithRefresh, inItems, outItems, usersById]);

    const resolvePerson = (r, dir) => {
        const id = dir === "in" ? r.sender_id || r.user_id : r.receiver_id || r.user_id;
        const nameReq = displayNameFromRequest(r, dir);
        const avatarReq = avatarFromRequest(r, dir);
        if (nameReq) return { id, name: nameReq, avatar: avatarReq };

        const u = id ? usersById[id] : null;
        const nameUser = displayNameFromUser(u);
        const avatarUser = avatarFromUser(u);
        return {
            id,
            name: nameUser || (id ? `user#${id}` : t("common.user", "Пользователь")),
            avatar: avatarUser || avatarReq || "/default-avatar.png",
        };
    };

    // ---------- actions ----------
    const handleAnswer = async (reqId, action, dir) => {
        await respondContactRequest(reqId, action);
        // мгновенно убираем карточку из списка
        if (dir === "in") setInItems((prev) => prev.filter((r) => r.id !== reqId));
        else setOutItems((prev) => prev.filter((r) => r.id !== reqId));
    };

    // ---------- styles ----------
    const cardStyle = {
        display: "flex",
        gap: 14,
        alignItems: "center",
        background: "#121a2b",
        border: "1px solid #233a5a",
        borderRadius: 16,
        padding: 14,
    };

    const btnBase = {
        padding: "8px 12px",
        borderRadius: 8,
        background: "#1f2937",
        color: "#cbd5e1",
        border: "1px solid #334155",
        cursor: "pointer",
    };

    // ---------- render ----------
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Входящие */}
            <div style={{ fontWeight: 800, color: "#e3f2fd", fontSize: 18 }}>
                {t("contacts.incoming", "Входящие")}
            </div>
            {inItems.length === 0 && !inLoading && !inError && (
                <div style={{ color: "#9cc4e7" }}>{t("common.none", "Нет")}</div>
            )}
            {inError && <div style={{ color: "#ff8a80" }}>{inError}</div>}

            {inItems.map((r) => {
                const p = resolvePerson(r, "in");
                return (
                    <div key={r.id} style={cardStyle}>
                        <Link
                            href={`/profile/${p.id ?? ""}`}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                                textDecoration: "none",
                                color: "#e3f2fd",
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <Image
                                src={p.avatar}
                                alt={p.name}
                                width={64}
                                height={64}
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 10,
                                    objectFit: "cover",
                                    border: "1.6px solid #223350",
                                    background: "#182337",
                                }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 16,
                                        color: "#e3f2fd",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {p.name}
                                </div>
                                <div style={{ marginTop: 4, color: "#9fbbe0", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {t("contacts.wantsToAdd", "хочет добавить вас в контакты")}
                                </div>
                            </div>
                        </Link>

                        <div style={{ display: "flex", gap: 8 }}>
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAnswer(r.id, "accept", "in"); }}
                                style={{ ...btnBase }}
                            >
                                {t("common.accept", "Принять")}
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAnswer(r.id, "decline", "in"); }}
                                style={{ ...btnBase, opacity: 0.85 }}
                            >
                                {t("common.decline", "Отклонить")}
                            </button>
                        </div>
                    </div>
                );
            })}

            {inLoading && (
                <div style={{ color: "#9cc4e7", textAlign: "center", padding: 12 }}>
                    {t("common.loading", "Загружаем...")}
                </div>
            )}
            {!inEOF && !inLoading && inItems.length > 0 && (
                <button
                    onClick={() => fetchPage("in", false)}
                    style={{
                        alignSelf: "center",
                        background: "transparent",
                        color: "#90caf9",
                        border: "1px solid #90caf9",
                        borderRadius: 12,
                        padding: "8px 12px",
                        cursor: "pointer",
                        marginTop: 8,
                    }}
                >
                    {t("common.showMore", "Показать ещё")}
                </button>
            )}
            <div ref={inSentinelRef} style={{ height: 1 }} />

            {/* Исходящие */}
            <div style={{ marginTop: 10, fontWeight: 800, color: "#e3f2fd", fontSize: 18 }}>
                {t("contacts.outgoing", "Исходящие")}
            </div>
            {outItems.length === 0 && !outLoading && !outError && (
                <div style={{ color: "#9cc4e7" }}>{t("common.none", "Нет")}</div>
            )}
            {outError && <div style={{ color: "#ff8a80" }}>{outError}</div>}

            {outItems.map((r) => {
                const p = resolvePerson(r, "out");
                return (
                    <div key={r.id} style={cardStyle}>
                        <Link
                            href={`/profile/${p.id ?? ""}`}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                                textDecoration: "none",
                                color: "#e3f2fd",
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <Image
                                src={p.avatar}
                                alt={p.name}
                                width={64}
                                height={64}
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 10,
                                    objectFit: "cover",
                                    border: "1.6px solid #223350",
                                    background: "#182337",
                                }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 16,
                                        color: "#e3f2fd",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {p.name}
                                </div>
                                <div style={{ marginTop: 4, color: "#9fbbe0", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {t("contacts.pending", "ожидание подтверждения запроса")}
                                </div>
                            </div>
                        </Link>
                    </div>
                );
            })}

            {outLoading && (
                <div style={{ color: "#9cc4e7", textAlign: "center", padding: 12 }}>
                    {t("common.loading", "Загружаем...")}
                </div>
            )}
            {!outEOF && !outLoading && outItems.length > 0 && (
                <button
                    onClick={() => fetchPage("out", false)}
                    style={{
                        alignSelf: "center",
                        background: "transparent",
                        color: "#90caf9",
                        border: "1px solid #90caf9",
                        borderRadius: 12,
                        padding: "8px 12px",
                        cursor: "pointer",
                        marginTop: 8,
                    }}
                >
                    {t("common.showMore", "Показать ещё")}
                </button>
            )}
            <div ref={outSentinelRef} style={{ height: 1 }} />
        </div>
    );
}
