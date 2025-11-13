"use client";
import CallOverlay from "./CallOverlay";
import useAudioUnlock from "../lib/useAudioUnlock";

export default function CallOverlayClient() {
    // На всякий случай дублируем разблокировку аудио-контекста во враппере
    useAudioUnlock();
    return <CallOverlay />;
}