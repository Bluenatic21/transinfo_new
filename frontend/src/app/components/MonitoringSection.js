"use client";
import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { useUser } from "@/app/UserContext";
import GpsRequestsSection from "@/app/components/GpsRequestsSection";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useLang } from "@/app/i18n/LangProvider";

const LiveTrackLayer = dynamic(() => import("@/app/components/LiveTrackLayer"), { ssr: false });

// Перевод статусов в DOM-ноду (используется для GpsRequestsSection, где текст статусов приходит EN)
function translateStatusesInNode(root, map) {
    if (!root || !map) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const t of texts) {
        const v = (t.nodeValue || "").trim();
        if (!v) continue;
        const upper = v.toUpperCase();
        if (map[upper]) t.nodeValue = map[upper];
    }
}

// Хелперы отображения
const getAvatarSrc = (u) => {
    const p = u?.avatar_url || u?.avatar || null;
    if (!p) return "/default-avatar.png";
    return abs(p);
};
// имя
function getDisplayName(u = {}, t) {
    return (
        u.company ||
        u.organization ||
        u.name ||
        `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
        u.contact_person ||
        u.username ||
        t("user.noName", "Имя не указано")
    );
}
// роль
function getRoleLabel(role, t) {
    const key = (typeof role === "string" ? role : (role?.value || role?.name || "")).toString().toUpperCase();
    const map = {
        OWNER: t("role.owner", "Грузовладелец"),
        TRANSPORT: t("role.transport", "Перевозчик"),
        MANAGER: t("role.manager", "Экспедитор"),
        EMPLOYEE: t("role.employee", "Экспедитор"),
    };
    return map[key] || "";
}

export default function MonitoringSection() {
    const { t } = useLang?.() || { t: (_k, f) => f };
    const isMobile = useIsMobile(768);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // UI пресеты
    const BTN = "inline-flex items-center justify-center h-11 px-4 rounded-xl font-semibold border transition-all duration-150 shadow-sm active:scale-95 select-none";
    const BTN_SOLID = "bg-[#152338] hover:bg-[#1b2b44] active:bg-[#0f1b2a] border-[#2a3e65] text-[#c9def5]";
    const BTN_GHOST = "bg-transparent hover:bg-[#0f1b2a] active:bg-[#0c1524] border-[#2a3e65]/40 text-[#9cc4e7]";
    const BTN_DANGER = "bg-[#2a1a1a] hover:bg-[#3a2020] active:bg-[#211313] border-[#5b2d2d] text-[#f5c9c9]";
    const tabBtnClass = (active) => `${BTN} ${active ? BTN_SOLID : BTN_GHOST} w-full text-center`;

    // Мобильный слайд-ап карты
    const openSheet = (sid) => {
        setSelected(sid);
        if (isMobile) setIsSheetOpen(true);
    };
    const closeSheet = () => {
        setIsSheetOpen(false);
        if (isMobile) setTimeout(() => setSelected(null), 200);
    };

    const { authFetchWithRefresh, user } = useUser();
    const [incoming, setIncoming] = useState([]); // со мной делятся
    const [outgoing, setOutgoing] = useState([]); // кому делюсь я
    const [selected, setSelected] = useState(null); // session_id выбранного шаринга
    const [tab, setTab] = useState("incoming");
    const requestsPaneRef = useRef(null);

    // Данные профилей участників шаринга
    const [peersById, setPeersById] = useState({});
    useEffect(() => {
        const ids = new Set();
        incoming.forEach(it => it?.from_user_id && ids.add(it.from_user_id));
        outgoing.forEach(it => it?.to_user_id && ids.add(it.to_user_id));
        const need = [...ids].filter(id => !peersById[id]);
        if (!need.length) return;
        let alive = true;
        (async () => {
            for (const id of need) {
                try {
                    let res = await authFetchWithRefresh(api(`/users/${id}`));
                    if (!res.ok) res = await authFetchWithRefresh(api(`/users/profile/${id}`));
                    if (!res.ok) continue;
                    const u = await res.json();
                    if (alive && u?.id) setPeersById(prev => ({ ...prev, [u.id]: u }));
                } catch { /* no-op */ }
            }
        })();
        return () => { alive = false; };
    }, [incoming, outgoing, authFetchWithRefresh]);

    // Загрузка списков
    const loadData = async () => {
        const r1 = await authFetchWithRefresh(api(`/track/incoming`));
        const r2 = await authFetchWithRefresh(api(`/track/outgoing`));
        try {
            const [a, b] = await Promise.all([r1.json(), r2.json()]);
            setIncoming(Array.isArray(a) ? a : []);
            setOutgoing(Array.isArray(b) ? b : []);
        } catch {
            setIncoming([]);
            setOutgoing([]);
        }
    };
    useEffect(() => { loadData(); }, []);

    // Live-обновления
    useEffect(() => {
        const token = (typeof window !== "undefined" && localStorage.getItem("token")) || "";
        if (!token) return;
        const ws = new WebSocket(ws(`/ws/track/shares_user?token=${encodeURIComponent(token)}`));
        ws.onmessage = (e) => {
            try {
                const { type, from_user_id, to_user_id, session } = JSON.parse(e.data);
                if (type === "incoming_share") {
                    setIncoming(prev => {
                        const map = new Map(prev.map(it => [it.from_user_id, it]));
                        map.set(from_user_id, { ...map.get(from_user_id), ...session, from_user_id });
                        return Array.from(map.values());
                    });
                } else if (type === "incoming_unshare") {
                    setIncoming(prev => prev.filter(it => it.from_user_id !== from_user_id && it.session?.id !== session?.id));
                    if (selected && session?.id && selected === session.id) setSelected(null);
                } else if (type === "outgoing_share") {
                    setOutgoing(prev => {
                        const map = new Map(prev.map(it => [it.to_user_id, it]));
                        map.set(to_user_id, { ...map.get(to_user_id), ...session, to_user_id });
                        return Array.from(map.values());
                    });
                } else if (type === "outgoing_unshare") {
                    setOutgoing(prev => prev.filter(it => it.to_user_id !== to_user_id && it.session?.id !== session?.id));
                }
            } catch { }
        };
        ws.onclose = () => { };
        ws.onerror = () => { };
        return () => { try { ws.close(); } catch { } };
    }, [selected]);

    // Локализованные подписи статусов для DOM-переводчика
    const STATUS_LABELS = {
        PENDING: t("gps.status.pending", "ОЖИДАНИЕ"),
        ACCEPTED: t("gps.status.accepted", "ПРИНЯТО"),
        REJECTED: t("gps.status.rejected", "ОТКЛОНЕНО"),
        CANCELLED: t("gps.status.cancelled", "ОТМЕНЕНО"),
    };

    // Прогоним перевод статусов внутри секций запросов
    useEffect(() => {
        if (!requestsPaneRef.current) return;
        if (!(tab === "req_out" || tab === "req_in")) return;
        const root = requestsPaneRef.current;
        translateStatusesInNode(root, STATUS_LABELS); // первичный прогон
        const mo = new MutationObserver(() => translateStatusesInNode(root, STATUS_LABELS));
        mo.observe(root, { childList: true, subtree: true, characterData: true });
        return () => mo.disconnect();
    }, [tab, t]); // при смене языка прогоняем заново

    const stopShare = async (sessionId, userId) => {
        const url = new URL(api(`/track/sessions/${sessionId}/unshare`));
        if (userId) url.searchParams.set("recipient_id", String(userId));
        await authFetchWithRefresh(url.toString(), { method: "POST" });
        loadData();
    };

    // Карточка списка
    const Card = ({ title, items, type }) => (
        <div className="rounded-2xl p-3" style={{ background: "#0B1622", border: "1px solid #233655", boxShadow: "0 2px 14px #19396922" }}>
            <div className="text-sm opacity-80 mb-2">{title}</div>
            <div className="flex flex-col gap-2">
                {items.map((it) => {
                    const sid = it.session?.id;
                    const isSelected = sid && selected === sid && type === "incoming";
                    const userId = type === "incoming" ? it.from_user_id : it.to_user_id;
                    const fallbackName = it.from_user_name || it.to_user_name || t("common.user", "Пользователь");
                    const peer = (userId && peersById[userId]) ? peersById[userId] : { id: userId, name: fallbackName };
                    const avatarSrc = getAvatarSrc(peer);
                    const name = getDisplayName(peer, t);
                    const roleLabel = getRoleLabel(peer?.role, t);

                    return (
                        <div
                            key={`${type}-${userId || sid}`}
                            className="rounded-xl p-3"
                            onClick={() => sid && (isMobile ? openSheet(sid) : setSelected(sid))}
                            style={{
                                background: isSelected ? "#132238" : "#0f1b2a",
                                border: "1px solid rgba(255,255,255,.08)",
                                cursor: sid ? "pointer" : "default"
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <img
                                    src={avatarSrc}
                                    alt="avatar"
                                    width={42}
                                    height={42}
                                    style={{
                                        borderRadius: 10,
                                        objectFit: "cover",
                                        border: "1.6px solid #223350",
                                        background: "#182337",
                                        display: "block",
                                        flexShrink: 0
                                    }}
                                    onError={(e) => { e.currentTarget.src = "/default-avatar.png"; }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        <div
                                            style={{
                                                fontSize: 14,
                                                fontWeight: 700,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                maxWidth: "100%"
                                            }}
                                            title={name}
                                        >
                                            {name}
                                        </div>
                                        {roleLabel && (
                                            <span
                                                style={{
                                                    marginLeft: "auto",
                                                    fontSize: 12,
                                                    fontWeight: 800,
                                                    padding: "4px 8px",
                                                    borderRadius: 999,
                                                    background: "#182b4a",
                                                    border: "1px solid #2a3e65",
                                                    color: "#9cc4e7",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {roleLabel}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs opacity-70">
                                        {t("gps.transport", "Транспорт")}: {it.transport_id || t("common.dash", "—")}
                                    </div>

                                    {type === "incoming" ? (
                                        <div className="mt-2 flex items-center gap-4">
                                            <div className="text-xs opacity-70">{t("gps.tip.openMap", "Нажмите, чтобы открыть карту")}</div>
                                            {it.session?.id && (
                                                <button
                                                    className={`${BTN} ${BTN_SOLID} gps-button`}
                                                    style={isMobile ? { minWidth: 140 } : undefined}
                                                    onClick={(e) => { e.stopPropagation(); stopShare(it.session?.id, user?.id); }}
                                                    title={t("gps.stop.self", "Остановить у себя")}
                                                >
                                                    {t("gps.stop", "Остановить")}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <button
                                            className={`${BTN} ${BTN_DANGER} mt-2 gps-button`}
                                            style={isMobile ? { minWidth: 140 } : undefined}
                                            onClick={() => stopShare(it.session?.id, it.to_user_id)}
                                        >
                                            {t("gps.stop", "Остановить")}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {items.length === 0 && (
                    <div className="px-3 py-6 text-sm opacity-70">{t("common.empty", "Пусто")}</div>
                )}
            </div>
        </div>
    );

    const PANEL_H = isMobile ? (isMapExpanded ? "calc(100vh - 112px)" : "56vh") : "65vh";

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 2xl:gap-8">
                {/* ЛЕВАЯ КОЛОНКА */}
                <div className={`${tab === "incoming" ? "order-2" : "order-1"} lg:order-none lg:col-span-5 2xl:col-span-4 flex flex-col gap-4 min-w-[320px]`}>
                    {/* Вкладки */}
                    <div
                        className="gps-tabs"
                        style={isMobile ? {
                            display: "flex",
                            gap: 12,
                            overflowX: "auto",
                            paddingBottom: 4,
                            WebkitOverflowScrolling: "touch"
                        } : {
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 12,
                            width: "100%"
                        }}
                    >
                        <button
                            onClick={() => setTab("incoming")}
                            className={`${tabBtnClass(tab === "incoming")} gps-tab`}
                            aria-current={tab === "incoming" ? "page" : undefined}
                            style={isMobile ? { minWidth: 160 } : undefined}
                        >
                            {t("gps.tabs.incoming", "Со мной делятся")}
                        </button>
                        <button
                            onClick={() => setTab("outgoing")}
                            className={`${tabBtnClass(tab === "outgoing")} gps-tab`}
                            aria-current={tab === "outgoing" ? "page" : undefined}
                            style={isMobile ? { minWidth: 160 } : undefined}
                        >
                            {t("gps.tabs.outgoing", "Кому я делюсь")}
                        </button>
                        <button
                            onClick={() => setTab("req_in")}
                            className={`${tabBtnClass(tab === "req_in")} gps-tab`}
                            aria-current={tab === "req_in" ? "page" : undefined}
                            style={isMobile ? { minWidth: 160 } : undefined}
                        >
                            {t("gps.tabs.req_in", "Входящие запросы")}
                        </button>
                        <button
                            onClick={() => setTab("req_out")}
                            className={`${tabBtnClass(tab === "req_out")} gps-tab`}
                            aria-current={tab === "req_out" ? "page" : undefined}
                            style={isMobile ? { minWidth: 160 } : undefined}
                        >
                            {t("gps.tabs.req_out", "Исходящие запросы")}
                        </button>
                    </div>

                    {/* Списки по активной вкладке */}
                    <div style={{ display: "flex", flexDirection: "column", height: PANEL_H }}>
                        <div style={{ flex: 1, overflow: "auto" }} ref={requestsPaneRef}>
                            {tab === "incoming" && (
                                <Card title={t("gps.titles.currentIncoming", "Текущие входящие шаринги")} items={incoming} type="incoming" />
                            )}
                            {tab === "outgoing" && (
                                <Card title={t("gps.titles.currentOutgoing", "Текущие исходящие шаринги")} items={outgoing} type="outgoing" />
                            )}
                            {tab === "req_in" && <GpsRequestsSection key="gps-in" preset="in" hideTabs />}
                            {tab === "req_out" && <GpsRequestsSection key="gps-out" preset="out" hideTabs />}
                        </div>
                    </div>
                </div>

                {/* ПРАВАЯ КОЛОНКА: карта (desktop) */}
                {!isMobile && (
                    <div className={`${tab === "incoming" ? "order-1" : "order-2"} lg:order-none lg:col-span-7 2xl:col-span-8`}>
                        <div className="rounded-2xl" style={{ background: "#0B1622", border: "1px solid rgba(255,255,255,.06)" }}>
                            <div className="px-3 py-2 text-sm opacity-80 flex items-center justify-between">
                                <span>{t("gps.map", "GPS карта")}</span>
                                {isMobile && tab === "incoming" && selected ? (
                                    <button
                                        onClick={() => setIsMapExpanded(v => !v)}
                                        className="gps-button px-2 py-1 rounded-lg text-xs ml-auto"
                                    >
                                        {isMapExpanded ? t("common.collapse", "Свернуть") : t("common.expand", "На весь экран")}
                                    </button>
                                ) : null}
                            </div>

                            {tab === "incoming" ? (
                                selected ? (
                                    <div style={{ height: PANEL_H, borderRadius: 16, overflow: "hidden" }}>
                                        <MapContainer center={[54, 39]} zoom={5} style={{ height: "100%" }}>
                                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                            <LiveTrackLayer
                                                sessionId={selected}
                                                token={(typeof window !== "undefined" && localStorage.getItem("token")) || ""}
                                            />
                                        </MapContainer>
                                    </div>
                                ) : (
                                    <div style={{
                                        height: PANEL_H, borderRadius: 16, display: "flex", alignItems: "center",
                                        justifyContent: "center", background: "#0f1b2a", border: "1px dashed rgba(255,255,255,.08)"
                                    }}>
                                        <div className="opacity-70 text-sm">
                                            {t("gps.chooseIncomingHint", "Выберите пользователя в «Текущие входящие шаринги», чтобы открыть карту")}
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div style={{
                                    height: PANEL_H, borderRadius: 16, display: "flex", alignItems: "center",
                                    justifyContent: "center", background: "#0f1b2a", border: "1px dashed rgba(255,255,255,.08)"
                                }}>
                                    <div className="opacity-70 text-sm">
                                        {t("gps.mapOnlyIncoming", "Карта доступна во вкладке «Со мной делятся»")}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Мобильный слайд-ап с картой */}
            {isMobile && selected && (
                <>
                    {/* overlay */}
                    <div
                        onClick={closeSheet}
                        style={{
                            position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
                            opacity: isSheetOpen ? 1 : 0, transition: "opacity .25s ease",
                            pointerEvents: isSheetOpen ? "auto" : "none", zIndex: 60
                        }}
                    />
                    {/* sheet */}
                    <div
                        style={{
                            position: "fixed", left: 0, right: 0, bottom: 0, height: "72vh",
                            background: "#0B1622", borderTopLeftRadius: 16, borderTopRightRadius: 16,
                            boxShadow: "0 -8px 30px rgba(0,0,0,.5)",
                            transform: isSheetOpen ? "translateY(0)" : "translateY(100%)",
                            transition: "transform .25s ease",
                            zIndex: 61
                        }}
                    >
                        <div className="px-3 py-2 text-sm opacity-80 flex items-center justify-between">
                            <span>{t("gps.map", "GPS карта")}</span>
                            <button
                                onClick={closeSheet}
                                className={`${BTN} ${BTN_GHOST} gps-button`}
                            >
                                {t("common.close", "Закрыть")}
                            </button>
                        </div>
                        <div style={{ height: "calc(72vh - 40px)", borderRadius: 16, overflow: "hidden", margin: 8 }}>
                            <MapContainer center={[54, 39]} zoom={5} style={{ height: "100%" }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <LiveTrackLayer
                                    sessionId={selected}
                                    token={(typeof window !== "undefined" && localStorage.getItem("token")) || ""}
                                />
                            </MapContainer>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
