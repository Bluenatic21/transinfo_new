// pages/api/transports.js
import { API_BASE } from "@/config/env";

export default async function handler(req, res) {
    const { method, query } = req;

    const upstream =
        process.env.INTERNAL_API_BASE?.trim?.() ||
        process.env.NEXT_PUBLIC_API_URL?.trim?.() ||
        process.env.NEXT_PUBLIC_API_BASE_URL?.trim?.() ||
        process.env.NEXT_PUBLIC_DEV_API_URL?.trim?.() ||
        "http://127.0.0.1:8004";

    const url = new URL(`${upstream.replace(/\/$/, "")}/transports`);

    Object.entries(query).forEach(([k, v]) => {
        if (Array.isArray(v)) {
            v.forEach((val) => url.searchParams.append(k, val));
        } else if (v !== undefined) {
            url.searchParams.append(k, v);
        }
    });

    const headers = {};
    if (req.headers.authorization)
        headers["Authorization"] = req.headers.authorization;
    if (req.headers.cookie)
        headers["Cookie"] = req.headers.cookie;

    // важно: прокинуть body для не‑GET методов
    const init = { method, headers };

    if (method !== "GET" && method !== "HEAD") {
        // Если Next уже распарсил JSON – req.body объект
        if (req.headers["content-type"]?.includes("application/json")) {
            init.body = JSON.stringify(req.body ?? {});
            headers["Content-Type"] = "application/json";
        } else {
            // на всякий случай – «сырое» тело, если нужно
            init.body = req.body;
        }
    }

    try {
        const resp = await fetch(url.toString(), init);
        const totalHeader =
            resp.headers.get("x-total-count") ||
            resp.headers.get("X-Total-Count");

        const text = await resp.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = text || null;
        }

        if (totalHeader) res.setHeader("X-Total-Count", totalHeader);

        res.status(resp.status).json(data ?? []);
    } catch (err) {
        res
            .status(502)
            .json({ error: "transport_proxy_failed", detail: String(err) });
    }
}
