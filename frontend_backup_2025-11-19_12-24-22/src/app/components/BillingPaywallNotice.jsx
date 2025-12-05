
"use client";
import React, { useEffect, useState } from "react";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

export default function BillingPaywallNotice() {
    const [state, setState] = useState({ loading: true, data: null, err: null });
    const { t } = useLang();
    useEffect(() => {
        let abort = false;
        (async () => {
            try {
                const resp = await fetch(api(`/api/billing/usage/preview`), { credentials: "include" });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                if (!abort) setState({ loading: false, data, err: null });
            } catch (e) {
                if (!abort) setState({ loading: false, data: null, err: String(e) });
            }
        })();
        return () => { abort = true; };
    }, []);

    if (state.loading || !state.data) return null;
    const { active_transports, free_slots, chargeable_slots, chargeable_usd } = state.data;
    if (chargeable_slots <= 0) return null;

    return (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-[#3a2f12] dark:text-amber-200">
            <div className="font-medium">{t("billing.paywall.title", "Внимание: платные слоты")}</div>
            <div className="text-sm">
                {t("billing.paywall.active", "Активных транспортов")}: <b>{active_transports}</b>.{" "}
                {t("billing.paywall.free", "Бесплатно входит")}: <b>{free_slots}</b>.{" "}
                {t("billing.paywall.extra", "Дополнительных слотов")}: <b>{chargeable_slots}</b> × $7 = <b>${chargeable_usd}</b>{" "}
                {t("billing.paywall.perMonth", "в месяц (будет добавлено к вашей подписке)")}.
            </div>
        </div>
    );
}
