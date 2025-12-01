// pages/api/transports.js
// Note: API_BASE не используем напрямую, чтобы избежать рекурсивных запросов к этому API-роуту

export default async function handler(req, res) {
  const { method, query } = req;

  // Запрещаем кэширование ответа, чтобы браузер не отвечал 304 и не скрывал транспорт
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // ⚠️ По умолчанию API_BASE указывает на тот же домен, что и фронт (http://127.0.0.1:3000/api),
  // поэтому прямое использование приведёт к бесконечному рекурсивному вызову этого же API-роута
  // и пустому списку транспорта. Всегда берём «настоящий» backend-хост, а в крайнем случае
  // откатываемся на локальный FastAPI (порт 8004 из run_backend_dev.bat).
  const rawHost = req.headers?.host
    ? String(req.headers.host).toLowerCase()
    : "";

  // Используем схему из заголовков запроса (если фронт крутится по http, запрос
  // на https://<host> провалится и список транспорта окажется пустым).
  const forwardedProto = (req.headers?.["x-forwarded-proto"] || "")
    .toString()
    .split(",")?.[0]
    ?.trim();
  const refererProto = (() => {
    try {
      return new URL(req.headers?.referer || "").protocol.replace(":", "");
    } catch {
      return null;
    }
  })();
  const requestScheme =
    forwardedProto ||
    refererProto ||
    (req.socket?.encrypted ? "https" : "http");

  // Маркер, что запрос уже побывал в этом proxy (защита от рекурсии)
  const loopGuard =
    (req.headers["x-transports-proxy"] || "").toString() === "1";

  const candidates = [
    process.env.INTERNAL_API_BASE,
    process.env.BACKEND_HOST,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_DEV_API_URL,
    process.env.NEXT_PUBLIC_API_SERVER,
    // Последний вариант — тот же хост, где крутится фронт (с сохранением схемы), вдруг там настроен прокси
    rawHost ? `${requestScheme}://${rawHost}` : null,
    // Дублируем явный http-вариант, если фронт за HTTPS-прокси, а бэкенд доступен только по http
    rawHost ? `http://${rawHost}` : null,
    "http://127.0.0.1:8004",
  ];

  const upstream =
    candidates.find((c) => {
      const trimmed = c?.trim?.();
      if (!trimmed) return false;

      try {
        const u = new URL(trimmed);
        const upstreamHost = `${u.hostname}${u.port ? `:${u.port}` : ""
          }`.toLowerCase();

        // Реальный рекурсивный вызов случается только если base-URL указывает обратно
        // на Next API (host совпадает и путь начинается с "/api"). Если backend крутится
        // на том же домене, но за другим роутом (например, reverse-proxy на /backend),
        // использовать такой адрес безопасно и нужно. Для безопасного прохождения через
        // фронтовый домен с /api добавляем loop‑guard: первый заход отдаём на тот же хост,
        // а повторный (если вдруг вернулись сюда) отфильтруем.
        const isSameHost = rawHost && upstreamHost === rawHost;
        const isApiPath =
          u.pathname === "/api" || u.pathname.startsWith("/api/");
        // Если адрес совпадает с фронтовым доменом без явного api‑префикса,
        // мы уйдём на Next‑страницу и вернём HTML вместо JSON → пустой список.
        // Такой кандидат игнорируем, чтобы сразу брать настоящий backend.
        if (isSameHost && !isApiPath) return false;
        if (isSameHost && isApiPath && loopGuard) return false;

        return true;
      } catch {
        return false;
      }
    }) || "http://127.0.0.1:8004";

  const url = new URL(`${upstream.replace(/\/$/, "")}/transports`);

  Object.entries(query).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach((val) => url.searchParams.append(k, val));
    } else if (v !== undefined) {
      url.searchParams.append(k, v);
    }
  });

  const headers = {
    "X-Transports-Proxy": "1", // чтобы второй заход в этот API понимал, что мы уже проксировали
  };
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
