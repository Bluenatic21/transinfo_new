import { API_BASE, api } from "@/config/env";

export async function deleteChatApi(chat_id) {
    const url = api(`/chat/${chat_id}/delete`);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        if (res.ok) return true;
        // Идемпотентность: если для пользователя уже "удалено" (нет участия) —
        // бэкенд вернёт 403/404 на старых версиях; теперь — ok:true, но подстрахуемся:
        if (res.status === 403 || res.status === 404) return true;
        return false;
    } catch (e) {
        console.error("deleteChatApi error:", e);
        return false;
    }
}