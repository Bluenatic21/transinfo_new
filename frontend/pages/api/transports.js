// pages/api/transports.js
import { API_BASE } from "@/config/env";

export default async function handler(req, res) {
    // Проксируем на FastAPI
    const { method, query } = req;
    // Поддерживаем явный override для внутреннего бэкенда, если он задан
    const upstream =
        process.env.INTERNAL_API_BASE?.trim?.() ||
        process.env.NEXT_PUBLIC_API_URL?.trim?.() ||
        process.env.NEXT_PUBLIC_API_BASE_URL?.trim?.() ||
        process.env.NEXT_PUBLIC_DEV_API_URL?.trim?.() ||
        API_BASE;

    const url = new URL(`${upstream.replace(/\/$/, "")}/transports`);

    // Корректно проксируем массивы (query= { foo: ['a', 'b'] })
    Object.entries(query).forEach(([k, v]) => {
        if (Array.isArray(v)) {
            v.forEach((val) => url.searchParams.append(k, val));
        } else if (v !== undefined) {
            url.searchParams.append(k, v);
        }
    });
    const headers = {};
    if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
    if (req.headers.cookie) headers["Cookie"] = req.headers.cookie; // важное: прокинуть куку token
    try {
        const resp = await fetch(url.toString(), { method, headers });
        const totalHeader =
            resp.headers.get("x-total-count") ||
            resp.headers.get("X-Total-Count");

        const text = await resp.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = text || null; // если отдали простой текст или пусто
        }

        if (totalHeader) {
            res.setHeader("X-Total-Count", totalHeader);
        }
        res.status(resp.status).json(data ?? []);
    } catch (err) {
        // Не даём упасть UI из-за ошибки прокси
        res.status(502).json({ error: "transport_proxy_failed", detail: String(err) });
    }
}