"use client";
import { useEffect } from "react";

export default function FlashMessage({ message, setMessage }) {
    useEffect(() => {
        if (message) {
            const timeout = setTimeout(() => setMessage(""), 2200);
            return () => clearTimeout(timeout);
        }
    }, [message, setMessage]);
    if (!message) return null;
    return (
        <div style={{
            background: "#22cf88", color: "#21222b",
            padding: "9px 22px", margin: "10px auto 20px auto",
            borderRadius: 7, textAlign: "center", fontWeight: 600, fontSize: 16
        }}>
            {message}
        </div>
    );
}
