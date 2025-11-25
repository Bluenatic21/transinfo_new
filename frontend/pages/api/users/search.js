// pages/api/users/search.js
// Proxy for user search to backend to avoid hitting Next.js API recursively

export default async function handler(req, res) {
  const { method, query } = req;

  const rawHost = req.headers?.host
    ? String(req.headers.host).toLowerCase()
    : "";

  // Detect request scheme (respect reverse proxies)
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

  // Prevent recursion when backend host resolves back to this Next API route
  const loopGuard = (req.headers["x-users-proxy"] || "").toString() === "1";

  const candidates = [
    process.env.INTERNAL_API_BASE,
    process.env.BACKEND_HOST,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_DEV_API_URL,
    process.env.NEXT_PUBLIC_API_SERVER,
    rawHost ? `${requestScheme}://${rawHost}` : null,
    rawHost ? `http://${rawHost}` : null,
    "http://127.0.0.1:8004",
  ];

  const upstream =
    candidates.find((c) => {
      const trimmed = c?.trim?.();
      if (!trimmed) return false;

      try {
        const u = new URL(trimmed);
        const upstreamHost = `${u.hostname}${
          u.port ? `:${u.port}` : ""
        }`.toLowerCase();
        const isSameHost = rawHost && upstreamHost === rawHost;
        const isApiPath =
          u.pathname === "/api" || u.pathname.startsWith("/api/");

        // Avoid looping back to Next pages unless explicitly pointing to /api
        if (isSameHost && !isApiPath) return false;
        if (isSameHost && isApiPath && loopGuard) return false;

        return true;
      } catch {
        return false;
      }
    }) || "http://127.0.0.1:8004";

  const url = new URL(`${upstream.replace(/\/$/, "")}/users/search`);
  Object.entries(query).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach((val) => url.searchParams.append(k, val));
    } else if (v !== undefined) {
      url.searchParams.append(k, v);
    }
  });

  const headers = {
    "X-Users-Proxy": "1",
  };
  if (req.headers.authorization)
    headers["Authorization"] = req.headers.authorization;
  if (req.headers.cookie) headers["Cookie"] = req.headers.cookie;

  const init = { method, headers };

  if (method !== "GET" && method !== "HEAD") {
    if (req.headers["content-type"]?.includes("application/json")) {
      init.body = JSON.stringify(req.body ?? {});
      headers["Content-Type"] = "application/json";
    } else {
      init.body = req.body;
    }
  }

  try {
    const resp = await fetch(url.toString(), init);
    const text = await resp.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    res.status(resp.status).json(data ?? []);
  } catch (err) {
    res.status(502).json({ error: "users_proxy_failed", detail: String(err) });
  }
}
