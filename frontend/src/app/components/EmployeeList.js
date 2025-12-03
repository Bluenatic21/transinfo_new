"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { FiSearch, FiUserPlus } from "react-icons/fi";
import { useLang } from "../i18n/LangProvider";
import { API_BASE, api, abs } from "@/config/env";
import { useTheme } from "../providers/ThemeProvider";

// Базовые адреса централизованы в "@/config/env"

const PAGE_SIZE = 30; // безопасная пачка

export default function EmployeeList({
    canManage = true,
    reloadSignal = 0,
    onCreateNew, // откроет EmployeeRegisterModal из страницы профиля␊
}) {
    const [loading, setLoading] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const { t } = useLang();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";
    const palette = {
        containerBg: isLight ? "var(--bg-card)" : "#182033",
        containerBorder: isLight ? "1px solid var(--border-subtle)" : "1px solid #233a5a",
        containerText: isLight ? "var(--text-primary)" : "#e3f2fd",
        badgeBg: isLight ? "var(--control-bg-hover)" : "#182b4a",
        badgeBorder: isLight ? "1px solid var(--border-subtle)" : "1px solid #2a3e65",
        badgeText: isLight ? "var(--text-secondary)" : "#9cc4e7",
        addButtonBg: isLight ? "#e8f1ff" : "#20325a",
        addButtonIcon: isLight ? "#1d4ed8" : "#43c8ff",
        searchIcon: isLight ? "#64748b" : "#9cc4e7",
        searchBg: isLight ? "var(--input)" : "#0f1a2b",
        searchBorder: isLight ? "1px solid var(--border-subtle)" : "1px solid #233a5a",
        searchText: isLight ? "var(--text-primary)" : "#e3f2fd",
        infoText: isLight ? "var(--text-secondary)" : "#9cc4e7",
        errorText: isLight ? "#dc2626" : "#ff9ea6",
        cardBg: isLight ? "var(--bg-card)" : "#121a2b",
        cardBorder: isLight ? "1px solid var(--border-subtle)" : "1px solid #233a5a",
        cardShadowHover: isLight ? "0 10px 28px rgba(15, 23, 42, 0.08)" : "0 6px 18px rgba(0,0,0,.2)",
        avatarBorder: isLight ? "1.6px solid #d7deea" : "1.6px solid #223350",
        avatarBg: isLight ? "var(--avatar-contrast-bg)" : "#182337",
        nameColor: isLight ? "var(--text-primary)" : "#e3f2fd",
        roleBg: isLight ? "var(--control-bg)" : "#182b4a",
        roleBorder: isLight ? "1px solid var(--border-subtle)" : "1px solid #2a3e65",
        roleText: isLight ? "var(--text-secondary)" : "#9cc4e7",
        emailColor: isLight ? "var(--text-secondary)" : "#cfe9ff",
        phoneColor: isLight ? "var(--text-muted)" : "#9cc4e7",
        editBtnBg: isLight ? "var(--control-bg)" : "#192a4a",
        editBtnBorder: isLight ? "1px solid var(--border-subtle)" : "1px solid #2a3e65",
        editBtnText: isLight ? "var(--text-secondary)" : "#9cc4e7",
        deleteBtnBg: "#db2344",
        deleteBtnText: "#fff",
        showMoreColor: isLight ? "#2563eb" : "#90caf9",
        showMoreBorder: isLight ? "1px solid #2563eb" : "1px solid #90caf9",
    };

    const [offset, setOffset] = useState(0);
    const [eof, setEof] = useState(false);
    const [totalCount, setTotalCount] = useState(null);
    const sentinelRef = useRef(null);
    const firstLoadRef = useRef(false);

    // --- EDIT MODAL ---
    const [editOpen, setEditOpen] = useState(false);
    const emptyDraft = {
        id: null,
        display_name: "",
        email: "",
        phone: "",
        role: "EMPLOYEE",
    };
    const [draft, setDraft] = useState(emptyDraft);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    // --- mobile flag (<=640px) — используется ниже в стилях
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(max-width: 640px)");
        const onChange = () => setIsMobile(mq.matches);
        onChange(); // первичная инициализация
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    const roleToRu = (role) => {
        const map = {
            ADMIN: t("role.admin", "Админ"),
            TRANSPORT: t("role.transport", "Перевозчик"),
            OWNER: t("role.owner", "Грузовладелец"),
            MANAGER: t("role.manager", "Экспедитор"),
            EMPLOYEE: t("role.employee", "Экспедитор"),
        };
        return map[(role || "").toString().toUpperCase()] || role || "—";
    };

    // имя/лейбл как в MiniUserCard: company/organization > name > first+last > contact_person > username > email
    const getDisplayName = (u) =>
        u?.company ||
        u?.organization ||
        u?.name ||
        `${u?.first_name || ""} ${u?.last_name || ""}`.trim() ||
        u?.contact_person ||
        u?.username ||
        u?.email ||
        t("employee.noName", "Без имени")

    // аватар как в MiniUserCard: абсолютный или с префиксом API
    const getAvatarSrc = (u) => {
        const avatarPath = u?.avatar_url || u?.avatar || null;
        if (!avatarPath) return "/default-avatar.png";
        return abs(avatarPath);
    };

    // --- helpers: ключ сотрудника и дедупликация
    const employeeKey = (u) =>
        String(
            u?.id ??
            u?.user_id ??
            u?.employee_id ??
            u?.email ??
            u?.phone ?? u?.tel ?? u?.phone_number ?? ""
        );

    const dedupeById = (arr) => {
        const seen = new Set();
        const out = [];
        for (const e of arr) {
            const k = employeeKey(e);
            if (k && seen.has(k)) continue;
            if (k) seen.add(k);
            out.push(e);
        }
        return out;
    };

    async function loadPage(reset = false) {
        if (loading) return;
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("token");
            const off = reset ? 0 : offset;
            const url = api(`/employees?limit=${PAGE_SIZE}&offset=${off}`);
            console.debug("[EmployeeList] GET", url);
            const res = await fetch(url, {
                headers: { Authorization: "Bearer " + token },
            });
            if (!res.ok) throw new Error(await res.text());

            // читаем тело
            const data = await res.json();
            const page = Array.isArray(data) ? data : [];

            // читаем тотал (если открыт в CORS expose, иначе просто будет null)
            const total = res.headers.get("X-Total-Count");
            if (total !== null) setTotalCount(Number(total));

            if (reset) {
                const unique = dedupeById(page);
                setEmployees(unique);
                setOffset(unique.length);
                setEof(unique.length < PAGE_SIZE);
            } else {
                setEmployees(prev => {
                    const merged = dedupeById([...prev, ...page]);
                    return merged;
                });
                // offset ведём по серверной пагинации (как раньше)
                setOffset(off + page.length);
                if (page.length < PAGE_SIZE) setEof(true);
            }
        } catch (e) {
            console.error(e);
            setError(typeof e?.message === "string" ? e.message : t("error.load", "Ошибка загрузки"));
            if (reset) setEmployees([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!firstLoadRef.current) {
            firstLoadRef.current = true;
            loadPage(true);
        }
    }, []);

    useEffect(() => {
        if (reloadSignal) {
            setEof(false);
            loadPage(true);
        }
    }, [reloadSignal]);

    useEffect(() => {
        if (!sentinelRef.current) return;
        const el = sentinelRef.current;
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !loading && !eof) {
                    loadPage(false);
                }
            });
        }, { rootMargin: "200px" });
        io.observe(el);
        return () => io.disconnect();
    }, [loading, eof]);

    // -------- edit
    const openEdit = (emp) => {
        setDraft({
            id: emp.id,
            display_name: getDisplayName(emp),
            email: emp?.email || "",
            phone: emp?.phone || emp?.tel || emp?.phone_number || "",
            role: emp?.role || "EMPLOYEE",
        });
        setSaveError("");
        setEditOpen(true);
    };
    const closeEdit = () => {
        setEditOpen(false);
        setSaving(false);
        setSaveError("");
        setDraft(emptyDraft);
    };
    const saveEdit = async () => {
        if (!draft.id) return;
        if (!draft.email?.trim()) {
            setSaveError(t("employee.emailRequired", "Email обязателен."));
            return;
        }
        setSaving(true);
        setSaveError("");
        try {
            const token = localStorage.getItem("token");
            const body = {
                email: draft.email.trim(),
                phone: draft.phone?.trim() || "",
                role: draft.role || "EMPLOYEE",
                contact_person: draft.display_name?.trim() || "",
                name: draft.display_name?.trim() || "",
            };
            const res = await fetch(api(`/employees/${draft.id}`), {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + token,
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                let msg = "";
                try { msg = await res.text(); } catch { }
                throw new Error(msg || t("error.save", "Ошибка сохранения"));
            }
            const updated = await res.json();
            const merged = {
                ...updated,
                contact_person:
                    updated?.contact_person || updated?.name || body.contact_person,
                phone: updated?.phone ?? body.phone,
                role: updated?.role ?? body.role,
                email: updated?.email ?? body.email,
            };
            setEmployees((prev) => prev.map((e) => (e.id === draft.id ? { ...e, ...merged } : e)));
            closeEdit();
        } catch (e) {
            console.error(e);
            setSaveError(typeof e?.message === "string" ? e.message : t("error.save", "Ошибка сохранения"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            style={{
                background: palette.containerBg,
                borderRadius: 18,
                padding: 16,
                border: palette.containerBorder,
                color: palette.containerText,
                boxShadow: isLight ? "0 12px 28px rgba(15, 23, 42, 0.06)" : "none",
            }}
        >
            {/* header */}
            <div
                style={{
                    display: "flex",
                    flexDirection: isMobile ? "column" : "row",
                    alignItems: isMobile ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: isMobile ? 8 : 0,
                    marginBottom: isMobile ? 10 : 14,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 800,
                        color: palette.containerText,
                        fontSize: 18,
                    }}
                >
                    <span>{t("employees.accountTitle", "Сотрудники аккаунта")}</span>
                    <span
                        style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                            background: palette.badgeBg,
                            border: palette.badgeBorder,
                            color: palette.badgeText,
                            lineHeight: 1.4,
                        }}
                        title={`${t("employees.count", "Кол-во сотрудников")}: ${totalCount ?? employees.length}`}
                    >
                        {totalCount ?? employees.length}
                    </span>
                </div>

                {/* Right controls: Add icon + Search */}
                <div style={{ marginLeft: isMobile ? 0 : "auto", display: "inline-flex", alignItems: "center", gap: 8, width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "space-between" : "initial" }}>
                    {canManage && (
                        <button
                            onClick={onCreateNew}
                            title={t("employee.add", "Добавить сотрудника")}
                            aria-label={t("employee.add", "Добавить сотрудника")}
                            style={{
                                width: 38,
                                height: 34,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 9,
                                border: "none",
                                background: palette.addButtonBg,
                                cursor: "pointer"
                            }}
                        >
                            <FiUserPlus size={18} color={palette.addButtonIcon} />
                        </button>
                    )}
                    <div style={{ position: "relative", display: isMobile ? "block" : "inline-flex", width: isMobile ? "100%" : 380, maxWidth: isMobile ? "100%" : "36vw" }}>
                        <FiSearch size={18} color={palette.searchIcon}
                            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t("employees.searchPlaceholder", "Поиск: имя, email, телефон, роль")}
                            style={{
                                padding: "10px 12px 10px 34px",
                                background: palette.searchBg,
                                border: palette.searchBorder,
                                borderRadius: 10,
                                color: palette.searchText,
                                fontSize: 14,
                                outline: "none",
                                width: "100%",
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* list area */}
            {loading && <div style={{ padding: 12, color: palette.infoText }}>{t("common.loading", "Загрузка...")}</div>}
            {!loading && error && (
                <div style={{ padding: 12, color: palette.errorText }}>{error}</div>
            )}
            {!loading && !error && employees.length === 0 && (
                <div style={{ padding: 12, color: palette.infoText }}>{t("employees.empty", "Пока нет сотрудников.")}</div>
            )}

            {/* WIDE one-per-row cards */}
            {!loading && !error && employees.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
                    {employees
                        .filter((emp) => {
                            const hay = [
                                getDisplayName(emp),
                                emp?.email,
                                emp?.phone || emp?.tel || emp?.phone_number,
                                roleToRu(emp?.role),
                                emp?.role
                            ].filter(Boolean).join(" ").toLowerCase();
                            const q = (query || "").toLowerCase().trim();
                            return !q || hay.includes(q);
                        })
                        .map((emp, i) => {
                            const name = getDisplayName(emp);

                            const email = emp?.email || "—";
                            const roleRu = roleToRu(emp?.role);
                            const phone = emp?.phone || emp?.tel || emp?.phone_number || "";
                            const avatarSrc = getAvatarSrc(emp);

                            return (
                                <div
                                    key={`emp-${employeeKey(emp) || i}`}
                                    style={{
                                        width: "100%",
                                        background: palette.cardBg,
                                        border: palette.cardBorder,
                                        borderRadius: 16,
                                        padding: 14,
                                        display: "flex",
                                        gap: 14,
                                        alignItems: isMobile ? "stretch" : "center",
                                        transition: "transform .08s ease, box-shadow .08s ease",
                                        boxShadow: "0 0 0 rgba(0,0,0,0)",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = "translateY(-2px)";
                                        e.currentTarget.style.boxShadow = palette.cardShadowHover;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = "translateY(0)";
                                        e.currentTarget.style.boxShadow = "0 0 0 rgba(0,0,0,0)";
                                    }}
                                >
                                    {/* clickable info (avatar + text) -> profile/{id} */}
                                    <Link
                                        href={`/profile/${emp.id}`}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 14,
                                            textDecoration: "none",
                                            color: "inherit",
                                            flex: 1,
                                            minWidth: 0,
                                            cursor: "pointer",
                                        }}
                                    >
                                        <img
                                            src={avatarSrc}
                                            alt={name}
                                            width={64}
                                            height={64}
                                            style={{
                                                width: 64,
                                                height: 64,
                                                borderRadius: 10,
                                                objectFit: "cover",
                                                border: palette.avatarBorder,
                                                background: palette.avatarBg,
                                                display: "block",
                                                flexShrink: 0,
                                            }}
                                            onError={(e) => { e.currentTarget.src = "/default-avatar.png"; }}
                                        />

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    marginBottom: 4,
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        color: palette.nameColor,
                                                        fontWeight: 800,
                                                        fontSize: 16,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        maxWidth: "100%",
                                                    }}
                                                    title={name}
                                                >
                                                    {name}
                                                </div>

                                                <span
                                                    title={emp?.role}
                                                    style={{
                                                        marginLeft: "auto",
                                                        fontSize: 12,
                                                        fontWeight: 800,
                                                        padding: "4px 8px",
                                                        borderRadius: 999,
                                                        background: palette.roleBg,
                                                        border: palette.roleBorder,
                                                        color: palette.roleText,
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {roleRu}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    color: palette.emailColor,
                                                    fontSize: 13,
                                                    lineHeight: 1.35,
                                                    marginBottom: 2,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                                title={email}
                                            >
                                                {email}
                                            </div>

                                            {phone && (
                                                <div
                                                    style={{
                                                        color: palette.phoneColor,
                                                        fontSize: 12.5,
                                                        opacity: isLight ? 1 : 0.9,
                                                        marginTop: 2,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                    }}
                                                    title={phone}
                                                >
                                                    {phone}
                                                </div>
                                            )}
                                        </div>
                                    </Link>

                                    {/* actions (не кликают в профиль) */}
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            flexWrap: isMobile ? "nowrap" : "wrap",
                                            flexDirection: isMobile ? "column" : "row",
                                            justifyContent: isMobile ? "space-between" : "initial",
                                            alignItems: isMobile ? "stretch" : "center",
                                            height: isMobile ? "100%" : "auto",
                                            minWidth: isMobile ? 120 : "auto",
                                        }}
                                    >
                                        {canManage && (
                                            <button
                                                onClick={() => openEdit(emp)}
                                                style={{
                                                    padding: "8px 12px",
                                                    borderRadius: 8,
                                                    border: palette.editBtnBorder,
                                                    background: palette.editBtnBg,
                                                    color: palette.editBtnText,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    whiteSpace: "nowrap",
                                                    width: isMobile ? "100%" : "auto",
                                                }}
                                            >
                                                {t("common.edit", "Редактировать")}
                                            </button>
                                        )}

                                        {canManage ? (
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(t("employees.excludeConfirm", "Исключить сотрудника из аккаунта?"))) return;
                                                    try {
                                                        const token = localStorage.getItem("token");
                                                        const res = await fetch(api(`/employees/${emp.id}`), {
                                                            method: "DELETE",
                                                            headers: { Authorization: "Bearer " + token },
                                                        });
                                                        if (!res.ok) throw new Error(await res.text());
                                                        setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
                                                    } catch (e) {
                                                        alert(typeof e?.message === "string" ? e.message : t("error.delete", "Ошибка удаления"));
                                                    }
                                                }}
                                                style={{
                                                    padding: "8px 12px",
                                                    borderRadius: 8,
                                                    border: "none",
                                                    background: palette.deleteBtnBg,
                                                    color: palette.deleteBtnText,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {t("employees.exclude", "Исключить")}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                </div>
            )}

            {/* Прогресс + Показать ещё + сенсор */}
            {loading && employees.length > 0 && (
                <div style={{ padding: 12, color: palette.infoText, textAlign: "center" }}>
                    {t("common.loading", "Загрузка…")}
                </div>
            )}
            {!eof && !loading && employees.length > 0 && (
                <button
                    onClick={() => loadPage(false)}
                    style={{
                        display: "block",
                        background: "transparent",
                        color: palette.showMoreColor,
                        border: palette.showMoreBorder,
                        borderRadius: 12,
                        padding: "8px 12px",
                        cursor: "pointer",
                        margin: "8px auto 0", // по центру даже вне flex-контейнера
                    }}
                >
                    {t("common.showMore", "Показать ещё")}
                </button>
            )}
            <div ref={sentinelRef} style={{ height: 1 }} />

            {/* EDIT MODAL */}
            {editOpen && (
                <Modal title={t("employee.editTitle", "Редактирование сотрудника")} onClose={closeEdit}>
                    <div style={{ display: "grid", gap: 10 }}>
                        <LabeledInput
                            label={t("employee.nameOrContact", "Имя / Контактное лицо")}
                            value={draft.display_name}
                            onChange={(v) => setDraft((d) => ({ ...d, display_name: v }))}
                            placeholder={t("employee.namePlaceholder", "Например, Иван Иванов")}
                        />
                        <LabeledInput
                            label={t("employee.emailLabel", "Email *")}
                            value={draft.email}
                            onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
                            placeholder={t("employee.emailPlaceholder", "name@example.com")}
                            type="email"
                        />
                        <LabeledInput
                            label={t("employee.phone", "Телефон")}
                            value={draft.phone}
                            onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
                            placeholder={t("employee.phonePlaceholder", "+995 5xx xxx xxx")}
                        />
                        <LabeledSelect
                            label={t("employee.role", "Роль")}
                            value={draft.role}
                            onChange={(v) => setDraft((d) => ({ ...d, role: v }))}
                            options={[
                                { value: "EMPLOYEE", label: t("role.employee.full", "Экспедитор (Сотрудник)") },
                                { value: "MANAGER", label: t("role.manager.full", "Экспедитор (Менеджер)") },
                            ]}
                        />
                    </div>

                    {saveError && <div style={{ color: palette.errorText, marginTop: 10 }}>{saveError}</div>}

                    <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                        <Button ghost onClick={closeEdit} disabled={saving}>{t("common.cancel", "Отмена")}</Button>
                        <Button primary onClick={saveEdit} disabled={saving}>
                            {saving ? t("common.saving", "Сохранение…") : t("common.save", "Сохранить")}
                        </Button>
                    </div>
                </Modal>
            )}
        </div>
    );
}

/* --------- UI helpers --------- */
function Modal({ title, children, onClose }) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                style={{
                    width: "min(820px, 96vw)",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 16,
                    padding: 16,
                    boxShadow: "var(--shadow-soft)",
                    color: "var(--text-primary)",
                }}
            >
                <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: 18, marginBottom: 12 }}>
                    {title}
                </div>
                {children}
            </div>
        </div>
    );
}

function Button({ children, primary, ghost, ...props }) {
    const base = {
        padding: "8px 12px",
        borderRadius: 9,
        fontWeight: 800,
        cursor: "pointer",
    };
    const styles = primary
        ? { ...base, border: "none", background: "#2f7ce3", color: "white" }
        : ghost
            ? { ...base, border: "1px solid var(--border-subtle)", background: "var(--control-bg)", color: "var(--text-secondary)" }
            : base;
    return (
        <button {...props} style={styles}>
            {children}
        </button>
    );
}

function LabeledInput({ label, value, onChange, placeholder = "", type = "text" }) {
    return (
        <label style={{ display: "grid", gap: 6 }}>␊
            <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 700 }}>{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    background: "var(--input)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    outline: "none",
                }}
            />
        </label>
    );
}

function LabeledSelect({ label, value, onChange, options = [] }) {
    return (
        <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 700 }}>{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    background: "var(--input)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    color: "var(--text-primary)",
                    outline: "none",
                }}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
