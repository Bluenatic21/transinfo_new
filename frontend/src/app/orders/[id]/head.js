import { api, abs } from "@/config/env";
import { buildOrderSharePayload } from "@/app/utils/orderShare";

async function fetchOrder(id) {
    if (!id) return null;
    try {
        const res = await fetch(api(`/orders/${id}`), { cache: "no-store" });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn("order head fetch failed", err);
        return null;
    }
}

export default async function Head({ params }) {
    const id = params?.id;
    const data = await fetchOrder(id);
    const share = buildOrderSharePayload(data || { id }, { t: (key, fallback) => fallback || key });
    const ogImage = abs("/truck-blue.png");

    return (
        <>
            <title>{share.title ? `${share.title} | Transinfo` : "Transinfo"}</title>
            <meta name="description" content={share.metaDescription} />
            <link rel="canonical" href={share.url} />
            <meta property="og:title" content={share.title} />
            <meta property="og:description" content={share.description} />
            <meta property="og:url" content={share.url} />
            <meta property="og:type" content="website" />
            <meta property="og:image" content={ogImage} />
            <meta property="og:image:alt" content={share.description} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={share.title} />
            <meta name="twitter:description" content={share.description} />
            <meta name="twitter:image" content={ogImage} />
        </>
    );
}