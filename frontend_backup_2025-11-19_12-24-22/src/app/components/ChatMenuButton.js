"use client";
import React, { useState, useRef, useEffect } from "react";
import { FaComments, FaInbox } from "react-icons/fa";
import { useMessenger } from "./MessengerContext";
import { useUser } from "../UserContext"; // если user нужен
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

export default function ChatMenuButton() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [inboxOpen, setInboxOpen] = useState(false);
    const { openMessenger } = useMessenger();
    const buttonRef = useRef();
    const { user } = useUser ? useUser() : { user: null };
    const [unread, setUnread] = useState(0);
    const { t } = useLang();

    // Закрытие по клику вне меню
    useEffect(() => {
        function handleClick(e) {
            if (!buttonRef.current?.contains(e.target)) setMenuOpen(false);
        }
        if (menuOpen) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen]);

    useEffect(() => {
        if (!user) return;
        let stopped = false;
        const fetchUnread = () => {
            fetch(api(`/my-chats/unread_count`), { credentials: "include" })
                .then(res => res.json())
                .then(data => { if (!stopped) setUnread(data.unread || 0); });
        };
        fetchUnread();
        const interval = setInterval(fetchUnread, 15000); // раз в 15 сек
        return () => { stopped = true; clearInterval(interval); };
    }, [user]);


    return (
        <>
            <div className="relative" ref={buttonRef}>
                <button
                    className="header-btn"
                    type="button"
                    style={{ display: "flex", alignItems: "center", gap: 7 }}
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label={t("chat.title", "Чат")}
                >
                    <FaComments className="nav-icon" style={{ marginRight: 2, fontSize: 19 }} />
                    {t("chat.title", "Чат")}
                    <span style={{
                        marginLeft: 4,
                        fontSize: 10,
                        background: "#e45b5b",
                        color: "white",
                        borderRadius: 8,
                        padding: "0px 5px",
                        display: "inline-block"
                    }}>
                        ▼
                    </span>
                    <span style={{
                        marginLeft: 7,
                        fontSize: 12,
                        background: "#e45b5b",
                        color: "white",
                        borderRadius: "50%",
                        padding: "0px 7px",
                        display: unread > 0 ? "inline-block" : "none"
                    }}>
                        {unread}
                    </span>
                </button>
                {menuOpen && (
                    <div className="absolute right-0 mt-2 bg-white dark:bg-[#242f48] rounded-xl shadow-lg min-w-[180px] z-50 border">
                        <button
                            className="flex items-center w-full px-4 py-3 hover:bg-[#e8eefc] dark:hover:bg-[#2b3651] transition text-base"
                            onClick={() => {
                                setInboxOpen(true);
                                setMenuOpen(false);
                            }}
                        >
                            <FaInbox className="mr-3" />
                            {t("chat.myChats", "Мои чаты")}
                        </button>
                        <button
                            className="flex items-center w-full px-4 py-3 hover:bg-[#e8eefc] dark:hover:bg-[#2b3651] transition text-base"
                            onClick={() => {
                                openMessenger();
                                setMenuOpen(false);
                            }}
                        >
                            <FaComments className="mr-3" />
                            {t("chat.quickChat", "Быстрый чат")}
                        </button>
                    </div>
                )}
            </div>
            <InboxPopup isOpen={inboxOpen} onClose={() => setInboxOpen(false)} />

        </>

    );

}