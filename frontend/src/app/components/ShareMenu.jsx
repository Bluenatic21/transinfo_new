"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaShareAlt } from "react-icons/fa";

const OPTIONS = [
    {
        key: "facebook",
        label: "Facebook",
        buildUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
        key: "telegram",
        label: "Telegram",
        buildUrl: (url, description) =>
            `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(description || url)}`,
    },
    {
        key: "whatsapp",
        label: "WhatsApp",
        buildUrl: (_, __, combinedText) => `https://wa.me/?text=${encodeURIComponent(combinedText)}`,
    },
    {
        key: "viber",
        label: "Viber",
        buildUrl: (_, __, combinedText) => `viber://forward?text=${encodeURIComponent(combinedText)}`,
    },
];

export default function ShareMenu({ url, title, text, triggerStyle, ariaLabel = "Поделиться" }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    const absoluteUrl = useMemo(() => {
        if (!url) return "";
        try {
            if (typeof window !== "undefined") {
                return new URL(url, window.location.origin).toString();
            }
        } catch {
            return url;
        }
        return url;
    }, [url]);

    const description = text || "";
    const combinedText = useMemo(() => {
        if (!description && !absoluteUrl) return "";
        if (!description) return absoluteUrl;
        if (!absoluteUrl) return description;
        return `${description}\n${absoluteUrl}`;
    }, [absoluteUrl, description]);

    const toggleMenu = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        function handleClick(e) {
            if (!containerRef.current) return;
            if (containerRef.current.contains(e.target)) return;
            setIsOpen(false);
        }
        function handleEscape(e) {
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("touchstart", handleClick, { passive: true });
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("touchstart", handleClick);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen]);

    const handleSelect = useCallback(
        async (option) => {
            setIsOpen(false);
            const shareData = {
                title: title || undefined,
                text: description || undefined,
                url: absoluteUrl || undefined,
            };

            if (typeof navigator !== "undefined" && navigator.share && shareData.url) {
                try {
                    await navigator.share(shareData);
                    return;
                } catch (err) {
                    if (err?.name === "AbortError") {
                        return;
                    }
                }
            }

            if (!absoluteUrl) return;
            const targetUrl = option.buildUrl(absoluteUrl, description, combinedText);
            if (targetUrl) {
                window.open(targetUrl, "_blank", "noopener,noreferrer");
            }
        },
        [absoluteUrl, combinedText, description, title],
    );

    return (
        <span ref={containerRef} className="share-menu-container">
            <button
                type="button"
                onClick={toggleMenu}
                style={triggerStyle}
                title={ariaLabel}
                aria-label={ariaLabel}
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <FaShareAlt />
            </button>
            <div className="share-menu-dropdown" data-open={isOpen} aria-hidden={!isOpen}>
                {OPTIONS.map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        className="share-menu-item"
                        onClick={() => handleSelect(option)}
                        tabIndex={isOpen ? 0 : -1}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </span>
    );
}