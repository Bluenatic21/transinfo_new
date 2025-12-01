"use client";
import React from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api, API_BASE } from "@/config/env";

export default function AdminUsersPage() {
  const { t } = useLang?.() || { t: (_k, f) => f };
  const [items, setItems] = React.useState<any[]>([]);
  const [page, setPage] = React.useState(0);
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("");
  const [isActive, setIsActive] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // список user_id активных SupportAgent
  const [agents, setAgents] = React.useState<Set<number>>(new Set());
  const [agentsLoading, setAgentsLoading] = React.useState(false);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const isInitialLoading = loading && items.length === 0;

  const load = React.useCallback(
    async ({ append = false }: { append?: boolean } = {}) => {
      const limit = 50;
      const nextPage = append ? page + 1 : 0;

      setLoading(true);
      setErr(null);
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (role) params.set("role", role);
      if (isActive)
        params.set("is_active", isActive === "true" ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(nextPage * limit));

      try {
        const r = await fetch(api(`/admin/users?${params.toString()}`), {
          headers: { Authorization: `Bearer ${token || ""}` },
          cache: "no-store",
        });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        setHasMore((data || []).length === limit);
        setPage(nextPage);
        setItems((prev) => (append ? [...prev, ...data] : data));
      } catch (e: any) {
        setErr(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    },
    [isActive, page, q, role, token]
  );

  const loadAgents = React.useCallback(() => {
    setAgentsLoading(true);
    fetch(api(`/support/agents`), {
      headers: { Authorization: `Bearer ${token || ""}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const activeIds = new Set<number>(
          (rows || [])
            .filter((a: any) => a?.is_active)
            .map((a: any) => a.user_id)
        );
        setAgents(activeIds);
      })
      .catch(() => { })
      .finally(() => setAgentsLoading(false));
  }, [token]);

  React.useEffect(() => {
    load();
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchUser = async (id: number, data: any) => {
    const r = await fetch(api(`/admin/users/${id}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(await r.text());
  };

  const onToggleActive = async (u: any) => {
    await patchUser(u.id, { is_active: !u.is_active });
    load();
  };

  const deleteUser = async (u: any) => {
    if (!confirm(t("admin.users.deleteConfirm", "Удалить аккаунт?") || ""))
      return;
    const r = await fetch(api(`/admin/users/${u.id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token || ""}` },
    });
    if (!r.ok) {
      alert(await r.text());
      return;
    }
    load();
    loadAgents();
  };

  const onChangeRole = async (u: any, newRole: string) => {
    await patchUser(u.id, { role: newRole });
    load();
    // если переключили в SUPPORT или из SUPPORT — обновим список агентов для корреляции статусов
    loadAgents();
  };

  const enableSupport = async (u: any) => {
    await fetch(api(`/support/agents/${u.id}/enable`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token || ""}` },
    });
    loadAgents();
  };

  const disableSupport = async (u: any) => {
    await fetch(api(`/support/agents/${u.id}/disable`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token || ""}` },
    });
    loadAgents();
  };

  return (
    <div className="space-y-4 text-[color:var(--text-primary)]">
      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col">
          <label className="text-sm text-[color:var(--text-secondary)]">
            {t("admin.common.search", "Поиск")}
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.users.search.ph", "e-mail или имя")}
            className="border border-[color:var(--border-subtle)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] rounded-xl px-3 py-2 shadow-[var(--shadow-soft)]"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-[color:var(--text-secondary)]">
            {t("admin.common.role", "Роль")}
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border border-[color:var(--border-subtle)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] rounded-xl px-3 py-2 shadow-[var(--shadow-soft)]"
          >
            <option value="">Все</option>
            <option value="EMPLOYEE">EMPLOYEE</option>
            <option value="MANAGER">MANAGER</option>
            <option value="OWNER">OWNER</option>
            <option value="TRANSPORT">TRANSPORT</option>
            <option value="SUPPORT">SUPPORT</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-[color:var(--text-secondary)]">
            {t("admin.common.active.m", "Активен")}
          </label>
          <select
            value={isActive}
            onChange={(e) => setIsActive(e.target.value)}
            className="border border-[color:var(--border-subtle)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] rounded-xl px-3 py-2 shadow-[var(--shadow-soft)]"
          >
            <option value="">{t("admin.common.all", "Все")}</option>
            <option value="true">{t("common.yes", "Да")}</option>
            <option value="false">{t("common.no", "Нет")}</option>
          </select>
        </div>
        <button
          onClick={() => {
            load();
            loadAgents();
          }}
          className="px-4 py-2 rounded-xl shadow bg-blue-600 hover:bg-blue-500 text-white"
        >
          {t("admin.common.filter", "Фильтровать")}
        </button>
      </div>

      {err && (
        <div className="text-red-600">
          {t("admin.common.error", "Ошибка")}: {err}
        </div>
      )}
      {isInitialLoading ? (
        <div>{t("common.loading", "Загрузка...")}</div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-auto rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] shadow-[var(--shadow-soft)]">
            <table className="min-w-full text-sm text-[color:var(--text-primary)]">
              <thead className="bg-[color:var(--bg-card-soft)] text-[color:var(--text-secondary)]">
                <tr>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">E-mail</th>
                  <th className="text-left p-3">
                    {t("admin.common.name", "Имя")}
                  </th>
                  <th className="text-left p-3">
                    {t("admin.common.role", "Роль")}
                  </th>
                  <th className="text-left p-3">
                    {t("admin.users.support", "Поддержка")}
                  </th>
                  <th className="text-left p-3">
                    {t("admin.common.active.m", "Активен")}
                  </th>
                  <th className="text-left p-3">
                    {t("admin.common.actions", "Действия")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => {
                  const isSupport =
                    (u.role || "").toString().toUpperCase() === "SUPPORT";
                  const isAgentActive = agents.has(u.id);
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--control-bg-hover)] transition"
                    >
                      <td className="p-3">{u.id}</td>
                      <td className="p-3">{u.email}</td>
                      <td className="p-3">{u.name}</td>
                      <td className="p-3">
                        <select
                          value={(u.role || "").toUpperCase()}
                          onChange={(e) => onChangeRole(u, e.target.value)}
                          className="border border-[color:var(--border-subtle)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] rounded-lg px-2 py-1 shadow-[var(--shadow-soft)]"
                        >
                          {[
                            "EMPLOYEE",
                            "MANAGER",
                            "OWNER",
                            "TRANSPORT",
                            "SUPPORT",
                            "ADMIN",
                          ].map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3">
                        {!isSupport ? (
                          <span className="text-[color:var(--text-secondary)]">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 rounded-lg ${isAgentActive
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300"
                                }`}
                            >
                              {agentsLoading
                                ? "..."
                                : isAgentActive
                                  ? t("admin.users.supportActive", "Активен")
                                  : t("admin.users.supportOff", "Выключен")}
                            </span>
                            {isAgentActive ? (
                              <button
                                onClick={() => disableSupport(u)}
                                className="px-3 py-1 rounded-lg border border-[color:var(--border-subtle)] hover:bg-[color:var(--control-bg-hover)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                              >
                                {t("admin.users.supportDisable", "Выключить")}
                              </button>
                            ) : (
                              <button
                                onClick={() => enableSupport(u)}
                                className="px-3 py-1 rounded-lg border border-[color:var(--border-subtle)] hover:bg-[color:var(--control-bg-hover)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                              >
                                {t("admin.users.supportEnable", "Включить")}
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-lg ${u.is_active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300"
                            }`}
                        >
                          {u.is_active
                            ? t("common.yes", "Да")
                            : t("common.no", "Нет")}
                        </span>
                      </td>

                      <td className="p-3">
                        <button
                          onClick={() => onToggleActive(u)}
                          className="px-3 py-1 rounded-lg border border-[color:var(--border-subtle)] hover:bg-[color:var(--control-bg-hover)] bg-[color:var(--control-bg)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                        >
                          {u.is_active
                            ? t("admin.users.block", "Заблокировать")
                            : t("admin.users.unblock", "Разблокировать")}
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          className="px-3 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-800/40 ml-2"
                        >
                          {t("admin.users.delete", "Удалить")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[color:var(--text-secondary)]">
                      {t("admin.common.nothing", "Ничего не найдено")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => load({ append: true })}
                disabled={loading}
                className="px-4 py-2 rounded-xl shadow bg-[color:var(--control-bg)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] hover:bg-[color:var(--control-bg-hover)] disabled:opacity-60"
              >
                {loading
                  ? t("common.loading", "Загрузка...")
                  : t("admin.users.loadMore", "Показать ещё")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
