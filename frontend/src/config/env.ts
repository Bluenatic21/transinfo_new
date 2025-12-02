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

// Текущий origin в браузере — помогает избежать рассинхрона env и фактического домена
// (например, prod сборка открыта с www., а API/WS прописаны на transinfo.ge → CORS/mixed content)
const RUNTIME_BASE =
  typeof window !== 'undefined' && window?.location?.origin
    ? window.location.origin
    : '';


// База API
// По умолчанию (как раньше) ходим на `${BASE}/api`.
// Локально можно переопределить через переменные окружения,
// чтобы сразу стучаться в FastAPI (например http://127.0.0.1:8004).
const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_DEV_API_URL ||
  '';

// Если в проде env указывает на другой домен, чем открытый сайт, — игнорируем его,
// чтобы избежать CORS/префлайт блокировок.
const SHOULD_FORCE_RUNTIME_BASE = (() => {
  if (!ENV_API_BASE || APP_ENV !== 'production' || !RUNTIME_BASE) return false;
  try {
    const envHost = new URL(ENV_API_BASE).host;
    const runtimeHost = new URL(RUNTIME_BASE).host;
    return envHost !== runtimeHost;
  } catch {
    return false;
  }
})();

const EFFECTIVE_BASE =
  (APP_ENV === 'production' && RUNTIME_BASE ? RUNTIME_BASE : BASE).replace(/\/$/, '');

export const API_BASE = (() => {
  if (ENV_API_BASE.trim() && !SHOULD_FORCE_RUNTIME_BASE) {
    return ENV_API_BASE.replace(/\/$/, '');
  }
  return `${EFFECTIVE_BASE}/api`;
})();

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

export function ws(path = ''): string {
  const p = path.startsWith('/') ? path : `/${path}`;

  // Если явно задан WS‑URL в env (локальная дев-база) — используем его,
  // но в проде перепроверяем, что домен совпадает с текущим (иначе mixed content/CORS).
  if (ENV_WS_BASE) {
    try {
      if (
        APP_ENV === 'production' &&
        RUNTIME_BASE &&
        new URL(ENV_WS_BASE).host !== new URL(RUNTIME_BASE).host
      ) {
        const host = RUNTIME_BASE.replace(/^https?:\/\//, '');
        const proto = RUNTIME_BASE.startsWith('https') ? 'wss' : 'ws';
        return `${proto}://${host}${p}`;
      }
    } catch { }

    return `${ENV_WS_BASE.replace(/\/$/, '')}${p}`;
  }

  // Иначе старое поведение: тот же хост, что и BASE (или фактический runtime-домен)
  const base = RUNTIME_BASE || BASE;
  const host = base.replace(/^https?:\/\//, '');
  const proto = base.startsWith('https') ? 'wss' : 'ws';
  return `${proto}://${host}${p}`;
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
