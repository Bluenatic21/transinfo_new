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
  const colors = {
    cardBg: "var(--surface)",
    cardBorder: "var(--border-subtle)",
    textPrimary: "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    textMuted: "var(--text-muted)",
    shadow: "var(--shadow-soft)",
    accent: "var(--brand-blue)",
  };
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
    return (
      Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
    );
  };

  const load = async (p = 1) => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await authFetchWithRefresh(
        api(`/users/${userId}/reviews?page=${p}&per_page=10`)
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((r) => (
        <div
          key={r.id}
          style={{
            borderRadius: 18,
            border: `1px solid ${colors.cardBorder}`,
            background: colors.cardBg,
            padding: 14,
            boxShadow: colors.shadow,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 12, color: colors.textSecondary }}>
              {new Date(r.created_at).toLocaleDateString()}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RatingStars value={score(r)} size={16} />
              <span
                style={{
                  fontSize: 12,
                  color: colors.textPrimary,
                  fontWeight: 700,
                }}
              >
                {score(r).toFixed(1)}
              </span>
            </div>
          </div>

          <div
            style={{ marginTop: 2, fontSize: 14, color: colors.textPrimary }}
          >
            {r.comment ? (
              r.comment
            ) : (
              <span style={{ color: colors.textMuted }}>
                {t("reviews.noComment", "Без комментария")}
              </span>
            )}
          </div>

          {/* Анонимный автор */}
          <div
            style={{ marginTop: 4, fontSize: 12, color: colors.textSecondary }}
          >
            {t("reviews.byAnonymous", "Оценил: Анонимно")}
          </div>
        </div>
      ))}

      {hasMore && (
        <div style={{ paddingTop: 8 }}>
          <button
            onClick={() => {
              const p2 = page + 1;
              setPage(p2);
              load(p2);
            }}
            disabled={loading}
            style={{
              width: "100%",
              borderRadius: 12,
              background: colors.accent,
              color: "var(--text-on-brand)",
              padding: "10px 12px",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.8 : 1,
              boxShadow: colors.shadow,
            }}
          >
            {loading
              ? t("common.loading", "Загрузка...")
              : t("common.showMore", "Показать ещё")}
          </button>
        </div>
      )}

      {!loading && !items.length && (
        <div style={{ fontSize: 14, color: colors.textSecondary }}>
          {t("reviews.none", "Пока нет отзывов.")}
        </div>
      )}
    </div>
  );
}
