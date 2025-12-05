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
            style={{
                background: "#172135",
                borderRadius: 18,
                boxShadow: "0 2px 8px rgba(60,130,255,0.08)",
                padding: "28px 32px",
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: 32,
                minWidth: 0,
                maxWidth: "100%",
            }}
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
                        border: "2px solid #233655"
                    }}
                    onError={e => { e.currentTarget.src = "/default-avatar.png"; }}
                />
                <input
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    style={{ marginTop: 7, color: "#b3d5fa", fontSize: 13, width: 140 }}
                    onChange={handleFileChange}
                    disabled={loading}
                />
            </div>

            {/* Форма */}
            <div className="profile-card-info" style={{ flex: 1 }}>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#b3d5fa", fontWeight: 600 }}>{t("profile.orgName", "Название организации")}</label>
                    <input
                        name="organization"
                        value={form.organization}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.orgName", "Название организации")}
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#b3d5fa", fontWeight: 600 }}>{t("profile.contactPerson", "Имя, Фамилия")}</label>
                    <input
                        name="contact_person"
                        value={form.contact_person}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.contactPerson", "Имя, Фамилия")}
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
                    />
                </div>
                {(role === "TRANSPORT" || role === "OWNER") && (
                    <div className="profile-card-row" style={{ marginBottom: 11 }}>
                        <label style={{ color: "#b3d5fa", fontWeight: 600 }}>
                            {t("profile.personType", "Юр. статус")}
                        </label>
                        <select
                            name="person_type"
                            value={form.person_type}
                            onChange={handleChange}
                            disabled={loading}
                            required
                            style={{
                                background: "#19263e",
                                color: "#e3f2fd",
                                border: "1px solid #233655",
                                borderRadius: 8,
                                padding: "6px 10px",
                                marginTop: 4,
                                fontSize: 16,
                                width: "100%",
                            }}
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
                    <label style={{ color: "#b3d5fa", fontWeight: 600 }}>{t("profile.country", "Страна")}</label>
                    <input
                        name="country"
                        value={form.country}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.country", "Страна")}
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#b3d5fa", fontWeight: 600 }}>{t("profile.city", "Город")}</label>
                    <input
                        name="city"
                        value={form.city}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder="Город"
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#b3d5fa", fontWeight: 600 }}>{t("profile.phone", "Телефон")}</label>
                    <input pattern="\+?[0-9\s\-()]+" autoComplete="tel" inputMode="tel" type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder={t("profile.phone", "Телефон")}
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
                    />
                </div>
                <div className="profile-card-row" style={{ marginBottom: 11 }}>
                    <label style={{ color: "#b3d5fa", fontWeight: 600 }}>Email</label>
                    <input autoComplete="email" type="email"
                        name="email"

                        value={form.email}
                        onChange={handleChange}
                        disabled={loading}
                        required
                        placeholder="Email"
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
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
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
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
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
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
                        style={{
                            background: "#19263e",
                            color: "#e3f2fd",
                            border: "1px solid #233655",
                            borderRadius: 8,
                            padding: "6px 10px",
                            marginTop: 4,
                            fontSize: 16,
                            width: "100%",
                        }}
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
                            background: "none",
                            color: "#b3d5fa",
                            border: "1px solid #284273",
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
      background: linear-gradient(180deg, rgba(23,33,53,0.0) 0%, rgba(23,33,53,0.95) 24%);
      backdrop-filter: blur(6px);
      border-top: 1px solid #223554;
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
