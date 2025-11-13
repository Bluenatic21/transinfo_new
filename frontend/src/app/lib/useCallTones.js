// useCallTones.js
"use client";
import { useCallback, useEffect, useRef } from "react";
import { getAudioContext } from "./useAudioUnlock";

// плавная огибающая, чтобы не щёлкало (для исходящего ringback)
function playBurst(freqs = [425], msOn = 1000, volume = 0.15) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const dur = msOn / 1000;

    const gain = ctx.createGain();
    // атака и релиз по 10 мс
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.setValueAtTime(volume, now + Math.max(0, dur - 0.02));
    gain.gain.linearRampToValueAtTime(0, now + dur);

    gain.connect(ctx.destination);

    const oscs = freqs.map(f => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + dur);
        return osc;
    });

    setTimeout(() => {
        oscs.forEach(o => o.disconnect());
        gain.disconnect();
    }, msOn + 50);
}

// ===== Загрузка/проигрывание готового WAV/MP3 для входящего =====
const _bufferCache = new Map();
async function loadAudioBuffer(url) {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (_bufferCache.has(url)) return _bufferCache.get(url);
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr.slice(0));
    _bufferCache.set(url, buf);
    return buf;
}

function playAudioBuffer(buf, { volume = 0.15, loop = false, loopStart = 0, loopEnd = null } = {}) {
    const ctx = getAudioContext();
    if (!ctx || !buf) return { stop: () => { } };
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!loop;
    if (loop) {
        src.loopStart = loopStart || 0;
        if (loopEnd != null) src.loopEnd = loopEnd; // если нужно обрезать хвост тишины — укажи секунду
    }
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    return {
        stop: () => {
            try { src.stop(0); } catch { }
            try { src.disconnect(); } catch { }
            try { gain.disconnect(); } catch { }
        }
    };
}

// ===== МЯГКИЙ «CHIME» ДЛЯ ФОЛЛБЭКА =====
function playSmoothBeep({
    freqFrom = 600,
    freqTo = 640,
    durationMs = 200,
    volume = 0.15,
    cutoffHz = 1400,
    at = null,
} = {}) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const start = (at ?? ctx.currentTime);
    const dur = durationMs / 1000;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqFrom, start);
    try { osc.frequency.exponentialRampToValueAtTime(freqTo, start + dur); }
    catch { osc.frequency.linearRampToValueAtTime(freqTo, start + dur); }

    const biq = ctx.createBiquadFilter();
    biq.type = "lowpass";
    biq.frequency.setValueAtTime(cutoffHz, start);
    biq.Q.setValueAtTime(0.7, start);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.setValueAtTime(volume, start + Math.max(0, dur - 0.06));
    gain.gain.linearRampToValueAtTime(0.0001, start + dur);

    osc.connect(biq);
    biq.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + dur + 0.02);

    setTimeout(() => {
        try { osc.disconnect(); } catch { }
        try { biq.disconnect(); } catch { }
        try { gain.disconnect(); } catch { }
    }, durationMs + 80);
}

// простой приятный мотив (фоллбэк)
function schedulePleasantIncoming(volume = 0.15) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    playSmoothBeep({ freqFrom: 580, freqTo: 640, durationMs: 180, volume, cutoffHz: 1400, at: t0 });
    playSmoothBeep({ freqFrom: 660, freqTo: 720, durationMs: 220, volume, cutoffHz: 1400, at: t0 + 0.26 });
}

export function useCallTones({ volume = 0.15 } = {}) {
    const ringbackTimer = useRef(null);
    const incomingTimer = useRef(null);         // используется только для синтетического фоллбэка
    const incomingSourceRef = useRef(null);     // текущий источник файла
    const incomingBufRef = useRef(null);        // кэшированный AudioBuffer

    // Исходящий звонок: EU ringback (1.0s ON / 4.0s OFF)
    const startRingback = useCallback(() => {
        if (ringbackTimer.current) return;
        const ctx = getAudioContext();
        if (!ctx) return;
        playBurst([425], 1000, volume);
        ringbackTimer.current = setInterval(() => {
            playBurst([425], 1000, volume);
        }, 5000);
    }, [volume]);

    const stopRingback = useCallback(() => {
        if (ringbackTimer.current) {
            clearInterval(ringbackTimer.current);
            ringbackTimer.current = null;
        }
    }, []);

    // Входящий звонок: играем внешний файл в бесшовном лупе (по всей длине, напр. 12s)
    const startIncomingTone = useCallback(() => {
        if (incomingSourceRef.current) return; // уже играет
        const url = "/sounds/incoming.wav";
        (async () => {
            try {
                if (!incomingBufRef.current) {
                    incomingBufRef.current = await loadAudioBuffer(url);
                }
                // беспрерывный луп по всей длине буфера
                incomingSourceRef.current = playAudioBuffer(incomingBufRef.current, {
                    volume,
                    loop: true,              // луп по всему буферу (12s)
                    // loopEnd: 11.9,        // <- если в конце есть тишина, можно подрезать
                });
            } catch {
                // fallback: синтетика раз в ~1.15s
                schedulePleasantIncoming(volume);
                incomingTimer.current = setInterval(() => { schedulePleasantIncoming(volume); }, 1150);
            }
        })();
    }, [volume]);

    const stopIncomingTone = useCallback(() => {
        if (incomingTimer.current) { clearInterval(incomingTimer.current); incomingTimer.current = null; }
        try { incomingSourceRef.current?.stop(); } catch { }
        incomingSourceRef.current = null;
    }, []);

    const stopAll = useCallback(() => {
        stopRingback();
        stopIncomingTone();
    }, [stopRingback, stopIncomingTone]);

    // очистка при размонтировании
    useEffect(() => () => {
        if (ringbackTimer.current) clearInterval(ringbackTimer.current);
        if (incomingTimer.current) clearInterval(incomingTimer.current);
        try { incomingSourceRef.current?.stop(); } catch { }
    }, []);

    return {
        startRingback,
        stopRingback,
        startIncomingTone,
        stopIncomingTone,
        stopAll,
    };
}
