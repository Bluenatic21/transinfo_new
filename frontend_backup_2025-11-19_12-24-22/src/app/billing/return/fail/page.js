
"use client";
import Link from "next/link";
import { useLang } from "@/app/i18n/LangProvider";

export default function BillingReturnFail() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    return (
        <div className="section">
            <div className="section-title">{t("billing.return.fail.title", "Оплата не завершена")}</div>
            <p>{t("billing.return.fail.text", "Платёж не был подтверждён. Попробуйте снова или проверьте способ оплаты.")}</p>
            <div className="mt-4">
                <Link className="underline" href="/settings/billing">{t("billing.return.back", "Вернуться в биллинг")}</Link>
            </div>
        </div>
    );
}
