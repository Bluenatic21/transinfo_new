// src/app/components/getAvatarUrl.js
import { abs } from "@/config/env";

export function getAvatarUrl(obj, isGroup = false) {
    if (!obj) return "/default-avatar.png";
    if (isGroup) {
        if (obj.group_avatar && obj.group_avatar !== "/group-default.png") {
            return obj.group_avatar.startsWith("/")
                ? abs(obj.group_avatar)
                : obj.group_avatar;
        }
        return "/group-default.png";
    }
    const raw = obj.avatar || obj.avatar_url || obj.photo;
    if (raw && raw !== "/default-avatar.png") {
        return raw.startsWith("/")
            ? abs(raw)
            : raw;
    }
    return "/default-avatar.png";
}

export default getAvatarUrl;
