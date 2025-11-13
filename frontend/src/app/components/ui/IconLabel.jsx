// src/app/components/ui/IconLabel.jsx
import React from "react";

/**
 * На мобилке показывает иконку, на ≥sm — текст.
 * Пример: <IconLabel icon={MapIcon} label="Карта" />
 */
export default function IconLabel({ icon: Icon, label, className = "" }) {
    return (
        <>
            {/* мобилка: только иконка */}
            <Icon className={`inline sm:hidden w-5 h-5 ${className}`} aria-hidden />
            {/* ≥sm: только текст */}
            <span className="hidden sm:inline">{label}</span>
            {/* доступность */}
            <span className="sr-only">{label}</span>
        </>
    );
}