"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import ModernMicButton from "./ModernMicButton";

/* Подбираем максимально совместимый mimeType */
function pickMimeType() {
    const prefers = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg",
    ];
    for (const t of prefers) {
        try {
            if (MediaRecorder.isTypeSupported(t)) return t;
        } catch { }
    }
    return "";
}

/**
 * Мини-рекордер без собственного UI предпросмотра/отправки.
 * Старт/стоп записи → onReady(blob, url)
 * Стиль кнопки задаёт ModernMicButton; красный цвет приходит, когда prop recording=true.
 */
export default function VoiceRecorder({ onReady, disabled }) {
    const [recording, setRecording] = useState(false);

    const streamRef = useRef(null);
    const mrRef = useRef(null);
    const chunksRef = useRef([]);

    // Определяем «мобильный» ввод (coarse pointer / тач)
    const isCoarse = useMemo(() => {
        try {
            return (
                window.matchMedia?.("(pointer: coarse)")?.matches ||
                (navigator?.maxTouchPoints ?? 0) > 0 ||
                "ontouchstart" in window
            );
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        return () => cleanup(); // корректно освобождаем микрофон при размонтировании
    }, []);

    function cleanup() {
        try {
            mrRef.current?.stop();
        } catch { }
        mrRef.current = null;

        try {
            streamRef.current?.getTracks?.().forEach((t) => t.stop());
        } catch { }
        streamRef.current = null;
    }

    async function ensureMic() {
        if (streamRef.current) return streamRef.current;

        // Небольшой набор «умных» аудио-констрейнтов; браузер проигнорирует то, что не поддерживает
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false,
            },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        return stream;
    }

    async function startRecording() {
        if (disabled || recording) return;

        try {
            const stream = await ensureMic();
            const mimeType = pickMimeType();

            chunksRef.current = [];
            const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            mrRef.current = mr;

            mr.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            mr.onstop = () => {
                // Собираем итог и отдаём наверх
                if (chunksRef.current.length && typeof onReady === "function") {
                    const type = mr.mimeType || "audio/webm";
                    const blob = new Blob(chunksRef.current, { type });
                    const url = URL.createObjectURL(blob);
                    onReady(blob, url);
                }
                chunksRef.current = [];
                setRecording(false);

                // Освобождаем дорожки после завершения — чтобы индикатор микрофона в ОС гас
                try {
                    streamRef.current?.getTracks?.().forEach((t) => t.stop());
                } catch { }
                streamRef.current = null;
                mrRef.current = null;
            };

            mr.start();
            setRecording(true);
        } catch (err) {
            console.error("Mic start error:", err);
            // Безопасно откатываем состояние
            setRecording(false);
            cleanup();
        }
    }

    function stopRecording() {
        if (!mrRef.current) return;
        try {
            mrRef.current.stop();
        } catch { }
    }

    function cancelRecording() {
        // Отмена удержания: не отправляем данные
        chunksRef.current = [];
        setRecording(false);
        cleanup();
    }

    // Мобилка: запись при зажатии (down → up/leave)
    const mobileHandlers = {
        onDown: startRecording,
        onUp: stopRecording,
        onLeave: cancelRecording,
    };

    // Десктоп: клик-переключатель (клик = старт, повторный клик = стоп)
    const desktopHandlers = {
        onDown: () => (recording ? stopRecording() : startRecording()),
    };

    return (
        <ModernMicButton
            disabled={disabled}
            recording={recording}
            {...(isCoarse ? mobileHandlers : desktopHandlers)}
        />
    );
}
