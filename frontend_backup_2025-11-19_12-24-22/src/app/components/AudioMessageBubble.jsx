"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Компактный WhatsApp-style аудио-баббл.
 * Без фиксированных ширин/высот: responsive через flex.
 * Внутри скрытый <audio> (без native controls).
 */
export default function AudioMessageBubble({ src, accent = "#264267" }) {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [pos, setPos] = useState(0);            // 0..1
    const [time, setTime] = useState({ cur: 0, dur: 0 });
    const [speed, setSpeed] = useState(1);

    useEffect(() => {
        const a = audioRef.current; if (!a) return;
        const onLoaded = () => setTime(t => ({ ...t, dur: a.duration || 0 }));
        const onTime = () => {
            const cur = a.currentTime || 0, dur = a.duration || 0;
            setTime({ cur, dur }); setPos(dur ? cur / dur : 0);
        };
        const onEnd = () => setPlaying(false);

        a.addEventListener("loadedmetadata", onLoaded);
        a.addEventListener("timeupdate", onTime);
        a.addEventListener("ended", onEnd);
        return () => {
            a.removeEventListener("loadedmetadata", onLoaded);
            a.removeEventListener("timeupdate", onTime);
            a.removeEventListener("ended", onEnd);
        };
    }, []);

    useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);

    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    const toggle = async () => {
        const a = audioRef.current; if (!a) return;
        if (playing) { a.pause(); setPlaying(false); }
        else {
            try { await a.play(); setPlaying(true); }
            catch (err) { console.warn("audio.play() failed", err); }
        }
    };

    const seek = e => {
        const a = audioRef.current; if (!a || !a.duration) return;
        const v = Number(e.target.value);
        a.currentTime = v * a.duration; setPos(v);
    };

    const cycle = () => setSpeed(s => s >= 1.5 ? 1 : 1.5);

    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", background: accent, color: "#fff",
            borderRadius: 14, maxWidth: "100%", boxShadow: "0 1px 6px rgba(0,0,0,.15)"
        }}>
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} style={{
                width: 34, height: 34, borderRadius: 9999, border: "none",
                display: "grid", placeItems: "center", background: "rgba(255,255,255,.14)",
                cursor: "pointer", flex: "0 0 34px"
            }}>{playing ? "⏸" : "▶"}</button>

            <input type="range" min={0} max={1} step={0.001} value={pos} onChange={seek}
                style={{
                    appearance: "none", WebkitAppearance: "none",
                    flex: "1 1 140px", height: 6, borderRadius: 9999, outline: "none",
                    background: "rgba(255,255,255,.22)"
                }}
            />
            <span style={{ fontSize: 12, opacity: .85, whiteSpace: "nowrap" }}>
                {fmt(time.cur)} / {fmt(time.dur || 0)}
            </span>
            <button onClick={cycle} style={{
                border: "none", borderRadius: 9999, padding: "2px 8px",
                fontSize: 12, background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer"
            }}>{speed}x</button>

            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                crossOrigin="anonymous"
                onError={(e) => {
                    console.warn("Audio error", e?.currentTarget?.error);
                    setPlaying(false);
                }}
            />
        </div>
    );
}