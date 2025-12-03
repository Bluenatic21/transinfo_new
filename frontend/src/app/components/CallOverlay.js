"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMessenger } from "./MessengerContext";
import { useUser } from "../UserContext";
import { useLang } from "../i18n/LangProvider";
import useAudioUnlock from "../lib/useAudioUnlock";
import { useCallTones } from "../lib/useCallTones";
import { abs } from "@/config/env";
// test commit from Bluenatic21
// Полноэкранный центрированный оверлей голосового вызова.
// + Перетаскивание/сворачивание в «пузырь».
// + Одна запись статуса на звонок, антидребезг, игнор своих сигналов.
// Ensure single instance of CallOverlay (avoid double mount)
let __CALL_OVERLAY_MOUNTED = false;
const ABS_URL = /^(https?:\/\/|blob:)/i;

function pickAvatarUrl(peer) {
  const src =
    peer?.avatar_url ||
    peer?.avatarUrl ||
    peer?.avatar ||
    peer?.photo_url ||
    peer?.photo ||
    peer?.image ||
    "";
  if (!src) return "";
  return ABS_URL.test(src) ? src : abs(src);
}

export default function CallOverlay() {
  // хук-контексты — строго первыми
  const { wsRef, openMessenger } = useMessenger();
  const { user } = useUser();
  const { t } = useLang();
  // Разблокируем аудио-контекст (для синтетических тонов) и инициализируем тоны
  useAudioUnlock();
  const {
    startRingback,
    stopRingback,
    startIncomingTone,
    stopIncomingTone,
    stopAll,
  } = useCallTones({ volume: 0.12 });

  // singleton guard (без раннего return до всех хуков!)
  const [__allowOverlay, __setAllowOverlay] = useState(false);
  useEffect(() => {
    if (__CALL_OVERLAY_MOUNTED) {
      __setAllowOverlay(false);
      return;
    }
    __CALL_OVERLAY_MOUNTED = true;
    __setAllowOverlay(true);
    return () => {
      __CALL_OVERLAY_MOUNTED = false;
    };
  }, []);

  // глобальный флаг «оверлей присутствует»
  useEffect(() => {
    try {
      globalThis.__CALL_OVERLAY_PRESENT = true;
    } catch {}
    return () => {
      try {
        globalThis.__CALL_OVERLAY_PRESENT = false;
      } catch {}
    };
  }, []);

  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [state, setState] = useState("idle"); // 'idle' | 'calling' | 'ringing' | 'in-call'
  const stateRef = useRef("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const directionRef = useRef("outgoing");
  const callStartedAtRef = useRef(null);

  const [activeChatId, setActiveChatId] = useState(null);
  const [fromUserId, setFromUserId] = useState(null);
  const [peerDisplayName, setPeerDisplayName] = useState("");
  const [peerAvatar, setPeerAvatar] = useState("");
  const [hasOffer, setHasOffer] = useState(false);
  const [muted, setMuted] = useState(false);

  // перетаскивание
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ dx: 0, dy: 0 });

  const pcRef = useRef(null);
  const cardRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingIceRef = useRef([]); // ICE до remoteDescription

  // re-entry guard + троттлинг запуска звонка
  const startLockRef = useRef(false);
  const lastStartTsRef = useRef(0);

  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [
          {
            urls: process.env.NEXT_PUBLIC_TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "",
          },
        ]
      : []),
  ];

  function sendSignal(type, payload = {}) {
    try {
      const ws = wsRef?.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, ...payload }));
      }
    } catch {}
  }

  const cleanup = useCallback(() => {
    // Всегда глушим локальные тоны при любом завершении
    try {
      stopAll();
    } catch {}
    try {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    } catch {}
    setClosing(false);

    try {
      if (pcRef.current) {
        try {
          pcRef.current.onicecandidate = null;
          pcRef.current.ontrack = null;
          pcRef.current.onconnectionstatechange = null;
          pcRef.current.oniceconnectionstatechange = null;
        } catch {}
        pcRef.current.close();
      }
    } catch {}
    pcRef.current = null;

    try {
      const s = localStreamRef.current;
      if (s)
        s.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
    } catch {}
    localStreamRef.current = null;

    setMuted(false);
    setState("idle");
    setVisible(false);
    setMinimized(false);
    setActiveChatId(null);
    setFromUserId(null);
    setPeerDisplayName("");
    setPeerAvatar("");
    setHasOffer(false);
    setPos(null);
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
  }, [stopAll]);

  // глобальный «call_active» для других модулей
  useEffect(() => {
    try {
      const active = state === "ringing" || state === "in-call";
      window.dispatchEvent(
        new CustomEvent("call_active", {
          detail: { active, chat_id: activeChatId },
        })
      );
    } catch {}
  }, [state, activeChatId]);

  // статусы звонка → в контекст (ONE-SHOT)
  const dispatchCallEvent = useCallback(
    (name, detail = {}) => {
      try {
        const payload = {
          chatId: detail.chatId || activeChatId,
          direction: detail.direction || directionRef.current,
          duration:
            typeof detail.duration === "number" ? detail.duration : null,
          caller_id: fromUserId || null,
        };
        window.dispatchEvent(new CustomEvent(name, { detail: payload }));
      } catch {}
    },
    [activeChatId, fromUserId]
  );

  const loggedOnceRef = useRef(false);
  const logOnce = useCallback(
    (name, detail = {}) => {
      if (loggedOnceRef.current) return;
      loggedOnceRef.current = true;
      dispatchCallEvent(name, detail);
    },
    [dispatchCallEvent]
  );

  // beforeunload
  useEffect(() => {
    const bye = () => {
      const st = stateRef.current;
      try {
        if (st === "in-call") {
          const dur = callStartedAtRef.current
            ? Math.round((Date.now() - callStartedAtRef.current) / 1000)
            : null;
          logOnce("call_ended", { duration: dur });
        } else if (st === "ringing") {
          if (directionRef.current === "incoming") logOnce("call_rejected");
          else logOnce("call_canceled");
        } else if (st === "calling") {
          logOnce("call_canceled");
        }
      } catch {}
      try {
        sendSignal("webrtc-hangup", { media: "audio" });
      } catch {}
      setClosing(true);
      closeTimerRef.current = setTimeout(() => cleanup(), 600);
    };
    window.addEventListener("beforeunload", bye);
    return () => window.removeEventListener("beforeunload", bye);
  }, [cleanup, logOnce]);

  // ====== Тоны звонка ======
  // Исходящий: ringback звучит пока state === "calling"
  useEffect(() => {
    if (state === "calling") startRingback();
    else stopRingback();
  }, [state, startRingback, stopRingback]);

  // Входящий: "warble" звучит пока state === "ringing" И это входящий (direction = incoming)
  useEffect(() => {
    if (state === "ringing" && directionRef.current === "incoming")
      startIncomingTone();
    else stopIncomingTone();
  }, [state, startIncomingTone, stopIncomingTone]);

  // При соединении/простое — на всякий случай глушим всё
  useEffect(() => {
    if (state === "in-call" || state === "idle") stopAll();
  }, [state, stopAll]);

  async function ensureWsReady(maxWaitMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const ws = wsRef?.current;
      if (ws && ws.readyState === WebSocket.OPEN) return true;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  // === Исходящий ===
  async function startCaller(cid, peerInfo) {
    if (startLockRef.current) return;
    startLockRef.current = true;
    lastStartTsRef.current = Date.now();

    try {
      globalThis.__CALL_BOOTING = true;
    } catch {}
    setActiveChatId(cid);
    directionRef.current = "outgoing";
    if (peerInfo) {
      setPeerDisplayName(
        peerInfo.display_name ||
          peerInfo.name ||
          peerInfo.username ||
          t("common.contact", "Контакт")
      );
      setPeerAvatar(pickAvatarUrl(peerInfo));
    }

    try {
      await openMessenger(cid);
    } catch {}
    const ok = await ensureWsReady(6000);
    if (!ok) {
      console.warn("[CallOverlay] chat WS not ready for call");
      setVisible(false);
      startLockRef.current = false;
      return;
    }

    setState("calling");
    setVisible(true);
    setMinimized(false);

    const pc = new RTCPeerConnection({ iceServers });

    const onConnDrop = () => {
      try {
        const st = stateRef.current;
        if (st === "in-call") {
          const dur = callStartedAtRef.current
            ? Math.round((Date.now() - callStartedAtRef.current) / 1000)
            : null;
          logOnce("call_ended", { duration: dur });
        } else if (st === "ringing" || st === "calling") {
          if (directionRef.current === "incoming") logOnce("call_canceled");
          else logOnce("call_missed");
        }
      } catch {}
      try {
        sendSignal("webrtc-hangup", { media: "audio" });
      } catch {}
      setClosing(true);
      closeTimerRef.current = setTimeout(() => cleanup(), 600);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed")
        onConnDrop();
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === "failed" || st === "disconnected" || st === "closed")
        onConnDrop();
    };

    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate)
        sendSignal("webrtc-ice", { candidate: e.candidate, media: "audio" });
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
    };

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal("webrtc-offer", { sdp: offer.sdp, media: "audio" });
    } catch (err) {
      console.error("[CallOverlay] getUserMedia / createOffer error", err);
      cleanup();
    } finally {
      startLockRef.current = false;
    }
  }

  // === Принять входящий ===
  async function acceptIncoming() {
    if (activeChatId) {
      try {
        await openMessenger(activeChatId);
      } catch {}
    }
    const ok = await ensureWsReady(6000);
    if (!ok) {
      console.warn("[CallOverlay] chat WS not ready to accept call");
      return;
    }
    if (!pendingOfferRef.current) {
      console.warn("[CallOverlay] awaiting remote offer, accept disabled");
      return;
    }

    setState("in-call");
    callStartedAtRef.current = Date.now();
    const pc = new RTCPeerConnection({ iceServers });

    const onConnDrop = () => {
      try {
        const st = stateRef.current;
        if (st === "in-call") {
          const dur = callStartedAtRef.current
            ? Math.round((Date.now() - callStartedAtRef.current) / 1000)
            : null;
          logOnce("call_ended", { duration: dur });
        } else if (st === "ringing" || st === "calling") {
          if (directionRef.current === "incoming") logOnce("call_canceled");
          else logOnce("call_missed");
        }
      } catch {}
      try {
        sendSignal("webrtc-hangup", { media: "audio" });
      } catch {}
      setClosing(true);
      closeTimerRef.current = setTimeout(() => cleanup(), 600);
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "failed" || st === "disconnected" || st === "closed")
        onConnDrop();
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === "failed" || st === "disconnected" || st === "closed")
        onConnDrop();
    };

    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate)
        sendSignal("webrtc-ice", { candidate: e.candidate, media: "audio" });
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
    };

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));

      const offerSdp = pendingOfferRef.current;
      if (offerSdp) {
        await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
        // применяем отложенные ICE после установки RD
        try {
          const buf = pendingIceRef.current || [];
          pendingIceRef.current = [];
          for (const c of buf) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch {}
          }
        } catch {}
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal("webrtc-answer", { sdp: answer.sdp, media: "audio" });
        pendingOfferRef.current = null;
        setHasOffer(false);
      }
    } catch (err) {
      console.error("[CallOverlay] acceptIncoming error", err);
      cleanup();
    }
  }

  // отклонить входящий (ringing)
  function declineIncoming() {
    try {
      logOnce("call_rejected");
    } catch {}
    try {
      sendSignal("webrtc-hangup", { media: "audio" });
    } catch {}
    setClosing(true);
    closeTimerRef.current = setTimeout(() => cleanup(), 600);
  }

  function hangup() {
    try {
      const st = stateRef.current;
      if (st === "in-call") {
        const dur = callStartedAtRef.current
          ? Math.round((Date.now() - callStartedAtRef.current) / 1000)
          : null;
        logOnce("call_ended", { duration: dur });
      } else if (st === "ringing") {
        logOnce("call_rejected");
      } else if (st === "calling") {
        logOnce("call_canceled");
      }
    } catch {}
    try {
      sendSignal("webrtc-hangup", { media: "audio" });
    } catch {}
    setClosing(true);
    startLockRef.current = false;
    closeTimerRef.current = setTimeout(() => cleanup(), 600);
  }

  // сворачиваем в «пузырь»
  const minimizeOverlay = useCallback(() => setMinimized(true), []);

  // mute
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        const s = localStreamRef.current;
        if (s) s.getAudioTracks().forEach((t) => (t.enabled = !next));
      } catch {}
      return next;
    });
  }, []);

  // incoming_call
  useEffect(() => {
    function onIncomingCall(ev) {
      const { chat_id, sdp, from_user_id, peer } = ev.detail || {};
      if (from_user_id && user?.id && String(from_user_id) === String(user.id))
        return;
      if (!chat_id) return;

      if (
        activeChatId === chat_id &&
        (stateRef.current === "ringing" || stateRef.current === "in-call")
      ) {
        setVisible(true);
        setMinimized(false);
        if (sdp) {
          pendingOfferRef.current = sdp;
          setHasOffer(true);
        }
        if (peer) {
          setPeerDisplayName(
            peer?.display_name ||
              peer?.name ||
              peer?.username ||
              t("common.contact", "Контакт")
          );
          setPeerAvatar(pickAvatarUrl(peer));
        }
        return;
      }

      directionRef.current = "incoming";
      const wsReady = !!(
        wsRef?.current && wsRef.current.readyState === WebSocket.OPEN
      );
      if (activeChatId !== chat_id || !wsReady) {
        try {
          openMessenger(chat_id);
        } catch {}
      }

      pendingOfferRef.current = sdp || null;
      setHasOffer(!!sdp);
      setActiveChatId(chat_id);
      setFromUserId(from_user_id || null);
      setPeerDisplayName(
        peer?.display_name ||
          peer?.name ||
          peer?.username ||
          t("common.contact", "Контакт")
      );
      setPeerAvatar(pickAvatarUrl(peer));
      setState("ringing");
      setVisible(true);
      setMinimized(false);
    }
    window.addEventListener("incoming_call", onIncomingCall);
    return () => window.removeEventListener("incoming_call", onIncomingCall);
  }, [openMessenger, activeChatId, user, wsRef]);

  // webrtc-signal
  useEffect(() => {
    function onSignal(ev) {
      const data = ev.detail || {};
      if (!data || !data.event) return;

      // игнор эхо своих сигналов
      try {
        if (
          data.from_user_id &&
          user?.id &&
          String(data.from_user_id) === String(user.id)
        )
          return;
      } catch {}

      if (data.event === "webrtc-offer") {
        // если уже в разговоре — это renegotiation
        if (stateRef.current === "in-call" && pcRef.current && data.sdp) {
          (async () => {
            try {
              await pcRef.current.setRemoteDescription({
                type: "offer",
                sdp: data.sdp,
              });
              try {
                const buf = pendingIceRef.current || [];
                pendingIceRef.current = [];
                for (const c of buf) {
                  try {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
                  } catch {}
                }
              } catch {}
              const answer = await pcRef.current.createAnswer();
              await pcRef.current.setLocalDescription(answer);
              sendSignal("webrtc-answer", { sdp: answer.sdp, media: "audio" });
            } catch (e) {
              console.error("[CallOverlay] renegotiation error", e);
            }
          })();
          return;
        }
        // иначе — новый входящий
        pendingOfferRef.current = data.sdp;
        setHasOffer(true);
        setActiveChatId(data.chat_id || null);
        setFromUserId(data.from_user_id || null);
        setPeerDisplayName(
          data.peer?.display_name ||
            data.peer?.name ||
            data.peer?.username ||
            t("common.contact", "Контакт")
        );
        setPeerAvatar(pickAvatarUrl(data.peer));
        setState("ringing");
        setVisible(true);
        setMinimized(false);
      } else if (data.event === "webrtc-answer") {
        const pc = pcRef.current;
        if (pc && data.sdp) {
          (async () => {
            try {
              await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
              try {
                const buf = pendingIceRef.current || [];
                pendingIceRef.current = [];
                for (const c of buf) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                  } catch {}
                }
              } catch {}
              setState("in-call");
              callStartedAtRef.current = Date.now();
            } catch {}
          })();
        }
      } else if (data.event === "webrtc-ice") {
        const pc = pcRef.current;
        if (pc && data.candidate) {
          try {
            const hasRD = !!pc.remoteDescription && !!pc.remoteDescription.type;
            if (!hasRD) pendingIceRef.current.push(data.candidate);
            else
              pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(
                () => {}
              );
          } catch {}
        }
      } else if (data.event === "webrtc-hangup") {
        try {
          const st = stateRef.current;
          if (st === "in-call") {
            const dur = callStartedAtRef.current
              ? Math.round((Date.now() - callStartedAtRef.current) / 1000)
              : null;
            logOnce("call_ended", { duration: dur });
          } else if (st === "ringing" || st === "calling") {
            if (directionRef.current === "incoming") logOnce("call_canceled");
            else logOnce("call_missed");
          }
        } catch {}
        setClosing(true);
        closeTimerRef.current = setTimeout(() => cleanup(), 600);
      }
    }
    window.addEventListener("webrtc-signal", onSignal);
    return () => window.removeEventListener("webrtc-signal", onSignal);
  }, [cleanup, user, wsRef]);

  // старт исходящего по «трубке» в чате
  useEffect(() => {
    function onCallStart(ev) {
      const { chatId: cid, peer } = ev.detail || {};
      if (!cid) return;
      if (
        stateRef.current === "calling" ||
        stateRef.current === "ringing" ||
        stateRef.current === "in-call"
      )
        return;
      if (Date.now() - (lastStartTsRef.current || 0) < 800) return; // антидребезг
      setActiveChatId(cid);
      startCaller(cid, peer);
    }
    window.addEventListener("call_start", onCallStart);
    window.addEventListener("start-call", onCallStart); // совместимость
    return () => {
      window.removeEventListener("call_start", onCallStart);
      window.removeEventListener("start-call", onCallStart);
    };
  }, []);

  // блок скролла только когда модал раскрыт
  useEffect(() => {
    if (!(visible && !minimized)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, [visible, minimized]);

  // ===== drag =====
  const onDragStart = useCallback(
    (e) => {
      if (minimized) return;
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      setDragging(true);
      setPos({ x: rect.left, y: rect.top });
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd);
    },
    [minimized]
  );

  const onDragMove = useCallback((e) => {
    if (!cardRef.current) return;
    const nx = e.clientX - dragRef.current.dx;
    const ny = e.clientY - dragRef.current.dy;
    const maxX = window.innerWidth - cardRef.current.offsetWidth;
    const maxY = window.innerHeight - cardRef.current.offsetHeight;
    const clampedX = Math.max(8, Math.min(nx, Math.max(8, maxX - 8)));
    const clampedY = Math.max(8, Math.min(ny, Math.max(8, maxY - 8)));
    setPos({ x: clampedX, y: clampedY });
  }, []);

  const onDragEnd = useCallback(() => {
    setDragging(false);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
  }, [onDragMove]);

  if (!__allowOverlay || !visible) return null;
  // Рендерим поверх чата: в #modal-root (fallback — body)
  const __portalTarget =
    (typeof document !== "undefined" &&
      document.getElementById("modal-root")) ||
    document.body;

  // ===== Мини-пузырь =====
  if (minimized) {
    return createPortal(
      <>
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          muted={state !== "in-call"}
        />
        <div
          style={{
            ...styles.miniWrap,
            ...(closing ? styles.miniWrapClosing : {}),
          }}
        >
          <div
            style={styles.miniCircle}
            title={t("call.expand", "Развернуть")}
            onClick={() => setMinimized(false)}
          >
            {peerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={peerAvatar}
                alt={peerDisplayName}
                style={styles.miniAvatar}
              />
            ) : (
              <div style={styles.miniFallback}>
                {peerDisplayName?.[0]?.toUpperCase() || "?"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleMute}
            title={
              muted
                ? t("call.micOn", "Включить микрофон")
                : t("call.micOff", "Выключить микрофон")
            }
            style={{ ...styles.miniBtn, ...styles.miniBtnLeft }}
          >
            {muted ? IconMicOff() : IconMic()}
          </button>
          <button
            type="button"
            onClick={hangup}
            title={t("call.hangup", "Сбросить")}
            style={{
              ...styles.miniBtn,
              ...styles.miniBtnRight,
              background: "#cc2e3a",
              color: "#fff",
            }}
          >
            {IconHangup()}
          </button>
        </div>
      </>,
      __portalTarget
    );
  }

  // ===== Полный модал =====
  return createPortal(
    <div
      style={styles.backdrop}
      aria-modal="true"
      role="dialog"
      onPointerDown={minimizeOverlay}
    >
      {/* remote audio; muted до in-call */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        muted={state !== "in-call"}
      />

      <div
        ref={cardRef}
        style={{
          ...styles.card,
          ...(pos
            ? {
                position: "fixed",
                left: pos.x,
                top: pos.y,
                cursor: dragging ? "grabbing" : "default",
              }
            : {}),
          ...(closing ? styles.cardClosing : {}),
          pointerEvents: closing ? "none" : "auto",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setMinimized(true)}
          title={t("call.minimize", "Свернуть в угол")}
          style={{ ...styles.topRightBtn, ...styles.btnNeutral }}
        >
          {IconMinimize()}
        </button>

        <div
          style={{ ...styles.header, cursor: "grab" }}
          onPointerDown={onDragStart}
        >
          <div style={styles.avatarWrap}>
            {peerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={peerAvatar}
                alt={peerDisplayName || t("common.avatar", "аватар")}
                style={styles.avatar}
                draggable={false}
              />
            ) : (
              <div style={styles.avatarFallback}>
                {peerDisplayName?.[0]?.toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div style={styles.title}>
            {peerDisplayName || t("call.title", "Звонок")}
          </div>
          <div style={styles.subtitle}>
            {state === "in-call"
              ? t("call.onTheLine", "На линии")
              : state === "calling"
              ? t("call.calling", "Звоним…")
              : state === "ringing"
              ? hasOffer
                ? t("call.incoming", "Входящий звонок")
                : t("call.waitingPeer", "Ожидаем подключение…")
              : ""}
          </div>
          {closing && (
            <div style={styles.goodbye}>
              {t("call.ended", "Звонок завершён")}
            </div>
          )}
        </div>

        {/* Кнопки */}
        {state === "ringing" ? (
          <div style={styles.controls}>
            <button
              type="button"
              onClick={declineIncoming}
              style={{ ...styles.roundBtn, ...styles.btnSecondary }}
              title={t("bids.reject", "Отклонить")}
              disabled={closing}
            >
              {IconDecline()}
            </button>
            <button
              type="button"
              onClick={acceptIncoming}
              style={{ ...styles.roundBtn, ...styles.btnPrimary }}
              title={t("call.accept", "Принять")}
              disabled={!hasOffer || closing}
            >
              {IconAccept()}
            </button>
          </div>
        ) : state === "calling" ? (
          <div style={styles.controls}>
            <button
              type="button"
              onClick={hangup}
              style={{ ...styles.roundBtn, ...styles.btnDanger }}
              title={t("call.hangup", "Сбросить")}
              disabled={closing}
            >
              {IconHangup()}
            </button>
          </div>
        ) : (
          <div style={styles.controls}>
            <button
              type="button"
              onClick={toggleMute}
              style={{ ...styles.roundBtn, ...styles.btnNeutral }}
              title={
                muted
                  ? t("call.micOn", "Включить микрофон")
                  : t("call.micOff", "Выключить микрофон")
              }
              disabled={closing}
            >
              {muted ? IconMicOff() : IconMic()}
            </button>
            <button
              type="button"
              onClick={hangup}
              style={{ ...styles.roundBtn, ...styles.btnDanger }}
              title={t("call.end", "Завершить")}
              disabled={closing}
            >
              {IconHangup()}
            </button>
          </div>
        )}
      </div>
    </div>,
    __portalTarget
  );
}

// ===== стили =====
const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background:
      "radial-gradient(1100px 520px at 50% -10%, rgba(0,0,0,.45), rgba(0,0,0,.72))",
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    /* внутри #modal-root тоже поднимем слой, чтобы быть поверх других модалок */
    zIndex: 2147483630,
  },
  card: {
    width: "min(92vw, 680px)",
    borderRadius: 20,
    background: "var(--call-overlay-bg, var(--panel-bg, #17263a))",
    color: "var(--call-overlay-text, var(--text-primary, #e6eef8))",
    boxShadow: "var(--call-overlay-shadow, 0 22px 60px rgba(0,0,0,.46))",
    border: "1px solid var(--call-overlay-border, rgba(255,255,255,.06))",
    padding: "28px 28px 24px",
    transform: "translateZ(0)",
    transition: "transform .28s ease, opacity .28s ease",
  },
  header: {
    display: "grid",
    placeItems: "center",
    rowGap: 10,
    marginTop: 4,
    userSelect: "none",
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: "50%",
    overflow: "hidden",
    background: "var(--call-overlay-avatar-bg, rgba(255,255,255,.06))",
    display: "grid",
    placeItems: "center",
    boxShadow:
      "0 0 0 2px var(--call-overlay-border, rgba(255,255,255,.08)) inset",
  },
  avatar: { width: "100%", height: "100%", objectFit: "cover" },
  avatarFallback: {
    fontSize: 40,
    fontWeight: 700,
    opacity: 0.9,
    lineHeight: 1,
  },
  title: { fontSize: 22, fontWeight: 700, letterSpacing: 0.3, marginTop: 6 },
  subtitle: { fontSize: 14, opacity: 0.8 },
  controls: {
    display: "flex",
    gap: 18,
    justifyContent: "center",
    marginTop: 22,
  },
  roundBtn: {
    width: 68,
    height: 68,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: 0,
    cursor: "pointer",
    border: "1px solid var(--call-overlay-border, rgba(255,255,255,0.08))",
    transition: "transform .12s ease, background .12s ease, opacity .12s ease",
  },
  btnNeutral: {
    background:
      "var(--call-overlay-btn-neutral-bg, var(--btn-secondary, #213651))",
    color: "var(--call-overlay-btn-neutral-text, #e6eef8)",
  },
  btnDanger: { background: "var(--btn-danger, #cc2e3a)", color: "#fff" },
  btnPrimary: { background: "#2ad575", color: "#0f1a2b" },
  btnSecondary: { background: "#293549", color: "#cfe3ff" },
  topRightBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    display: "grid",
    placeItems: "center",
    border: "1px solid var(--call-overlay-border, rgba(255,255,255,.06))",
  },

  // Мини-режим
  miniWrap: {
    position: "fixed",
    top: 16,
    right: 16,
    width: 72,
    height: 72,
    zIndex: 2147483631,
    transition: "transform .28s ease, opacity .28s ease",
  },
  miniCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "var(--call-overlay-bg, var(--panel-bg, #17263a))",
    border: "1px solid var(--call-overlay-border, rgba(255,255,255,.06))",
    boxShadow: "var(--call-overlay-mini-shadow, 0 16px 40px rgba(0,0,0,.46))",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    overflow: "hidden",
  },
  miniAvatar: { width: "100%", height: "100%", objectFit: "cover" },
  miniFallback: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--call-overlay-text, #e6eef8)",
  },
  miniBtn: {
    position: "absolute",
    bottom: -6,
    width: 32,
    height: 32,
    borderRadius: 16,
    border: "1px solid var(--call-overlay-border, rgba(255,255,255,.08))",
    display: "grid",
    placeItems: "center",
    background: "var(--call-overlay-mini-btn-bg, #233854)",
    color: "var(--call-overlay-mini-btn-text, #e6eef8)",
  },
  miniBtnLeft: { left: -6 },
  miniBtnRight: { right: -6 },
  cardClosing: { opacity: 0, transform: "translateY(-8px) scale(.96)" },
  miniWrapClosing: { opacity: 0, transform: "scale(.88)" },
  goodbye: { textAlign: "center", fontSize: 14, opacity: 0.9, marginTop: 8 },
};

// ===== иконки =====
function IconMic() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2" />
      <path d="M12 18v4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconMicOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 9v2a3 3 0 0 0 5.12 2.12"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M15 10V6a3 3 0 0 0-5.65-1.15"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19 11a7 7 0 0 1-9.33 6.65"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 11a7 7 0 0 0 1.06 3.69"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M1.5 1.5 22.5 22.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 18v4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function IconHangup() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 5c-4.97 0-9.16 3.04-10.8 7.28-.23.58.02 1.23.58 1.5l2.2 1.04c.49.23 1.09.1 1.45-.31l1.8-2.13c.35-.42.93-.55 1.43-.31 1.21.58 2.56.9 3.94.9s2.73-.32 3.94-.9c.5-.24 1.08-.11 1.43.31l1.8 2.13c.36.42.96.55 1.45.31l2.2-1.04c.56-.27.81-.92.58-1.5C21.16 8.04 16.97 5 12 5z" />
    </svg>
  );
}
function IconAccept() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12l5 5 13-13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconDecline() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconMinimize() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 3h6v6M21 3l-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 21H3v-6M3 21l7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
