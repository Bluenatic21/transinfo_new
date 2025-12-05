"use client";

import React from "react";
import OrderForm from "../components/OrderForm";
import { useLang } from "../i18n/LangProvider";

export default function CreatePage() {
    const { t } = useLang();

    return (
        <div className="section">
            <div className="section-title">
                {t("order.createTitle", "Создать Заявку")}
            </div>
            <OrderForm />
        </div>
    );
}
