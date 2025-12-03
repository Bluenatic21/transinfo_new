"use client";
import React, { useCallback, useState } from "react";
import { useLang } from "../../i18n/LangProvider";
import { api } from "@/config/env";

type Props = {
    /** ID пользователя, которого оцениваем. Можно передать userId или targetUserId */
    userId?: string | number;
    targetUserId?: string | number;
    /** Коллбек после успешной отправки — чтобы показать «ваш отзыв» */
    onReviewSent?: (saved: any) => void;
    className?: string;
    /** Текущая тема, нужна для подбора цветов кнопки */
    isLightTheme?: boolean;
};

/**
 * Оставить отзыв: 4 метрики (0..10) + комментарий
 * Визуально и по стилю вписывается в ваши карточки профиля.
 */
export default function LeaveReview({ userId, targetUserId, onReviewSent, className, isLightTheme }: Props) {
    const { t } = useLang();
    const target = userId ?? targetUserId;
    const [stars10, setStars10] = useState<number>(10);
    const [hover, setHover] = useState<number | null>(null);
    const [comment, setComment] = useState("");
    const [pending, setPending] = useState(false);

    const submit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!target || pending) return;
            setPending(true);
            try {
                const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
                const res = await fetch(api(`/reviews`), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        target_user_id: Number(target),
                        stars10,
                        comment: comment.trim() || null,
                    }),
                });

                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data?.detail || t("review.submitError", "Не удалось отправить отзыв"));

                // очистим поле комментария и сообщим вверх
                setComment("");
                onReviewSent?.(data);
            } catch (err: any) {
                // можно заменить на ваш toast
                alert(err?.message ?? t("review.error", "Ошибка отправки"));
            } finally {
                setPending(false);
            }
        },
        [target, stars10, comment, pending, onReviewSent]
    );

    return (
        <form onSubmit={submit} className={className}>
            {/* 10 интерактивных звёзд с hover-preview и подтверждением клика */}
            <div className="flex items-center gap-1.5">
                {Array.from({ length: 10 }, (_, i) => {
                    const idx = i + 1;
                    const active = (hover ?? stars10) >= idx;
                    return (
                        <button
                            key={idx}
                            type="button"
                            onMouseEnter={() => setHover(idx)}
                            onMouseLeave={() => setHover(null)}
                            onClick={() => {
                                if (idx !== stars10) {
                                    const ok = window.confirm(
                                        t("review.confirmScore", "Поставить оценку {value} из 10?")
                                            .replace("{value}", String(idx))
                                    );
                                    if (!ok) return;
                                    setStars10(idx);
                                }
                            }}
                            className="p-1"
                            aria-label={t("ratings.setScoreAria", "Поставить оценку {value} из 10").replace("{value}", String(idx))}
                        >
                            <svg viewBox="0 0 24 24" width="24" height="24"
                                className={`transition-opacity ${active ? "text-emerald-400 opacity-100" : "opacity-40"}`}>
                                <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.401 8.167L12 18.896l-7.335 3.868 1.401-8.167L.132 9.21l8.2-1.192L12 .587z"
                                    fill="currentColor" />
                            </svg>
                        </button>
                    );
                })}
                <span className="text-sm opacity-70 ml-2">{stars10} / 10</span>
            </div>

            {/* единый textarea в стиле карточек */}
            {/* (верхний дублирующийся блок удалён) */}

            <div className="mt-3">
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t("review.commentPlaceholder", "Ваш комментарий…")}
                    className="w-full min-h-[110px] rounded-xl bg-slate-900/50 border border-white/10 px-3 py-2 outline-none focus:border-emerald-500/60"
                />
            </div>

            <div className="mt-4">
                <button
                    type="submit"
                    disabled={pending}
                    style={{
                        padding: "10px 18px",
                        background: isLightTheme ? "#0f3b66" : "#43c8ff",
                        color: isLightTheme ? "#f2f6ff" : "#182337",
                        border: 0,
                        borderRadius: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        minWidth: 140,
                        opacity: pending ? 0.75 : 1,
                    }}
                >
                    {pending ? t("review.sending", "Отправка…") : t("review.send", "Отправить")}
                </button>
            </div>
        </form>
    );
}

