
"use client";
import React from "react";
import WaveformRecorder from "./WaveformRecorder";
import { useLang } from "../i18n/LangProvider";
import { useTheme } from "../providers/ThemeProvider";

export default function VoiceRecordBar({
  mode,
  timerSec = 0,
  stream,
  audioURL,
  onCancel,
  onSend,
}) {
  const { t } = useLang();
  const { resolvedTheme } = useTheme?.() || { resolvedTheme: "dark" };
  const mm = String(Math.floor(timerSec / 60)).padStart(2, "0");
  const ss = String(timerSec % 60).padStart(2, "0");

  const palette =
    resolvedTheme === "light"
      ? {
        containerBg: "#ffffff",
        containerBorder: "1px solid rgba(15,23,42,0.08)",
        containerShadow: "0 16px 40px rgba(15,23,42,0.12)",
        recordBg: "#f8fafc",
        recordBorder: "1px solid #e2e8f0",
        recordText: "#0f172a",
        timerText: "#475569",
        dotColor: "#ef4444",
        btnShadow: "0 8px 18px rgba(15,23,42,0.14)",
      }
      : {
        containerBg: "#0f1c2d",
        containerBorder: "1px solid rgba(142,202,230,0.20)",
        containerShadow: "0 8px 26px rgba(0,0,0,0.45)",
        recordBg: "#101a2a",
        recordBorder: "1px solid rgba(255,255,255,0.06)",
        recordText: "#d2e4f9",
        timerText: "#9fb7d6",
        dotColor: "#ff5252",
        btnShadow: "0 6px 18px rgba(0,0,0,0.35)",
      };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(env(safe-area-inset-bottom) + 14px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        role="dialog"
        aria-live="polite"
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: palette.containerBg,
          border: palette.containerBorder,
          borderRadius: 12,
          padding: "10px 12px",
          boxShadow: palette.containerShadow,
          width: "min(860px, calc(100vw - 24px))",
        }}
      >
        {mode === "recording" ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: palette.recordBg,
                padding: "8px 12px",
                borderRadius: 10,
                border: palette.recordBorder,
                minWidth: 180,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: palette.dotColor,
                  boxShadow: `0 0 10px ${palette.dotColor}`,
                }}
              />
              <strong style={{ color: palette.recordText }}>
                {t("voice.recording", "Идёт запись")}
              </strong>
              <span
                style={{
                  color: palette.timerText,
                  marginLeft: 8,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {mm}:{ss}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <WaveformRecorder stream={stream} recording={true} />
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={onCancel}
                title={t("common.delete", "Удалить")}
                style={iconBtn("#ef4444", palette)}
                aria-label={t("common.cancel", "Отмена")}
              >
                🗑
              </button>
              <button
                onClick={onSend}
                title={t("common.send", "Отправить")}
                style={sendBtn(palette)}
                aria-label={t("common.send", "Отправить")}
              >
                ▶
              </button>
            </div>
          </>
        ) : (
          <>
            <audio src={audioURL || undefined} controls style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={onCancel}
                title={t("common.delete", "Удалить")}
                style={iconBtn("#ef4444", palette)}
              >
                🗑
              </button>
              <button onClick={onSend} title={t("common.send", "Отправить")} style={sendBtn(palette)}>
                {t("common.send", "Отправить")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function iconBtn(bg, palette) {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    width: 44,
    height: 36,
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: palette.btnShadow,
  };
}
function sendBtn(palette) {
  return {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    height: 36,
    padding: "0 14px",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: palette.btnShadow,
  };
}
