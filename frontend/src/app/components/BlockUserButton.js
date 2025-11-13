"use client";
import React, { useMemo, useState } from "react";
import { FaUserSlash, FaUnlock } from "react-icons/fa";
import { useUser } from "@/app/UserContext";
import { useLang } from "../i18n/LangProvider";

export default function BlockUserButton({ targetId, className = "" }) {
    const { isBlocked, blockUser, unblockUser } = useUser();
    const { t } = useLang();
    const blocked = useMemo(() => isBlocked?.(targetId), [isBlocked, targetId]);

    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState("block"); // "block" | "unblock"
    const [busy, setBusy] = useState(false);
    if (!targetId) return null;

    const trigger = (m) => {
        setMode(m);
        setOpen(true);
    };

    const onConfirm = async () => {
        if (!targetId) return;
        try {
            setBusy(true);
            if (mode === "block") {
                await blockUser(targetId);
            } else {
                await unblockUser(targetId);
            }
        } finally {
            setBusy(false);
            setOpen(false);
        }
    };

    const title = mode === "block"
        ? t("block.title.block", "Заблокировать пользователя?")
        : t("block.title.unblock", "Разблокировать пользователя?");
    const isBlock = mode === "block";

    return (
        <>
            <button
                type="button"
                onClick={() => trigger(blocked ? "unblock" : "block")}
                title={blocked ? t("common.unblock", "Разблокировать") : t("common.block", "Заблокировать")}
                style={{
                    background: blocked ? "#223d59" : "#7f1d1d",
                    color: blocked ? "#43c8ff" : "#fff",
                    borderRadius: 7,
                    border: "none",
                    padding: 8,
                    width: 40,
                    height: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 10px #13204820",
                }}
                className={className}
            >
                {blocked ? <FaUnlock size={18} /> : <FaUserSlash size={18} />}
            </button>

            {open && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 9999,
                        background: "rgba(0,0,0,0.55)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 16,
                    }}
                    onClick={() => !busy && setOpen(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "min(560px, 94vw)",
                            background: "#182033",
                            border: "1px solid #24334f",
                            color: "#e6f1ff",
                            borderRadius: 14,
                            boxShadow: "0 8px 40px rgba(9,18,44,.6)",
                            padding: "22px 22px 18px",
                        }}
                    >
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: isBlock ? "#ffb3b3" : "#cde8ff" }}>
                            {title}
                        </div>

                        {isBlock ? (
                            <div style={{ lineHeight: 1.5, color: "#cde8ff", opacity: .95 }}>
                                <p style={{ marginBottom: 8 }}>
                                    {t("block.info.intro", "Блокировка — это инструмент безопасности и комфорта. После блокировки:")}
                                </p>
                                <ul style={{ margin: "8px 0 14px 18px", display: "grid", gap: 8 }}>
                                    <li>{t("block.info.point1", "Вы и этот пользователь больше не увидите профили и контакты друг друга.")}</li>
                                    <li>{t("block.info.point2", "Чаты и запросы на связь будут скрыты/недоступны.")}</li>
                                    <li>{t("block.info.point3", "Заявки и транспорт обеих сторон не будут видны в поиске, Соответствиях и уведомлениях.")}</li>
                                    <li>{t("block.info.point4", "Действие обратимо — разблокировать можно в разделе «Заблокированные» вашего профиля.")}</li>
                                </ul>
                            </div>
                        ) : (
                            <p style={{ margin: "0 0 14px 0", color: "#cde8ff", opacity: .95 }}>
                                {t("block.unblock.info", "Пользователь будет снова видеть ваш профиль и объявления, а вы — его. Эту операцию всегда можно повторить.")}
                            </p>
                        )}

                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button
                                type="button"
                                onClick={() => !busy && setOpen(false)}
                                style={{
                                    padding: "9px 14px",
                                    borderRadius: 10,
                                    background: "transparent",
                                    color: "#bcd7ff",
                                    border: "1px solid #2b3e64",
                                    cursor: "pointer",
                                }}
                                disabled={busy}
                            >
                                {t("common.cancel", "Отмена")}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                style={{
                                    padding: "9px 14px",
                                    borderRadius: 10,
                                    background: isBlock ? "#b91c1c" : "#2563eb",
                                    color: "#fff",
                                    border: "none",
                                    cursor: "pointer",
                                    minWidth: 140,
                                    fontWeight: 700,
                                }}
                                disabled={busy}
                            >
                                {busy ? t("common.pleaseWait", "Подождите...") : isBlock ? t("common.block", "Заблокировать") : t("common.unblock", "Разблокировать")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}