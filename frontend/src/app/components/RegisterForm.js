"use client";
// Terms consent
const TERMS_VERSION = "2025-09-17-ru-v1";
import { useState, useEffect, Fragment } from "react";
import { FaTruck, FaUser, FaClipboardCheck, FaEye, FaEyeSlash } from "react-icons/fa6";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/app/lib/apiBase";
import { setTokenEverywhere, setUserEverywhere, removeTokenEverywhere } from "./yourTokenUtils";
import { useUser } from "../UserContext";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import "../globals.css";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

// Палитра под ваш интерфейс
const COLORS = {
    accent: "#43c8ff",
    accentL: "#6bd9ff",
    btnIdle: "#2b2f3a",     // темнее фона, но светлее прежнего #23242c
    btnHover: "#303544",
    textIdle: "#bde8ff",    // чуть светлее, читаемей на тёмном
};
const ACTIVE_BG = `linear-gradient(180deg, ${COLORS.accentL} 0%, ${COLORS.accent} 100%)`;


function ModalNotice({ text }) {
    return (
        <div
            style={{
                position: "fixed",
                left: 0,
                top: 0,
                width: "100vw",
                height: "100vh",
                zIndex: 1000,
                background: "rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                animation: "fadeIn 0.17s",
            }}
        >
            <div
                style={{
                    background: "#242531",
                    color: "#a8ffe5",
                    borderRadius: 16,
                    fontSize: 21,
                    minWidth: 300,
                    padding: "30px 36px",
                    boxShadow: "0 6px 32px 0 rgba(0,0,0,.18)",
                    border: "2.5px solid #43c8ff",
                    textAlign: "center",
                }}
            >
                {text}
            </div>
        </div>
    );
}

// Единый стиль для текста ошибок
const errorStyle = { color: "#ffbfc4", fontSize: 12, marginTop: 4 };

// Мягкая подсветка рамки при ошибке
const withErrorStyles = (hasError) =>
    hasError
        ? {
            borderColor: "#ff6b6b",
            boxShadow: "0 0 0 3px rgba(255, 107, 107, 0.2)",
            transition: "border-color .2s, box-shadow .2s",
        }
        : { transition: "border-color .2s, box-shadow .2s" };


function renderCodeDestination(template, target) {
    const safeTemplate = template || "";
    const safeTarget = target || "";

    if (!safeTemplate.includes("{target}")) {
        return (
            <>
                {safeTemplate} <b>{safeTarget}</b>
            </>
        );
    }

    const parts = safeTemplate.split("{target}");
    return parts.map((part, idx) => (
        <Fragment key={`codepart-${idx}`}>
            {part}
            {idx < parts.length - 1 && <b>{safeTarget}</b>}
        </Fragment>
    ));
}


