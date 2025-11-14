// frontend/src/config/env.ts

// Берём базовый URL из env, по умолчанию локальный backend
const RAW_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

const RAW_WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ||
  RAW_API_BASE_URL.replace(/^http/, 'ws');

// То, к чему уже привязан новый код
export const API_BASE_URL = RAW_API_BASE_URL;
export const WS_BASE_URL = RAW_WS_BASE_URL;

// Старые имена, которые импортируются по всему проекту
export const API_BASE = API_BASE_URL;

// Удобная функция для HTTP-запросов
export function api(path: string): string {
  // Если уже абсолютный URL — не трогаем
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  let p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

// Получить абсолютный URL до того же API (по сути дубль api)
export function abs(path: string): string {
  let p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

// WebSocket URL
export function ws(path: string): string {
  let p = path.startsWith('/') ? path : `/${path}`;
  return `${WS_BASE_URL}${p}`;
}

// Обёртка, если где-то используют withApi
export function withApi(path: string): string {
  return api(path);
}