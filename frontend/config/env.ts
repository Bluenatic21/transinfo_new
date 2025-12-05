// src/config/env.ts
type AppEnv = 'production' | 'staging' | 'development';

export const APP_ENV: AppEnv =
    (process.env.NEXT_PUBLIC_APP_ENV as AppEnv) ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

// Базовые хосты по окружениям
const HOST_BY_ENV: Record<AppEnv, string> = {
    production: 'https://www.transinfo.ge',
    staging: 'https://staging.transinfo.ge',
    development: 'http://127.0.0.1:3000'
};

// В проде закрепляемся на prod-домене
export const BASE =
    APP_ENV === 'production' ? 'https://www.transinfo.ge' : HOST_BY_ENV[APP_ENV];

// База API
// По умолчанию (как раньше) ходим на `${BASE}/api`.
// Локально можно переопределить через переменные окружения,
// чтобы сразу стучаться в FastAPI (например http://127.0.0.1:8004).
const ENV_API_BASE =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_DEV_API_URL ||
    '';

export const API_BASE =
    ENV_API_BASE.trim()
        ? ENV_API_BASE.replace(/\/$/, '')
        : `${BASE}/api`;

// Совместимость с существующим кодом
export const API = API_BASE;

/** Склеивает абсолютный URL к API */
export function api(path = ''): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE}${p}`;
}

// alias под старые импорты
export const withApi = api;


/** Абсолютный URL к сайту (assets и пр.) */
export function abs(path = ''): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${BASE}${p}`;
}

/** WebSocket URL */
const ENV_WS_BASE = (
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_WS_BASE ||
    ''
).trim();

const buildWsFromBase = (base: string, path: string) => {
    const cleanBase = base.replace(/\/$/, '');
    const proto = cleanBase.startsWith('https') || cleanBase.startsWith('wss') ? 'wss' : 'ws';
    const host = cleanBase.replace(/^(https?:\/\/|wss?:\/\/)/, '');
    return `${proto}://${host}${path}`;
};


export function ws(path = ''): string {
    const p = path.startsWith('/') ? path : `/${path}`;

    // Если явно задан WS‑URL в env (локальная дев-база) — используем его,
    // но при https-странице и небезопасном ws:// переключаемся на текущий origin.
    if (ENV_WS_BASE) {
        try {
            const envUrl = new URL(ENV_WS_BASE);
            if (typeof window !== 'undefined' && window.location) {
                const runtimeUrl = new URL(window.location.origin);

                if (runtimeUrl.protocol === 'https:' && envUrl.protocol === 'ws:') {
                    return buildWsFromBase(window.location.origin, p);
                }

                if (envUrl.host !== runtimeUrl.host) {
                    return buildWsFromBase(window.location.origin, p);
                }
            }
        } catch { /* ignore */ }

        return `${ENV_WS_BASE.replace(/\/$/, '')}${p}`;
    }

    // Иначе старое поведение: тот же хост, что и BASE
    return buildWsFromBase(BASE, p);
}


// Иногда в коде встречается makeWsUrl — оставляем алиас
export const makeWsUrl = ws;

export default {
    APP_ENV,
    BASE,
    API_BASE,
    API,
    api,
    withApi,
    abs,
    ws,
    makeWsUrl
};
