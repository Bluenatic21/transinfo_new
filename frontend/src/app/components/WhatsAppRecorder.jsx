// components/WhatsAppRecorder.jsx
import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n/LangProvider";

/**
 * UI-обёртка. В вашу «железную» логику прокидываем колбэки:
 * onStart, onPause, onResume, onCancel, onSend.
 * Компонент НЕ пишет сам звук — только вызывает ваши функции.
 */
export default function WhatsAppRecorder({
    isRecording,
    isPaused,
    onStart,
    onPause,
    onResume,
    onCancel,
    onSend,
}) {
    const { t } = useLang();
    const [sec, setSec] = useState(0);
    const timer = useRef(null);

    useEffect(() => {
        if (isRecording && !isPaused) {
            timer.current = setInterval(() => setSec(s => s + 1), 1000);
            return () => clearInterval(timer.current);
        }
        return () => { };
    }, [isRecording, isPaused]);

    useEffect(() => { if (!isRecording) setSec(0); }, [isRecording]);

    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    if (!isRecording) {
        // Стандартное состояние композера: иконка микрофона + инпут/кнопка отправки
        return (
            <>
                <button className="whats-audio__play" onClick={onStart} aria-label="Start recording">🎙</button>
                {/* ваш input и кнопка отправки текста здесь */}
            </>
        );
    }

    // Режим записи: пилюля на месте инпута
    return (
        <div className="whats-rec" role="status" aria-live="polite">
            <span className="whats-rec__dot" />
            <strong>{t("voice.recording", "Идёт запись")}</strong>
            <span style={{ opacity: .85 }}>{fmt(sec)}</span>
            <div className="whats-rec__actions">
                <button className="whats-chip" onClick={isPaused ? onResume : onPause}>
                    {isPaused ? t("voice.resume", "Продолжить") : t("voice.pause", "Пауза")}
                </button>
                <button className="whats-chip whats-chip--del" onClick={onCancel}>{t("common.delete", "Удалить")}</button>
                <button className="whats-chip whats-chip--ok" onClick={onSend}>{t("common.send", "Отправить")}</button>
            </div>
        </div>
    );
}
