import React, { useRef, useEffect } from "react";

// Live-анимка wave по аудио (во время записи)
export default function WaveformRecorder({ stream, recording }) {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const analyserRef = useRef(null);
    const dataArrayRef = useRef(null);

    useEffect(() => {
        if (!stream || !recording) return;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        source.connect(analyser);
        analyserRef.current = analyser;
        dataArrayRef.current = dataArray;

        function draw() {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            analyser.getByteTimeDomainData(dataArray);
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#4ee5a6";
            ctx.beginPath();

            const sliceWidth = width * 1.0 / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            ctx.lineTo(width, height / 2);
            ctx.stroke();

            animationRef.current = requestAnimationFrame(draw);
        }
        draw();

        return () => {
            animationRef.current && cancelAnimationFrame(animationRef.current);
            analyser.disconnect();
            source.disconnect();
            audioCtx.close();
        };
    }, [stream, recording]);

    return (
        <canvas
            ref={canvasRef}
            width={160}
            height={44}
            style={{
                background: "#121d2c",
                borderRadius: 12,
                boxShadow: "0 1px 7px #1116",
                marginLeft: 9,
                marginRight: 7,
                display: recording ? "block" : "none"
            }}
        />
    );
}
