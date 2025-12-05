import { useEffect, useState } from "react";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

export default function UserRatings({ user }) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const [ratings, setRatings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return; // <-- ждем появления user.id
        setLoading(true); // чтобы не висел старый статус между пользователями
        fetch(api(`/profile/ratings/${user.id}`))
            .then(res => res.json())
            .then(setRatings)
            .finally(() => setLoading(false));
    }, [user?.id]); // правильно реагировать на смену id

    if (loading) return <div>{t("ratings.loading", "Загрузка отзывов...")}</div>;
    if (!ratings.length) return <div>{t("ratings.empty", "Пока нет отзывов.")}</div>;

    // Средний рейтинг
    const avg = (ratings.reduce((acc, r) =>
        acc +
        ((r.punctuality + r.communication + r.professionalism + r.reliability) / 4)
        , 0) / ratings.length).toFixed(2);

    return (
        <div className="user-ratings-list" style={{ marginTop: 28 }}>
            <div style={{ fontWeight: 700, color: "#ffd600", fontSize: 22, marginBottom: 10 }}>
                ★ {avg} / 5{" "}
                <span style={{ color: "#b3d5fa", fontWeight: 400, fontSize: 15 }}>
                    ({t("ratings.count", "отзывов")}: {ratings.length})
                </span>
            </div>
            {ratings.map(r => (
                <div key={r.id} className="rating-item" style={{
                    background: "#182740",
                    borderRadius: 12,
                    marginBottom: 12,
                    padding: 14
                }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: "#43c8ff" }}>
                        ★ {((r.punctuality + r.communication + r.professionalism + r.reliability) / 4).toFixed(2)} / 5
                    </div>
                    <div style={{ marginTop: 4, color: "#fff" }}>{r.comment}</div>
                    <div style={{ fontSize: 13, color: "#b0bec5", marginTop: 6 }}>
                        {new Date(r.created_at).toLocaleString()}
                    </div>
                </div>
            ))}
        </div>
    );
}
