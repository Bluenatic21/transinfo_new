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
  (typeof window !== 'undefined' && window?.location?.origin
    ? window.location.origin
    : '').replace(/\/$/, '');

const getRuntimeBase = (): string => RUNTIME_BASE;


// База API
// По умолчанию (как раньше) ходим на `${BASE}/api`.
// Локально можно переопределить через переменные окружения,
// чтобы сразу стучаться в FastAPI (например http://127.0.0.1:8004).
const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_DEV_API_URL ||
  '';

// Если в проде env указывает на другой домен, чем открытый сайт, — игнорируем его,
// чтобы избежать CORS/префлайт блокировок.
// Если в проде env указывает на другой домен, чем открытый сайт, — игнорируем его,
// чтобы избежать CORS/префлайт блокировок. При этом разрешаем поддомены внутри
// одного базового домена (api.transinfo.ge vs transinfo.ge).
const shouldForceRuntimeBase = (runtimeBase: string) => {
  if (!ENV_API_BASE || APP_ENV !== 'production' || !runtimeBase) return false;

  const getBaseDomain = (host: string) => host.split('.').slice(-2).join('.');

  try {
    const envHost = new URL(ENV_API_BASE).host;
    const runtimeHost = new URL(runtimeBase).host;

    // Разрешаем api.<domain> и www.<domain> — главное, чтобы базовый домен совпадал
    if (getBaseDomain(envHost) === getBaseDomain(runtimeHost)) return false;

    return envHost !== runtimeHost;
  } catch {
    return false;
  }
};

const getEffectiveBase = (runtimeBase?: string) => {
  const rb = (runtimeBase ?? getRuntimeBase()) || '';
  return (APP_ENV === 'production' && rb ? rb : BASE).replace(/\/$/, '');
};

const resolveApiBase = () => {
  const runtimeBase = getRuntimeBase();
  const envApiBase = ENV_API_BASE.trim();

  if (envApiBase && !shouldForceRuntimeBase(runtimeBase)) {
    return envApiBase.replace(/\/$/, '');
  }
  return `${getEffectiveBase(runtimeBase)}/api`;
};

export const API_BASE = resolveApiBase();

// Совместимость с существующим кодом
export const API = API_BASE;

/** Склеивает абсолютный URL к API */
export function getApiBase(): string {
  return resolveApiBase();
}

export function api(path = ''): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = resolveApiBase();
  return `${base}${p}`;
}

// alias под старые импорты
export const withApi = api;

// Абсолютный URL для ресурсов
export function abs(path = ''): string {
  const p = path.startsWith('/') ? path : `/${path}`;

  // Файлы, которые отдаёт FastAPI (аватары, документы, support‑лого и т.п.),
  // лежат в backend/static и наружу доступны как /api/static/...
  // Поэтому для /static/... всегда используем хост API, а не фронта.
  if (p.startsWith('/static/')) {
    const apiBase = getApiBase(); // например, https://transinfo.ge/api или http://127.0.0.1:8000
    return `${apiBase}${p}`;      // -> https://transinfo.ge/api/static/avatars/xxxx.png
  }

  // Всё остальное (картинки из Next /public, любые ссылки на фронт)
  // оставляем как раньше: тот же домен, что и у фронта.
  return `${getEffectiveBase()}${p}`;
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
  const runtimeBase = getRuntimeBase();

  // Если явно задан WS‑URL в env (локальная дев-база) — используем его,
  // но в проде перепроверяем, что домен/протокол совместимы с текущим (иначе mixed content/CORS).
  if (ENV_WS_BASE) {
    try {
      const envUrl = new URL(ENV_WS_BASE);

      if (APP_ENV === 'production' && runtimeBase) {
        const runtimeUrl = new URL(runtimeBase);

        // HTTPS страница не может открывать небезопасный ws:// — переключаемся на фактический origin
        // или когда хосты различаются (www.transinfo.ge vs transinfo.ge).
        if (runtimeUrl.protocol === 'https:' && envUrl.protocol === 'ws:') {
          return buildWsFromBase(runtimeBase, p);
        }

        if (envUrl.host !== runtimeUrl.host) {
          return buildWsFromBase(runtimeBase, p);
        }
      }
      return `${ENV_WS_BASE.replace(/\/$/, '')}${p}`;
    } catch {
      // если URL из env битый — возвращаемся к текущему origin
      return buildWsFromBase(runtimeBase || BASE, p);
    }
  }

  // Иначе используем тот же хост, что и BASE (или фактический runtime-домен)
  return buildWsFromBase(runtimeBase || BASE, p);
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
