"use client";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/app/i18n/LangProvider";


export default function MonitoringSoonGuard() {
    const { t } = useLang();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // ловим ?monitoring=1 и сразу чистим URL
    useEffect(() => {
        const m = searchParams?.get("monitoring");
        if (m) {
            setOpen(true);
            // чистим query, остаёмся на /profile
            router.replace(pathname);
        }
    }, [searchParams, pathname, router]);

    if (!open) return null;
    if (typeof document === "undefined") return null;

    return ReactDOM.createPortal(
        <div
            onClick={() => setOpen(false)}
            style={{
                position: "fixed", inset: 0, background: "#001a", zIndex: 200000,
                display: "flex", alignItems: "center", justifyContent: "center"
            }}>
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "min(92vw, 520px)",
                    background: "#0f1b2e",
                    border: "1px solid #1f3355",
                    borderRadius: 14,
                    padding: 22,
                    color: "#cde2ff",
                    boxShadow: "0 10px 40px #0008"
                }}>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                    {t("gps.soon.title", "Скоро доступно")}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: "#9ec8ff" }}>
                    {t("gps.soon.body", "GPS-мониторинг находится в разработке и появится в ближайших обновлениях.")}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
                    <button
                        onClick={() => setOpen(false)}
                        style={{ background: "#43c8ff", color: "#fff", border: "none", borderRadius: 9, padding: "8px 18px", fontWeight: 800, cursor: "pointer" }}>
                        {t("common.ok", "Понятно")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
