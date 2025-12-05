import React from "react";
import { useLang } from "../i18n/LangProvider";

export default function ModernMicButton({ onDown, onUp, onLeave, recording, disabled }) {
    const { t } = useLang();
    return (
        <button
            type="button"
            className="action-btn action-btn--mic"
            data-recording={recording ? "true" : "false"}
            title={recording ? t("voice.stop", "Остановить запись") : t("voice.record", "Записать голосовое")}
            disabled={disabled}
            onMouseDown={onDown}
            onMouseUp={onUp}
            onMouseLeave={onLeave}
            onTouchStart={onDown}
            onTouchEnd={onUp}
        >
            <svg width="18" height="18" viewBox="0 0 20 20" className="icon" aria-hidden="true">
                <g>
                    <ellipse
                        cx="10"
                        cy="8"
                        rx={recording ? 4.1 : 4.7}
                        ry={recording ? 6.2 : 6.8}
                        fill={recording ? "#fff3" : "#fff1"}
                    >
                        <animate
                            attributeName="rx"
                            values="4.7;6.5;4.7"
                            dur="1.05s"
                            repeatCount="indefinite"
                        />
                    </ellipse>
                    <rect
                        x="6"
                        y="3"
                        width="8"
                        height="10"
                        rx="4"
                        fill="#fff"
                        stroke="#fff"
                        strokeWidth="0.2"
                        style={{ filter: "drop-shadow(0 0 1.6px #0003)" }}
                    />
                    <rect
                        x="8.7"
                        y="13"
                        width="2.6"
                        height="5"
                        rx="1"
                        fill="#fff"
                    />
                </g>
            </svg>
        </button>
    );
}

