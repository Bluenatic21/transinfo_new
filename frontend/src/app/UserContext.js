"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { API_BASE } from "@/config/env"; // централизованный базовый URL

const UserContext = createContext();

// Старое имя переменной оставляем для совместимости с шаблонами `${API}/...`
const API = API_BASE;

export function UserProvider({ children }) {
  console.log("[UserContext.js] File loaded!");

  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false); // станет true после первой попытки загрузки профиля
  const [subscription, setSubscription] = useState(null); // { status, period, next_renewal_at, role } | null

  // подхватить user из localStorage (без запросов)
  useEffect(() => {
    const cached = localStorage.getItem("user");
    if (cached) {
      try {
        setUser(JSON.parse(cached));
      } catch { }
    }
  }, []);

  const isAdmin = (user?.role || "").toUpperCase() === "ADMIN";
  // если флаг is_active отсутствует — считаем активным
  const isActive = user?.is_active !== false;

  const [token, setToken] = useState(null);
  const [isUserLoaded, setIsUserLoaded] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [message, setMessage] = useState("");
  const [notifications, setNotifications] = useState([]);

  // Notification pub/sub для других компонентов
  const notificationListenersRef = useRef(new Set());
  const onNotification = useCallback((listener) => {
    notificationListenersRef.current.add(listener);
    return () => notificationListenersRef.current.delete(listener);
  }, []);
  const _emitNotification = (payload) => {
    for (const fn of notificationListenersRef.current) {
      try {
        fn(payload);
      } catch (e) {
        console.error("[UserContext] onNotification listener error:", e);
      }
    }
  };

  // --- Контакты ---
  const [contacts, setContacts] = useState([]);
  const [contactReq, setContactReq] = useState({ incoming: [], outgoing: [] });
  const contactReqRef = useRef({ incoming: [], outgoing: [] });

  // --- Блокировки пользователей ---
  const [blocked, setBlocked] = useState({
    all_ids: [],
    blocked_by_me_ids: [],
    blocked_me_ids: [],
  });
  const blockedSetRef = useRef(new Set());

  // --- Сохранённые (грузы / транспорт) ---
  const [savedOrders, setSavedOrders] = useState([]);
  const [savedTransports, setSavedTransports] = useState([]);

  // Принудительный выход (без редиректа — за навигацию отвечает AuthGate)
  const wsRef = useRef(null);
  const forceLogout = useCallback((reason = "session_revoked") => {
    try {
      localStorage.removeItem("token");
    } catch { }
    try {
      localStorage.removeItem("user");
    } catch { }
    setUser(null);
    setNotifications([]);
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch { }
      wsRef.current = null;
    }
  }, []);

  // Универсальный fetch с авто-refresh токена
  const authFetchWithRefresh = useCallback(
    async (url, options = {}) => {
      let token = localStorage.getItem("token");
      let headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // 1) первичный запрос
      let response;
      try {
        response = await fetch(url, { ...options, credentials: "include", headers });
      } catch (err) {
        const aborted =
          (err && err.name === "AbortError") ||
          (options && options.signal && options.signal.aborted) ||
          (typeof err === "string" &&
            (err === "component-unmount" || err === "fetch-replaced")) ||
          (err && typeof err.message === "string" && /abort/i.test(err.message)) ||
          (err && err.cause && (err.cause === "component-unmount" || err.cause === "fetch-replaced"));
        if (aborted) throw err;

        console.warn("[UserContext] authFetchWithRefresh network error:", err);
        return new Response(null, { status: 502, statusText: "FETCH_ERROR" });
      }

      // 2) авто-refresh при 401
      if (response.status === 401) {
        // явный ревок — выходим без refresh
        try {
          const copy = response.clone();
          const data = await copy.json().catch(() => ({}));
          const code = data?.code || data?.detail?.code || data?.detail;
          if (code === "error.auth.sessionRevoked") {
            forceLogout("session_revoked_401");
            return new Response(null, { status: 401, statusText: "SESSION_REVOKED" });
          }
        } catch { }

        try {
          const refreshResp = await fetch(`${API}/refresh-token`, {
            method: "POST",
            credentials: "include",
          });

          if (refreshResp.ok) {
            const refreshData = await refreshResp.json();
            if (refreshData.access_token) {
              localStorage.setItem("token", refreshData.access_token);
              headers = {
                ...(options.headers || {}),
                Authorization: `Bearer ${refreshData.access_token}`,
              };
              try {
                return await fetch(url, { ...options, credentials: "include", headers });
              } catch (err2) {
                const aborted2 =
                  (err2 && err2.name === "AbortError") ||
                  (options && options.signal && options.signal.aborted) ||
                  (typeof err2 === "string" &&
                    (err2 === "component-unmount" || err2 === "fetch-replaced")) ||
                  (err2 && typeof err2.message === "string" && /abort/i.test(err2.message)) ||
                  (err2 && err2.cause && (err2.cause === "component-unmount" || err2.cause === "fetch-replaced"));
                if (aborted2) throw err2;
                console.error("[UserContext] retry fetch failed:", err2);
                return new Response(null, { status: 502, statusText: "FETCH_ERROR" });
              }
            }
          } else if (refreshResp.status === 401) {
            try {
              const jd = await refreshResp.clone().json().catch(() => ({}));
              const code = jd?.code || jd?.detail?.code || jd?.detail;
              if (code === "error.auth.sessionRevoked") {
                forceLogout("session_revoked_refresh");
                return new Response(null, { status: 401, statusText: "SESSION_REVOKED" });
              }
            } catch { }
          }
        } catch (e) {
          console.warn("[UserContext] refresh-token failed:", e);
        }

        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
      }

      return response;
    },
    [forceLogout]
  );

  // Гарантированно получить «свежий» токен
  const ensureFreshToken = useCallback(async () => {
    try {
      await authFetchWithRefresh(`${API}/auth/whoami`);
    } catch { }
    return localStorage.getItem("token");
  }, [authFetchWithRefresh]);

  // --- Получить актуальные уведомления с backend ---
  // ВАЖНО: объявляем ДО всех эффектов, где она будет использоваться
  const fetchNotifications = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    try {
      const resp = await authFetchWithRefresh(`${API}/notifications`);
      if (!resp || !resp.ok) {
        console.warn(
          "[UserContext] fetchNotifications: failed",
          resp?.status,
          resp?.statusText
        );
        return;
      }
      const data = await resp.json();
      setNotifications((prev) => {
        const next = Array.isArray(data) ? data : [];
        if (Array.isArray(prev) && prev.length === next.length) {
          let same = true;
          for (let i = 0; i < prev.length; i++) {
            const a = prev[i],
              b = next[i];
            if (!b || String(a.id) !== String(b.id) || !!a.read !== !!b.read) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return next;
      });
    } catch (e) {
      console.warn("[UserContext] fetchNotifications error", e);
    }
  }, [authFetchWithRefresh]);

  // Подтягиваем статус подписки
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        if (!user) {
          setSubscription(null);
          return;
        }
        const resp = await fetch(`${API}/api/billing/subscription`, { credentials: "include" });
        if (!resp.ok) {
          setSubscription(null);
          return;
        }
        const data = await resp.json();
        if (!abort) setSubscription(data || null);
      } catch {
        if (!abort) setSubscription(null);
      }
    })();
    return () => {
      abort = true;
    };
  }, [user]);

  // ===== CONTACTS =====
  const contactsFetchLockRef = useRef(false);
  const contactsLastAtRef = useRef(0);
  const fetchContacts = useCallback(async () => {
    if (contactsFetchLockRef.current) return;
    const now = Date.now();
    if (now - contactsLastAtRef.current < 800) return;
    contactsFetchLockRef.current = true;
    try {
      const res = await authFetchWithRefresh(`${API}/contacts`);
      const data = res.ok ? await res.json() : [];
      setContacts(Array.isArray(data) ? data : []);
      return data;
    } finally {
      contactsLastAtRef.current = Date.now();
      contactsFetchLockRef.current = false;
    }
  }, [authFetchWithRefresh]);

  const contactReqFetchLockRef = useRef(false);
  const contactReqLastAtRef = useRef(0);
  const fetchContactRequests = useCallback(
    async (force = false) => {
      if (contactReqFetchLockRef.current && !force) return contactReqRef.current;
      const now = Date.now();
      if (!force && now - contactReqLastAtRef.current < 800) return contactReqRef.current;
      contactReqFetchLockRef.current = true;
      try {
        const [rin, rout] = await Promise.all([
          authFetchWithRefresh(`${API}/contacts/requests?direction=in&status=pending`),
          authFetchWithRefresh(`${API}/contacts/requests?direction=out&status=pending`),
        ]);
        const incoming = rin.ok ? await rin.json() : [];
        const outgoing = rout.ok ? await rout.json() : [];
        const next = { incoming, outgoing };
        setContactReq(next);
        contactReqRef.current = next;
        return next;
      } finally {
        contactReqLastAtRef.current = Date.now();
        contactReqFetchLockRef.current = false;
      }
    },
    [authFetchWithRefresh]
  );

  const sendContactRequest = async (targetId) => {
    const res = await authFetchWithRefresh(`${API}/contacts/request/${targetId}`, {
      method: "POST",
    });
    return res.ok ? await res.json() : Promise.reject(await res.text());
  };

  const respondContactRequest = async (requestId, action) => {
    const res = await authFetchWithRefresh(`${API}/contacts/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, action }),
    });
    const data = res.ok ? await res.json() : Promise.reject(await res.text());
    await Promise.all([fetchContacts(), fetchContactRequests(true)]);
    return data;
  };

  const removeContact = async (targetId) => {
    const res = await authFetchWithRefresh(`${API}/contacts/${targetId}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchContacts();
    return res.ok;
  };

  function _rebuildBlockedSet(obj) {
    const set = new Set((obj?.all_ids || []).map(Number));
    blockedSetRef.current = set;
    setBlocked(obj || { all_ids: [], blocked_by_me_ids: [], blocked_me_ids: [] });
  }

  const isBlocked = (userId) => blockedSetRef.current.has(Number(userId));

  async function reloadBlocked() {
    try {
      const res = await authFetchWithRefresh(`${API}/users/blocked`);
      if (res.ok) {
        const data = await res.json();
        _rebuildBlockedSet(data);
      }
    } catch (_) { }
  }

  async function blockUser(targetId) {
    if (!targetId) return;
    await authFetchWithRefresh(`${API}/users/${targetId}/block`, { method: "POST" });
    await reloadBlocked();
  }

  async function unblockUser(targetId) {
    if (!targetId) return;
    await authFetchWithRefresh(`${API}/users/${targetId}/block`, { method: "DELETE" });
    await reloadBlocked();
  }

  // Загружаем список блокировок, когда пользователь появился/сменился
  useEffect(() => {
    if (user?.id) reloadBlocked();
  }, [user?.id]);

  // ----- Saved: API helpers -----
  const fetchSavedOrders = useCallback(async () => {
    try {
      const r = await authFetchWithRefresh(`${API}/saved/orders`);
      if (r.ok) {
        const data = await r.json();
        setSavedOrders(Array.isArray(data) ? data : []);
      }
    } catch { }
  }, [authFetchWithRefresh]);

  const fetchSavedTransports = useCallback(async () => {
    try {
      const r = await authFetchWithRefresh(`${API}/saved/transports`);
      if (r.ok) {
        const data = await r.json();
        setSavedTransports(Array.isArray(data) ? data : []);
      }
    } catch { }
  }, [authFetchWithRefresh]);

  const saveOrder = useCallback(
    async (id) => {
      await authFetchWithRefresh(`${API}/saved/orders/${id}`, { method: "POST" });
      await fetchSavedOrders();
    },
    [authFetchWithRefresh, fetchSavedOrders]
  );

  const unsaveOrder = useCallback(
    async (id) => {
      await authFetchWithRefresh(`${API}/saved/orders/${id}`, { method: "DELETE" });
      await fetchSavedOrders();
    },
    [authFetchWithRefresh, fetchSavedOrders]
  );

  const saveTransport = useCallback(
    async (id) => {
      await authFetchWithRefresh(`${API}/saved/transports/${id}`, { method: "POST" });
      await fetchSavedTransports();
    },
    [authFetchWithRefresh, fetchSavedTransports]
  );

  const unsaveTransport = useCallback(
    async (id) => {
      await authFetchWithRefresh(`${API}/saved/transports/${id}`, { method: "DELETE" });
      await fetchSavedTransports();
    },
    [authFetchWithRefresh, fetchSavedTransports]
  );

  // Автозагрузка сохранённых при появлении пользователя
  useEffect(() => {
    if (user?.id && localStorage.getItem("token")) {
      fetchSavedOrders();
      fetchSavedTransports();
    } else {
      setSavedOrders([]);
      setSavedTransports([]);
    }
  }, [user?.id]); // функции стабильны, мемоизированы useCallback

  // live-сигналы
  const [monitoringReloadTick, setMonitoringReloadTick] = useState(0);
  const [matchesReloadTick, setMatchesReloadTick] = useState(0);
  const [notifyReconnectTick, setNotifyReconnectTick] = useState(0);
  const emitMonitoringReload = () => setMonitoringReloadTick((t) => t + 1);
  const emitMatchesReload = () => setMatchesReloadTick((t) => t + 1);

  const wsPingRef = useRef(null);
  const wsReconnectTimerRef = useRef(null);
  const wsAttemptRef = useRef(0);

  // Всегда получать профиль из API при старте, если есть токен
  useEffect(() => {
    console.log("[UserContext] useEffect[]: Fetch user start");
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const res = await authFetchWithRefresh(`${API}/me`);
          if (res.ok) {
            const data = await res.json();
            setUser(data);
            localStorage.setItem("user", JSON.stringify(data));
            setToken(token);
            console.log("[UserContext] Loaded user:", data);
          } else {
            setUser(null);
            localStorage.removeItem("user");
            localStorage.removeItem("token");
            setToken(null);
          }
        } catch (err) {
          setUser(null);
          setToken(null);
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
      } else {
        setUser(null);
        setToken(null);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      }
      setIsUserLoaded(true);
      setAuthReady(true); // ← ключевой флаг для AuthGate
    };
    fetchUser();
  }, [authFetchWithRefresh]);

  // Сохранять user в localStorage при изменении (опционально)
  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("user");
    }
  }, [user]);

  // --- Notifications WebSocket (надёжный) ---
  useEffect(() => {
    const cleanup = () => {
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      if (wsPingRef.current) {
        clearInterval(wsPingRef.current);
        wsPingRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch { }
        wsRef.current = null;
      }
    };

    // ⚠ Для неавторизованных гостей:
    // - чистим уведомления
    // - закрываем WS/таймеры (если вдруг что-то осталось)
    // - больше ничего не делаем
    if (!user || !user.id) {
      setNotifications([]);
      cleanup();
      return;
    }

    // Авторизованным — сразу подтягиваем уведомления
    fetchNotifications();

    let cancelled = false;
    (async () => {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      const freshToken = await ensureFreshToken();
      if (!freshToken || cancelled) return;

      let apiURL;
      try {
        apiURL = new URL(API);
      } catch {
        // API должен быть абсолютным URL — на всякий случай не падаем
        return;
      }
      const wsBase = makeWsUrl("");
      let wsURL;
      try {
        wsURL = new URL(wsBase || API);
      } catch {
        wsURL = apiURL;
      }
      const wsProto = wsURL.protocol === "https:" ? "wss" : "ws";
      const basePath = wsURL.pathname.replace(/\/$/, "");
      const qs = new URLSearchParams();
      if (user?.id) qs.set("user_id", String(user.id));
      qs.set("token", freshToken);
      const wsUrl = `${wsProto}://${wsURL.host}${basePath}/ws/notifications?${qs.toString()}`;
      console.log("[UserContext] Connecting WS:", wsUrl);

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch { }
      }
      const ws = new window.WebSocket(wsUrl, ["bearer", freshToken]);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[UserContext] WS OPENED");
        wsAttemptRef.current = 0;
        if (wsPingRef.current) {
          clearInterval(wsPingRef.current);
          wsPingRef.current = null;
        }
        wsPingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
            } catch { }
          }
        }, 30000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          // Принудительный выход по сигналу сервера
          if (msg && (msg.type === "force_logout" || msg.event === "force_logout")) {
            forceLogout("ws_force_logout");
            return;
          }
          if (msg && msg.event === "incoming_call") {
            try {
              window.dispatchEvent(new CustomEvent("incoming_call", { detail: msg }));
            } catch { }
            return;
          }

          _emitNotification(msg);

          // прокинем событие contacts_update -> глобальный window
          if (msg?.event === "contacts_update") {
            try {
              window.dispatchEvent(new Event("contacts_update"));
            } catch { }
          }

          if (msg.event === "new_notification") {
            const incoming = msg.notification || msg;
            try {
              if (incoming?.type === "AUTO_MATCH") {
                emitMatchesReload();
              }
            } catch { }
            setNotifications((prev) => {
              const updated = [incoming, ...prev.filter((n) => n.id !== incoming.id)];
              return updated;
            });
            try {
              const audio = new window.Audio("/sounds/notification.wav");
              audio.volume = 0.7;
              audio.play();
            } catch (err) {
              console.warn("[WS][NOTIFY] SOUND ERROR:", err);
            }
          } else if (msg.type && msg.message) {
            setNotifications((prev) => {
              const updated = [msg, ...prev.filter((n) => n.id !== msg.id)];
              return updated;
            });
          }

          if (msg?.type === "AUTO_MATCH") {
            emitMatchesReload();
          }
          if (msg?.type === "GPS_REQUEST_CREATED" || msg?.type === "GPS_REQUEST_RESPONDED") {
            emitMonitoringReload();
          }
          if (msg?.event === "support.ticket.claimed") {
            try {
              window.dispatchEvent(
                new CustomEvent("support_ticket_claimed", { detail: msg })
              );
            } catch { }
          }
          if (msg?.event === "new_notification") {
            const n = msg?.notification || {};
            if (n?.type === "GPS_REQUEST_CREATED" || n?.type === "GPS_REQUEST_RESPONDED") {
              emitMonitoringReload();
            }
          }
        } catch (err) {
          console.error("[WS][NOTIFY] parse fail:", err, e?.data);
        }
      };

      ws.onerror = (ev) => {
        const msg = ev?.message || ev?.type || "ws_error";
        console.warn("[UserContext] WS ERROR:", msg);
      };

      ws.onclose = (ev) => {
        if (wsPingRef.current) {
          clearInterval(wsPingRef.current);
          wsPingRef.current = null;
        }
        wsRef.current = null;
        if (ev && (ev.code === 4401 || ev.code === 4403)) {
          return;
        }
        const base = Math.min(30000, 1000 * Math.pow(2, wsAttemptRef.current++));
        const jitter = Math.floor(Math.random() * 300);
        const delay = Math.min(30000, base) + jitter;
        if (wsReconnectTimerRef.current) {
          clearTimeout(wsReconnectTimerRef.current);
          wsReconnectTimerRef.current = null;
        }
        wsReconnectTimerRef.current = setTimeout(() => {
          if (!wsRef.current) {
            console.log("[UserContext] Reconnecting WS after", delay, "ms");
            setNotifyReconnectTick((t) => t + 1);
          }
        }, delay);
      };
    })();

    return () => {
      cleanup();
    };
  }, [user?.id, notifyReconnectTick, ensureFreshToken, fetchNotifications, forceLogout]);

  // --- Пометить уведомления прочитанными ---
  const markNotificationsRead = async (ids) => {
    try {
      const arr = (Array.isArray(ids) ? ids : [])
        .map((x) => Number(x))
        .filter(Number.isFinite);
      if (!arr.length) return;
      const resp = await authFetchWithRefresh(`${API}/notifications/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(arr),
      });
      if (resp.ok) {
        setNotifications((prev) =>
          prev.map((n) => (arr.includes(Number(n.id)) ? { ...n, read: true } : n))
        );
        try {
          await fetchNotifications();
        } catch { }
      }
    } catch (e) {
      console.error("[UserContext] markNotificationsRead error", e);
    }
  };

  /* initial contacts/requests load */
  useEffect(() => {
    if (!user || !user.id) return;
    try {
      fetchContacts?.();
    } catch { }
    try {
      fetchContactRequests?.(true);
    } catch { }
  }, [user?.id, fetchContacts, fetchContactRequests]);

  // Подписка на contacts_update — после объявлений функций
  useEffect(() => {
    const onContactsUpdate = () => {
      try {
        fetchContacts?.();
      } catch { }
      try {
        fetchContactRequests?.(true);
      } catch { }
      try {
        fetchNotifications?.();
      } catch { }
    };
    window.addEventListener("contacts_update", onContactsUpdate);
    return () => window.removeEventListener("contacts_update", onContactsUpdate);
  }, [fetchContacts, fetchContactRequests, fetchNotifications]);

  // Очищать user при выходе (и убрать refresh-cookie на бэке)
  const handleLogoutClick = async () => {
    try {
      await fetch(`${API}/logout`, {
        method: "POST",
        credentials: "include",
        keepalive: true, // чтобы запрос не прервался при мгновенной навигации
      });
    } catch { }
    try {
      localStorage.removeItem("user");
    } catch { }
    try {
      localStorage.removeItem("token");
    } catch { }
    setUser(null);
    setNotifications([]);
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch { }
      wsRef.current = null;
    }
    setToken(null);

    // Универсальный переход на главную после выхода
    try {
      if (typeof window !== "undefined") {
        setTimeout(() => {
          try {
            window.location.replace("/");
          } catch { }
        }, 0);
      }
    } catch { }
  };

  const handleLoginClick = () => setShowAuth(true);

  // Возможность ручного рефетча профиля
  const refetchUser = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      const res = await authFetchWithRefresh(`${API}/me`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        localStorage.setItem("user", JSON.stringify(data));
        setToken(token);
      } else {
        setUser(null);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        setToken(null);
      }
    }
  };

  // Лог на каждый рендер для контроля
  useEffect(() => {
    console.log("[UserContext] notifications updated", notifications);
  }, [notifications]);

  // --- Новый метод для получения своих ставок ---
  async function fetchMyBids() {
    const token = localStorage.getItem("token");
    if (!token) return [];
    const res = await authFetchWithRefresh(`${API}/bids/my`);
    if (res.ok) {
      return await res.json();
    }
    return [];
  }

  return (
    <UserContext.Provider
      value={{
        user,
        setUser,
        isAdmin,
        isActive,
        isUserLoaded,
        authReady, // ← нужно для AuthGate
        showAuth,
        setShowAuth,
        handleLoginClick,
        handleLogoutClick,
        message,
        setMessage,
        refetchUser,
        API,
        authFetchWithRefresh,
        ensureFreshToken,
        notifications,
        setNotifications,
        fetchNotifications,
        markNotificationsRead,
        fetchMyBids,
        monitoringReloadTick,
        emitMonitoringReload,
        matchesReloadTick,
        emitMatchesReload,
        // Контакты
        contacts,
        setContacts,
        contactReq,
        setContactReq,
        fetchContacts,
        fetchContactRequests,
        sendContactRequest,
        respondContactRequest,
        removeContact,
        // Блокировки
        blocked,
        isBlocked,
        blockUser,
        unblockUser,
        reloadBlocked,
        onNotification,
        // Сохранённые
        savedOrders,
        savedTransports,
        fetchSavedOrders,
        fetchSavedTransports,
        saveOrder,
        unsaveOrder,
        saveTransport,
        unsaveTransport,
        // Подписка
        subscription,
        // Доступ «как раньше»
        hasFullAccess: !!user,
        canSeeDetails: true,
        shouldBlur: !user,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
