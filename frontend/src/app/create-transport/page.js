"use client";
import TransportForm from "../components/TransportForm";
import { useLang } from "../i18n/LangProvider";

export default function CreateTransportPage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    return (
        <div className="section">
            <div className="section-title">{t("transport.createTitle", "Добавить Транспорт")}</div>
            <TransportForm />
        </div>
    );
}