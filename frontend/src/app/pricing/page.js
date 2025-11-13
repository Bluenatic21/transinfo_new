
"use client";
import Link from "next/link";
import { useLang } from "@/app/i18n/LangProvider";

const cards = [
    {
        role: "OWNER",
        priceKey: "pricing.owner.price",
        bulletsKeys: [
            "pricing.owner.b1",
            "pricing.owner.b2",
        ],
    },
    {
        role: "TRANSPORT",
        priceKey: "pricing.transport.price",
        bulletsKeys: [
            "pricing.transport.b1",
            "pricing.transport.b2",
        ],
    },
    {
        role: "MANAGER",
        priceKey: "pricing.manager.price",
        bulletsKeys: [
            "pricing.manager.b1",
            "pricing.manager.b2",
            "pricing.manager.b3",
            "pricing.manager.b4",
        ],
    },
];

export default function PricingPage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const roleLabel = (code) =>
        code === "OWNER"
            ? t("role.owner", "Грузовладелец")
            : code === "TRANSPORT"
                ? t("role.transport", "Перевозчик")
                : code === "MANAGER"
                    ? t("role.manager", "Экспедитор")
                    : code;
    return (
        <div className="section">
            <div className="section-title">{t("pricing.title", "Тарифы")}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((c) => (
                    <div key={c.role} className="rounded-xl border p-4 bg-white dark:bg-[#0d1117]">
                        <div className="text-xl font-semibold mb-2">{roleLabel(c.role)}</div>
                        <div className="text-2xl font-bold mb-4">
                            {t(c.priceKey, c.role === "OWNER" ? t("pricing.free", "Бесплатно") : t("pricing.basePrice", "30 GEL / $15 в мес"))}
                        </div>
                        <ul className="space-y-1 mb-4 text-sm opacity-90">
                            {c.bulletsKeys.map((k, i) => (
                                <li key={i}>• {t(k,
                                    // дефолтные русские тексты
                                    c.role === "OWNER" && i === 0 ? t("pricing.unlimitedCargos", "Безлимит грузов") :
                                        c.role === "OWNER" && i === 1 ? t("pricing.msgAndMatches", "Сообщения и матчи (по текущим лимитам)") :
                                            c.role === "TRANSPORT" && i === 0 ? t("pricing.oneActiveTransportFree", "1 активная заявка транспорта бесплатно") :
                                                c.role === "TRANSPORT" && i === 1 ? t("pricing.extraSlot", "Каждый доп. слот: 15 GEL / $7 в мес") :
                                                    c.role === "MANAGER" && i === 0 ? t("pricing.oneActiveTransportFree", "1 активная заявка транспорта бесплатно") :
                                                        c.role === "MANAGER" && i === 1 ? t("pricing.extraSlot", "Каждый доп. слот: 15 GEL / $7 в мес") :
                                                            c.role === "MANAGER" && i === 2 ? t("pricing.perEmployee", "За каждого EMPLOYEE: 30 GEL / $15 в мес") :
                                                                t("pricing.unlimitedCargos", "Безлимит грузов")
                                )}</li>
                            ))}
                        </ul>
                        <Link href="/settings/billing" className="inline-block rounded-md px-4 py-2 bg-blue-600 text-white">
                            {t("pricing.cta", "Оформить")}
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}
