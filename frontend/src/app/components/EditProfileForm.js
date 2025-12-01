"use client";
import { useState } from "react";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";

export default function EditProfileForm({ user, onClose, onSave }) {
    const { authFetchWithRefresh } = useUser();
    const { refetchUser } = useUser(); // <--- ВАЖНО!
    const { t } = useLang();
    // Для person_type только если роль TRANSPORT или OWNER
    const PERSON_TYPES = [
        { value: "", label: t("profile.personType", "Юр. статус") },
        { value: "ЮЛ", label: t("profile.pt.yl", "Юридическое лицо") },
        { value: "ИП", label: t("profile.pt.ip", "ИП") },
        { value: "ФЛ", label: t("profile.pt.fl", "Физ. лицо") }
    ];
    const [form, setForm] = useState({
        organization: user.organization || "",
        contact_person: user.contact_person || "",
        person_type: user.person_type || "",
        country: user.country || "",
        city: user.city || "",
        phone: user.phone || "",
        email: user.email || "",
        avatar: user.avatar || "",
        whatsapp: user.whatsapp || user.phone || "",
        viber: user.viber || user.phone || "",
        telegram: user.telegram || "",
    });
    const [avatarPreview, setAvatarPreview] = useState(
        form.avatar ? abs(form.avatar) : "/default-avatar.png"
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const role = user.role || ""; // нужно для логики person_type

    const cardStyle = {
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        borderRadius: 18,
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-soft)",
        padding: "28px 32px",
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        gap: 32,
        minWidth: 0,
        maxWidth: "100%",
    };

    const labelStyle = { color: "var(--text-secondary)", fontWeight: 600 };

    const controlStyle = {
        background: "var(--control-bg)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        padding: "6px 10px",
        marginTop: 4,
        fontSize: 16,
        width: "100%",
    };

    const handleChange = e => {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    };

    const handleAvatarUpload = async (file) => {
        setLoading(true);
        setError("");
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await authFetchWithRefresh(api("/profile/avatar"), {
                method: "POST",
                body: formData,
            });
            if (!res.ok) throw new Error("Ошибка загрузки файла");
            const data = await res.json();
            setForm(f => ({ ...f, avatar: data.avatar }));
            setAvatarPreview(data.avatar ? abs(data.avatar) : "/default-avatar.png");
        } catch (err) {
            setError(t("error.photo.upload", "Ошибка загрузки фото") + ": " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = e => {
        const file = e.target.files?.[0];
        if (file) {
            handleAvatarUpload(file);
        }
    };

    const handleSubmit = async e => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const payload = { ...form };
            const res = await authFetchWithRefresh(api("/profile"), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(t("error.profile.save", "Ошибка сохранения профиля"));

            // !!! Новый код: после успешного PATCH обязательно запрашиваем профиль заново
            const freshRes = await authFetchWithRefresh(api("/me"));
            const updatedUser = await freshRes.json();


            setAvatarPreview(updatedUser.avatar ? abs(updatedUser.avatar) : "/default-avatar.png");
            if (onSave) onSave(updatedUser);
            // при необходимости — подтянуть профиль из контекста:
            try { await refetchUser?.(); } catch { }
        } catch (err) {
            setError(t("error.generic", "Ошибка") + ": " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="editProfileForm"
            onSubmit={handleSubmit}
            style={cardStyle}
        >
            {/* Аватар (изолированный от глобальных стилей) */}
            <div
                className="profile-avatar-edit"
                style={{ background: "transparent", padding: 0, border: "none", boxShadow: "none" }}
            >
                <img
                    src={avatarPreview}
                    alt="avatar"
                    style={{
                        width: 90,
                        height: 90,
                        borderRadius: "50%",
                        display: "block",
                        objectFit: "cover",
                        border: "2px solid var(--border-subtle)"
                    }}
                    onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                />
                <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    style={{ marginTop: 7, color: "var(--text-secondary)", fontSize: 13, width: 140 }}
                    onChange={handleFileChange}
                    disabled={loading}
                />
            </div>

            {/* Форма */}
            <div className="profile-card-info" style={{ flex: 1 }}>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={labelStyle}>{t("profile.orgName", "Название организации")}</label>
                    <input
                        name="organization"
                        value={form.organization}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.orgName", "Название организации")}
                        style={controlStyle}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={labelStyle}>{t("profile.contactPerson", "Имя, Фамилия")}</label>
                    <input
                        name="contact_person"
                        value={form.contact_person}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.contactPerson", "Имя, Фамилия")}
                        style={controlStyle}
                    />
                </div>
                {(role === "TRANSPORT" || role === "OWNER") && (
                    <div className="profile-card-row" style={{ marginBottom: 11 }}>
                        <label style={labelStyle}>
                            {t("profile.personType", "Юр. статус")}
                        </label>
                        <select
                            name="person_type"
                            value={form.person_type}
                            onChange={handleChange}
                            disabled={loading}
                            required
                            style={controlStyle}
                        >
                            {PERSON_TYPES.map(opt => (
                                <option key={opt.value} value={opt.value} disabled={opt.value === ""}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={labelStyle}>{t("profile.country", "Страна")}</label>
                    <input
                        name="country"
                        value={form.country}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.country", "Страна")}
                        style={controlStyle}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={labelStyle}>{t("profile.city", "Город")}</label>
                    <input
                        name="city"
                        value={form.city}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder="Город"
                        style={controlStyle}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={labelStyle}>{t("profile.phone", "Телефон")}</label>
                    <input pattern="\+?[0-9\s\-()]+" autoComplete="tel" inputMode="tel" type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.phone", "Телефон")}
                        style={controlStyle}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={labelStyle}>Email</label>
                    <input autoComplete="email" type="email"
                        name="email"

                        value={form.email}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder="Email"
                        style={controlStyle}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#43d854", fontWeight: 600 }}>WhatsApp</label>
                    <input pattern="\+?[0-9\s\-()]+" autoComplete="tel" inputMode="tel" type="tel"
                        name="whatsapp"
                        value={form.whatsapp}
                        onChange={handleChange}
                        disabled={loading}
                        placeholder="WhatsApp"
                        style={controlStyle}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#7957d5", fontWeight: 600 }}>Viber</label>
                    <input pattern="\+?[0-9\s\-()]+" autoComplete="tel" inputMode="tel" type="tel"
                        name="viber"
                        value={form.viber}
                        onChange={handleChange}
                        disabled={loading}
                        placeholder="Viber"
                        style={controlStyle}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#21a5dd", fontWeight: 600 }}>Telegram</label>
                    <input
                        name="telegram"
                        value={form.telegram}
                        onChange={handleChange}
                        disabled={loading}
                        placeholder={t("profile.telegram", "Telegram (ник или номер)")}
                        style={controlStyle}
                    />
                </div>
                {error && <div style={{ color: "red", margin: "7px 0 10px 0" }}>{error}</div>}
                <div className="profile-actions" style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            background: "#46cfff",
                            color: "#00253e",
                            border: 0,
                            borderRadius: 6,
                            padding: "7px 28px",
                            fontWeight: 700,
                            fontSize: 16,
                            cursor: "pointer",
                        }}
                    >
                        {t("common.save", "Сохранить")}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        style={{
                            background: "var(--control-bg)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 6,
                            padding: "7px 18px",
                            fontWeight: 700,
                            fontSize: 16,
                            cursor: "pointer",
                        }}
                    >
                        {t("common.cancel", "Отмена")}
                    </button>
                </div>
            </div>

            <style jsx>{`
  /* Base adjustments for better touch targets */
  .editProfileForm input,
  .editProfileForm select,
  .editProfileForm textarea,
  .editProfileForm button {
    font-family: inherit;
  }

  /* Сбросим возможные глобальные стили у контейнера аватара на всех брейкпоинтах */
  .editProfileForm .profile-avatar-edit {
    background: transparent;
    box-shadow: none;
    border: 0;
  }

  @media (max-width: 820px) {
    .editProfileForm {
      flex-direction: column !important;
      gap: 16px !important;
      padding: 16px 14px !important;
      border-radius: 14px !important;
    }
    .editProfileForm .profile-avatar-edit {
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      text-align: center !important;
      margin-bottom: 4px !important;
      background: transparent !important;
      box-shadow: none !important;
      border: 0 !important;
    }
    .editProfileForm .profile-avatar-edit img {
      width: 96px !important;
      height: 96px !important;
      border-radius: 50% !important;
      display: block !important;
    }
    .editProfileForm .profile-card-info {
      width: 100% !important;
      max-width: 100% !important;
    }
    .editProfileForm .profile-card-row {
      margin-bottom: 10px !important;
    }
    .editProfileForm .profile-card-row input,
    .editProfileForm .profile-card-row select,
    .editProfileForm .profile-card-row textarea {
      width: 100% !important;
      min-height: 44px !important; /* comfortable touch area */
    }
    /* Sticky action bar for mobile */
    .editProfileForm .profile-actions {
      position: sticky;
      bottom: 0;
      margin-top: 8px;
      padding: 10px 12px;
      background: linear-gradient(180deg, transparent 0%, var(--bg-card) 28%, var(--bg-card) 100%);
      backdrop-filter: blur(6px);
      border-top: 1px solid var(--border-subtle);
      display: flex !important;
      gap: 8px !important;
      justify-content: space-between !important;
      z-index: 2;
    }
    .editProfileForm .profile-actions button {
      flex: 1 1 auto;
      min-height: 44px;
    }
  }
`}</style>

        </form>
    );
}
