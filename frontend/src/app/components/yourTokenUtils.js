// yourTokenUtils.js

// Сохраняет токен во всех нужных местах
export function setTokenEverywhere(token) {
    if (typeof window !== "undefined") {
        window.token = token;
        localStorage.setItem("token", token);
        // cookie:
        document.cookie = `token=${token};path=/;max-age=604800;SameSite=Lax`;
        document.cookie = `Authorization=Bearer ${token};path=/;max-age=604800;SameSite=Lax`;
    }
}

// Сохраняет user во всех нужных местах
export function setUserEverywhere(user) {
    if (typeof window !== "undefined") {
        window.user = user;
        localStorage.setItem("user", JSON.stringify(user));
    }
}

// Читает токен
export function getTokenSync() {
    if (typeof window !== "undefined") {
        if (window.token) return window.token;
        if (window.user && window.user.token) return window.user.token;
        const t = localStorage.getItem("token");
        if (t) return t;
        try {
            const u = JSON.parse(localStorage.getItem("user"));
            if (u?.token) return u.token;
        } catch { }
    }
    return null;
}

// Удаляет токен и user отовсюду
export function removeTokenEverywhere() {
    if (typeof window !== "undefined") {
        window.token = null;
        window.user = null;
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        // чистим куку
        document.cookie = "token=;path=/;max-age=0";
        document.cookie = "Authorization=;path=/;max-age=0";
    }
}
