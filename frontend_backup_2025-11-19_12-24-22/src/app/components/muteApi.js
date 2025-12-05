// muteApi.js
import { api } from "@/config/env";

export async function fetchMutedGroups() {
    const res = await fetch(api("/group-mute"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    if (!res.ok) return [];
    return await res.json();
}
export async function muteGroupApi(chat_id) {
    await fetch(api(`/group-mute/${chat_id}`), {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
}
export async function unmuteGroupApi(chat_id) {
    await fetch(api(`/group-unmute/${chat_id}`), {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
}
