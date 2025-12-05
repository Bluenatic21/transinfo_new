"use client";



import { getTokenSync } from "./yourTokenUtils";
import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useCallback,
} from "react";
import { useUser } from "../UserContext";
import { api, ws } from "@/config/env";
import { fetchMutedGroups, muteGroupApi, unmuteGroupApi } from "./muteApi";

// ---- Глобальное состояние звонка (переживает навигации/перерисовки) ----
const getGlobalCallState = () => {
    try { return (globalThis).__CALL_STATE || { active: false }; } catch { return { active: false }; }
};
const setGlobalCallActive = (active) => {
    try {
        const box = (globalThis).__CALL_STATE || ((globalThis).__CALL_STATE = { active: false });
        box.active = !!active;
    } catch { /* no-op */ }
};


// ---- Ранний «booting»-флаг (защищает во время установки звонка до активного состояния) ----
const getCallBooting = () => {
    try { return !!globalThis.__CALL_BOOTING; } catch { return false; }
};
const setCallBooting = (on) => {
    try { globalThis.__CALL_BOOTING = !!on; } catch { }
};

// --- Support chat helper ---
const isSupportChat = (chat) =>
    chat?.type === 'support' ||
    chat?.slug === 'support' ||
    chat?.is_support === true ||
    chat?.id === 'support';

/** ---- СТАБИЛЬНАЯ СОРТИРОВКА СООБЩЕНИЙ (ASC) ---- */
const _tsOf = (m) => {
    if (!m) return 0;
    if (m.sent_at) {
        const t = +new Date(m.sent_at);
        if (!Number.isNaN(t)) return t;
    }
    if (m.created_at) {
        const t = +new Date(m.created_at);
        if (!Number.isNaN(t)) return t;
    }
    if (typeof m.id === "number") return m.id * 1000; // монотонный фолбэк
    return m._client_ts || 0;                           // для оптимистичных
};
const _cmpMsgAsc = (a, b) => {
    const da = _tsOf(a), db = _tsOf(b);
    if (da !== db) return da - db;
    const ia = typeof a.id === "number" ? a.id : Number.MAX_SAFE_INTEGER;
    const ib = typeof b.id === "number" ? b.id : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return (a._client_seq || 0) - (b._client_seq || 0); // последний тай-брейк
};

function getCurrentUser() {
    if (typeof window !== "undefined") {
        if (window.user) return window.user;
        try {
            const u = JSON.parse(localStorage.getItem("user"));
            if (u?.id) {
                window.user = u;
                return u;
            }
        } catch { }
    }
    return null;
}

export const MessengerContext = createContext();

function getInitialPinnedChats() {
    try {
        const fromLS = JSON.parse(localStorage.getItem("pinnedChats"));
        if (Array.isArray(fromLS)) return fromLS;
    } catch { }
    return [];
}

