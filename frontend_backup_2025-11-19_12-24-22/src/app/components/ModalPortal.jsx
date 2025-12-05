"use client";
import { useEffect } from "react";
import ReactDOM from "react-dom";
import { useLang } from "../i18n/LangProvider";

export default function ModalPortal({
    open,
    onClose,
    title,
    children,
    variant = "center",      // "sheet" | "fullscreen" | "center"
    maxHeight = "85vh",
}) {
    const { t } = useLang?.() || { t: (_k, f) => f };
    if (typeof document === "undefined" || !open) return null;
    const root = document.getElementById("modal-root");
    if (!root) return null;

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    const overlay = (
        <div className="modal-overlay" onClick={onClose} />
    );

    const panelBase = "bg-[#0b1422] text-white shadow-xl";
    let panelClass = "";
    let panelStyle = {};
    if (variant === "sheet") {
        panelClass = "modal-sheet rounded-t-2xl p-4";
        panelStyle = { maxHeight, overflowY: "auto" };
    } else if (variant === "fullscreen") {
        panelClass = "modal-full p-3";
        panelStyle = { height: "100vh", overflow: "hidden" };
    } else {
        panelClass = "fixed inset-x-0 mx-3 md:mx-auto top-1/2 -translate-y-1/2 z-[1001] max-w-xl w-full rounded-2xl p-4 md:p-6";
        panelStyle = { maxHeight, overflowY: "auto" };
    }

    const content = (
        <>
            {overlay}
            <div className={`${panelBase} ${panelClass}`} style={panelStyle} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-3">
                    {title && <h3 className="text-lg font-semibold">{title}</h3>}
                    <button onClick={onClose} className="ml-auto rounded-xl px-3 py-1 bg-white/10 hover:bg-white/15">
                        {t("common.close", "Закрыть")}
                    </button>
                </div>
                <div className={variant === "fullscreen" ? "h-[calc(100vh-56px)]" : ""}>
                    {children}
                </div>
            </div>
        </>
    );

    return ReactDOM.createPortal(content, root);
}
