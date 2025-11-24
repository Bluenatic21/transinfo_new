// pages/api/transports.js
// Note: API_BASE не используем напрямую, чтобы избежать рекурсивных запросов к этому API-роуту

export default async function handler(req, res) {
  const { method, query } = req;

  // ⚠️ По умолчанию API_BASE указывает на тот же домен, что и фронт (http://127.0.0.1:3000/api),
  // поэтому прямое использование приведёт к бесконечному рекурсивному вызову этого же API-роута
  // и пустому списку транспорта. Всегда берём «настоящий» backend-хост, а в крайнем случае
  // откатываемся на локальный FastAPI (порт 8004 из run_backend_dev.bat).
  const upstream =
    process.env.INTERNAL_API_BASE?.trim?.() ||
    process.env.NEXT_PUBLIC_API_URL?.trim?.() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim?.() ||
    process.env.NEXT_PUBLIC_DEV_API_URL?.trim?.() ||
    process.env.NEXT_PUBLIC_API_SERVER?.trim?.() ||
    "http://127.0.0.1:8004/api";

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
  if (req.headers.cookie) headers["Cookie"] = req.headers.cookie;

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
      resp.headers.get("x-total-count") || resp.headers.get("X-Total-Count");

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
