"use client";
import { useLang } from "./i18n/LangProvider";

export default function Loading() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    return (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[var(--loader-backdrop,#0b0f19)]">
            <div className="boot-spinner">
                <span className="boot-dot" />
                <span className="boot-dot" />
                <span className="boot-dot" />
            </div>
            <p className="boot-text mt-4">{t("common.loading", "Загрузка…")}</p>
        </div>
    );
}