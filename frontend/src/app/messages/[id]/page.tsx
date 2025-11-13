"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMessenger } from "@/app/components/MessengerContext";
import MessengerChat from "@/app/components/MessengerChat";

export default function ChatPage() {
  const router = useRouter();

  // В некоторых типизациях Next useParams может быть nullable — страхуемся
  const params =
    (useParams() as Readonly<Record<string, string | string[]>> | null) ?? null;

  const raw = params?.["id"];
  const idStr = Array.isArray(raw) ? raw[0] : raw;
  const chatId = Number(idStr);

  // Забираем функции/данные из контекста, с фолбэком, чтобы не было ошибок деструктуризации
  const ctx = useMessenger() ?? ({} as any);
  const {
    openMessenger,
    fetchChatList,
    closeMessenger,
    peerUser,
    goBack,
  } = ctx;

  useEffect(() => {
    try {
      if (typeof fetchChatList === "function") {
        fetchChatList({ force: false });
      }
    } catch {}

    if (Number.isFinite(chatId)) {
      try {
        if (typeof openMessenger === "function") {
          openMessenger(chatId);
        }
      } catch {}
    }
  }, [chatId, openMessenger, fetchChatList]);

  // Если id некорректный — не рендерим
  if (!Number.isFinite(chatId)) return null;

  return (
    <div
      id="chat-root"
      className="min-h-[100dvh] max-h-[100dvh] bg-[#0b1220] text-slate-100"
    >
      <div className="max-w-screen-sm mx-auto">
        <MessengerChat
          chatId={chatId}
          peerUser={peerUser}
          closeMessenger={closeMessenger ?? (() => router.back())}
          goBack={goBack ?? (() => router.back())}
        />
      </div>
    </div>
  );
}
