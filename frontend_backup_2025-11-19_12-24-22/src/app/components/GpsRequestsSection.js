"use client";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useUser } from "@/app/UserContext";
import { useLang } from "@/app/i18n/LangProvider";
import { api } from "@/config/env";
const RequestGpsModal = dynamic(() => import("@/app/components/RequestGpsModal"), { ssr: false });
const ShareLocationModal = dynamic(() => import("@/app/components/ShareLocationModal"), { ssr: false });


const PAGE_SIZE = 10;

/**
 * Универсальная секция запросов GPS.
 * Показывает входящие и исходящие запросы и даёт быстрый доступ к:
 *  - кнопке «Запросить GPS» (во вкладке Входящие запросы)
 *  - кнопке «Поделиться» (во вкладке Исходящие запросы)
 * Обе кнопки открывают существующие модалки и передают туда order_id выбранной строки.
 */
export default function GpsRequestsSection({ preset = "in", hideTabs = false }) {
    const { authFetchWithRefresh } = useUser();
    const { t } = useLang();
    const STATUS = {
        PENDING: t("gps.status.PENDING", "ОЖИДАНИЕ"),
        ACCEPTED: t("gps.status.ACCEPTED", "ПРИНЯТО"),
        DECLINED: t("gps.status.DECLINED", "ОТКЛОНЕНО"),
        CANCELED: t("gps.status.CANCELED", "ОТМЕНЕНО"),
        EXPIRED: t("gps.status.EXPIRED", "ПРОСРОЧЕНО"),
        REVOKED: t("gps.status.REVOKED", "ОТОЗВАНО"),
        STOPPED: t("gps.status.STOPPED", "ОСТАНОВЛЕНО"),
    };
    const [tab, setTab] = useState(preset === "out" ? "out" : "in");
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [loading, setLoading] = useState(false);
    // пагинация
    const [pageIn, setPageIn] = useState(1);
    const [pageOut, setPageOut] = useState(1);
    const [hasMoreIn, setHasMoreIn] = useState(false);
    const [hasMoreOut, setHasMoreOut] = useState(false);

    // выбор строки -> используем её order_id для модалок
    const [selected, setSelected] = useState(null); // {id, order_id,...}

    // модалки
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);

    const reload = async () => {
        setLoading(true);
        try {
            const [rIn, rOut] = await Promise.all([
                authFetchWithRefresh(api(`/track/requests/incoming?page=${pageIn}&size=${PAGE_SIZE}`)),
                authFetchWithRefresh(api(`/track/requests/outgoing?page=${pageOut}&size=${PAGE_SIZE}`)),
            ]);
            const makeIn = async (resp) => {
                if (!resp?.ok) return [];
                const data = await resp.json();
                const arr = (Array.isArray(data) ? data : []).map((it) => ({
                    id: it?.request?.id || it?.id,
                    order_id: it?.request?.order_id ?? it?.order_id ?? null,
                    from_user_id: it?.from_user_id ?? null,
                    from_user_name: it?.from_user_name || t("common.user", "Пользователь"),
                    message: it?.request?.message ?? it?.message ?? null,
                    status: (it?.request?.status || it?.status || "PENDING").toString(),
                    created_at: it?.request?.created_at || it?.created_at || null,
                })).filter(x => x.id);
                setHasMoreIn(arr.length === PAGE_SIZE);
                return arr;
            };
            const makeOut = async (resp) => {
                if (!resp?.ok) return [];
                const data = await resp.json();
                const arr = (Array.isArray(data) ? data : []).map((it) => ({
                    id: it?.request?.id || it?.id,
                    order_id: it?.request?.order_id ?? it?.order_id ?? null,
                    to_user_id: it?.to_user_id ?? null,
                    to_user_name: it?.to_user_name || t("common.user", "Пользователь"),
                    message: it?.request?.message ?? it?.message ?? null,
                    status: (it?.request?.status || it?.status || "PENDING").toString(),
                    created_at: it?.request?.created_at || it?.created_at || null,
                })).filter(x => x.id);
                setHasMoreOut(arr.length === PAGE_SIZE);
                return arr;
            };
            setIncoming(await makeIn(rIn));
            setOutgoing(await makeOut(rOut));
        } catch (e) {
            console.error("[GpsRequestsSection] reload error:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); }, [pageIn, pageOut]);

    const rows = tab === "in" ? incoming : outgoing;

    const Header = () => (
        <div className="flex items-center mb-2" style={{ gap: 12, width: "100%" }}>
            {!hideTabs && (
                // Две равные колонки для табов
                <div
                    className="gps-tabs"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                        width: "100%",
                        maxWidth: 520
                    }}
                >
                    <button
                        onClick={() => { setTab("in"); setSelected(null); }}
                        className={`gps-tab w-full text-center ${tab === "in" ? "is-active" : ""}`}
                        aria-current={tab === "in" ? "page" : undefined}
                    >
                        {t("gps.tabs.in", "Входящие запросы")}
                    </button>
                    <button
                        onClick={() => { setTab("out"); setSelected(null); }}
                        className={`gps-tab w-full text-center ${tab === "out" ? "is-active" : ""}`}
                        aria-current={tab === "out" ? "page" : undefined}
                    >
                        {t("gps.tabs.out", "Исходящие запросы")}
                    </button>
                </div>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {tab === "in" && (
                    <button
                        onClick={() => setShowRequestModal(true)}
                        className="gps-button"
                        title={t("gps.request", "Запросить GPS")}
                    >
                        {t("gps.request", "Запросить GPS")}
                    </button>
                )}
                {tab === "out" && (
                    <button
                        onClick={() => setShowShareModal(true)}
                        className="gps-button"
                        title={t("gps.share", "Поделиться GPS")}
                    >
                        {t("gps.share", "Поделиться GPS")}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="rounded-2xl p-3" style={{ background: "#0f1b2a", border: "1px solid #233655", boxShadow: "0 2px 14px #19396922" }}>
            <Header />
            <div className="rounded-xl" style={{ border: "1px solid rgba(255,255,255,.06)" }}>
                {loading && <div className="px-3 py-4 text-sm opacity-70">{t("common.loading", "Загрузка…")}</div>}
                {!loading && rows.length === 0 && <div className="px-3 py-6 text-sm opacity-70">{t("common.empty", "Пусто")}</div>}
                {!loading && rows.length > 0 && rows.map((r) => {
                    const isSel = selected?.id === r.id;
                    return (
                        <div
                            key={r.id}
                            onClick={() => setSelected(r)}
                            className="px-3 py-2"
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                gap: 12,
                                cursor: "pointer",
                                background: isSel ? "#142234" : "transparent",
                                borderBottom: "1px solid rgba(255,255,255,.06)"
                            }}
                        >
                            <div>
                                <div className="text-sm" style={{ fontWeight: 700 }}>
                                    {t("order.requestShort", "Заявка")} #{r.order_id || "—"}
                                </div>
                                <div className="text-xs opacity-80">
                                    {tab === "in" ? t("gps.from", "От:") : t("gps.to", "Кому:")}{" "}
                                    {tab === "in"
                                        ? (r.from_user_name || "—")
                                        : (r.to_user_name || "—")}
                                </div>
                                {r.message && <div className="text-xs opacity-70 mt-1">{r.message}</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <span className="text-xs" style={{
                                    padding: "3px 8px",
                                    borderRadius: 999,
                                    border: "1px solid rgba(255,255,255,.1)",
                                    background: "#11233a"
                                }}>
                                    {STATUS[String(r.status || "").toUpperCase()] || String(r.status || "").toUpperCase()}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Пагинация */}
            <div className="flex items-center justify-between px-2 py-3">
                {tab === "in" ? (
                    <>
                        <button
                            className="gps-button disabled:opacity-40"
                            onClick={() => setPageIn(p => Math.max(1, p - 1))}
                            disabled={pageIn <= 1 || loading}
                        >
                            {t("common.prev", "Назад")}
                        </button>
                        <div className="text-xs opacity-70">{t("common.pageShort", "Стр.")} {pageIn}</div>
                        <button
                            className="gps-button disabled:opacity-40"
                            onClick={() => setPageIn(p => p + 1)}
                            disabled={!hasMoreIn || loading}
                        >
                            {t("common.next", "Вперёд")}
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            className="gps-button disabled:opacity-40"
                            onClick={() => setPageOut(p => Math.max(1, p - 1))}
                            disabled={pageOut <= 1 || loading}
                        >
                            {t("common.prev", "Назад")}
                        </button>
                        <div className="text-xs opacity-70">{t("common.pageShort", "Стр.")} {pageOut}</div>
                        <button
                            className="gps-button disabled:opacity-40"
                            onClick={() => setPageOut(p => p + 1)}
                            disabled={!hasMoreOut || loading}
                        >
                            {t("common.next", "Вперёд")}
                        </button>
                    </>
                )}
            </div>

            {/* Модалки */}
            <RequestGpsModal
                open={showRequestModal}
                onClose={() => setShowRequestModal(false)}
                orderId={selected?.order_id || null}
                onRequested={() => { setPageIn(1); reload(); }}
            />
            <ShareLocationModal
                open={showShareModal}
                onClose={() => setShowShareModal(false)}
                orderId={selected?.order_id || null}
                onShared={() => { setPageOut(1); reload(); }}
            />
        </div>
    );
}
