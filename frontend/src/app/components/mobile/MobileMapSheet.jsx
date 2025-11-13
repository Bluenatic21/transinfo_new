// src/app/components/mobile/MobileMapSheet.jsx
"use client";
import ReactDOM from "react-dom";
import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// карта лежит уровнем выше текущей папки
const SimpleMap = dynamic(() => import("../SimpleMap"), { ssr: false });

export default function MobileMapSheet({
    open,
    onClose,
    transports = [],   // список транспорта
    orders = [],       // список грузов
    filters,
    setFiltersFromMap, // тот же колбэк, что на десктопе
    onFilteredIdsChange, // чтобы показывать count и отрисовывать отфильтрованные карточки
}) {
    const backdropRef = useRef(null);

    const sheetRef = useRef(null);
    const [offset, setOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const startRef = useRef({ y: 0, t: 0, start: 0 });

    const [SNAP, setSNAP] = useState({ HALF: 300, CLOSED: 700 });
    useEffect(() => {
        function recalc() {
            const vh = window.innerHeight || 800;
            setSNAP({ HALF: Math.round(vh * 0.45), CLOSED: Math.round(vh * 0.92) });
        }
        recalc();
        window.addEventListener("resize", recalc);
        return () => window.removeEventListener("resize", recalc);
    }, []);

    useEffect(() => { if (open) setOffset(0); }, [open]);

    const onPointerDown = (e) => {
        const handle = e.target.closest?.('[data-handle="true"]');
        if (!handle) return;
        setDragging(true);
        startRef.current = { y: e.clientY, t: Date.now(), start: offset };
        sheetRef.current?.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
        if (!dragging) return;
        const dy = e.clientY - startRef.current.y;
        const next = Math.max(0, Math.min(SNAP.CLOSED, startRef.current.start + dy));
        setOffset(next);
    };
    const onPointerUp = (e) => {
        if (!dragging) return;
        setDragging(false);
        const dy = e.clientY - startRef.current.y;
        const dt = Math.max(1, Date.now() - startRef.current.t);
        const v = dy / dt;

        let target = 0;
        if (offset > (SNAP.HALF + SNAP.CLOSED) / 2 || v > 0.6) target = SNAP.CLOSED;
        else if (offset > (0 + SNAP.HALF) / 2 || v > 0.35) target = SNAP.HALF;
        else target = 0;

        setOffset(target);
        if (target === SNAP.CLOSED) setTimeout(() => onClose?.(), 180);
    };

    // блокируем прокрутку фона при открытии шторки
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    if (!open) return null;

    const portalTarget = (typeof document !== "undefined" && document.body) || null;
    const overlay = (
        <div
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) onClose?.(); }}
            style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(0,10,20,.45)", backdropFilter: "blur(2px)" }}
            aria-modal="true" role="dialog"
        >
            <div
                ref={sheetRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                    position: "absolute",
                    left: 0, right: 0, bottom: 0,
                    height: "88vh",
                    maxHeight: "90vh",
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    overflow: "hidden",
                    background: "rgba(18,32,52,0.98)",
                    boxShadow: "0 -10px 30px rgba(0,0,0,.35)",
                    transform: `translateY(${offset}px)`,
                    transition: dragging ? "none" : "transform 180ms cubic-bezier(.2,.8,.2,1)",
                    willChange: "transform"
                }}
            >
                {/* хэндл для перетаскивания */}
                <div data-handle="true" style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
                    <div style={{ width: 36, height: 4, borderRadius: 4, background: "rgba(255,255,255,.35)" }} />
                </div>

                {/* карта на всю шторку */}
                <div style={{ height: "calc(100% - 18px)" }}>
                    <SimpleMap fullHeight
                        transports={Array.isArray(transports) && transports.length ? transports : undefined}
                        orders={Array.isArray(orders) && orders.length ? orders : undefined}
                        filters={filters}
                        setFilters={setFiltersFromMap}
                        onFilteredIdsChange={onFilteredIdsChange}
                    />
                </div>
            </div>
        </div>
    );
    return portalTarget ? ReactDOM.createPortal(overlay, portalTarget) : overlay;
}
