
"use client";
import React, { useEffect, useState } from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { API_BASE, api } from "@/config/env";

const PAYMENTS_SUSPENDED =
    (process.env.NEXT_PUBLIC_PAYMENTS_SUSPENDED || "0").toString().toLowerCase() === "1" ||
    (process.env.NEXT_PUBLIC_PAYMENTS_SUSPENDED || "").toLowerCase() === "true";

export default function BillingSettingsPage() {
    const { t } = useLang();
    const [sub, setSub] = useState(null);
    const [usage, setUsage] = useState(null);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [period, setPeriod] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const s = await fetch(api(`/api/billing/subscription`), { credentials: "include" }).then(r => r.json());
                setSub(s);
                const u = await fetch(api(`/api/billing/usage/preview`), { credentials: "include" }).then(r => r.json());
                setUsage(u);
                // превью текущего периода (пики и сумма аддонов)
                try {
                    const p = await fetch(api(`/api/billing/period/preview`), { credentials: "include" }).then(r => r.ok ? r.json() : null);
                    setPeriod(p);
                } catch { }
            } catch (e) {
                setErr(String(e));
            }
        })();
    }, []);

    return (
        <div className="section">
            {PAYMENTS_SUSPENDED && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-[#3a2f12] dark:text-amber-200">
                    <b>Оплата временно недоступна.</b> Вы сможете оформить или продлить подписку позже.
                </div>
            )}
            <div className="section-title">{t("billing.title", "Оплата и подписка")}</div>
            {err && <div className="mb-4 p-3 rounded bg-red-50 text-red-800">{err}</div>}
            {sub && (
                <div className="rounded border p-4 mb-4">
                    <div><b>{t("billing.role", "Роль")}:</b> {sub.role}</div>
                    <div><b>{t("billing.status", "Статус")}:</b> {sub.status}</div>
                    <div><b>{t("billing.period", "Период")}:</b> {sub.period}</div>
                    {sub.next_renewal_at && <div><b>{t("billing.nextCharge", "Следующее списание")}:</b> {new Date(sub.next_renewal_at).toLocaleString()}</div>}
                </div>
            )}
            {usage && (
                <div className="rounded border p-4">
                    <div className="font-semibold mb-2">{t("billing.usagePreview", "Использование (превью)")}</div>
                    <div className="text-sm">{t("billing.activeTransports", "Активных транспортов сейчас")}: <b>{usage.active_transports}</b></div>
                    <div className="text-sm">{t("billing.freeSlots", "Бесплатных слотов")}: <b>{usage.free_slots}</b></div>
                    <div className="text-sm">{t("billing.chargeableSlots", "Платных слотов (если превысите)")}: <b>{usage.chargeable_slots}</b></div>
                    {usage.chargeable_slots > 0 && (
                        <div className="text-sm mt-1">{t("billing.extraSlotsCost", "Доплата за слоты")}: <b>${usage.chargeable_usd}</b> / {t("billing.perMonth", "мес")}</div>
                    )}
                    <div className="text-xs opacity-70 mt-2">
                        {t("billing.note", "Итоговая сумма за месяц включает базу (30 GEL / $15) + 30 GEL / $15 за сотрудника (MANAGER) + слоты (15 GEL / $7 за доп. одновременный слот).")}
                    </div>
                </div>
            )}
            {period && period.chargeable_slots >= 0 && (
                <div className="rounded border p-4 mt-4">
                    <div className="font-semibold mb-2">{t("billing.periodTitle", "Период")}</div>
                    <div className="text-sm">{t("billing.fromTo", "С")} {new Date(period.period_start).toLocaleString()} {t("billing.to", "по")} {new Date(period.period_end).toLocaleString()}</div>
                    <div className="text-sm">{t("billing.peak", "Пиковая активность")}: <b>{period.peak_active_transports}</b></div>
                    <div className="text-sm">{t("billing.chargeableToPay", "Платных слотов к оплате")}: <b>{period.chargeable_slots}</b></div>
                    <div className="text-sm">{t("billing.addonsAmount", "Сумма аддонов")}: <b>${period.addons_amount_usd}</b></div>
                </div>
            )}
            <div className="mt-6">
                <button
                    disabled={busy || PAYMENTS_SUSPENDED}
                    onClick={async () => {
                        if (PAYMENTS_SUSPENDED) return alert("Оплата временно недоступна.");
                        try {
                            setBusy(true);
                            const resp = await fetch(api(`/api/billing/checkout/start`), {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({}),
                            });
                            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                            const data = await resp.json();
                            if (data?.redirect_url) {
                                window.location.href = data.redirect_url;
                            } else {
                                throw new Error("Redirect URL not provided");
                            }
                        } catch (e) {
                            setErr(String(e));
                        } finally {
                            setBusy(false);
                        }
                    }}
                    className="rounded-md px-4 py-2 bg-blue-600 text-white"
                >
                    {busy ? t("billing.openingCheckout", "Открываем оплату...") : t("billing.payNow", "Оплатить сейчас")}
                </button>
                <div className="text-xs opacity-70 mt-2">
                    {t("billing.note2", "Списывается только база (30 GEL / $15) + сотрудники (MANAGER). Доп. слоты по $7 добавятся к счёту в конце периода.")}
                </div>
            </div>
            <div className="mt-3">
                <button
                    disabled={busy}
                    onClick={async () => {
                        try {
                            setBusy(true);
                            const resp = await fetch(api(`/api/billing/checkout/addons`), {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({}),
                            });
                            if (!resp.ok) throw new Error(await resp.text());
                            const data = await resp.json();
                            if (data?.redirect_url) {
                                window.location.href = data.redirect_url;
                            } else {
                                throw new Error("Redirect URL not provided");
                            }
                        } catch (e) {
                            setErr(String(e));
                        } finally {
                            setBusy(false);
                        }
                    }}
                    className="rounded-md px-4 py-2 bg-amber-600 text-white disabled:opacity-50"
                >
                    {PAYMENTS_SUSPENDED ? "Оплата недоступна" : (busy ? t("billing.preparing", "Готовим оплату...") : t("billing.payAddonsNow", "Оплатить слоты сейчас"))}
                </button>
                <div className="text-xs opacity-70 mt-2">
                    {t("billing.devNote", "Для теста в dev: можно оплатить аддоны за текущий период прямо сейчас (иначе спишется при закрытии периода).")}
                </div>
            </div>
        </div>
    );
}
