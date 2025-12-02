import React, { useState, useEffect } from "react";
import TransportCompactCard from "./TransportCompactCard";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";

const SimpleMap = dynamic(() => import("./SimpleMap"), { ssr: false });

function MatchesList({ matches, onClose, router, hoveredItemId, setHoveredItemId }) {
    const { t } = useLang();
    if (!matches || matches.length === 0) {
        return <div style={{ color: "var(--text-secondary)" }}>{t("matchedTransports.empty", "Нет совпавших транспортов.")}</div>;
    }
    return matches.map(tr => (
        <TransportCompactCard
            key={tr.id}
            transport={tr}
            isMobile={false}
            matchesCount={tr.matchesCount}
            hideStatus={true}
            hoveredItemId={hoveredItemId}
            setHoveredItemId={setHoveredItemId}
            enableHoverScroll={true}
            enableHoverLift={true}
            isFocused={hoveredItemId === tr.id}
            managerContext={true}
            isMine={false}
            inModal={true}
            isNew={!!tr.is_new}
            onClick={() => { onClose?.(); router.push(`/transport/${tr.id}`); }}
            data-transport-id={tr.id}
        />
    ));
}

export default function MatchedTransportsModal({ open, onClose, matches, myTransportId, myTransport, myOrder }) {
    const router = useRouter();
    const { t } = useLang();
    const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
    const isLight = resolvedTheme === "light";
    const [hoveredItemId, setHoveredItemId] = useState(null); // <-- hover state для синхронизации карты и списка

    if (!open) return null;

    const modalWidth = 1250;
    const modalHeight = 570;
    const cardsWidth = 0.52;
    const mapWidth = 0.48;

    const palette = {
        overlay: isLight ? "color-mix(in srgb, #0f172a 26%, transparent)" : "rgba(13,23,37,0.85)",
        shellBg: isLight ? "var(--surface)" : "#232d46",
        shellBorder: isLight ? "1px solid var(--border-subtle)" : "1px solid rgba(255,255,255,0.04)",
        shellShadow: isLight ? "0 18px 46px rgba(15,23,42,0.14)" : "0 4px 32px #0d172560",
        heading: "var(--text-primary)",
        close: isLight ? "var(--text-secondary)" : "#82b1ff",
        mapBg: isLight ? "var(--surface-soft)" : "#203153",
        emptyMap: isLight ? "var(--text-muted)" : "#b3d5fa77",
    };

    return (
        <div className="modal-overlay" style={{
            position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", zIndex: 2000,
            background: palette.overlay, display: "flex", justifyContent: "center", alignItems: "center"
        }}
            onClick={onClose} // <--- добавлено
        >
            <div style={{
                background: palette.shellBg,
                borderRadius: 22,
                width: modalWidth,
                height: modalHeight,
                maxWidth: "94vw",
                maxHeight: "95vh",
                boxShadow: palette.shellShadow,
                border: palette.shellBorder,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: 0,
                color: "var(--text-primary)",
            }}
                onClick={e => e.stopPropagation()} // <--- добавлено
            >
                {/* Header */}
                <div style={{
                    width: "100%",
                    padding: "32px 38px 18px 38px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "none",
                    flexShrink: 0,
                }}>
                    <span style={{
                        fontWeight: 700, color: palette.heading, fontSize: 26,
                        letterSpacing: "-0.5px"
                    }}>
                        {t("matchedTransports.title", "Совпавшие транспорты")}
                    </span>
                    <button onClick={onClose}
                        style={{
                            background: "none", border: "none", color: palette.close,
                            fontSize: 36, cursor: "pointer", marginLeft: 18, marginTop: -2
                        }}>×</button>
                </div>

                {/* Контент: Список + Карта */}
                <div style={{
                    flex: 1,
                    width: "100%",
                    display: "flex",
                    flexDirection: "row",
                    gap: 0,
                    padding: "0 30px 30px 30px",
                    minHeight: 0,
                }}>
                    {/* Список карточек слева, только он скроллится */}
                    <div style={{
                        width: `${cardsWidth * 100}%`,
                        minWidth: 320,
                        marginRight: 18,
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        maxHeight: "100%",
                        minHeight: 0,
                    }}>
                        <div
                            style={{
                                flex: 1,
                                height: "100%",
                                overflowY: "auto",
                                overflowX: "visible", // <--- чтобы подсветка не обрезалась по горизонтали!
                                minHeight: 120,
                                paddingRight: 4,
                                width: "100%",
                                maxWidth: "100%",
                                boxSizing: "border-box",
                                position: "relative", // <--- обязательно!
                                zIndex: 1,
                            }}
                        >
                            <MatchesList
                                matches={matches}
                                onClose={onClose}
                                router={router}
                                hoveredItemId={hoveredItemId}
                                setHoveredItemId={setHoveredItemId}
                            />
                        </div>
                    </div>
                    {/* Карта справа, всегда 100% высоты */}
                    <div style={{
                        width: `${mapWidth * 100}%`,
                        minWidth: 350,
                        borderRadius: 16,
                        overflow: "hidden",
                        background: palette.mapBg,
                        display: "flex",
                        height: "100%"
                    }}>
                        {matches && matches.length > 0 ? (
                            <SimpleMap
                                transports={matches}
                                mainOrder={myOrder}
                                mapHeight={"100%"}
                                fitAll={true}
                                showOnlyPins
                                hideControls
                                hideSearch
                                myTransportId={myTransportId}
                                mainTransport={myTransport}
                                style={{ width: "100%", height: "100%" }}
                                hoveredItemId={hoveredItemId}
                                setHoveredItemId={setHoveredItemId}
                            />
                        ) : (
                            <div style={{
                                width: "100%", height: "100%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: palette.emptyMap
                            }}>{t("matchedTransports.emptyMap", "Нет совпавших транспортов на карте")}</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
