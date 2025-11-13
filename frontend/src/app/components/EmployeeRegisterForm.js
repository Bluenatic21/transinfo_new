"use client";
import { useState } from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

export default function EmployeeRegisterForm({ onSuccess }) {
    const [form, setForm] = useState({
        contact_person: "",
        country: "",
        city: "",
        phone: "",
        email: "",
        password: "",
    });
    const [password2, setPassword2] = useState("");
    const [show, setShow] = useState(false);
    const [show2, setShow2] = useState(false);
    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const { t } = useLang();
    function handleChange(e) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setMsg("");
        if (!form.password || !password2) return setMsg(t("register.enterAndConfirmPass", "Введите и подтвердите пароль"));
        if (form.password !== password2) return setMsg(t("register.passwordMismatch", "Пароли не совпадают"));

        const data = {
            contact_person: form.contact_person,
            country: form.country,
            city: form.city,
            phone: form.phone.startsWith("+") ? form.phone : "+" + form.phone,
            email: form.email,
            password: form.password,
            // роль и привязка к менеджеру — на бэке
        };

        try {
            setLoading(true);
            const token = localStorage.getItem("token");
            const res = await fetch(api("/employees"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + token,
                },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(txt || t("employee.register.error", "Ошибка регистрации сотрудника"));
            }
            if (onSuccess) onSuccess();
        } catch (err) {
            setMsg(typeof err?.message === "string" ? err.message : t("error.register", "Ошибка регистрации"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ color: "#e3f2fd", margin: "0 0 8px", fontWeight: 700, fontSize: 18 }}>
                {t("employee.add", "Добавить сотрудника")}
            </h3>

            <input
                name="contact_person"
                placeholder={t("profile.contactPerson", "Имя, Фамилия")}
                value={form.contact_person}
                onChange={handleChange}
                required
                className="register-form-input"
            />

            <input
                name="country"
                placeholder={t("profile.country", "Страна")}
                value={form.country}
                onChange={handleChange}
                required
                className="register-form-input"
            />
            <input
                name="city"
                placeholder={t("profile.city", "Город")}
                value={form.city}
                onChange={handleChange}
                required
                className="register-form-input"
            />

            <PhoneInput
                country={"ge"}
                value={form.phone}
                onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                inputProps={{ name: "phone", required: true }}
                inputStyle={{
                    width: "100%",
                    borderRadius: 8,
                    border: "1.5px solid #43c8ff",
                    background: "#23242c",
                    color: "#8ac6c8",
                    fontSize: 16,
                    padding: "10px 12px",
                }}
                containerStyle={{ width: "100%" }}
            />

            <input
                name="email"
                type="email"
                placeholder={t("auth.email", "Email")}
                value={form.email}
                onChange={handleChange}
                required
                className="register-form-input"
            />

            <div style={{ position: "relative", width: "100%" }}>
                <input
                    name="password"
                    type={show ? "text" : "password"}
                    placeholder={t("auth.password", "Пароль")}
                    value={form.password}
                    onChange={handleChange}
                    required
                    className="register-form-input"
                    style={{ paddingRight: 38, width: "100%" }}
                    autoComplete="new-password"
                />
                <span
                    onClick={() => setShow((v) => !v)}
                    style={{
                        position: "absolute",
                        right: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        cursor: "pointer",
                        opacity: 0.7,
                        fontSize: 14,
                        color: "#9ecbff",
                    }}
                >
                    {show ? t("common.hide", "скрыть") : t("common.show", "показать")}
                </span>
            </div>

            <div style={{ position: "relative", width: "100%" }}>
                <input
                    name="password2"
                    type={show2 ? "text" : "password"}
                    placeholder={t("auth.confirmPassword", "Подтвердите пароль")}
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    required
                    className="register-form-input"
                    style={{ paddingRight: 38, width: "100%" }}
                    autoComplete="new-password"
                />
                <span
                    onClick={() => setShow2((v) => !v)}
                    style={{
                        position: "absolute",
                        right: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        cursor: "pointer",
                        opacity: 0.7,
                        fontSize: 14,
                        color: "#9ecbff",
                    }}
                >
                    {show2 ? t("common.hide", "скрыть") : t("common.show", "показать")}
                </span>
            </div>

            <button type="submit" className="register-form-btn" disabled={loading}>
                {loading ? t("common.creating", "Создание...") : t("employee.create", "Создать сотрудника")}
            </button>

            {msg && (
                <div className="register-form-msg" style={{ marginTop: 6 }}>
                    {msg}
                </div>
            )}
        </form>
    );
}