export function MessengerProvider({ children }) {
    const { authFetchWithRefresh, onNotification } = useUser();
    // state, который используется в ранних хуках — объявляем ДО них
    const [chatList, setChatList] = useState([]);
    // Универсальный поиск чата по id/chat_id без chatsMap
    const getChatById = useCallback((id) => {
        if (!id) return null;
        const sid = String(id);
        const list = Array.isArray(chatList) ? chatList : [];
        return (
            list.find((c) => {
                const cid = c?.chat_id ?? c?.id;
                return cid != null && String(cid) === sid;
            }) || null
        );
    }, [chatList]);
    const [isOpen, setIsOpen] = useState(false);
    const isOpenRef = useRef(false);
    useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
    const [messages, setMessages] = useState([]);
    const optimisticSeqRef = useRef(0);
    // --- support ephemeral state (per chat) ---
    const supportTypingRef = useRef(new Map());   // chatId -> boolean
    const supportQueueRef = useRef(new Map());   // chatId -> {position, eta_minutes} | null
    const autocloseRef = useRef(new Map());   // chatId -> { until_iso: string, seconds: number }
    const [, forceEphemeralRender] = useState(0); // триггер для перерисовки потребителей
    const [chatId, setChatId] = useState(null);
    const chatIdRef = useRef(chatId);
    useEffect(() => {
        chatIdRef.current = chatId;
    }, [chatId]);

    const [unread, setUnread] = useState(0);
    const [peerUser, setPeerUser] = useState(null);
    // pagination state for chat list
    const [chatListOffset, setChatListOffset] = useState(0);
    const [chatListEOF, setChatListEOF] = useState(false);
    const [chatListLoading, setChatListLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState(getCurrentUser());
    const [pendingAttachment, setPendingAttachment] = useState(null);
    const [notificationsSocket, setNotificationsSocket] = useState(null);
    const [mutedGroups, setMutedGroups] = useState([]);
    const [pinnedChats, setPinnedChats] = useState(getInitialPinnedChats());
    const [pendingPinned, setPendingPinned] = useState([]);
    const [allMessages, setAllMessages] = useState({});
    // --- настройки пагинации истории ---
    const PAGE_SIZE = Number(process.env.NEXT_PUBLIC_PAGE_SIZE_DEBUG) || 30;
    const historyOffsetRef = useRef(new Map()); // chatId -> сколько сообщений уже загружено
    const historyEofRef = useRef(new Map());    // chatId -> достигнут ли конец (старше нет)
    const wsRef = useRef(null);
    const lastChatIdRef = useRef(null); // ← добавлено: отслеживаем, для какого chatId уже открыт сокет
    // Флаг активного звонка (локальный ref + глобальный бокс)
    const callActiveRef = useRef(getGlobalCallState().active);
    // ---- circuit breakers for WS handshakes ----
    const wsStopUntilRef = useRef(0);              // timestamp until which WS connects are paused
    const handshakeFailsRef = useRef({ count: 0, since: 0 }); // rolling counter for failures
    // --------------------------------------------

    // Backoff / timers / caches
    const wsBackoffRef = useRef(1000);
    const keepaliveTimerRef = useRef(null);
    const etagByChatRef = useRef(new Map()); // chatId -> ETag
    const fetchLockRef = useRef(new Map()); // chatId -> boolean
    const fetchLastAtRef = useRef(new Map()); // chatId -> ts
    const inflightHistoryRef = useRef(new Map()); // chatId -> Promise (дедуп параллельных)
    const HISTORY_TTL_MS = 4000; // не чаще 1 раза в 4с без force

    const pollTimerRef = useRef(null);
    const lastPushRef = useRef({ id: null, ts: 0 });

    // дедуп входящих звонков (чтобы не слать дважды incoming_call за <1s по тому же chat_id)
    const incomingGuardRef = useRef({ ts: 0, chat_id: null });

    // limiter for reconnects (<= 6 fails per minute)
    const reconnectStateRef = useRef({ fails: 0, windowStart: 0 });

    // throttles for list/counters
    const chatListFetchLockRef = useRef(false);
    const chatListFetchLastAtRef = useRef(0);
    const unreadFetchLockRef = useRef(false);
    const unreadFetchLastAtRef = useRef(0);

    // === ВСТАВИТЬ/ОБНОВИТЬ ЧАТ В САЙДБАРЕ НЕМЕДЛЕННО (оптимистично) ===
    const ensureChatInSidebar = useCallback((cid, opt = {}) => {
        if (!cid) return;
        const normalizePeer = (p) => {
            if (!p) return null;
            const organization = p.organization || null;
            const full =
                p.full_name ||
                [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                p.name ||
                p.username ||
                p.email ||
                "";
            return {
                id: p.id ?? p.user_id ?? null,
                organization,
                name: full,
                avatar: p.avatar || p.avatar_url || p.photo || null,
            };
        };
        setChatList((prev0) => {
            const prev = Array.isArray(prev0) ? prev0 : [];
            const sid = String(cid);
            const idx = prev.findIndex((c) => String(c?.chat_id ?? c?.id) === sid);
            const peer = normalizePeer(opt.peer);
            const last_message = opt.lastMessage || opt.last_message || null;
            if (idx === -1) {
                // нет в списке — создаём «заглушку» со всеми известными полями
                const stub = {
                    chat_id: cid,
                    is_group: false,
                    is_support: false,
                    peer: peer || null,
                    last_message: last_message || null,
                    created_at: new Date().toISOString(),
                    _optimistic_stub: true,
                };
                return [stub, ...prev];
            }
            // есть — ДОКЛЕИВАЕМ peer/last_message, чтобы не оставался «Пользователь»
            const cur = prev[idx] || {};
            const next = { ...cur };
            if (peer) next.peer = { ...(cur.peer || {}), ...peer };
            if (last_message) next.last_message = last_message;
            if (!("_optimistic_stub" in cur)) next._optimistic_stub = true;
            const out = prev.slice();
            out[idx] = next;
            return out;
        });
    }, []);

    // Очистить локальную историю и кэши конкретного чата
    const clearLocalChat = useCallback((cid) => {
        try {
            setAllMessages(prev => { const cp = { ...prev }; delete cp[cid]; return cp; });
        } catch { }
        try { etagByChatRef.current.delete(cid); } catch { }
        try { historyOffsetRef.current.delete(cid); } catch { }
        try { historyEofRef.current.delete(cid); } catch { }
        try { fetchLockRef.current.delete(cid); } catch { }
        try { fetchLastAtRef.current.delete(cid); } catch { }
        try { inflightHistoryRef.current.delete(cid); } catch { }
        // если этот чат открыт — мгновенно показываем пусто,
        // далее fetch стянет уже «после cleared_at»
        if (chatIdRef.current === cid) {
            setMessages([]);
        }
    }, []);


    // === Data loaders ===
    const fetchChatList = useCallback(
        async ({ force = false, reset = true } = {}) => {
            const now = Date.now();
            if (!force && (chatListFetchLockRef.current || now - chatListFetchLastAtRef.current < 700)) return;
            chatListFetchLockRef.current = true;
            setChatListLoading(true);
            try {
                const off = reset ? 0 : chatListOffset;
                const res = await authFetchWithRefresh(api(`/my-chats?limit=30&offset=${off}`));
                if (res.ok) {
                    const data = await res.json();
                    const arr = Array.isArray(data) ? data : [];
                    if (reset) {
                        // сохраняем локальные "заглушки", если сервер их ещё не вернул
                        setChatList(prev => {
                            const prevArr = Array.isArray(prev) ? prev : [];
                            const stubs = prevArr.filter(
                                c => c && c._optimistic_stub && !arr.some(x => String(x?.chat_id ?? x?.id) === String(c.chat_id))
                            );
                            return [...stubs, ...arr];
                        });
                        setChatListOffset(arr.length);
                        setChatListEOF(arr.length < 30);
                    } else {
                        setChatList(prev => [...prev, ...arr]);
                        setChatListOffset(off + arr.length);
                        if (arr.length < 30) setChatListEOF(true);
                    }
                } else if (reset) {
                    setChatList([]);
                }
            } catch {
                if (reset) setChatList([]);
            } finally {
                chatListFetchLastAtRef.current = Date.now();
                chatListFetchLockRef.current = false;
                setChatListLoading(false);
            }
        },
        [authFetchWithRefresh, chatListOffset]
    );

    const fetchMoreChats = useCallback(() => {
        if (chatListEOF || chatListLoading) return;
        fetchChatList({ force: true, reset: false });
    }, [chatListEOF, chatListLoading, fetchChatList]);

    const fetchUnreadCount = useCallback(
        async ({ force = false } = {}) => {
            const now = Date.now();
            if (
                !force &&
                (unreadFetchLockRef.current ||
                    now - unreadFetchLastAtRef.current < 1000)
            )
                return;
            unreadFetchLockRef.current = true;
            try {
                const res = await authFetchWithRefresh(api(`/my-chats/unread_count`));
                if (res.ok) {
                    const data = await res.json();
                    setUnread(data.unread || 0);
                }
            } catch {
                // silent
            } finally {
                unreadFetchLastAtRef.current = Date.now();
                unreadFetchLockRef.current = false;
            }
        },
        [authFetchWithRefresh]
    );


    // --- Удалить чат «только для меня» (ставим ПОСЛЕ fetchChatList/fetchUnreadCount)
    const deleteChatForMe = useCallback(async (cid) => {
        if (!cid) return false;
        try {
            const res = await authFetchWithRefresh(api(`/chat/${cid}/delete`), { method: "POST" });
            clearLocalChat(cid);
            // если этот чат открыт — закрываем вкладку
            setChatId(prev => (prev === cid ? null : prev));
            // обновить список и счётчик
            fetchChatList({ force: true });
            fetchUnreadCount({ force: true });
            return res.ok;
        } catch {
            clearLocalChat(cid);
            setChatId(prev => (prev === cid ? null : prev));
            fetchChatList({ force: true });
            return false;
        }
    }, [authFetchWithRefresh, clearLocalChat, fetchChatList, fetchUnreadCount]);

    const fetchMessagesById = useCallback(
        async (id, { force = false } = {}) => {
            if (!id) return;

            const now = Date.now();
            const lastAt = fetchLastAtRef.current.get(id) || 0;
            const locked = fetchLockRef.current.get(id);

            // если уже есть in-flight промис и не форсили — вернём его
            if (!force && inflightHistoryRef.current.has(id)) {
                return inflightHistoryRef.current.get(id);
            }
            // anti-thrash: не чаще 1 раза в TTL и не параллелим
            if (!force && (locked || now - lastAt < HISTORY_TTL_MS)) return;

            const headers = {};
            const etag = etagByChatRef.current.get(id);
            if (etag && !force) headers["If-None-Match"] = etag;

            fetchLockRef.current.set(id, true);
            const p = (async () => {
                // Грузим ТОЛЬКО последнюю страницу (PAGE_SIZE)
                const res = await authFetchWithRefresh(api(`/chat/${id}/history?limit=${PAGE_SIZE}`), { headers });
                if (res.status === 304) {
                    // no changes
                    return null;
                }
                if (res.ok) {
                    const data = await res.json();
                    const newEtag = res.headers?.get?.("ETag");
                    if (newEtag) etagByChatRef.current.set(id, newEtag);

                    const arr = Array.isArray(data) ? data : [];
                    // сервер отдаёт DESC → переводим в ASC (старые → новые)
                    const arrAsc = [...arr].reverse();
                    const sorted = arrAsc.slice().sort(_cmpMsgAsc);
                    setMessages(sorted);
                    setAllMessages((prev) => ({ ...prev, [id]: sorted }));

                    // курсоры считаем по фактическому количеству элементов
                    historyOffsetRef.current.set(id, arrAsc.length);
                    historyEofRef.current.set(id, arrAsc.length < PAGE_SIZE);
                } else {
                    // e.g. 403
                    setMessages([]);
                    setAllMessages((prev) => ({ ...prev, [id]: [] }));
                    historyOffsetRef.current.set(id, 0);
                    historyEofRef.current.set(id, true);
                }
            })();
            inflightHistoryRef.current.set(id, p);
            try {
                return await p;
            } finally {
                fetchLastAtRef.current.set(id, Date.now());
                fetchLockRef.current.set(id, false);
                inflightHistoryRef.current.delete(id);
            }
        },
        [authFetchWithRefresh, PAGE_SIZE]
    );


    // Подгрузить более старые сообщения (следующую «страницу» вверх) по skip


    const fetchOlderMessagesById = useCallback(
        async (id) => {
            if (!id) return [];
            const current = historyOffsetRef.current.get(id) || 0;
            if (historyEofRef.current.get(id)) return [];
            try {
                const res = await authFetchWithRefresh(api(`/chat/${id}/history?limit=${PAGE_SIZE}&skip=${current}`));
                if (!res.ok) return [];
                const data = await res.json();
                const olderDesc = Array.isArray(data) ? data : [];
                // сервер вернул DESC → приводим к ASC
                const olderAsc = [...olderDesc].reverse();

                if (olderAsc.length > 0) {
                    // prepend старых (ASC) к уже загруженным (ASC)
                    setMessages(prev => [...olderAsc, ...prev]);
                    setAllMessages(prevAll => {
                        const prevArr = prevAll[id] || [];
                        return { ...prevAll, [id]: [...olderAsc, ...prevArr] };
                    });
                    // оффсеты считаем по фактическому количеству полученных элементов
                    historyOffsetRef.current.set(id, current + olderDesc.length);
                    if (olderDesc.length < PAGE_SIZE) historyEofRef.current.set(id, true);
                } else {
                    historyEofRef.current.set(id, true);
                }
                return olderAsc;
            } catch {
                return [];
            }
        },
        [authFetchWithRefresh, PAGE_SIZE]
    );

    const pinChat = useCallback((chat) => {
        setPinnedChats((prev) => {
            // запрет закрепления для саппорт-чата
            if (isSupportChat(chat)) return prev;
            if (prev.some((c) => c.chat_id === chat.chat_id)) return prev;
            let short = { chat_id: chat.chat_id, is_group: chat.is_group };
            if (chat.is_group) {
                short.group_avatar = chat.group_avatar || null;
                short.group_name = chat.group_name || "";
            } else if (chat.peer) {
                short.peer = {
                    avatar: chat.peer.avatar || null,
                    name:
                        chat.peer.name ||
                        chat.peer.full_name ||
                        chat.peer.organization ||
                        chat.peer.email ||
                        "",
                    id: chat.peer.id,
                };
            }
            let next = [...prev, short];
            if (next.length > 20) next = next.slice(next.length - 20);
            return next;
        });
    }, []);

    const unpinChat = useCallback((chat_id) => {
        setPinnedChats((prev) => prev.filter((c) => c.chat_id !== chat_id));
    }, []);

    const muteGroup = async (chat_id) => {
        await muteGroupApi(chat_id);
        setMutedGroups((prev) => [...prev, chat_id]);
    };
    const unmuteGroup = async (chat_id) => {
        await unmuteGroupApi(chat_id);
        setMutedGroups((prev) => prev.filter((id) => id !== chat_id));
    };

    function playNotify() {
        try {
            if (audioRef.current) {
                const audio = audioRef.current.cloneNode();
                audio.volume = 0.77;
                audio.play().catch(() => { });
            }
        } catch (e) { }
    }

    // == Effects ==
    useEffect(() => {
        try {
            localStorage.setItem("pinnedChats", JSON.stringify(pinnedChats));
        } catch { }
    }, [pinnedChats]);

    useEffect(() => {
        if (!currentUser || !currentUser.id) return;
        fetchMutedGroups().then(setMutedGroups);
    }, [currentUser]);

    useEffect(() => {
        if (currentUser && currentUser.id) {
            fetchChatList();
        }
    }, [currentUser, fetchChatList]);


    // SUPPORT: когда кто-то взял тикет — обновим список чатов у всех остальных агентов
    useEffect(() => {
        function onSupportClaimed() {
            try { fetchChatList({ force: true, reset: true }); } catch { }
        }
        window.addEventListener("support_ticket_claimed", onSupportClaimed);
        return () => window.removeEventListener("support_ticket_claimed", onSupportClaimed);
    }, [fetchChatList]);

    useEffect(() => {
        if (!currentUser || !currentUser.id) return;
        fetchUnreadCount();
    }, [currentUser, fetchUnreadCount]);

    // single notifications bus from UserContext
    useEffect(() => {
        if (!onNotification) return;
        const off = onNotification((data) => {
            try {
                const evt = data?.event || data?.type;

                // de-dup new_message
                if (evt === "new_message") {
                    const msgId = data?.message?.id;
                    const now = Date.now();
                    if (
                        msgId &&
                        lastPushRef.current.id === msgId &&
                        now - lastPushRef.current.ts < 800
                    ) {
                        return;
                    }
                    lastPushRef.current = { id: msgId || null, ts: now };

                    // counters & lists
                    fetchUnreadCount();
                    fetchChatList();
                    window.dispatchEvent(new CustomEvent("inbox_update"));
                }

                if (evt === "group_members_updated" || evt === "UNREAD_COUNT_CHANGED") {
                    fetchUnreadCount();
                    fetchChatList();
                }

                const evName = (data?.event || data?.type || data?.action);
                // ВАЖНО: на звонках историю не дергаем
                if (evName === "incoming_call") {
                    // дедуп по chat_id и 1 сек. окне
                    const now = Date.now();
                    const cid = data?.chat_id ?? null;
                    const wasSame = incomingGuardRef.current.chat_id === cid &&
                        (now - incomingGuardRef.current.ts) < 1000;
                    if (wasSame) return;
                    incomingGuardRef.current = { ts: now, chat_id: cid };

                    // активируем звонок и выходим — без refetch истории
                    try {
                        setCallBooting(true);
                        callActiveRef.current = true;
                        setGlobalCallActive(true);
                        window.dispatchEvent(new CustomEvent("incoming_call", { detail: data }));
                    } catch { }
                    return;
                }
                // Рефрешим историю ТОЛЬКО для событий, где реально нужно «перечитать» (без message.new)
                const shouldRefresh =
                    evName === "new_message" ||
                    evName === "messages_seen" ||
                    evName === "chat_cleared";
                if (shouldRefresh && data?.chat_id && chatIdRef.current === data.chat_id) {
                    // force — только для legacy "new_message"; для остальных уважаем TTL/in-flight
                    const force = (evName === "new_message");
                }
            } catch (e) {
                console.warn("[MessengerContext] onNotification error:", e);
            }
        });
        return () => {
            try {
                off && off();
            } catch { }
        };
    }, [onNotification, fetchChatList, fetchUnreadCount, fetchMessagesById]);


    // Слежение за пользовательскими событиями звонка из UI/overlay
    useEffect(() => {
        const onStart = (ev) => {
            setCallBooting(true);
            callActiveRef.current = true;
            setGlobalCallActive(true);
            try {
                const cid = ev && ev.detail && (ev.detail.chatId || ev.detail.chat_id);
                if (cid) {
                    try { setChatId(cid); } catch { }
                    try { connectWS && connectWS(cid); } catch { }
                }
            } catch { }
        };
        const onEndLike = () => { setCallBooting(false); callActiveRef.current = false; setGlobalCallActive(false); };
        try {
            window.addEventListener("call_start", onStart);
            window.addEventListener("incoming_call", onStart);
            window.addEventListener("call_ended", onEndLike);
            window.addEventListener("call_missed", onEndLike);
            window.addEventListener("call_rejected", onEndLike);
            window.addEventListener("call_canceled", onEndLike);
        } catch { }
        return () => {
            try {
                window.removeEventListener("call_start", onStart);
                window.removeEventListener("incoming_call", onStart);
                window.removeEventListener("call_ended", onEndLike);
                window.removeEventListener("call_missed", onEndLike);
                window.removeEventListener("call_rejected", onEndLike);
                window.removeEventListener("call_canceled", onEndLike);
            } catch { }
        };
    }, []);

    // Если чат закрыт, но звонок активен — убеждаемся, что сигнальный WS жив
    useEffect(() => {
        if (!callActiveRef.current) return;
        const cid = chatIdRef.current;
        if (!cid) return;
        const ready = wsRef.current?.readyState;
        if (ready == null || ready > WebSocket.CONNECTING) {
            try { connectWS && connectWS(cid); } catch { }
        }
    }, [/* намеренно пусто: триггерится при маунте/перерисовках */]);

    // Не закрываем WS во время активного звонка даже при сворачивании/навигации
    useEffect(() => {
        // Если окно мессенджера закрыто — при активном звонке держим WS
        if (!isOpen && callActiveRef.current) {
            const cid = chatIdRef.current;
            if (!cid) return;
            const st = wsRef.current?.readyState;
            if (st == null || st > WebSocket.CONNECTING) {
                try { connectWS && connectWS(cid); } catch { }
            }
        }
    }, [isOpen]);

    // На размонтировании провайдера: не рвём сигналинг, если звонок активен
    useEffect(() => {
        return () => {
            if (callActiveRef.current) return;
            try { wsRef.current?.close(4000, "unmount"); } catch { }
        };
    }, []);

    useEffect(() => {
        if (isOpen) fetchChatList();
    }, [isOpen, fetchChatList, currentUser]);

    useEffect(() => {
        window._fetchUnreadCountGlobal = fetchUnreadCount;
        window._fetchChatListGlobal = fetchChatList;
        return () => {
            window._fetchUnreadCountGlobal = null;
            window._fetchChatListGlobal = null;
        };
    }, [fetchUnreadCount, fetchChatList]);

    useEffect(() => {
        function updateSidebar() {
            fetchChatList();
        }
        window.addEventListener("inbox_update", updateSidebar);
        return () => window.removeEventListener("inbox_update", updateSidebar);
    }, [fetchChatList]);

    // Безопасно дорисовать входящее сообщение (с дедупликацией)
    const handleIncomingMessage = (cid, msg) => {
        if (!cid || !msg) return;
        setMessages(prev => {
            const arr = Array.isArray(prev) ? prev : [];
            if (arr.some(m => m.id === msg.id)) return arr;
            return [...arr, msg];
        });
        setAllMessages(prev => {
            const byChat = prev || {};
            const arr = byChat[cid] || [];
            if (arr.some(m => m.id === msg.id)) return byChat;
            return { ...byChat, [cid]: [...arr, msg] };
        });
        // пометить прочитанным — «огонь-и-забыл»
        try {
            authFetchWithRefresh && authFetchWithRefresh(api(`/chat/${cid}/mark_read`), { method: "POST" });
        } catch { }
    };

    useEffect(() => {
        // окно мессенджера закрыто или chatId отсутствует → закрываем ТОЛЬКО если нет активного звонка
        if (((!isOpen || !chatId) && !callActiveRef.current) && !getCallBooting()) {
            if (wsRef.current) {
                try { wsRef.current.close(4001, "not-open"); } catch { }
            }
            wsRef.current = null;
            lastChatIdRef.current = null;
            return;

        }
        // Если звонок активен, но окно закрыто — поддерживаем/восстанавливаем WS для текущего чата
        if ((!isOpen && chatId) && callActiveRef.current) {
            // если сокет отсутствует или закрыт — переподключим
            if (!wsRef.current || wsRef.current.readyState > WebSocket.CONNECTING) {
                connectWS(chatId);
                return;
            }

        }
        // Если этот же чат уже активен и сокет жив/коннектится — ничего не делаем
        if (lastChatIdRef.current === chatId && wsRef.current) {
            const st = wsRef.current.readyState;
            if (st === WebSocket.OPEN || st === WebSocket.CONNECTING) {
                return;
            }
        }
        // Переключение на другой чат → закрыть прошлый и открыть новый
        if (wsRef.current) {
            try { wsRef.current.close(4001, "switch-chat"); } catch { }
            wsRef.current = null;
        }
        lastChatIdRef.current = chatId;
        connectWS(chatId);
        // В cleanup НИЧЕГО не закрываем — закрытие выполняется явно при (!isOpen) или смене chatId
        return () => { };
    }, [isOpen, chatId]); // не добавляем connectWS в зависимости специально

    // graceful polling when WS not OPEN
    useEffect(() => {
        // во время звонка историю не дёргаем, сигнальный WS работает
        if (!isOpen || !chatId || (getGlobalCallState()?.active)) {
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
            return;
        }
        function poll() {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
            // если недавно уже тянули — не дёргаем
            const lastAt = fetchLastAtRef.current.get(chatId) || 0;
            if (Date.now() - lastAt < HISTORY_TTL_MS) return;
            fetchMessagesById(chatId).catch(() => { });
        }
        poll();
        pollTimerRef.current = setInterval(poll, 5000);
        return () => {
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
    }, [isOpen, chatId, fetchMessagesById]);

    // audio
    const audioRef = useRef(null);
    useEffect(() => {
        audioRef.current = new window.Audio("/sounds/notify.mp3");
    }, []);

    // === WS for a particular chat ===
    const connectLockRef = useRef(false);
    const lastAttemptAtRef = useRef(0);
    const canJoinCacheRef = useRef({ chatId: null, okAt: 0 });
    const joinedRef = useRef(new Set()); // avoid repeated POST /join per chat

    async function connectWS(id) {

        // hard pause window after repeated failures
        const nowHard = Date.now();
        if (nowHard < wsStopUntilRef.current) {
            // do not even try — polling will keep chat updated
            return;
        }

        if (!id) return;
        if (connectLockRef.current) return;
        const nowTS = Date.now();
        if (nowTS - lastAttemptAtRef.current < 1200) return;
        lastAttemptAtRef.current = nowTS;
        connectLockRef.current = true;

        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
            connectLockRef.current = false;
            return;
        }
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            try {
                wsRef.current.close();
            } catch { }
            wsRef.current = null;
        }

        async function ensureFreshToken() {
            try {
                const token = getTokenSync();
                if (!token) {
                    console.warn("[WS] skipped open: no token");
                    connectLockRef.current = false;
                    return;
                }
                const parts = token.split(".");
                if (parts.length !== 3) return;
                const payload = JSON.parse(atob(parts[1]));
                const exp = payload?.exp || 0;
                const now = Math.floor(Date.now() / 1000);
                // refresh earlier to avoid race / clock skew
                if (exp - now < 150) { // было 45
                    const resp = await fetch(api(`/refresh-token`), { method: "POST", credentials: "include" });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data?.access_token) localStorage.setItem("token", data.access_token);
                    } else {
                        // fallback: any authed call that triggers refresh
                        try {
                            await authFetchWithRefresh(api(`/auth/whoami`));
                        } catch { }
                    }
                }
            } catch { }
        }

        await ensureFreshToken();

        // preflight can-join (cache 30s)
        if (
            canJoinCacheRef.current.chatId !== id ||
            Date.now() - canJoinCacheRef.current.okAt > 30000
        ) {
            try {
                const r = await authFetchWithRefresh(api(`/chat/${id}/can-join`));
                if (r.status === 404) {
                    console.warn("[WS] chat not found (404) — stop");
                    connectLockRef.current = false;
                    return;
                }
                if (r.status === 401 || r.status === 403) {
                    console.warn("[WS] can-join denied:", r.status);
                    connectLockRef.current = false;
                    return;
                }
                canJoinCacheRef.current = { chatId: id, okAt: Date.now() };
                // ← после успешного can-join — вступаем в чат, чтобы WS не получил 403
                try {
                    if (!joinedRef.current.has(id)) {
                        let jr = await authFetchWithRefresh(api(`/chat/${id}/join`), { method: "POST" });
                        // ok / created / no content / already in
                        if (![200, 201, 204, 409].includes(jr.status)) {
                            console.warn("[WS] join returned non-ok:", jr.status);
                            connectLockRef.current = false;
                            return;
                        }
                        // помечаем joined только после успешного/допустимого статуса
                        joinedRef.current.add(id);
                    }
                } catch (e) {
                    console.warn("[WS] join error:", e);
                    connectLockRef.current = false;
                    return;
                }
            } catch {
                // network hiccup — stop now, backoff will handle retry
                connectLockRef.current = false;
                return;
            }
        }

        const token = getTokenSync(); // after ensureFreshToken()
        if (!token) {
            console.warn("[WS] skipped open: no token");
            connectLockRef.current = false;
            return;
        }

        // Дублируем токен: subprotocol + query (совместимо с прокси/старыми сборками)
        // Также пробрасываем user_id для бэкенд-аудита/совместимости
        const qs = new URLSearchParams();
        const u = getCurrentUser();
        if (u?.id) qs.set("user_id", String(u.id));
        qs.set("token", token);  // fallback для старых сборок/прокси

        const wsUrl = ws(`/ws/chat/${id}?${qs.toString()}`);

        // ——— Старт: сперва subprotocol + token; при сбое — фолбэк на query-only
        let triedFallback = false;

        const openSocket = (queryOnly = false) => {
            // если queryOnly==false → отправляем ["bearer", <JWT>] (классика)
            const subprotocols = queryOnly ? ["bearer"] : ["bearer", token];

            const ws = new window.WebSocket(wsUrl, subprotocols);
            wsRef.current = ws;

            ws.onopen = () => {
                wsBackoffRef.current = 1000;
                try { if (keepaliveTimerRef.current) clearInterval(keepaliveTimerRef.current); } catch { }
                keepaliveTimerRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        try { ws.send(JSON.stringify({ type: "ping", ts: Date.now() })); } catch { }
                    }
                }, 25000);
                try { ws.send(JSON.stringify({ type: "ping", content: "init" })); } catch { }
                connectLockRef.current = false;

                // сбрасываем счётчик рукопожатий
                try { handshakeFailsRef.current = { count: 0, since: 0 }; } catch { }
            };

            ws.onmessage = (event) => {
                let data;
                try { data = JSON.parse(event.data); } catch { data = event.data; }

                // WebRTC сигналы → сразу считаем звонок активным (важно до навигации)
                if (data && data.event && String(data.event).startsWith("webrtc-")) {
                    // если это наш собственный сигнал — игнорируем echo
                    try {
                        const me = getCurrentUser()?.id || currentUser?.id;
                        if (me && data.from_user_id && String(data.from_user_id) === String(me)) {
                            return;
                        }
                    } catch { }
                    try {
                        setCallBooting(true);
                        callActiveRef.current = true;
                        setGlobalCallActive(true);
                        window.dispatchEvent(new CustomEvent("webrtc-signal", { detail: data }));
                    } catch { }
                    return;
                }

                // seen-маркер
                if (data?.event === "messages_seen" && data.chat_id && data.seen_by) {
                    setMessages((prev) => {
                        if (!Array.isArray(prev) || prev.length === 0) return prev;
                        let lastIdx = -1;
                        for (let i = prev.length - 1; i >= 0; --i) {
                            if (prev[i].sender_id === getCurrentUser()?.id) { lastIdx = i; break; }
                        }
                        if (lastIdx === -1) return prev;
                        return prev.map((m, i) => (i === lastIdx ? { ...m, is_read: true } : m));
                    });
                    setAllMessages((prev) => {
                        const arr = prev[data.chat_id] || [];
                        let lastIdx = -1;
                        for (let i = arr.length - 1; i >= 0; --i) {
                            if (arr[i].sender_id === getCurrentUser()?.id) { lastIdx = i; break; }
                        }
                        if (lastIdx === -1) return prev;
                        return { ...prev, [data.chat_id]: arr.map((m, i) => (i === lastIdx ? { ...m, is_read: true } : m)) };
                    });
                    return;
                }

                // реакции
                if (data?.event === "reaction_update" && data.message_id && Array.isArray(data.reactions)) {
                    setMessages((prev) => prev.map((msg) => msg.id === data.message_id ? { ...msg, reactions: data.reactions } : msg));
                    setAllMessages((prev) => {
                        const arr = prev[data.chat_id] || [];
                        return { ...prev, [data.chat_id]: arr.map((msg) => msg.id === data.message_id ? { ...msg, reactions: data.reactions } : msg) };
                    });
                    return;
                }

                // Эфемерные action-события
                try {
                    const action = data?.action;
                    const cid = data?.chat_id || data?.data?.chat_id;

                    if (action === "message.new" && data?.data) {
                        const inc = data.data;
                        const target = cid || inc.chat_id;

                        if (chatIdRef.current === target) {
                            setMessages(prev => {
                                if (prev.some(m => m.id === inc.id)) return prev;
                                const i = prev.findIndex(m => m.client_id && inc.client_id && m.client_id === inc.client_id);
                                const next = prev.slice();
                                if (i !== -1) next[i] = inc; else next.push(inc);
                                return next.slice().sort(_cmpMsgAsc);
                            });
                            setAllMessages(prev => {
                                const arr = prev[target] || [];
                                if (arr.some(m => m.id === inc.id)) return prev;
                                const j = arr.findIndex(m => m.client_id && inc.client_id && m.client_id === inc.client_id);
                                const next = arr.slice();
                                if (j !== -1) next[j] = inc; else next.push(inc);
                                return { ...prev, [target]: next.slice().sort(_cmpMsgAsc) };
                            });
                            return;
                        }
                    }

                    if (action === "support.typing" && cid) {
                        const on = !!(data?.data?.is_typing);
                        supportTypingRef.current.set(cid, on);
                        forceEphemeralRender(x => x + 1);
                        return;
                    }
                    if (action === "support.queue_update" && cid) {
                        const pos = data?.data?.position;
                        const eta = data?.data?.eta_minutes;
                        if (pos == null || eta == null) {
                            supportQueueRef.current.set(cid, null);
                        } else {
                            supportQueueRef.current.set(cid, { position: pos, eta_minutes: eta });
                        }
                        forceEphemeralRender(x => x + 1);
                        return;
                    }
                    if (action === "support.autoclose.countdown" && cid) {
                        const until_iso = data?.data?.until_iso;
                        const seconds = (data?.data?.seconds ?? 60);
                        autocloseRef.current.set(cid, { until_iso, seconds });
                        forceEphemeralRender(x => x + 1);
                        return;
                    }
                    if (action === "support.autoclose.cancelled" && cid) {
                        autocloseRef.current.delete(cid);
                        forceEphemeralRender(x => x + 1);
                        return;
                    }
                    // SUPPORT: первый агент забрал тикет → убрать карточку из Inbox
                    if (action === "support.assigned" && cid) {
                        try { fetchChatList({ force: true, reset: true }); } catch { }
                        return;
                    }
                    if (action === "support.autoclose.closed" && cid) {
                        try { window.dispatchEvent(new CustomEvent("support_chat_closing", { detail: { chatId: cid } })); } catch { }
                        // Даём 800мс на анимацию, затем чистим стейты
                        setTimeout(() => {
                            setChatList(prev => (Array.isArray(prev) ? prev.filter(c => c.chat_id !== cid) : prev));
                            setAllMessages(prev => { const cp = { ...prev }; delete cp[cid]; return cp; });
                            autocloseRef.current.delete(cid);
                            forceEphemeralRender(x => x + 1);
                        }, 800);
                        return;
                    }
                } catch (e) { }
            };

            ws.onerror = (evt) => {
                // первый сбой → пробуем без передачи JWT в subprotocol (совместимость с прокси/старым сервером)
                if (!triedFallback) {
                    triedFallback = true;
                    try { ws.close(); } catch { }
                    openSocket(true); // query-only: ["bearer"] + токен только в query
                    return;
                }
                const now = Date.now();
                if (!handshakeFailsRef.current.since || now - handshakeFailsRef.current.since > 60000) {
                    handshakeFailsRef.current = { count: 1, since: now };
                } else {
                    handshakeFailsRef.current.count += 1;
                }
                if (handshakeFailsRef.current.count >= 4) {
                    console.warn("[WS] repeated handshake failures → pause 2m", evt?.code);
                    wsStopUntilRef.current = now + 2 * 60 * 1000;
                }
            };

            ws.onclose = async (evt) => {
                wsRef.current = null;
                try { if (keepaliveTimerRef.current) clearInterval(keepaliveTimerRef.current); } catch { }

                // ⚡️моментальный фолбэк: если сабпротокол с токеном «не зашёл», переключаемся на query-only
                if (!triedFallback && !queryOnly && (evt?.code === 1006 || evt?.code === 4401 || evt?.code === 4403)) {
                    triedFallback = true;
                    try { ws.close(); } catch { }
                    openSocket(true);
                    return;
                }

                if (!isOpen && !callActiveRef.current && !getCallBooting()) return;

                // во время активного/устанавливающегося звонка удерживаем связь даже если chatId сброшен
                if ((callActiveRef.current || getCallBooting()) && chatIdRef.current !== id) {
                    // продолжаем реконнект по старому id, чтобы звонок не оборвался
                } else if (chatIdRef.current !== id) {
                    return;
                }

                // Любая неудача рукопожатия — сначала пробуем query-only один раз
                if (!triedFallback && (!evt || [1006, 4401, 4403].includes(evt.code))) {
                    triedFallback = true;
                    console.warn("[WS] fallback: retry with query-only token");
                    openSocket(true); // query-only
                    return;
                }
                // 1008 / 4403 — действительно политика/запрещено → ставим паузу.
                // 4401 (Unauthorized) обрабатываем ниже через refresh и быстрый реконнект.
                if (evt && (evt.code === 1008 || evt.code === 4403)) {
                    console.warn("[WS] stop reconnect due to policy/forbidden:", evt.code);
                    connectLockRef.current = false;
                    wsStopUntilRef.current = Date.now() + 2 * 60 * 1000;
                    return;
                }

                if (evt && evt.code === 1006) {
                    console.warn("[WS] handshake failed (likely 403) — quick retry");
                    connectLockRef.current = false;
                    setTimeout(() => { if ((isOpen || callActiveRef.current) && chatIdRef.current === id) connectWS(id); }, 1500);
                    return;
                }
                if (evt && evt.code === 4401) {
                    let refreshed = false;
                    try {
                        const rr = await fetch(api(`/refresh-token`), { method: "POST", credentials: "include" });
                        if (rr.ok) {
                            const data = await rr.json().catch(() => ({}));
                            if (data?.access_token) { localStorage.setItem("token", data.access_token); refreshed = true; }
                        }
                    } catch { }
                    if (!refreshed) {
                        console.warn("[WS] refresh failed → stop reconnect, show login");
                        try { setIsOpen(false); } catch { }
                        try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("auth_required")); } catch { }
                        connectLockRef.current = false;
                        return;
                    }
                    // токен обновлён → пробуем переподключиться сразу
                    connectLockRef.current = false;
                    setTimeout(() => { if ((isOpen || callActiveRef.current) && chatIdRef.current === id) connectWS(id); }, 300);
                    return;
                    connectLockRef.current = false;
                    setTimeout(() => { if ((isOpen || callActiveRef.current) && chatIdRef.current === id) connectWS(id); }, 200);
                    return;
                }

                // Санитарная проверка can-join, если 1006 без кода
                if (!evt?.code || evt.code === 1006) {
                    const lastOk = canJoinCacheRef.current?.okAt || 0;
                    if (Date.now() - lastOk < 25000) { connectLockRef.current = false; return; }
                    try {
                        const r = await authFetchWithRefresh(api(`/chat/${id}/can-join`));
                        if (r.status === 0) {
                            console.warn("[WS] can-join blocked by CORS/Origin → stop reconnect");
                            try { setIsOpen(false); } catch { }
                            try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ws_cors_blocked")); } catch { }
                            connectLockRef.current = false;
                            return;
                        }
                        if ([404, 401, 403].includes(r.status)) { connectLockRef.current = false; return; }
                        canJoinCacheRef.current = { chatId: id, okAt: Date.now() };
                    } catch { }
                }

                try { if (handshakeFailsRef.current.count > 0) handshakeFailsRef.current.count -= 1; } catch { }

                const now = Date.now();
                const winStart = reconnectStateRef.current.windowStart || now;
                if (now - winStart > 60000) {
                    reconnectStateRef.current = { fails: 0, windowStart: now };
                }
                reconnectStateRef.current.fails += 1;
                if (reconnectStateRef.current.fails >= 6) {
                    const cooldown = 60000;
                    console.warn("[WS] too many failures; cooldown 60s");
                    setTimeout(() => { if ((isOpen || callActiveRef.current) && chatIdRef.current === id) connectWS(id); }, cooldown);
                    connectLockRef.current = false;
                    return;
                }

                const base = wsBackoffRef.current || 1000;
                const next = Math.min(30000, Math.floor(base * 1.8)) + Math.floor(Math.random() * 300);
                wsBackoffRef.current = next;
                console.warn(`[WS] reconnect in ${next}ms...`);
                setTimeout(() => { if ((isOpen || callActiveRef.current) && chatIdRef.current === id) connectWS(id); }, next);
                connectLockRef.current = false;
            };
        };

        // Стартуем с токеном в subprotocol; при ошибке onerror сам переключит на query-only
        openSocket(false);
    } // ←←← ЗАКРЫВАЕМ connectWS ПРЯМО ЗДЕСЬ


    // === Open / Close API ===
    const openMessenger = useCallback(
        async (arg = null, attachment = null) => {
            let _chatId = null;
            let _userId = null;
            if (arg && typeof arg === "object") {
                if (arg.nativeEvent) {
                    _chatId = null;
                } else if (arg.chat_id || arg.chatId) {
                    _chatId = arg.chat_id || arg.chatId;
                } else if (arg.userId || arg.user_id) {
                    _userId = arg.userId || arg.user_id;
                }
            } else if (typeof arg === "string" || typeof arg === "number") {
                _chatId = arg;
            }
            setCurrentUser(getCurrentUser());
            setIsOpen(true);
            setPendingAttachment(attachment || null);

            if (_chatId) {
                const alreadyOpen = (chatIdRef.current === _chatId) && isOpenRef.current;
                // если этот чат уже открыт — просто показываем окно и ничего не перезагружаем
                if (!alreadyOpen) {
                    setChatId(_chatId);
                    setMessages([]); // clear old
                    try { ensureChatInSidebar(_chatId, { peer: peerUser }); } catch { }
                    await fetchMessagesById(_chatId, { force: true });
                } else {
                    setIsOpen(true);
                }
                try {
                    const res = await authFetchWithRefresh(api(`/chat/${_chatId}/peer`));
                    if (res.ok) {
                        const p = await res.json();

                        const fromList =
                            (Array.isArray(chatList) ? chatList : []).find(
                                (c) => c.chat_id === _chatId
                            )?.peer || {};

                        const avatar =
                            (p && (p.avatar || p.avatar_url || p.photo)) ||
                            (fromList && (fromList.avatar || fromList.avatar_url || fromList.photo)) ||
                            null;
                        const mergedPeer = { ...(fromList || {}), ...(p || {}), ...(avatar ? { avatar } : {}) };
                        setPeerUser(mergedPeer);
                        // обновим карточку точными данными о собеседнике (organization, name, avatar)
                        try { ensureChatInSidebar(_chatId, { peer: mergedPeer }); } catch { }
                    } else {
                        setPeerUser(null);
                    }
                } catch {
                    setPeerUser(null);
                }
            } else if (_userId) {
                setChatId(null);
                setMessages([]);
                if (arg && arg.user) {
                    setPeerUser(arg.user);
                } else {
                    setPeerUser(null);
                }
                try {
                    const res = await authFetchWithRefresh(api(`/users/${_userId}`));
                    if (res.ok) {
                        let u = await res.json();
                        if (!u.avatar) {
                            const fromList = (Array.isArray(chatList) ? chatList : []).find(
                                (c) => c.peer?.id === _userId
                            )?.peer;
                            if (fromList?.avatar) u.avatar = fromList.avatar;
                        }
                        setPeerUser(u);
                    }
                } catch { }
            }
        },
        [authFetchWithRefresh, chatList, fetchMessagesById, ensureChatInSidebar, peerUser]
    );

    const sendMessage = useCallback(
        async (msg) => {
            if (!chatId) return;

            // до реального запроса убеждаемся, что чат виден в сайдбаре
            try { ensureChatInSidebar(chatId, { peer: peerUser }); } catch { }

            // 1) оптимистичное сообщение
            const client_id = `c${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const me = getCurrentUser();
            const _client_ts = Date.now();
            const _client_seq = (optimisticSeqRef.current = optimisticSeqRef.current + 1);
            const optimistic = {
                id: `tmp:${client_id}`,
                client_id,
                sender_id: me?.id,
                content: msg.content ?? "",
                message_type: msg.message_type || "text",
                file_id: msg.file_id || null,
                file: null,
                order_id: msg.order_id || null,
                transport_id: msg.transport_id || null,
                sent_at: new Date().toISOString(),
                _optimistic: true,
                _client_ts,
                _client_seq,
            };

            setMessages((prev) => {
                if (chatIdRef.current !== chatId) return prev;
                const next = [...prev, optimistic].slice().sort(_cmpMsgAsc);
                return next;
            });
            setAllMessages((prev) => {
                const arr = prev[chatId] || [];
                return { ...prev, [chatId]: [...arr, optimistic].slice().sort(_cmpMsgAsc) };
            });


            // 2) реальный запрос
            const res = await authFetchWithRefresh(api(`/chat/${chatId}/send`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...msg, client_id }),
            });

            if (res.ok) {
                const data = await res.json();

                setMessages((prev) => {
                    if (chatIdRef.current !== chatId) return prev;
                    const i = prev.findIndex((m) => m.client_id === client_id);
                    const next = prev.slice();
                    if (i === -1) next.push(data); else next[i] = data;
                    return next.slice().sort(_cmpMsgAsc);
                });
                setAllMessages((prev) => {
                    const arr = prev[chatId] || [];
                    const j = arr.findIndex((m) => m.client_id === client_id);
                    const next = arr.slice();
                    if (j !== -1) next[j] = data; else next.push(data);
                    return { ...prev, [chatId]: next.slice().sort(_cmpMsgAsc) };
                });
                // сразу дописываем превью последнего сообщения и корректного peer в карточку
                try { ensureChatInSidebar(chatId, { peer: peerUser, lastMessage: data }); } catch { }

                fetchChatList();
                window.dispatchEvent(new CustomEvent("inbox_update"));
            } else {
                // пометим как неотправленное
                setMessages((prev) => prev.map(m => m.client_id === client_id ? { ...m, _failed: true } : m));
                setAllMessages((prev) => {
                    const arr = prev[chatId] || [];
                    return { ...prev, [chatId]: arr.map(m => m.client_id === client_id ? { ...m, _failed: true } : m) };
                });
            }
        },
        [chatId, authFetchWithRefresh, fetchChatList, ensureChatInSidebar, peerUser]
    );
    // --- ПУБЛИЧНЫЙ API: отправка карточки звонка (в конкретный чат) ---
    const sendCallMessage = useCallback(async (data = {}, targetChatId = null) => {
        const id = targetChatId || chatIdRef.current || chatId;
        if (!id) return;

        // нормализуем полезную нагрузку карточки
        const safe = {
            status: data.status || data.state || "ended",         // ended|missed|rejected|canceled
            direction: data.direction || "outgoing",              // incoming|outgoing
            duration: (typeof data.duration === "number" ? data.duration : data.seconds) || null
        };
        const payload = JSON.stringify(safe);

        // --- оптимистичное добавление в нужный чат ---
        const client_id = `c${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const me = getCurrentUser && getCurrentUser();
        const _client_ts = Date.now();
        const _client_seq = (optimisticSeqRef.current = optimisticSeqRef.current + 1);
        const optimistic = {
            id: `tmp:${client_id}`,
            client_id,
            sender_id: me?.id,
            content: payload,
            message_type: "call",
            file_id: null,
            file: null,
            order_id: null,
            transport_id: null,
            sent_at: new Date().toISOString(),
            _optimistic: true,
            _client_ts,
            _client_seq,
            chat_id: id
        };

        // если этот чат сейчас открыт — дорисуем в экран
        setMessages(prev => {
            if ((chatIdRef.current || chatId) !== id) return prev;
            const next = Array.isArray(prev) ? [...prev, optimistic] : [optimistic];
            return next.slice().sort(_cmpMsgAsc);
        });
        // всегда обновим кэш этого чата
        setAllMessages(prev => {
            const byChat = prev || {};
            const arr = byChat[id] || [];
            const next = [...arr, optimistic].slice().sort(_cmpMsgAsc);
            return { ...byChat, [id]: next };
        });
        // сразу обновим превью в списке чатов
        try { ensureChatInSidebar && ensureChatInSidebar(id, { peer: peerUser, lastMessage: optimistic }); } catch { }

        // --- реальный запрос именно в нужный чат ---
        try {
            const res = await authFetchWithRefresh(api(`/chat/${id}/send`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message_type: "call", content: payload, client_id })
            });
            if (res.ok) {
                const saved = await res.json();
                // заменить оптимистичное сообщение на реальное
                setMessages(prev => {
                    if ((chatIdRef.current || chatId) !== id) return prev;
                    const arr = Array.isArray(prev) ? prev.slice() : [];
                    const i = arr.findIndex(m => m.client_id === client_id);
                    if (i === -1) arr.push(saved); else arr[i] = saved;
                    return arr.slice().sort(_cmpMsgAsc);
                });
                setAllMessages(prev => {
                    const byChat = prev || {};
                    const arr = (byChat[id] || []).slice();
                    const j = arr.findIndex(m => m.client_id === client_id);
                    if (j === -1) arr.push(saved); else arr[j] = saved;
                    return { ...byChat, [id]: arr.slice().sort(_cmpMsgAsc) };
                });
                try { ensureChatInSidebar && ensureChatInSidebar(id, { peer: peerUser, lastMessage: saved }); } catch { }
                fetchChatList && fetchChatList();
                window.dispatchEvent(new CustomEvent("inbox_update"));
            } else {
                // пометить как неотправленное
                setMessages(prev => (Array.isArray(prev) ? prev.map(m => (m.client_id === client_id ? { ...m, _failed: true } : m)) : prev));
                setAllMessages(prev => {
                    const byChat = prev || {};
                    const arr = (byChat[id] || []).map(m => (m.client_id === client_id ? { ...m, _failed: true } : m));
                    return { ...byChat, [id]: arr };
                });
            }
        } catch {
            setMessages(prev => (Array.isArray(prev) ? prev.map(m => (m.client_id === client_id ? { ...m, _failed: true } : m)) : prev));
            setAllMessages(prev => {
                const byChat = prev || {};
                const arr = (byChat[id] || []).map(m => (m.client_id === client_id ? { ...m, _failed: true } : m));
                return { ...byChat, [id]: arr };
            });
        }
    }, [authFetchWithRefresh, ensureChatInSidebar, fetchChatList, chatId, peerUser]);

    // Запоминаем чат, из которого стартовал звонок, чтобы использовать его,
    // если модуль звонков не передаст detail.chatId в событиях завершения
    const lastCallChatIdRef = useRef(null);
    useEffect(() => {
        const onStart = (e) => {
            lastCallChatIdRef.current = e?.detail?.chatId || chatIdRef.current || chatId;
        };
        window.addEventListener("call_start", onStart);
        return () => window.removeEventListener("call_start", onStart);
    }, [chatId]);


    // Подхватываем события из модуля звонков и логируем в чат
    useEffect(() => {
        function toChat(status, detail = {}) {
            const direction =
                detail.direction || (detail.caller_id === currentUser?.id ? "outgoing" : "incoming");
            const cid = detail.chatId || chatIdRef.current || lastCallChatIdRef.current || chatId;
            sendCallMessage({ status, direction, duration: detail.duration }, cid);
        }
        const onEnded = (e) => toChat("ended", e.detail || {});
        const onMissed = (e) => toChat("missed", e.detail || {});
        const onReject = (e) => toChat("rejected", e.detail || {});
        const onCancel = (e) => toChat("canceled", e.detail || {});
        window.addEventListener("call_ended", onEnded);
        window.addEventListener("call_missed", onMissed);
        window.addEventListener("call_rejected", onReject);
        window.addEventListener("call_canceled", onCancel);
        return () => {
            window.removeEventListener("call_ended", onEnded);
            window.removeEventListener("call_missed", onMissed);
            window.removeEventListener("call_rejected", onReject);
            window.removeEventListener("call_canceled", onCancel);
        };
    }, [sendCallMessage, currentUser, chatId]);

    const markChatRead = useCallback(
        async (_chatId = null, opts = {}) => {
            const id = _chatId || chatId;
            if (!id) return;
            try {
                const res = await authFetchWithRefresh(api(`/chat/${id}/mark_read`), {
                    method: "POST",
                });
                if (!opts.silent) {
                    fetchUnreadCount();
                    fetchChatList();
                }
                window._lastReadChats = window._lastReadChats || {};
                window._lastReadChats[id] = Date.now();
            } catch { }
        },
        [chatId, fetchUnreadCount, fetchChatList, authFetchWithRefresh]
    );

    useEffect(() => {
        function updateUnread() {
            fetchUnreadCount();
        }
        window.addEventListener("inbox_update", updateUnread);
        return () => window.removeEventListener("inbox_update", updateUnread);
    }, [fetchUnreadCount]);

    // Мягкое скрытие только UI (без трогания WS) — удобно вызывать при навигации
    const hideMessengerUi = useCallback(() => {
        setIsOpen(false);
    }, []);

    const closeMessenger = useCallback((opts = {}) => {
        const { keepWS = false } = opts;
        setIsOpen(false);
        // Во время активного звонка/бутстрапа/наличия оверлея — WS не трогаем
        const mustKeepWs =
            keepWS ||
            callActiveRef.current ||
            getCallBooting() ||
            (typeof window !== "undefined" &&
                ((window.__CALL_STATE && window.__CALL_STATE.active) || window.__CALL_OVERLAY_PRESENT));

        if (!mustKeepWs) {
            setChatId(null);
            if (wsRef.current) {
                try { wsRef.current.close(); } catch { }
                wsRef.current = null;
            }
            setMessages([]);
            setPeerUser(null);
            setPendingAttachment(null);
        }
    }, []);

    // --- selectors for ephemeral state ---
    const getSupportTyping = useCallback((id) => {
        return !!supportTypingRef.current.get(id);
    }, []);
    const getSupportQueue = useCallback((id) => {
        return supportQueueRef.current.get(id) || null;
    }, []);

    return (
        <MessengerContext.Provider
            value={{
                isOpen,
                openMessenger,
                closeMessenger,
                hideMessengerUi,
                markChatRead,
                messages,
                setMessages,
                sendMessage,
                sendCallMessage,
                chatId,
                setChatId,
                peerUser,
                setPeerUser,
                unread,
                fetchUnreadCount,
                chatList,
                fetchChatList,            // reload first page
                fetchMoreChats,           // load next page (append)
                chatListEOF,
                chatListLoading,
                currentUser,
                connectWS,
                pendingAttachment,
                setPendingAttachment,
                allMessages,
                setAllMessages,
                notificationsSocket,
                fetchMessages: fetchMessagesById,
                fetchOlderMessages: fetchOlderMessagesById,
                mutedGroups,
                muteGroup,
                unmuteGroup,
                pinnedChats,
                pinChat,
                unpinChat,
                // helpers
                isSupportChat,
                getChatById,
                pendingPinned,
                wsRef,
                // support ephemeral selectors
                getSupportTyping,
                getSupportQueue,
                getSupportTyping,
                getSupportQueue,
                getAutoclose: (id) => (autocloseRef.current.get(id) || null),
                clearLocalChat,
                deleteChatForMe,
            }}
        >
            {children}
        </MessengerContext.Provider>
    );
}

export function useMessenger() {
    return useContext(MessengerContext);
}
