"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import OrderForm from "../../../components/OrderForm";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";

export default function EditOrderPage() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const params = useParams();
    const id = params.id;
    const router = useRouter();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        const token = localStorage.getItem("token");
        fetch(api(`/orders/${id}`), {
            headers: { Authorization: "Bearer " + token }
        })
            .then(res => res.json())
            .then(data => setOrder(data))
            .finally(() => setLoading(false));
    }, [id]);

    // Контрастный лоадер, чтобы на тёмной теме не казалось «пустой страницей»
    if (loading) {
        return (
            <div
                aria-busy="true"
                style={{
                    padding: 32,
                    color: "#c9eaff",
                    minHeight: "calc(100dvh - 110px)",
                    display: "grid",
                    placeItems: "center",
                }}
            >
                <div className="boot-spinner">
                    <span className="boot-dot" />
                    <span className="boot-dot" />
                    <span className="boot-dot" />
                </div>
                <p className="boot-text">{t("common.loading", "Загрузка…")}</p>
            </div>
        );
    }
    if (!order) return <div>{t("order.notFound", "Заявка не найдена")}</div>;

    return (
        <div className="section">
            <div className="section-title">{t("order.editTitle", "Редактировать заявку")}</div>
            <OrderForm
                order={order}
                onSaved={() => router.push("/profile")}
            />
        </div>
    );
}
