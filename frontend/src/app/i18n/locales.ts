export type Locale = "ka" | "ru" | "en" | "tr" | "az" | "hy" | "uk";

// список поддерживаемых локалей (важно: как const)
export const SUPPORTED_LOCALES = ["ka", "ru", "en", "tr", "az", "hy", "uk"] as const;

// дефолтная локаль
export const DEFAULT_LOCALE: Locale = "ka";

// человекочитаемые ярлыки (если используешь их в селекторе/меню)
export const LOCALE_LABELS: Record<Locale, string> = {
    ka: "ქართული",
    ru: "Русский",
    en: "English",
    tr: "Türkçe",
    az: "Azərbaycanca",
    hy: "Հայերեն",
    uk: "Українська",
};

// опционально: хелпер нормализации строки в Locale
export function normalizeLocale(v: string | null | undefined): Locale {
    const s = (v || "").toLowerCase();
    return (SUPPORTED_LOCALES as readonly string[]).includes(s)
        ? (s as Locale)
        : DEFAULT_LOCALE;
}
