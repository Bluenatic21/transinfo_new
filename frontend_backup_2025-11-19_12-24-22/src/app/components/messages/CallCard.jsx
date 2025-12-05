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

    const base =
        "max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm select-none " +
        (isOwn
            ? "self-end bg-[#1c2a3b] text-white"
            : "self-start bg-[#1a2332] text-white/90");

    const line = "flex items-center gap-2";

    let Icon = PhoneCall;
    let title = t("call.title", "Звонок");
    let tone =
        p.status === "missed" || p.status === "rejected" ? "text-red-400" : "text-emerald-400";

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
        <div className={base}>
            <div className={line}>
                <Icon className={tone} size={18} />
                <div className="font-medium">{title}</div>
            </div>

            {p.status !== "missed" && typeof p.duration === "number" && (
                <div className="mt-1 text-xs opacity-80">
                    {t("call.durationLabel", "Длительность")}: {formatDuration(p.duration)}
                </div>
            )}

            <div className="mt-1 text-[11px] opacity-60">
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
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                onClick={() => window?.__transinfo_call?.(msg.chat_id)}
                aria-label={t("call.redial", "Перезвонить")}
            >
                <RefreshCcw size={14} />
                {t("call.redial", "Перезвонить")}
            </button>

            <div className="mt-1 text-[10px] opacity-50">{msg.pretty_time || ""}</div>
        </div>
    );
}
