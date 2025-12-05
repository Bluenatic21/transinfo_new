"use client";

// Кнопка «Поддержка»: создаёт/возвращает тикет и открывает чат.
// Не зависит от UserContext. Базовый URL берём из ../lib/apiBase.

import React, { useState } from "react";
import { api } from "@/config/env";
import { useMessenger } from "./MessengerContext";
import { Headset } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useLang } from "../i18n/LangProvider";

export default function SupportFab() {
  const [busy, setBusy] = useState(false);
  const isMobile = useIsMobile(768);
  const { t } = useLang();

  // На мобилке плавающая кнопка не нужна — показываем пункт меню
  if (isMobile) return null;


  // Мягкая зависимость от мессенджера (если провайдера нет — graceful fallback)
  let openFromMessenger = null;
  try {
    const ctx = useMessenger();
    openFromMessenger = ctx?.openMessenger || null;
  } catch {
    openFromMessenger = null;
  }

  // Локальный авторизованный fetch без контекстов
  const authFetch = async (url, options = {}) => {
    const token = typeof window !== "undefined" ? (localStorage.getItem("token") || "") : "";
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  };

  const openChatById = (chatId) => {
    if (!chatId) return;
    if (openFromMessenger) {
      openFromMessenger(chatId);
      try { window.dispatchEvent(new CustomEvent("inbox_update")); } catch { }
    } else {
      // запасной путь, если нет провайдера
      try { window.dispatchEvent(new CustomEvent("open_chat", { detail: { chatId } })); } catch { }
      try { window.location.hash = `#chat-${chatId}`; } catch { }
    }
  };

  const createTicket = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await authFetch(api(`/support/tickets`), {
        method: "POST",
        body: JSON.stringify({ subject: t("support.subject", "Support request") }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn("[SupportFab] create failed:", res.status, txt);

        // Популярный кейс: тикет уже открыт → бэк может вернуть 409.
        // Если у вас есть эндпоинт, который возвращает текущий активный тикет,
        // можете здесь сделать дополнительный запрос. Пока просто сообщаем.
        alert(res.status === 401
          ? t("support.signInPlease", "Войдите в систему и попробуйте снова.")
          : t("support.openFailed", "Не удалось открыть поддержку."));
        return;
      }

      const data = await res.json().catch(() => ({}));
      const chatId = data?.chat_id || data?.chatId;
      if (chatId) openChatById(chatId);
    } catch (e) {
      console.warn("[SupportFab] network error:", e);
      alert(t("support.networkError", "Сетевая ошибка. Проверьте доступность API и протокол (HTTP/HTTPS)."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button data-support-fab
      onClick={createTicket}
      disabled={busy}
      aria-label={t("support.open", "Открыть поддержку")}
      title={t("support.title", "Поддержка")}
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        border: "none",
        background: "#0ea5e9",
        color: "#fff",
        boxShadow: "0 8px 22px rgba(0,0,0,.35)",
        cursor: "pointer",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {busy ? "…" : <Headset size={22} aria-hidden="true" />}
    </button>
  );
}
