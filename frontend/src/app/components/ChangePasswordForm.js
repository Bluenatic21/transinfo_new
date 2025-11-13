"use client";
import { useState } from "react";
import { useUser } from "../UserContext";
import { api } from "@/config/env";
import { FaLock } from "react-icons/fa";
import { useLang } from "../i18n/LangProvider";

export default function ChangePasswordForm() {
    const { authFetchWithRefresh } = useUser();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const { t } = useLang();

    const onSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);
        setError(null);
        if (!newPassword || newPassword.length < 8) {
            setError(t("changePassword.error.min8", "Новый пароль должен быть не короче 8 символов"));
            return;
        }
        if (newPassword !== confirm) {
            setError(t("changePassword.error.mismatch", "Пароли не совпадают"));
            return;
        }
        try {
            setLoading(true);
            const resp = await authFetchWithRefresh(api("/change-password"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                }),
            });
            if (resp.ok) {
                setMessage(t("changePassword.success", "Пароль успешно изменён."));
                setCurrentPassword("");
                setNewPassword("");
                setConfirm("");
            } else {
                const data = await resp.json().catch(() => ({}));
                setError(data?.detail || t("changePassword.error.generic", "Не удалось сменить пароль"));
            }
        } catch (err) {
            setError(String(err || t("support.networkError", "Ошибка сети")));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="change-password-card"
            style={{
                marginTop: 16,
                background: "#0f2449",
                border: "1px solid #254985",
                borderRadius: 16,
                padding: 20,
                boxShadow: "0 6px 20px rgba(0,0,0,.25)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <FaLock color="#b3d5fa" size={16} />
                <h3 style={{ margin: 0, color: "#e3f2fd", fontSize: 18, fontWeight: 700 }}>
                    {t("changePassword.title", "Смена пароля")}
                </h3>
            </div>

            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
                <div>
                    <label style={{ color: "#b3d5fa", fontWeight: 600, display: "block", marginBottom: 6 }}>{t("changePassword.current", "Текущий пароль")}</label>
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        disabled={loading}
                        style={{
                            background: "#091a35",
                            border: "1px solid #254985",
                            color: "#e3f2fd",
                            borderRadius: 12,
                            padding: "10px 12px",
                            width: "100%",
                            fontSize: 16,
                        }}
                    />
                </div>
                <div>
                    <label style={{ color: "#b3d5fa", fontWeight: 600, display: "block", marginBottom: 6 }}>{t("changePassword.new", "Новый пароль")}</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        disabled={loading}
                        style={{
                            background: "#091a35",
                            border: "1px solid #254985",
                            color: "#e3f2fd",
                            borderRadius: 12,
                            padding: "10px 12px",
                            width: "100%",
                            fontSize: 16,
                        }}
                    />
                </div>
                <div>
                    <label style={{ color: "#b3d5fa", fontWeight: 600, display: "block", marginBottom: 6 }}>{t("changePassword.repeat", "Повторите новый пароль")}</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        minLength={8}
                        disabled={loading}
                        style={{
                            background: "#091a35",
                            border: "1px solid #254985",
                            color: "#e3f2fd",
                            borderRadius: 12,
                            padding: "10px 12px",
                            width: "100%",
                            fontSize: 16,
                        }}
                    />
                </div>

                {error && (
                    <div style={{ color: "#ff9aa2", fontWeight: 600 }}>{error}</div>
                )}
                {message && (
                    <div style={{ color: "#72ebff", fontWeight: 600 }}>{message}</div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        background: loading ? "#1c3a72" : "#1a73e8",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        padding: "10px 14px",
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: loading ? "default" : "pointer",
                    }}
                >
                    {loading ? t("changePassword.saving", "Сохранение...") : t("changePassword.submit", "Изменить пароль")}
                </button>
            </form>
        </div>
    );
}
