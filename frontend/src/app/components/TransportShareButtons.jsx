"use client";

import { useMemo } from "react";
import { useLang } from "@/app/i18n/LangProvider";
import { buildTransportSharePayload } from "@/app/utils/transportShare";
import ShareButtons from "./ShareButtons";

const FALLBACK_T = { t: (key, fallback) => fallback || key };

export default function TransportShareButtons({ transport, variant = "compact", buttonStyle, style }) {
    const langCtx = useLang?.() || FALLBACK_T;
    const { t } = langCtx;

    const share = useMemo(
        () => (transport ? buildTransportSharePayload(transport, { t }) : null),
        [transport, t]
    );

    if (!share) return null;

    return (
        <ShareButtons
            share={share}
            variant={variant}
            buttonStyle={buttonStyle}
            style={style}
            t={t}
        />
    );
}