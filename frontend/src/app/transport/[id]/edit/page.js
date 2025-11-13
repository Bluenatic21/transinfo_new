"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TransportForm from "../../../components/TransportForm";
import { useLang } from "../../../i18n/LangProvider";
import { api } from "@/config/env";

export default function EditTransportPage() {
    const { t } = useLang();
    const params = useParams();
    const router = useRouter();
    const [initialData, setInitialData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            setError(t("auth.tokenMissing", "Не найден токен авторизации"));
            setLoading(false);
            return;
        }
        fetch(api(`/transports/${params.id}`), {
            headers: { Authorization: "Bearer " + token }
        })
            .then(async res => {
                if (!res.ok) {
                    setError(t("load.requestError", "Ошибка загрузки заявки") + ": " + res.status);
                    setInitialData(null);
                } else {
                    const data = await res.json();
                    setInitialData(data);
                }
            })
            .catch(e => {
                setError(t("load.error", "Ошибка загрузки") + ": " + e.message);
                setInitialData(null);
            })
            .finally(() => setLoading(false));
    }, [params.id]);

    if (loading) return <div style={{ color: "#90caf9", fontSize: 19, padding: 32 }}>{t("common.loading", "Загрузка...")}</div>;
    if (error) return <div style={{ color: "#ff5252", fontWeight: 700, fontSize: 19, padding: 32 }}>{error}</div>;
    if (!initialData) return <div style={{ color: "#ff5252", fontWeight: 700, fontSize: 19, padding: 32 }}>{t("request.notFoundOrNoAccess", "Заявка не найдена или нет доступа")}</div>;

    return (
        <TransportForm
            initialData={initialData}
            mode="edit"
            onSuccess={() => router.push("/profile")}
        />
    );
}
