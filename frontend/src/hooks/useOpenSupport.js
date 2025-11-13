"use client";
import { useCallback } from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";
import { useUser } from "@/app/UserContext";
import { useMessenger } from "@/app/components/MessengerContext";

// Единая функция открытия поддержки: создаёт/находит тикет и открывает чат
export function useOpenSupport() {
    const { t } = useLang();
    const { authFetchWithRefresh } = useUser();
    const { openMessenger } = useMessenger();

    const openSupport = useCallback(async () => {
        try {
            // Создаём/возвращаем тикет как в FAB
            const res = await authFetchWithRefresh(api("/support/tickets"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: "Support request" }),
            });
            if (!res?.ok) {
                const txt = await res.text().catch(() => "");
                console.warn("[useOpenSupport] create failed:", res.status, txt);
                alert(res.status === 401
                    ? t("support.loginFirst", "Войдите в систему и попробуйте снова.")
                    : t("support.openError", "Не удалось открыть поддержку."));
                return;
            }
            const j = await res.json().catch(() => ({}));
            const chatId =
                j?.chat_id || j?.chatId || j?.chat?.id || j?.id || j?.ticket?.chat_id || j?.ticket?.chat?.id;
            if (!chatId) {
                alert(t("support.noChat", "Не удалось определить чат поддержки."));
                return;
            }
            // небольшая задержка — дать закрыться сайдбару
            setTimeout(() => { try { openMessenger && openMessenger(chatId); } catch { } }, 30);
        } catch (e) {
            console.warn("[useOpenSupport] network error:", e);
            alert(t("error.network", "Сетевая ошибка. Проверьте доступность API."));
        }
    }, [authFetchWithRefresh, openMessenger]);

    return openSupport;
}
