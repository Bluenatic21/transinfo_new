// src/app/.../mobileNav.ts

import type { IconType } from "react-icons";
import {
  FaTruck,
  FaHandshake,
  FaClipboardList,
  FaUser,
  FaGaugeHigh,
  FaUsers,
} from "react-icons/fa6";

/** Роли, для которых строим мобильную навигацию */
export type Role = "OWNER" | "TRANSPORT" | "MANAGER" | "EMPLOYEE" | "ADMIN";

/** Пункт мобильного меню */
export type NavItem = {
  href: string;
  /** Русский фолбэк (НЕ удаляем) */
  label: string;
  /** i18n-ключ, по которому локализуем подпись на UI */
  labelKey?: string;
  icon: IconType;
  /** Ключ счётчика (бейджа), если нужен */
  badgeKey?: "matches" | "messages" | "contacts";
};

/** Значения счётчиков для бейджей */
export type NavCounters = {
  matches?: number;
  messages?: number;
  contacts?: number;
};

/** Карта навигации по ролям. label — русское значение как фолбэк, labelKey — i18n-ключ. */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  OWNER: [
    { href: "/transport", label: "Транспорт", labelKey: "nav.transport", icon: FaTruck },
    { href: "/matches", label: "Соответствия", labelKey: "nav.matches", icon: FaHandshake, badgeKey: "matches" },
    { href: "__my__", label: "Моё", labelKey: "nav.my", icon: FaClipboardList },
    { href: "/profile", label: "Профиль", labelKey: "nav.profile", icon: FaUser, badgeKey: "contacts" },
  ],
  TRANSPORT: [
    { href: "/orders", label: "Заявки", labelKey: "nav.orders", icon: FaClipboardList },
    { href: "/matches", label: "Соответствия", labelKey: "nav.matches", icon: FaHandshake, badgeKey: "matches" },
    { href: "__my__", label: "Моё", labelKey: "nav.my", icon: FaClipboardList },
    { href: "/profile", label: "Профиль", labelKey: "nav.profile", icon: FaUser, badgeKey: "contacts" },
  ],
  MANAGER: [
    { href: "/orders", label: "Заявки", labelKey: "nav.orders", icon: FaClipboardList },
    { href: "/matches", label: "Соответствия", labelKey: "nav.matches", icon: FaHandshake, badgeKey: "matches" },
    { href: "__my__", label: "Моё", labelKey: "nav.my", icon: FaClipboardList },
    { href: "/profile", label: "Профиль", labelKey: "nav.profile", icon: FaUser, badgeKey: "contacts" },
  ],
  EMPLOYEE: [
    { href: "/orders", label: "Заявки", labelKey: "nav.orders", icon: FaClipboardList },
    { href: "/matches", label: "Соответствия", labelKey: "nav.matches", icon: FaHandshake, badgeKey: "matches" },
    { href: "__my__", label: "Моё", labelKey: "nav.my", icon: FaClipboardList },
    { href: "/profile", label: "Профиль", labelKey: "nav.profile", icon: FaUser, badgeKey: "contacts" },
  ],
  ADMIN: [
    { href: "/admin", label: "Админ", labelKey: "nav.admin", icon: FaGaugeHigh },
    { href: "/admin/users", label: "Пользователи", labelKey: "nav.admin.users", icon: FaUsers },
    { href: "/orders", label: "Заявки", labelKey: "nav.orders", icon: FaClipboardList },
    { href: "/transport", label: "Транспорт", labelKey: "nav.transport", icon: FaTruck },
    { href: "/profile", label: "Профиль", labelKey: "nav.profile", icon: FaUser },
  ],
};

/** Возвращает числовой бейдж для пункта меню */
export function getBadgeCount(key: NavItem["badgeKey"], c: NavCounters = {}): number {
  if (!key) return 0;
  return key === "matches"
    ? (c.matches || 0)
    : key === "messages"
      ? (c.messages || 0)
      : key === "contacts"
        ? (c.contacts || 0)
        : 0;
}

/**
 * Получить навигацию для роли. Если передать t(), подписи будут локализованы:
 * label = t(labelKey || label, label). Русские тексты остаются как фолбэк.
 */
export function getNavByRole(
  role: Role,
  t?: (key: string, fallback?: string) => string
): NavItem[] {
  const items = NAV_BY_ROLE[role] || [];
  if (!t) return items;
  return items.map((it) => ({
    ...it,
    label: t(it.labelKey || it.label, it.label),
  }));
}
