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

    return (
        <div className="modal-overlay" style={{
            position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", zIndex: 2000,
            background: "rgba(13,23,37,0.85)", display: "flex", justifyContent: "center", alignItems: "center"
        }}
            onClick={onClose} // <--- добавлено
        >
            <div style={{
                background: "#232d46",
                borderRadius: 22,
                width: modalWidth,
                height: modalHeight,
                maxWidth: "94vw",
                maxHeight: "95vh",
                boxShadow: "0 4px 32px #0d172560",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: 0,
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
                        fontWeight: 700, color: "#e3f2fd", fontSize: 26,
                        letterSpacing: "-0.5px"
                    }}>
                        {t("matchedTransports.title", "Совпавшие транспорты")}
                    </span>
                    <button onClick={onClose}
                        style={{
                            background: "none", border: "none", color: "#82b1ff",
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
                        background: "#203153",
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
                                color: "#b3d5fa77"
                            }}>{t("matchedTransports.emptyMap", "Нет совпавших транспортов на карте")}</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
