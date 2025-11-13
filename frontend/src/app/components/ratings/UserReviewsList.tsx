"use client";
import React, { useEffect, useState } from "react";
import { useUser } from "@/app/UserContext";
import RatingStars from "@/app/components/RatingStars";
import { useLang } from "../../i18n/LangProvider";
import { api } from "@/config/env";

type Review = {
    id: number;
    author_user_id: number;
    target_user_id: number;
    stars10?: number | null;
    punctuality?: number | null;
    communication?: number | null;
    professionalism?: number | null;
    terms?: number | null;
    comment?: string | null;
    created_at: string;
};

export default function UserReviewsList({
    userId,
}: {
    userId: number | undefined | null;
}) {
    const { t } = useLang();
    const { authFetchWithRefresh } = useUser();
    const [items, setItems] = useState<Review[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const score = (r: Review) => {
        if (typeof r.stars10 === "number") return r.stars10;
        const nums = [
            r.punctuality,
            r.communication,
            r.professionalism,
            r.terms,
        ].filter((x): x is number => typeof x === "number");
        if (!nums.length) return 10;
        return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
    };

    const load = async (p = 1) => {
        if (!userId) return;
        setLoading(true);
        try {
            const res = await authFetchWithRefresh(
                api(`/reviews/user/${userId}?page=${p}&per_page=10`)
            );
            if (!res.ok) throw new Error("failed");
            const data: Review[] = await res.json();
            setItems((prev) => (p === 1 ? data : [...prev, ...data]));
            setHasMore(data.length === 10);
        } catch (e) {
            console.warn("[UserReviewsList] load error", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setItems([]);
        setPage(1);
        setHasMore(true);
        if (userId) load(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    return (
        <div className="space-y-3">
            {items.map((r) => (
                <div
                    key={r.id}
                    className="rounded-2xl border border-slate-700 bg-slate-800/40 p-3"
                >
                    <div className="flex items-center justify-between">
                        <div className="text-xs opacity-70">
                            {new Date(r.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-2">
                            <RatingStars value={score(r)} size={16} />
                            <span className="text-xs opacity-80">{score(r).toFixed(1)}</span>
                        </div>
                    </div>

                    <div className="mt-1 text-sm text-slate-200">
                        {r.comment ? r.comment : <span className="opacity-60">{t("reviews.noComment", "Без комментария")}</span>}
                    </div>

                    {/* Анонимный автор */}
                    <div className="mt-2 text-xs text-slate-400">{t("reviews.byAnonymous", "Оценил: Анонимно")}</div>
                </div>
            ))}

            {hasMore && (
                <div className="pt-2">
                    <button
                        onClick={() => {
                            const p2 = page + 1;
                            setPage(p2);
                            load(p2);
                        }}
                        disabled={loading}
                        className="w-full rounded-xl bg-slate-700/60 hover:bg-slate-600/70 py-2 text-sm disabled:opacity-60"
                    >
                        {loading ? t("common.loading", "Загрузка...") : t("common.showMore", "Показать ещё")}
                    </button>
                </div>
            )}

            {!loading && !items.length && (
                <div className="text-sm opacity-70">{t("reviews.none", "Пока нет отзывов.")}</div>
            )}
        </div>
    );
}
