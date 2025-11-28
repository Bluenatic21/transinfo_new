"use client";
import { useState } from "react";
import { useUser } from "../UserContext";
import { api } from "@/config/env";
import { FaLock } from "react-icons/fa";
import { useLang } from "../i18n/LangProvider";
import styles from "./ChangePasswordForm.module.css";

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
        <div className={`${styles.card} change-password-card`}>
            <div className={styles.header}>
                <FaLock className={styles.icon} size={16} />
                <h3 className={styles.title}>
                    {t("changePassword.title", "Смена пароля")}
                </h3>
            </div>

            <form onSubmit={onSubmit} className={styles.form}>
                <div>
                    <label className={styles.label}>{t("changePassword.current", "Текущий пароль")}</label>
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        disabled={loading}
                        className={styles.input}
                    />
                </div>
                <div>
                    <label className={styles.label}>{t("changePassword.new", "Новый пароль")}</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        disabled={loading}
                        className={styles.input}
                    />
                </div>
                <div>
                    <label className={styles.label}>{t("changePassword.repeat", "Повторите новый пароль")}</label>
                    <input
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        minLength={8}
                        disabled={loading}
                        className={styles.input}
                    />
                </div>

                {error && <div className={styles.feedbackError}>{error}</div>}
                {message && <div className={styles.feedbackSuccess}>{message}</div>}

                <button type="submit" disabled={loading} className={styles.submit}>
                    {loading
                        ? t("changePassword.saving", "Сохранение...")
                        : t("changePassword.submit", "Изменить пароль")}
                </button>
            </form>
        </div>
    );
}