// src/app/components/ui/IconLabel.jsx
import React from "react";

/**
 * На мобилке показывает иконку, на ≥sm — текст с иконкой слева.
 * Пример: <IconLabel icon={MapIcon} label="Карта" />
 */
export default function IconLabel({ icon: Icon, label, className = "" }) {
    return (
        <span className={`inline-flex items-center gap-2 ${className}`}>
            <Icon className="w-5 h-5" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
            {/* доступность */}
            <span className="sr-only">{label}</span>
        </span>
    );
}