import { useRef } from "react";

export function useAvatarFly() {
    const flyingRef = useRef(null);

    function flyAvatar({ fromRect, toRect, avatarUrl, onEnd }) {
        const el = document.createElement("div");
        el.style.position = "fixed";
        el.style.zIndex = 999999;
        el.style.pointerEvents = "none";
        el.style.transition = "all 0.65s cubic-bezier(0.4,0.85,0.47,1.18)";
        el.style.left = fromRect.left + "px";
        el.style.top = fromRect.top + "px";
        el.style.width = fromRect.width + "px";
        el.style.height = fromRect.height + "px";
        el.style.borderRadius = "50%";
        el.style.overflow = "hidden";
        el.style.background = "#26364a";
        el.style.boxShadow = "0 2px 10px #202e42a9";
        el.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;"/>`;
        document.body.appendChild(el);
        flyingRef.current = el;
        // trigger reflow
        setTimeout(() => {
            el.style.left = toRect.left + "px";
            el.style.top = toRect.top + "px";
            el.style.width = toRect.width + "px";
            el.style.height = toRect.height + "px";
        }, 10);

        setTimeout(() => {
            el.remove();
            flyingRef.current = null;
            if (onEnd) onEnd();
        }, 690);
    }

    function cleanup() {
        if (flyingRef.current) {
            flyingRef.current.remove();
            flyingRef.current = null;
        }
    }

    return { flyAvatar, cleanup };
}