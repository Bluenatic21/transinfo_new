// src/app/utils/currency.js
export const CURRENCIES = [
    "₾", "₽", "$", "€", "TRY", "KZT", "UZS", "BYN", "AMD", "AZN", "PLN", "CHF", "GBP", "CNY", "UAH"
];

// Третий аргумент (необязательный) — функция t() ИЛИ строка-лейбл.
// Если не передан, будет показано русское "Договорная".
export function formatPrice(value, currency, tOrLabel) {
    const noneLabel = typeof tOrLabel === "function"
        ? tOrLabel("price.negotiable", "Договорная")
        : (tOrLabel || "Договорная");
    if (value == null || value === "") return noneLabel;
    const n = Number(value);
    const text = Number.isFinite(n) ? n.toLocaleString() : String(value);
    return currency ? `${text} ${currency}` : text;
}

// Удобный алиас, если всегда передаёте t():
export const formatPriceI18n = (value, currency, t) => formatPrice(value, currency, t);