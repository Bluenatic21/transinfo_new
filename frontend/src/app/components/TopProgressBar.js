// app/components/TopProgressBar.js
import { useEffect, useState, useRef } from "react";

export default function TopProgressBar({ loading }) {
    const [pos, setPos] = useState(0);
    const [direction, setDirection] = useState(1); // 1 = вправо, -1 = влево
    const intervalRef = useRef(null);

    useEffect(() => {
        if (loading) {
            intervalRef.current = setInterval(() => {
                setPos(prev => {
                    if (prev >= 90) setDirection(-1);
                    if (prev <= 0) setDirection(1);
                    return prev + direction * 3;
                });
            }, 15);
        } else {
            setPos(100);
            setTimeout(() => setPos(0), 360);
            clearInterval(intervalRef.current);
        }
        return () => clearInterval(intervalRef.current);
        // eslint-disable-next-line
    }, [loading, direction]);

    return (
        <div style={{
            position: "fixed",
            top: 109, // под твой header (height: 110px)
            left: 0,
            width: "100vw",
            height: 3,
            zIndex: 10000,
            pointerEvents: "none",
        }}>
            <div
                style={{
                    position: "absolute",
                    left: `${pos}%`,
                    width: "16vw",
                    height: "100%",
                    background: "linear-gradient(90deg, #41cfff 0%, #42e7b5 100%)",
                    borderRadius: 4,
                    boxShadow: "0 0 8px #41cfff99",
                    transition: loading ? "none" : "left 0.3s",
                    opacity: loading ? 1 : 0,
                }}
            />
        </div>
    );
}
