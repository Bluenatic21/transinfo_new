
"use client";
import React from "react";
import WaveformRecorder from "./WaveformRecorder";
import { useLang } from "../i18n/LangProvider";

export default function VoiceRecordBar({
  mode,
  timerSec = 0,
  stream,
  audioURL,
  onCancel,
  onSend,
}) {
  const { t } = useLang();
  const mm = String(Math.floor(timerSec / 60)).padStart(2, "0");
  const ss = String(timerSec % 60).padStart(2, "0");

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom) + 14px)", zIndex: 9999, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div role="dialog" aria-live="polite" style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 16, background: "#0f1c2d", border: "1px solid rgba(142,202,230,0.20)", borderRadius: 12, padding: "10px 12px", boxShadow: "0 8px 26px rgba(0,0,0,0.45)", width: "min(860px, calc(100vw - 24px))" }}>
        {mode === "recording" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#101a2a", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", minWidth: 180 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5252", boxShadow: "0 0 10px #ff5252" }} />
              <strong style={{ color: "#d2e4f9" }}>
                {t("voice.recording", "Идёт запись")}
              </strong>
              <span style={{ color: "#9fb7d6", marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <WaveformRecorder stream={stream} recording={true} />
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={onCancel} title={t("common.delete", "Удалить")}
                style={iconBtn("#ef4444")} aria-label={t("common.cancel", "Отмена")}>🗑</button>
              <button onClick={onSend} title={t("common.send", "Отправить")}
                style={sendBtn()} aria-label={t("common.send", "Отправить")}>▶</button>
            </div>
          </>
        ) : (
          <>
            <audio src={audioURL || undefined} controls style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={onCancel} title={t("common.delete", "Удалить")} style={iconBtn("#ef4444")}>🗑</button>
              <button onClick={onSend} title={t("common.send", "Отправить")} style={sendBtn()}>
                {t("common.send", "Отправить")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function iconBtn(bg) {
  return { background: bg, color: "#fff", border: "none", borderRadius: 10, width: 44, height: 36, fontSize: 18, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" };
}
function sendBtn() {
  return { background: "#22c55e", color: "#fff", border: "none", borderRadius: 10, height: 36, padding: "0 14px", fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" };
}
