import { useEffect, useRef } from "react";

export default function ActionRail({ open, onClose, children, ariaLabel = "Действия" }) {
    const ref = useRef(null);
    useEffect(() => {
        function onKey(e) { if (e.key === "Escape") onClose?.(); }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div
            ref={ref}
            className={`ti-action-rail ${open ? "open" : ""}`}
            role="region"
            aria-label={ariaLabel}
        >
            {children}
        </div>
    );
}
