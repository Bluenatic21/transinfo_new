// src/app/components/LoginForm.js
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setTokenEverywhere, setUserEverywhere, removeTokenEverywhere } from "./yourTokenUtils";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

export default function LoginForm({ onLogin, onClose, onShowRegister }) {
    const { t } = useLang();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [msg, setMsg] = useState("");
    const router = useRouter();
    const { authFetchWithRefresh } = useUser();

    const [showPassword, setShowPassword] = useState(false);
    const [eyeHover, setEyeHover] = useState(false);

    // Новый стейт для "запомнить"
    const [rememberMe, setRememberMe] = useState(false);

    // === Восстановить email/пароль из localStorage при загрузке
    useEffect(() => {
        try {
            const remembered = JSON.parse(localStorage.getItem("rememberMeLogin") || "{}");
            if (remembered.email) setEmail(remembered.email);
            if (remembered.password) setPassword(remembered.password);
            if (remembered.email || remembered.password) setRememberMe(true);
        } catch (e) { }
    }, []);

    // === Сохранять/удалять email/пароль в localStorage при входе
    async function handleLogin(e) {
        e.preventDefault();

        removeTokenEverywhere();

        const res = await fetch(api("/login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            credentials: "include",
        });

        const data = await res.json();
        if (data.access_token) {
            setMsg(t("login.success", "Успешный вход!"));

            // === Запоминаем email/пароль если надо, иначе удаляем
            if (rememberMe) {
                localStorage.setItem("rememberMeLogin", JSON.stringify({ email, password }));
            } else {
                localStorage.removeItem("rememberMeLogin");
            }

            setTokenEverywhere(data.access_token, rememberMe);

            const resUser = await authFetchWithRefresh(api("/me"));
            if (!resUser.ok) {
                setMsg(t("login.fetchProfileError", "Ошибка получения профиля"));
                removeTokenEverywhere();
                return;
            }
            const userInfo = await resUser.json();

            if (userInfo && userInfo.role) {
                const userObj = { ...userInfo, token: data.access_token };
                setUserEverywhere(userObj, rememberMe);
                // 👉 Автопереход в профиль после успешного входа
                try {
                    router.push("/profile");
                } catch { }

                onLogin && onLogin(userObj);
            } else {
                setMsg(t("login.fetchProfileError", "Ошибка получения профиля"));
                removeTokenEverywhere();
            }
        } else {
            // Localize system error keys like "error.auth.invalidCredentials"
            const raw = data?.detail;
            const fallback = t("login.error", "Ошибка входа");
            if (typeof raw === "string" && raw.startsWith("error.")) {
                setMsg(t(raw, fallback));
            } else if (raw && typeof raw === "object" && typeof raw.code === "string" && raw.code.startsWith("error.")) {
                setMsg(t(raw.code, fallback));
            } else if (typeof raw === "string") {
                setMsg(raw);
            } else {
                setMsg(fallback);
            }
            removeTokenEverywhere();
        }
    }

    return (
        <form onSubmit={handleLogin} className="login-form-root">
            <h2 className="login-form-title">{t("login.title", "Вход")}</h2>
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="login-form-input"
                autoComplete="username"
            />
            <div style={{ position: "relative", width: "100%" }}>
                <input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("login.password", "Пароль")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="login-form-input"
                    autoComplete="current-password"
                    style={{ paddingRight: 38, width: "100%" }}
                />
                {password && (
                    <span
                        onClick={() => setShowPassword((v) => !v)}
                        onMouseOver={() => setEyeHover(true)}
                        onMouseOut={() => setEyeHover(false)}
                        style={{
                            position: "absolute",
                            right: 14,
                            top: "50%",
                            transform: "translateY(-50%)",
                            cursor: "pointer",
                            color: "#222",
                            opacity: eyeHover ? 1 : 0.55,
                            fontSize: 22,
                            transition: "opacity 0.15s",
                            userSelect: "none",
                        }}
                        tabIndex={0}
                        aria-label={showPassword ? t("login.hidePassword", "Скрыть пароль") : t("login.showPassword", "Показать пароль")}
                    >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </span>
                )}
            </div>
            {/* === Чекбокс Запомнить меня === */}
            <label
                style={{
                    display: "flex",
                    alignItems: "center",
                    margin: "7px 0 2px 0",
                    fontSize: 15,
                    color: "#b9e1fa",
                    gap: 7,
                    userSelect: "none",
                }}
            >
                <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{
                        width: 18,
                        height: 18,
                        accentColor: "#43c8ff",
                        marginRight: 7,
                        cursor: "pointer",
                    }}
                />
                {t("login.remember", "Запомнить меня")}
            </label>

            <button type="submit" className="login-form-btn">
                {t("login.submit", "Войти")}
            </button>
            {msg && <div className={`login-form-msg ${msg === "Login successful!" ? "ok" : "err"}`}>{msg}</div>}
            <div className="login-form-links" style={{ marginTop: 18, display: "flex", justifyContent: "space-between" }}>
                <Link
                    href="/auth/forgot"
                    className="login-form-link"
                    style={{
                        color: "#43c8ff",
                        fontSize: 15,
                        textDecoration: "underline",
                    }}
                    prefetch={false}
                >
                    {t("login.forgot", "Забыли пароль?")}
                </Link>
                <button
                    type="button"
                    className="login-form-link"
                    style={{
                        background: "none",
                        border: "none",
                        color: "#43c8ff",
                        cursor: "pointer",
                        fontSize: 15,
                        textDecoration: "underline",
                        padding: 0,
                    }}
                    onClick={() => {
                        if (onShowRegister) {
                            onShowRegister(); // без закрытия и setTimeout — стабильно на мобиле
                        } else if (onClose) {
                            onClose();
                        }
                    }}
                >
                    {t("login.register", "Регистрация")}
                </button>
            </div>
        </form>
    );
}
