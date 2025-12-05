// components/WhatsAppAudioMessage.jsx
import { useEffect, useRef, useState } from "react";

export default function WhatsAppAudioMessage({ src, defaultSpeed = 1 }) {
    const aRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [pos, setPos] = useState(0);          // 0..1
    const [time, setTime] = useState({ cur: 0, dur: 0 });
    const [speed, setSpeed] = useState(defaultSpeed);

    useEffect(() => {
        const a = aRef.current;
        if (!a) return;

        const onLoaded = () => setTime(t => ({ ...t, dur: a.duration || 0 }));
        const onTime = () => {
            const cur = a.currentTime || 0, dur = a.duration || 0;
            setTime({ cur, dur }); setPos(dur ? cur / dur : 0);
        };
        const onEnded = () => setPlaying(false);

        a.addEventListener("loadedmetadata", onLoaded);
        a.addEventListener("timeupdate", onTime);
        a.addEventListener("ended", onEnded);
        return () => {
            a.removeEventListener("loadedmetadata", onLoaded);
            a.removeEventListener("timeupdate", onTime);
            a.removeEventListener("ended", onEnded);
        };
    }, []);

    useEffect(() => { if (aRef.current) aRef.current.playbackRate = speed; }, [speed]);

    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    const toggle = async () => {
        const a = aRef.current; if (!a) return;
        if (playing) { a.pause(); setPlaying(false); }
        else {
            try { await a.play(); setPlaying(true); } catch { /* ignore */ }
        }
    };
    const seek = (e) => {
        const a = aRef.current; if (!a || !a.duration) return;
        const next = Number(e.target.value);
        a.currentTime = next * a.duration; setPos(next);
    };
    const cycleSpeed = () => setSpeed(prev => prev >= 1.5 ? 1 : 1.5);

    return (
        <div className="whats-audio">
            <button className="whats-audio__play" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? "⏸" : "▶"}
            </button>
            <input
                className="whats-audio__range"
                type="range" min={0} max={1} step={0.001}
                value={pos} onChange={seek}
            />
            <span className="whats-audio__time">{fmt(time.cur)} / {fmt(time.dur || 0)}</span>
            <button className="whats-audio__speed" onClick={cycleSpeed}>{speed}x</button>
            <audio ref={aRef} src={src} preload="metadata" />
        </div>
    );
}