export default function RegisterForm({ onSuccess }) {
    const { t, lang } = useLang?.() || { t: (_k, f) => f, lang: "ru" };
    // Точный язык UI для бэкенда
    const uiLang =
        (lang && String(lang).split("-")[0].toLowerCase()) ||
        (typeof navigator !== "undefined" && (navigator.language || "").split("-")[0].toLowerCase()) ||
        "ru";
    const ROLE_LABELS = {
        TRANSPORT: { label: t("role.transport", "Перевозчик"), icon: <FaTruck /> },
        OWNER: { label: t("role.owner", "Грузовладелец"), icon: <FaClipboardCheck /> },
        MANAGER: { label: t("role.manager", "Экспедитор"), icon: <FaUser /> },
    };
    const [role, setRole] = useState("");
    const [personType, setPersonType] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPassword2, setShowPassword2] = useState(false);
    const [eyeHover, setEyeHover] = useState(false);
    const [eyeHover2, setEyeHover2] = useState(false);
    const { authFetchWithRefresh } = useUser();
    const [phoneVerified, setPhoneVerified] = useState(false);
    const [showPhoneVerify, setShowPhoneVerify] = useState(false);
    const [phoneCode, setPhoneCode] = useState("");
    const [phoneVerifyMsg, setPhoneVerifyMsg] = useState("");
    const [phoneResendLeft, setPhoneResendLeft] = useState(0);
    const [pendingRegisterPayload, setPendingRegisterPayload] = useState(null);
    const [isPhoneCodeSending, setIsPhoneCodeSending] = useState(false);
    // одно состояние для проверки кода
    const [isPhoneVerifyLoading, setIsPhoneVerifyLoading] = useState(false);

    const [form, setForm] = useState({
        organization: "",
        country: "",
        city: "",
        contact_person: "",
        phone: "",
        email: "",
        password: "",
    });
    const [password2, setPassword2] = useState("");
    const [msg, setMsg] = useState(""); // общие/непривязанные ошибки
    const [agreeTerms, setAgreeTerms] = useState(false);

    // Ошибки по полям
    const createEmptyErrors = () => ({
        role: [],
        organization: [],
        contact_person: [],
        person_type: [],
        country: [],
        city: [],
        phone: [],
        email: [],
        password: [],
        password2: [],
        accepted_terms: [],
        form: [], // для ошибок сервера без конкретного поля
    });
    const [errors, setErrors] = useState(() => createEmptyErrors());
    const [hoveredRole, setHoveredRole] = useState(null);

    const [showSuccess, setShowSuccess] = useState(false);
    // --- Верификация e-mail ---
    const [showVerify, setShowVerify] = useState(false);
    const [emailForVerify, setEmailForVerify] = useState("");
    const [verifyCode, setVerifyCode] = useState("");
    const [verifyMsg, setVerifyMsg] = useState("");
    const [resendLeft, setResendLeft] = useState(0);

    const codeSentTemplate = t("register.verify.codeSent", "Мы отправили 6-значный код на {target}.");
    const codeInputPlaceholder = t("register.verify.codeInputPlaceholder", "Введите 6-значный код");
    const verifySubmitLabel = t("register.verify.submit", "Подтвердить");
    const verifyResendLabel = t("register.verify.resend", "Отправить ещё раз");
    const verifyCancelLabel = t("register.verify.cancel", "Отмена");
    const phoneModalTitle = t("register.verify.phoneTitle", "Подтверждение телефона");
    const emailModalTitle = t("register.verify.emailTitle", "Подтверждение e-mail");

    useEffect(() => {
        if (!showVerify || resendLeft <= 0) return;
        const id = setInterval(() => setResendLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(id);
    }, [showVerify, resendLeft]);

    useEffect(() => {
        if (!showPhoneVerify || phoneResendLeft <= 0) return;
        const id = setInterval(() => setPhoneResendLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(id);
    }, [showPhoneVerify, phoneResendLeft]);

    function handleRole(r) {
        setRole(r);
        setPersonType("");
        setForm({
            organization: "",
            country: "",
            city: "",
            contact_person: "",
            phone: "",
            email: "",
            password: "",
        });
        setPassword2("");
        setMsg("");
        setErrors(createEmptyErrors());
        // уберём ошибку роли, если она была
        setErrors((prev) => ({ ...prev, role: [] }));
        setPhoneVerified(false);
        setPendingRegisterPayload(null);
        setShowPhoneVerify(false);
    }

    function handleChange(e) {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value });
        if (name in errors && Array.isArray(errors[name]) && errors[name].length) {
            setErrors((prev) => ({ ...prev, [name]: [] }));
        }
    }

    function handlePersonTypeChange(v) {
        setPersonType(v);
        if (errors.person_type.length) {
            setErrors((prev) => ({ ...prev, person_type: [] }));
        }
    }

    // Приземление ошибок сервера по полям
    function mapServerErrors(detailArray) {
        const next = createEmptyErrors();
        const known = {
            email: "email",
            organization: "organization",
            contact_person: "contact_person",
            country: "country",
            city: "city",
            phone: "phone",
            person_type: "person_type",
            accepted_terms: "accepted_terms",
            terms_version: "form",
            role: "role",
            password: "password",
        };
        for (const e of detailArray) {
            const loc = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : null;
            const key = known[loc] || "form";
            next[key].push(e.msg || (typeof e === "string" ? e : JSON.stringify(e)));
        }
        setErrors(next);
        scrollToFirstError(next);
    }

    // Скролл к первому ошибочному полю
    function scrollToFirstError(next) {
        const order = [
            "role",
            "organization",
            "contact_person",
            "person_type",
            "country",
            "city",
            "phone",
            "email",
            "password",
            "password2",
            "accepted_terms",
            "form",
        ];
        const idMap = {
            role: "field-role",
            organization: "field-organization",
            contact_person: "field-contact_person",
            person_type: "field-person_type",
            country: "field-country",
            city: "field-city",
            phone: "field-phone",
            email: "field-email",
            password: "field-password",
            password2: "field-password2",
            accepted_terms: "field-accepted_terms",
            form: "field-form-msg",
        };
        for (const k of order) {
            const arr = next[k];
            if (Array.isArray(arr) && arr.length > 0) {
                const el = document.getElementById(idMap[k]);
                if (el && typeof el.scrollIntoView === "function") {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                break;
            }
        }
    }

    // Клиентская валидация -> раскладка по полям
    function validateFormAndSetErrors() {
        const next = createEmptyErrors();
        const empty = (v) => !v || (typeof v === "string" && !v.trim());
        if (!role) next.role.push("Выберите роль.");
        if (empty(form.organization)) next.organization.push("Укажите название организации.");
        if (empty(form.contact_person)) next.contact_person.push("Укажите контактное лицо.");
        if (empty(form.country)) next.country.push("Укажите страну.");
        if (empty(form.city)) next.city.push("Укажите город.");
        if (empty(form.phone)) next.phone.push("Укажите телефон.");
        if (empty(form.email)) next.email.push("Укажите email.");
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email.push("Email указан некорректно.");
        if (empty(form.password)) next.password.push("Введите пароль.");
        if (empty(password2)) next.password2.push("Подтвердите пароль.");
        if (form.password && password2 && form.password !== password2) next.password2.push("Пароли не совпадают.");
        if ((role === "TRANSPORT" || role === "OWNER") && empty(personType))
            next.person_type.push("Выберите юридический статус (ЮЛ/ИП/ФЛ).");
        if (!agreeTerms) next.accepted_terms.push("Необходимо согласие с пользовательским соглашением.");

        setErrors(next);
        const hasErrors = Object.values(next).some((arr) => Array.isArray(arr) && arr.length > 0);
        if (hasErrors) scrollToFirstError(next);
        return hasErrors;
    }

    async function handleRegister(e) {
        e.preventDefault();
        setMsg("");
        const hasErrors = validateFormAndSetErrors();
        if (hasErrors) {
            setShowPhoneVerify(false);
            setPendingRegisterPayload(null);
            return;
        }

        const data = {
            ...form,
            // гарантируем +995...
            phone: form.phone.startsWith("+") ? form.phone : "+" + form.phone,
            role,
            person_type: personType,
        };

        const payload = {
            ...data,
            accepted_terms: agreeTerms,
            terms_version: TERMS_VERSION,
        };

        // 1) если телефон ещё НЕ подтверждён – сначала шлём SMS и открываем модалку
        if (!phoneVerified) {
            await startPhoneVerificationFlow(payload);
            return;
        }

        // 2) телефон уже подтверждён – сразу регистрация
        await submitRegistration(payload);
    }


    async function startPhoneVerificationFlow(payload) {
        if (!payload?.phone) {
            const phoneRequiredMsg = t("register.verify.error.phoneRequired", "Укажите номер телефона.");
            setErrors((prev) => ({ ...prev, phone: [phoneRequiredMsg] }));
            return;
        }
        setIsPhoneCodeSending(true);
        setPhoneVerifyMsg("");
        setPendingRegisterPayload(payload);
        const sent = await sendPhoneCode(payload.phone);
        setIsPhoneCodeSending(false);
        if (!sent) {
            setPendingRegisterPayload(null);
            return;
        }
        setPhoneCode("");
        setPhoneResendLeft(60);
        setShowPhoneVerify(true);  // <-- показываем модалку ввода кода
    }

    async function sendPhoneCode(phone) {
        try {
            const res = await fetch(api(`/phone/send-code`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, lang: uiLang }),
            });
            if (!res.ok) {
                let detail = await res.text();
                try {
                    const parsed = detail ? JSON.parse(detail) : null;
                    if (parsed && typeof parsed.detail === "string") detail = parsed.detail;
                } catch (_) {
                    // ignore
                }
                throw new Error(detail || "send_failed");
            }
            return true;
        } catch (err) {
            const msg = mapPhoneError(err?.message);
            setPhoneVerifyMsg(msg);
            setErrors((prev) => ({ ...prev, phone: [msg] }));
            return false;
        }
    }

    function mapPhoneError(detail) {
        const generic = t("register.verify.error.codeSendFailed", "Не удалось отправить код. Попробуйте ещё раз.");
        if (!detail) return generic;
        if (detail.includes("cooldown")) return t("register.verify.error.cooldown", "Код уже отправлен. Попробуйте позже.");
        if (detail.includes("sms_failed")) return t("register.verify.error.smsFailed", "Не удалось отправить SMS. Попробуйте позже.");
        if (detail.includes("phone_required")) return t("register.verify.error.phoneRequired", "Укажите номер телефона.");
        return generic;
    }

    const handlePhoneVerifySubmit = async (e) => {
        e.preventDefault();
        if (phoneCode.replace(/\D/g, "").length !== 6) {
            setPhoneVerifyMsg(t("register.verify.error.enterCode", "Введите 6-значный код."));
            return;
        }

        setIsPhoneVerifyLoading(true);
        setPhoneVerifyMsg("");

        try {
            const payload = pendingRegisterPayload;
            if (!payload || !payload.phone) {
                throw new Error("code_not_requested");
            }

            const resp = await fetch(api(`/phone/verify`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: payload.phone,
                    code: phoneCode.trim(),
                }),
                credentials: "include",
            });

            if (!resp.ok) {
                let detail = "";
                try {
                    const data = await resp.json();
                    detail = data?.detail?.message || data?.detail || "";
                } catch (_) {
                    detail = await resp.text().catch(() => "");
                }
                throw new Error(detail || "code_invalid");
            }

            // телефон подтверждён
            setPhoneVerified(true);
            setShowPhoneVerify(false);
            setPhoneVerifyMsg("");

            // сразу продолжаем регистрацию теми же данными
            const payloadCopy = { ...payload };
            setPendingRegisterPayload(null);
            await submitRegistration(payloadCopy);
        } catch (err) {
            const msg = mapPhoneVerifyError(err?.message);
            setPhoneVerifyMsg(msg);
        } finally {
            setIsPhoneVerifyLoading(false);
        }
    };

    function mapPhoneVerifyError(detail) {
        if (!detail) return t("register.verify.error.invalidCode", "Неверный код.");
        if (detail === "code_expired") return t("register.verify.error.phoneCodeExpired", "Срок действия кода истёк. Запросите новый.");
        if (detail === "code_invalid") return t("register.verify.error.invalidCode", "Неверный код.");
        if (detail === "too_many_attempts") return t("register.verify.error.tooManyAttempts", "Слишком много попыток. Попробуйте позже.");
        if (detail === "code_not_requested") return t("register.verify.error.codeNotRequested", "Сначала запросите код.");
        return t("register.verify.error.verifyFailed", "Не удалось подтвердить код.");
    }

    async function handlePhoneResend() {
        if (phoneResendLeft > 0) return;
        const phone = pendingRegisterPayload?.phone || form.phone;
        if (!phone) return;
        const sent = await sendPhoneCode(phone);
        if (sent) {
            setPhoneResendLeft(60);
            setPhoneVerifyMsg("");
        }
    }

    function cancelPhoneVerification() {
        setShowPhoneVerify(false);
        setPhoneCode("");
        setPhoneVerifyMsg("");
        setIsPhoneVerifyLoading(false);
        setPhoneResendLeft(0);
        setPendingRegisterPayload(null);
    }

    async function submitRegistration(payload) {
        setPendingRegisterPayload(null);
        let res, resp;
        try {
            res = await fetch(api(`/register`), {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-ui-lang": uiLang },
                body: JSON.stringify(payload),
            });
        } catch (_) {
            setMsg("Сеть недоступна. Проверьте подключение.");
            return;
        }

        try {
            resp = await res.json();
        } catch (_) {
            resp = {};
        }

        if (res.ok && resp && resp.status === "verification_sent") {
            setEmailForVerify(payload.email || form.email);
            setVerifyCode("");
            setVerifyMsg("");
            setShowVerify(true);
            setResendLeft(60);
            return;
        }


        if (res.ok && resp && resp.status === "ok") {
            // --- Автовход после регистрации ---
            try {
                const loginRes = await fetch(api(`/login`), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: payload.email, password: payload.password }),
                    credentials: "include",
                });
                const loginData = await loginRes.json();
                if (loginRes.ok && loginData && loginData.access_token) {
                    setTokenEverywhere(loginData.access_token);

                    const resUser = await authFetchWithRefresh(api(`/me`));
                    if (!resUser.ok) {
                        setMsg("Регистрация прошла, но вход не выполнен (ошибка профиля).");
                        removeTokenEverywhere();
                        return;
                    }
                    const userInfo = await resUser.json();
                    if (userInfo && userInfo.role) {
                        const userObj = { ...userInfo, token: loginData.access_token };
                        setUserEverywhere(userObj);
                        window.location.href = "/profile";
                        return;
                    } else {
                        setMsg("Регистрация прошла, но вход не выполнен (ошибка профиля).");
                        removeTokenEverywhere();
                    }
                } else {
                    setMsg("Регистрация прошла, но вход не выполнен: " + (loginData?.detail || ""));
                }
            } catch (_) {
                setMsg("Регистрация прошла, но вход не выполнен (ошибка сети).");
            }

            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                if (onSuccess) onSuccess();
            }, 1800);
            return;
        } else {
            // Ошибки от FastAPI
            if (resp && Array.isArray(resp.detail)) {
                mapServerErrors(resp.detail);
                setMsg("");
            } else if (resp && typeof resp.detail === "string") {
                setMsg(resp.detail || "Ошибка регистрации");
            } else {
                setMsg("Ошибка регистрации");
            }
        }
    }


    async function handleVerifySubmit(e) {
        e.preventDefault();
        setVerifyMsg("");
        if (!emailForVerify) {
            setVerifyMsg(t("register.verify.error.unknownEmail", "Неизвестный e-mail для подтверждения."));
            return;
        }
        if (verifyCode.replace(/\D/g, "").length !== 6) {
            setVerifyMsg(t("register.verify.error.enterCode", "Введите 6-значный код."));
            return;
        }
        let r, j;
        try {
            r = await fetch(api(`/verify-email`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailForVerify, code: verifyCode.replace(/\D/g, "") }),
                credentials: "include",
            });
            j = await r.json().catch(() => ({}));
        } catch {
            setVerifyMsg(t("register.verify.error.network", "Сеть недоступна. Попробуйте ещё раз."));
            return;
        }
        if (!r.ok) {
            // Сообщения от бэка: error.verify.codeInvalid | codeExpired | tooManyAttempts | noCode | error.user.notFound
            const d = (j && j.detail) || "Ошибка подтверждения.";
            if (d === "error.verify.codeInvalid") setVerifyMsg(t("register.verify.error.invalidCode", "Неверный код."));
            else if (d === "error.verify.codeExpired") setVerifyMsg(t("register.verify.error.codeExpired", "Срок действия кода истёк."));
            else if (d === "error.verify.tooManyAttempts") setVerifyMsg(t("register.verify.error.tooManyAttemptsLong", "Слишком много попыток. Запросите новый код позже."));
            else if (d === "error.verify.noCode") setVerifyMsg(t("register.verify.error.noCode", "Код не запрошен. Повторите регистрацию или запросите код."));
            else if (d === "error.user.notFound") setVerifyMsg(t("register.verify.error.userNotFound", "Пользователь не найден."));
            else setVerifyMsg(typeof d === "string" ? d : t("register.verify.error.generic", "Ошибка подтверждения."));
            return;
        }

        // Успех — логинимся и закрываем модалку
        try {
            const loginRes = await fetch(api(`/login`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailForVerify, password: form.password }),
                credentials: "include",
            });
            const loginData = await loginRes.json();
            if (loginRes.ok && loginData && loginData.access_token) {
                setTokenEverywhere(loginData.access_token);
                const resUser = await authFetchWithRefresh(api(`/me`));
                if (resUser.ok) {
                    const userInfo = await resUser.json();
                    if (userInfo && userInfo.role) {
                        const userObj = { ...userInfo, token: loginData.access_token };
                        setUserEverywhere(userObj);
                        setShowVerify(false);
                        window.location.href = "/profile";
                        return;
                    }
                }
                // если профиль не подтянули — просто закрываем модалку и показываем сообщение
                setShowVerify(false);
                setVerifyMsg("");
                setMsg("Подтверждение прошло, но вход не завершён — обновите страницу и войдите.");
            } else {
                setShowVerify(false);
                setVerifyMsg("");
                setMsg("E-mail подтверждён. Войдите с указанным паролем.");
            }
        } catch {
            setShowVerify(false);
            setVerifyMsg("");
            setMsg("E-mail подтверждён. Войдите с указанным паролем.");
        }
    }

    async function handleResend() {
        if (!emailForVerify) return;
        if (resendLeft > 0) return;
        try {
            await fetch(api(`/verify-email/resend`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailForVerify }),
                credentials: "include",
            });
            setResendLeft(60);
        } catch {
            // молчим, можно показать тост
        }
    }

    // Общая функция для ввода: объединяем стандартный стиль + подсветка ошибки
    const fieldStyle = (hasError) => ({
        ...withErrorStyles(hasError),
        width: "100%",
    });

    // Динамика для PhoneInput — без конфликта border/borderColor
    const phoneInputStyle = (hasError) => ({
        width: "100%",
        borderRadius: 8,
        borderWidth: 1.5,
        borderStyle: "solid",
        borderColor: hasError ? "#ff6b6b" : "#43c8ff",
        background: "#23242c",
        color: "#8ac6c8",
        fontSize: 16,
        padding: "10px 12px",
        boxShadow: hasError ? "0 0 0 3px rgba(255,107,107,.2)" : "none",
        transition: "border-color .2s, box-shadow .2s",
    });

    return (
        <div
            className="register-form-root"
            style={{
                maxWidth: 420,
                width: "100%",
                background: "rgba(34,36,52,0.94)",
                borderRadius: 18,
                boxShadow: "0 6px 32px 0 rgba(0,0,0,.15)",
                padding: "24px 18px 24px 18px",
                margin: "0 auto",
                position: "relative",
                overflow: "hidden",
                minHeight: 0,
            }}
        >
            {showSuccess && <ModalNotice text="Регистрация успешна!" />}
            <h2
                className="register-form-title"
                style={{ textAlign: "center", fontWeight: 600, marginBottom: 18, fontSize: 27 }}
            >
                {t("auth.register", "Регистрация")}
            </h2>

            <div
                id="field-role"
                className="register-form-rolebtns"
                style={{ marginBottom: 12, flexWrap: "wrap", gap: 8, display: "flex", justifyContent: "center" }}
            >
                {Object.entries(ROLE_LABELS).map(([val, { label, icon }]) => {
                    const isActive = role === val;
                    const isHover = hoveredRole === val;
                    const roleBtnStyle = {
                        fontSize: 15,
                        padding: "8px 20px",
                        borderRadius: 14,
                        border: isActive ? "1px solid rgba(67,200,255,.60)" : "1px solid rgba(67,200,255,.35)",
                        background: isActive ? ACTIVE_BG : (isHover ? COLORS.btnHover : COLORS.btnIdle),
                        color: isActive ? "#ffffff" : COLORS.textIdle,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        boxShadow: isActive
                            ? "0 2px 0 rgba(0,0,0,.25), 0 0 0 3px rgba(67,200,255,.18)"
                            : (isHover ? "0 0 0 3px rgba(67,200,255,.12)" : "none"),
                        transition: "background .15s ease, box-shadow .15s ease, border-color .15s ease, color .15s ease",
                        ...(errors.role.length ? { boxShadow: "0 0 0 3px rgba(255,107,107,.25)" } : null),
                    };
                    return (
                        <button
                            key={val}
                            type="button"
                            onClick={() => handleRole(val)}
                            className={`register-form-rolebtn${isActive ? " active" : ""}`}
                            tabIndex={0}
                            onMouseEnter={() => setHoveredRole(val)}
                            onMouseLeave={() => setHoveredRole(null)}
                            style={roleBtnStyle}
                            aria-invalid={errors.role.length ? "true" : "false"}
                        >
                            {icon} {label}
                        </button>
                    );
                })}
            </div>
            {errors.role.length > 0 && (
                <div style={{ ...errorStyle, textAlign: "center", marginTop: -6, marginBottom: 6 }}>
                    {errors.role[0]}
                </div>
            )}

            {!role && (
                <div style={{ color: "var(--accent)", textAlign: "center", marginBottom: 10 }}>
                    {t("register.chooseRole", "Выберите роль для продолжения")}
                </div>
            )}

            {role && (
                <form noValidate onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div id="field-organization">
                        <input
                            name="organization"
                            placeholder={t("profile.orgName", "Название организации")}
                            value={form.organization}
                            onChange={handleChange}
                            className="register-form-input"
                            style={fieldStyle(!!errors.organization.length)}
                            aria-invalid={errors.organization.length ? "true" : "false"}
                        />
                        {errors.organization.length > 0 && <div style={errorStyle}>{errors.organization[0]}</div>}
                    </div>

                    <div id="field-contact_person">
                        <input
                            name="contact_person"
                            placeholder={t("profile.contactPerson", "Имя, Фамилия")}
                            value={form.contact_person}
                            onChange={handleChange}
                            className="register-form-input"
                            style={fieldStyle(!!errors.contact_person.length)}
                            aria-invalid={errors.contact_person.length ? "true" : "false"}
                        />
                        {errors.contact_person.length > 0 && <div style={errorStyle}>{errors.contact_person[0]}</div>}
                    </div>

                    {(role === "TRANSPORT" || role === "OWNER") && (
                        <div id="field-person_type">
                            <select
                                name="person_type"
                                value={personType}
                                onChange={(e) => handlePersonTypeChange(e.target.value)}
                                className="register-form-input"
                                style={fieldStyle(!!errors.person_type.length)}
                                aria-invalid={errors.person_type.length ? "true" : "false"}
                            >
                                <option value="" disabled hidden>
                                    {t("profile.personType", "Юр. статус")}
                                </option>
                                {/* значения (ЮЛ/ИП/ФЛ) сохраняем для бэка, локализуем только подписи */}
                                <option value="ЮЛ">{t("profile.pt.yl", "Юридическое лицо")}</option>
                                <option value="ИП">{t("profile.pt.ip", "ИП")}</option>
                                <option value="ФЛ">{t("profile.pt.fl", "Физ. лицо")}</option>
                            </select>
                            {errors.person_type.length > 0 && <div style={errorStyle}>{errors.person_type[0]}</div>}
                        </div>
                    )}

                    <div id="field-country">
                        <input
                            name="country"
                            placeholder={t("profile.country", "Страна")}
                            value={form.country}
                            onChange={handleChange}
                            className="register-form-input"
                            style={fieldStyle(!!errors.country.length)}
                            aria-invalid={errors.country.length ? "true" : "false"}
                        />
                        {errors.country.length > 0 && <div style={errorStyle}>{errors.country[0]}</div>}
                    </div>

                    <div id="field-city">
                        <input
                            name="city"
                            placeholder={t("profile.city", "Город")}
                            value={form.city}
                            onChange={handleChange}
                            className="register-form-input"
                            style={fieldStyle(!!errors.city.length)}
                            aria-invalid={errors.city.length ? "true" : "false"}
                        />
                        {errors.city.length > 0 && <div style={errorStyle}>{errors.city[0]}</div>}
                    </div>

                    <div id="field-phone">
                        <PhoneInput
                            country={"ge"}
                            value={form.phone}
                            onChange={(phone) => {
                                setForm((f) => ({ ...f, phone }));
                                setPhoneVerified(false);
                                setPendingRegisterPayload(null);
                                setShowPhoneVerify(false);
                                setPhoneVerifyMsg("");
                                setPhoneCode("");
                                setPhoneResendLeft(0);
                                if (errors.phone.length) setErrors((prev) => ({ ...prev, phone: [] }));
                            }}
                            inputProps={{
                                name: "phone",
                                "aria-invalid": errors.phone.length ? "true" : "false",
                            }}
                            inputStyle={phoneInputStyle(!!errors.phone.length)}
                            containerStyle={{ width: "100%" }}
                        />
                        {errors.phone.length > 0 && <div style={errorStyle}>{errors.phone[0]}</div>}
                    </div>

                    <div id="field-email">
                        <input
                            name="email"
                            type="email"
                            placeholder={t("auth.email", "Email")}
                            value={form.email}
                            onChange={handleChange}
                            className="register-form-input"
                            style={fieldStyle(!!errors.email.length)}
                            aria-invalid={errors.email.length ? "true" : "false"}
                        />
                        {errors.email.length > 0 && <div style={errorStyle}>{errors.email[0]}</div>}
                    </div>

                    {/* Пароль */}
                    <div id="field-password" style={{ position: "relative", width: "100%" }}>
                        <input
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t("auth.password", "Пароль")}
                            value={form.password}
                            onChange={handleChange}
                            className="register-form-input"
                            style={{ ...fieldStyle(!!errors.password.length), paddingRight: 38, width: "100%" }}
                            autoComplete="new-password"
                            aria-invalid={errors.password.length ? "true" : "false"}
                        />
                        {form.password && (
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
                        {errors.password.length > 0 && <div style={errorStyle}>{errors.password[0]}</div>}
                    </div>

                    {/* Подтверждение пароля */}
                    <div id="field-password2" style={{ position: "relative", width: "100%" }}>
                        <input
                            name="password2"
                            type={showPassword2 ? "text" : "password"}
                            placeholder={t("auth.confirmPassword", "Подтвердите пароль")}
                            value={password2}
                            onChange={(e) => {
                                setPassword2(e.target.value);
                                if (errors.password2.length) setErrors((prev) => ({ ...prev, password2: [] }));
                            }}
                            className="register-form-input"
                            style={{ ...fieldStyle(!!errors.password2.length), paddingRight: 38, width: "100%" }}
                            autoComplete="new-password"
                            aria-invalid={errors.password2.length ? "true" : "false"}
                        />
                        {password2 && (
                            <span
                                onClick={() => setShowPassword2((v) => !v)}
                                onMouseOver={() => setEyeHover2(true)}
                                onMouseOut={() => setEyeHover2(false)}
                                style={{
                                    position: "absolute",
                                    right: 14,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    cursor: "pointer",
                                    color: "#222",
                                    opacity: eyeHover2 ? 1 : 0.55,
                                    fontSize: 22,
                                    transition: "opacity 0.15s",
                                    userSelect: "none",
                                }}
                                tabIndex={0}
                                aria-label={showPassword2 ? t("login.hidePassword", "Скрыть пароль") : t("login.showPassword", "Показать пароль")}
                            >
                                {showPassword2 ? <FaEyeSlash /> : <FaEye />}
                            </span>
                        )}
                        {errors.password2.length > 0 && <div style={errorStyle}>{errors.password2[0]}</div>}
                    </div>

                    {/* Согласие с условиями — под формой, над кнопкой */}
                    <div id="field-accepted_terms">
                        <label
                            style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 8,
                                fontSize: 14,
                                lineHeight: "1.3",
                                marginTop: 4,
                                ...(errors.accepted_terms.length ? { padding: "6px 8px", borderRadius: 8, ...withErrorStyles(true) } : null),
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={agreeTerms}
                                onChange={(e) => {
                                    setAgreeTerms(e.target.checked);
                                    if (errors.accepted_terms.length) setErrors((prev) => ({ ...prev, accepted_terms: [] }));
                                }}
                                aria-invalid={errors.accepted_terms.length ? "true" : "false"}
                            />
                            <span>
                                {t("register.acceptPrefix", "Я принимаю условия")}&nbsp;
                                <a href="/legal/terms" target="_blank" rel="noopener noreferrer">
                                    {t("footer.terms", "пользовательского соглашения").toLowerCase()}
                                </a>
                            </span>
                        </label>
                        {errors.accepted_terms.length > 0 && <div style={errorStyle}>{errors.accepted_terms[0]}</div>}
                    </div>

                    <button type="submit" className="register-form-btn" disabled={showSuccess || isPhoneCodeSending}>
                        {t("auth.register", "Регистрация")}
                    </button>

                    {(!!msg || errors.form.length > 0) && !showSuccess && (
                        <div
                            id="field-form-msg"
                            className={`register-form-msg${msg === "Регистрация успешна!" ? " ok" : ""}`}
                            style={{ marginTop: 8 }}
                        >
                            {errors.form.length > 0 && (
                                <ul style={{ paddingLeft: 18, margin: 0 }}>
                                    {errors.form.map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                    ))}
                                </ul>
                            )}
                            {msg && typeof msg === "string" && msg}
                        </div>
                    )}
                </form>
            )}

            {showPhoneVerify && (
                <div
                    onClick={cancelPhoneVerification}
                    style={{
                        position: "fixed",
                        left: 0,
                        top: 0,
                        width: "100vw",
                        height: "100vh",
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2100,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 420,
                            maxWidth: "92vw",
                            background: "rgba(34,36,52,0.98)",
                            borderWidth: 2,
                            borderStyle: "solid",
                            borderColor: "#43c8ff",
                            borderRadius: 16,
                            padding: 20,
                            boxShadow: "0 8px 40px rgba(0,0,0,.3)",
                        }}
                    >
                        <h3 style={{ margin: 0, marginBottom: 8, fontSize: 20 }}>{phoneModalTitle}</h3>
                        <div style={{ opacity: .85, marginBottom: 14 }}>
                            {renderCodeDestination(codeSentTemplate, pendingRegisterPayload?.phone || form.phone)}
                        </div>
                        <form onSubmit={handlePhoneVerifySubmit}>
                            <input
                                inputMode="numeric"
                                autoFocus
                                placeholder={codeInputPlaceholder}
                                value={phoneCode}
                                onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                style={{
                                    width: "100%",
                                    fontSize: 22,
                                    letterSpacing: 4,
                                    textAlign: "center",
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "2px solid #43c8ff",
                                    outline: "none",
                                    background: "rgba(255,255,255,0.04)",
                                    color: "white",
                                }}
                                disabled={isPhoneVerifyLoading}
                            />
                            {phoneVerifyMsg && (
                                <div style={{ color: "#ff7b7b", marginTop: 8 }}>{phoneVerifyMsg}</div>
                            )}
                            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                                <button
                                    type="submit"
                                    disabled={isPhoneVerifyLoading || phoneCode.replace(/\D/g, '').length !== 6}
                                    className="register-submit-btn"
                                    style={{ flex: 1 }}
                                >
                                    {verifySubmitLabel}
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePhoneResend}
                                    disabled={phoneResendLeft > 0 || isPhoneVerifyLoading}
                                    className="register-cancel-btn"
                                    style={{ flex: 1 }}
                                >
                                    {verifyResendLabel}
                                    {phoneResendLeft > 0 ? ` (${phoneResendLeft})` : ''}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={cancelPhoneVerification}
                                className="register-cancel-btn"
                                style={{ marginTop: 10, width: "100%" }}
                            >
                                {verifyCancelLabel}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showVerify && (
                <div
                    onClick={() => setShowVerify(false)}
                    style={{
                        position: "fixed",
                        left: 0,
                        top: 0,
                        width: "100vw",
                        height: "100vh",
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2000,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 420,
                            maxWidth: "92vw",
                            background: "rgba(34,36,52,0.98)",
                            borderWidth: 2,
                            borderStyle: "solid",
                            borderColor: "#43c8ff",
                            borderRadius: 16,
                            padding: 20,
                            boxShadow: "0 8px 40px rgba(0,0,0,.3)",
                        }}
                    >
                        <h3 style={{ margin: 0, marginBottom: 8, fontSize: 20 }}>{emailModalTitle}</h3>
                        <div style={{ opacity: .85, marginBottom: 14 }}>
                            {renderCodeDestination(codeSentTemplate, emailForVerify)}
                        </div>
                        <form onSubmit={handleVerifySubmit}>
                            <input
                                inputMode="numeric"
                                autoFocus
                                placeholder={codeInputPlaceholder}
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                style={{
                                    width: "100%",
                                    fontSize: 22,
                                    letterSpacing: 4,
                                    textAlign: "center",
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "2px solid #43c8ff",
                                    outline: "none",
                                    background: "rgba(255,255,255,0.04)",
                                    color: "white",
                                }}
                            />
                            {verifyMsg && (
                                <div style={{ color: "#ff7b7b", marginTop: 8 }}>{verifyMsg}</div>
                            )}
                            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                                <button
                                    type="submit"
                                    disabled={verifyCode.replace(/\D/g, '').length !== 6}
                                    className="register-submit-btn"
                                    style={{ flex: 1 }}
                                >
                                    {verifySubmitLabel}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={resendLeft > 0}
                                    className="register-cancel-btn"
                                    style={{ flex: 1 }}
                                >
                                    {verifyResendLabel}
                                    {resendLeft > 0 ? ` (${resendLeft})` : ''}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* === ВСТАВЬ СЮДА модалку подтверждения e-mail === */}
            {showVerify && (
                <div
                    onClick={() => setShowVerify(false)}
                    style={{
                        position: "fixed",
                        left: 0,
                        top: 0,
                        width: "100vw",
                        height: "100vh",
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2000,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 420,
                            maxWidth: "92vw",
                            background: "rgba(34,36,52,0.98)",
                            borderWidth: 2,
                            borderStyle: "solid",
                            borderColor: "#43c8ff",
                            borderRadius: 16,
                            padding: 20,
                            boxShadow: "0 8px 40px rgba(0,0,0,.3)",
                        }}
                    >
                        <h3 style={{ margin: 0, marginBottom: 8, fontSize: 20 }}>{emailModalTitle}</h3>
                        <div style={{ opacity: .85, marginBottom: 14 }}>
                            {renderCodeDestination(codeSentTemplate, emailForVerify)}
                        </div>
                        <form onSubmit={handleVerifySubmit}>
                            <input
                                inputMode="numeric"
                                autoFocus
                                placeholder={codeInputPlaceholder}
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                style={{
                                    width: "100%", fontSize: 22, letterSpacing: 4, textAlign: "center",
                                    padding: "10px 12px", borderRadius: 12, border: "2px solid #43c8ff",
                                    outline: "none", background: "rgba(255,255,255,0.04)", color: "white",
                                }}
                            />
                            {verifyMsg && <div style={{ color: "#ff7b7b", marginTop: 8 }}>{verifyMsg}</div>}
                            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                                <button type="submit" disabled={verifyCode.replace(/\D/g, "").length !== 6} className="register-submit-btn" style={{ flex: 1 }}>
                                    {verifySubmitLabel}
                                </button>
                                <button type="button" onClick={handleResend} disabled={resendLeft > 0} className="register-cancel-btn" style={{ flex: 1 }}>
                                    {verifyResendLabel}
                                    {resendLeft > 0 ? ` (${resendLeft})` : ""}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
