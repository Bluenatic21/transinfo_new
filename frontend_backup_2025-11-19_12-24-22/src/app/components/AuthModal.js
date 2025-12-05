"use client";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";

export default function AuthModal({ visible, onClose, setShowRegisterModal }) {
    const { setUser } = useUser();
    const [view, setView] = useState("login"); // 'login' | 'register'
    const { t } = useLang();
    useEffect(() => { if (visible) setView("login"); }, [visible]);

    // Блокируем прокрутку body на время модалки (чтобы на мобиле не «уплывала»)
    // Хук должен быть объявлен до любых условных return, чтобы порядок хуков не "скакал".
    useEffect(() => {
        if (!visible) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [visible]);

    if (!visible) return null;

    // Рендерим строго в #modal-root, чтобы избежать конфликтов stacking-context/overflow
    const root = typeof document !== "undefined" ? document.getElementById("modal-root") : null;
    if (!root) return null;

    const content = (
        <>
            {/* Этот overlay перекроет Leaflet и все его контролы */}
            <div className="auth-modal__backdrop"
                style={{
                    position: "fixed",
                    left: 0,
                    top: 0,
                    width: "100vw",
                    height: "100dvh",
                    // ниже фрейма, но выше любых штор/оверлеев: берём максимум из проекта - 1
                    zIndex: 2147483646,
                    background: "transparent",
                    pointerEvents: "auto"
                }}
            />
            <div
                className="auth-modal__frame"
                style={{
                    position: "fixed",
                    inset: 0,
                    // самый верх — чтобы гарантированно быть поверх всего
                    zIndex: 2147483647,
                    backdropFilter: "blur(3px)",
                    background: "rgba(16, 24, 43, 0.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
                role="dialog"
                aria-modal="true"
                aria-label={view === "login" ? t("nav.login", "Вход") : t("nav.register", "Регистрация")}
                onClick={onClose}
            >
                <div
                    className="auth-modal__inner"
                    onClick={(e) => e.stopPropagation()}
                    style={{ maxWidth: 430, width: "100%", margin: "0 16px", maxHeight: "92dvh", overflowY: "auto" }}
                >
                    {view === "login" ? (
                        <LoginForm
                            onLogin={(user) => { setUser(user); onClose && onClose(); }}
                            onClose={onClose}
                            onShowRegister={() => {
                                // Показываем форму регистрации внутри этой же модалки
                                setView("register");
                            }}
                        />
                    ) : (
                        <RegisterForm
                            onSuccess={() => {
                                // После успешной регистрации вернёмся к логину и закроем окно
                                setView("login");
                                onClose && onClose();
                            }}
                        />
                    )}
                </div>
            </div>
            <style jsx>{`
              @media (max-width: 480px) {
                .auth-modal__frame {
                  align-items: flex-end;
                  padding: 0;
                }
                .auth-modal__inner {
                  width: 100%;
                  max-width: none;
                  margin: 0;
                  max-height: 100dvh;
                  border-radius: 18px 18px 0 0;
                  padding-bottom: env(safe-area-inset-bottom);
                }
              }
            `}</style>
        </>
    );

    return ReactDOM.createPortal(content, root);
}

