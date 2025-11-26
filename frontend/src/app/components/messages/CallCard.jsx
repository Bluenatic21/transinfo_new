// src/app/components/messages/CallCard.jsx
import { PhoneIncoming, PhoneOutgoing, PhoneOff, PhoneCall, RefreshCcw } from "lucide-react";
import { useLang } from "../../i18n/LangProvider";

function formatDuration(sec = 0) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

export default function CallCard({ msg, isOwn }) {
    const { t } = useLang();
    // ожидание структуры:
    // msg.type === 'call'
    // msg.payload = { status: 'missed'|'ended'|'rejected'|'canceled', direction: 'incoming'|'outgoing', duration?: number }
    const p = msg?.payload || {};

    const bubbleBg = isOwn ? "var(--chat-bubble-self-bg)" : "var(--chat-bubble-peer-bg)";
    const bubbleText = isOwn ? "var(--chat-bubble-self-text)" : "var(--chat-bubble-peer-text)";
    const bubbleBorder = isOwn
        ? "1px solid var(--chat-bubble-self-border)"
        : "1px solid var(--chat-bubble-peer-border)";
    const metaColor = "var(--chat-bubble-meta)";
    const accentColor =
        p.status === "missed" || p.status === "rejected"
            ? "#ef4444"
            : isOwn
                ? "var(--chat-bubble-self-accent)"
                : "var(--chat-bubble-peer-accent)";

    const base = "max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm select-none";

    const line = "flex items-center gap-2";

    let Icon = PhoneCall;
    let title = t("call.title", "Звонок");

    if (p.status === "missed") {
        Icon = PhoneOff;
        title = t("call.missed", "Пропущенный звонок");
    } else if (p.direction === "incoming") {
        Icon = PhoneIncoming;
        title = t("call.incoming", "Входящий звонок");
    } else if (p.direction === "outgoing") {
        Icon = PhoneOutgoing;
        title = t("call.outgoing", "Исходящий звонок");
    }

    return (
        <div
            className={base}
            style={{
                background: bubbleBg,
                color: bubbleText,
                border: bubbleBorder,
                boxShadow: "var(--chat-reaction-shadow)",
                alignSelf: isOwn ? "flex-end" : "flex-start",
            }}
        >
            <div className={line} style={{ color: accentColor }}>
                <Icon size={18} />
                <div className="font-medium" style={{ color: bubbleText }}>
                    {title}
                </div>
            </div>

            {p.status !== "missed" && typeof p.duration === "number" && (
                <div className="mt-1 text-xs" style={{ color: bubbleText }}>
                    {t("call.durationLabel", "Длительность")}: {formatDuration(p.duration)}
                </div>
            )}

            <div className="mt-1 text-[11px]" style={{ color: metaColor }}>
                {p.status === "missed"
                    ? t("call.status.missed", "Не удалось связаться")
                    : p.status === "rejected"
                        ? t("call.status.rejected", "Отклонён")
                        : p.status === "canceled"
                            ? t("call.status.canceled", "Отменён")
                            : t("call.status.ended", "Завершён")}
            </div>

            {/* Кнопка “Перезвонить” — опционально */}
            <button
                type="button"
                className="mt-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs transition"
                onClick={() => window?.__transinfo_call?.(msg.chat_id)}
                aria-label={t("call.redial", "Перезвонить")}
                style={{
                    background: "var(--chat-translation-bg)",
                    border: bubbleBorder,
                    color: bubbleText,
                }}
            >
                <RefreshCcw size={14} color={accentColor} />
                <span style={{ color: accentColor }}>{t("call.redial", "Перезвонить")}</span>
            </button>

            <div className="mt-1 text-[10px]" style={{ color: metaColor }}>
                {msg.pretty_time || ""}
            </div>
        </div>
    );
}