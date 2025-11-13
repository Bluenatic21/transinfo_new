// pages/api/transports.js
import { API_BASE } from "@/config/env";

export default async function handler(req, res) {
    // Проксируем на FastAPI
    const { method, query } = req;
    const url = new URL(`${API_BASE.replace(/\/$/, "")}/transports`);
    Object.entries(query).forEach(([k, v]) => url.searchParams.append(k, v));
    const headers = {};
    if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
    if (req.headers.cookie) headers["Cookie"] = req.headers.cookie; // важное: прокинуть куку token
    const resp = await fetch(url.toString(), { method, headers });
    const data = await resp.json();
    res.status(resp.status).json(data);
}