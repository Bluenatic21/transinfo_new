"use client";
import React, { useEffect, useMemo, useState } from "react";
import { FaUserPlus, FaUserCheck } from "react-icons/fa";
import { useUser } from "@/app/UserContext";
import { useLang } from "../i18n/LangProvider";

export default function AddContactButton({ targetId, className = "" }) {
    const { user, contacts = [], contactReq = { incoming: [], outgoing: [] }, fetchContacts, fetchContactRequests, sendContactRequest, respondContactRequest, removeContact, isBlocked } = useUser();
    const [busy, setBusy] = useState(false);
    const { t } = useLang();

    useEffect(() => { fetchContacts(); fetchContactRequests(); }, []); // подхватить текущее состояние

    const inContacts = useMemo(() => contacts.some(u => +u.id === +targetId), [contacts, targetId]);
    const outgoing = useMemo(() => contactReq.outgoing.find(r => +r.receiver_id === +targetId), [contactReq, targetId]);
    const incoming = useMemo(() => contactReq.incoming.find(r => +r.sender_id === +targetId), [contactReq, targetId]);

    if (!targetId || !user || +user.id === +targetId) return null;
    if (isBlocked?.(targetId)) return null; // при блоке кнопка скрыта

    const onAdd = async () => {
        setBusy(true);
        try { await sendContactRequest(targetId); await fetchContactRequests(); }
        finally { setBusy(false); }
    };
    const onAccept = async () => { setBusy(true); try { await respondContactRequest(incoming.id, "accept"); } finally { setBusy(false); } };
    const onDecline = async () => { setBusy(true); try { await respondContactRequest(incoming.id, "decline"); } finally { setBusy(false); } };

    return (
        <>
            {inContacts ? (
                <button title={t("contacts.inContacts", "В контактах")}
                    style={{ background: "#134e4a", color: "#a7f3d0", borderRadius: 7, border: "none", padding: "8px 10px", display: "inline-flex", alignItems: "center", gap: 8, cursor: "default" }}
                    className={className}>
                    <FaUserCheck size={16} /> {t("contacts.inContacts", "В контактах")}
                </button>
            ) : incoming ? (
                <div style={{ display: "inline-flex", gap: 8 }}>
                    <button onClick={onAccept} disabled={busy}
                        style={{ background: "#2563eb", color: "#fff", borderRadius: 7, border: "none", padding: "8px 10px", cursor: "pointer" }}>
                        {t("contacts.accept", "Принять")}
                    </button>
                    <button onClick={onDecline} disabled={busy}
                        style={{ background: "#1f2937", color: "#cbd5e1", borderRadius: 7, border: "1px solid #334155", padding: "8px 10px", cursor: "pointer" }}>
                        {t("contacts.decline", "Отклонить")}
                    </button>
                </div>
            ) : outgoing ? (
                <button disabled
                    title={t("contacts.requestSentTitle", "Запрос отправлен")}
                    style={{ background: "#0f172a", color: "#93c5fd", borderRadius: 7, border: "1px solid #1d2b4a", padding: "8px 10px" }}
                    className={className}>
                    {t("contacts.pending", "Ожидание подтверждения")}
                </button>
            ) : (
                <button onClick={onAdd} disabled={busy}
                    title={t("contacts.add", "Добавить в контакты")}
                    style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 7, border: "1px solid #334155", padding: "8px", width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    className={className}>
                    <FaUserPlus size={18} />
                </button>
            )}
        </>
    );
}
