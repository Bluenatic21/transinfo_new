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
export const API_BASE = `${BASE}/api`;

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

/** WebSocket URL на тот же хост */
export function ws(path = ''): string {
  const host = BASE.replace(/^https?:\/\//, '');
  const proto = BASE.startsWith('https') ? 'wss' : 'ws';
  const p = path.startsWith('/') ? path : `/${path}`;
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
