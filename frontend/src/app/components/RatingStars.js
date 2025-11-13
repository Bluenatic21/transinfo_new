"use client";
import React from "react";
import { FaStar, FaRegStar } from "react-icons/fa";
import { useLang } from "../i18n/LangProvider";

/**
 * Рендерит 10 звёзд с цветом по рейтингу:
 * 10 -> зелёный, 0 -> красный, остальные — плавный переход.
 * Поддерживает дробные значения (частично закрашенная звезда).
 */
export default function RatingStars({
    value = 10,
    size = 18,
    showNumber = false,
    className = "",
}) {
    const { t } = useLang();
    const v = Math.max(0, Math.min(10, Number(value) || 0));
    // HSL: 0 (красный) -> 120 (зелёный). При 10 баллах hue=120, при 0 — hue=0.
    const hue = (v / 10) * 120;
    const color = `hsl(${hue}, 90%, 45%)`;
    const emptyColor = "rgba(255,255,255,0.15)"; // нейтральный для пустых

    // Сколько полных и сколько дробной части
    const full = Math.floor(v);
    const frac = v - full; // 0..1
    const stars = Array.from({ length: 10 });

    return (
        <div
            className={`flex items-center gap-1 ${className}`}
            aria-label={t("ratings.aria", "Рейтинг {value} из 10").replace("{value}", v.toFixed(1))}
        >
            <div className="flex items-center">
                {stars.map((_, i) => {
                    const index = i + 1;
                    // Полная звезда
                    if (index <= full) {
                        return <FaStar key={i} size={size} color={color} />;
                    }
                    // Частично-закрашенная звезда
                    if (index === full + 1 && frac > 0) {
                        return (
                            <span key={i} className="relative" style={{ width: size, height: size, display: "inline-block" }}>
                                {/* пустая подложка */}
                                <FaRegStar size={size} color={emptyColor} style={{ position: "absolute", inset: 0 }} />
                                {/* цветная маска по ширине процента */}
                                <span
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        width: `${Math.round(frac * 100)}%`,
                                        overflow: "hidden",
                                        display: "inline-block",
                                    }}
                                >
                                    <FaStar size={size} color={color} />
                                </span>
                            </span>
                        );
                    }
                    // Пустая звезда
                    return <FaRegStar key={i} size={size} color={emptyColor} />;
                })}
            </div>
            {showNumber && (
                <span style={{ color, fontWeight: 700, fontSize: Math.round(size * 0.9) }}>
                    {v.toFixed(1)}
                </span>
            )}
        </div>
    );
}
