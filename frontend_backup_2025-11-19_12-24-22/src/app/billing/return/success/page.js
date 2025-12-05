
"use client";
import Link from "next/link";
import { useLang } from "@/app/i18n/LangProvider";

export default function BillingReturnSuccess() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    return (
        <div className="section">
            <div className="section-title">{t("billing.return.ok.title", "Оплата принята")}</div>
            <p>{t("billing.return.ok.text", "Мы получили сигнал об успешной оплате. Если статус не обновился мгновенно — это нормально, он придёт через вебхук.")}</p>
            <div className="mt-4">
                <Link className="underline" href="/settings/billing">{t("billing.return.back", "Вернуться в биллинг")}</Link>
            </div>
        </div>
    );
}
