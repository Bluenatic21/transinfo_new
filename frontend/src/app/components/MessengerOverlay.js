"use client";
// FIX: компонент использует React.use*, поэтому импортируем React
import * as React from "react";
import { useMessenger } from "./MessengerContext";
import MessengerSidebar from "./MessengerSidebar";
import MessengerChat from "./MessengerChat";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import MobileBottomSheet from "./MobileBottomSheet";
import { useLang } from "../i18n/LangProvider";

// --- Универсальный хук для мобилки ---
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 900 : false
  );
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 900);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

export default function MessengerOverlay() {
  const { t } = useLang();
  const {
    isOpen,
    closeMessenger,
    hideMessengerUi,
    chatId,
    openMessenger,
    peerUser,
    fetchChatList,
    markChatRead,
  } = useMessenger();
  // необязательно, но если нужно прямо отсюда создавать карточки,
  // можешь также деструктурировать sendCallMessage
  // const { sendCallMessage } = useMessenger();
  const [selectedChat, setSelectedChat] = useState(chatId);
  const isMobile = useIsMobile();

  // --- Закрытие overlay только при ФАКТИЧЕСКОЙ смене пути + с лёгкой задержкой ---
  const pathname = usePathname();
  const lastPathRef = useRef(pathname);
  const closeTimerRef = useRef(null);
  useEffect(() => {
    if (pathname?.startsWith("/messages")) {
      lastPathRef.current = pathname;
      return;
    }
    const changed = lastPathRef.current !== pathname;
    lastPathRef.current = pathname;
    if (!changed) return;

    // Дадим паузу, чтобы CallOverlay/контекст подняли флаг звонка.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      const active =
        typeof window !== "undefined" &&
        ((window.__CALL_STATE && window.__CALL_STATE.active) ||
          window.__CALL_BOOTING === true);
      // При уходе со страницы чата просто прячем UI, WS не трогаем:
      if (!active) hideMessengerUi();
    }, 700);

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [pathname]); // намеренно: без зависимости от isOpen

  // --- Открытие чата --
  const prevSelectedChat = useRef(null);

  const handleSelectChat = (id, userId = null) => {
    if (prevSelectedChat.current && prevSelectedChat.current !== id) {
      markChatRead(prevSelectedChat.current);
    }
    setSelectedChat(id);
    if (id) {
      openMessenger(id);
    } else if (userId) {
      openMessenger({ userId });
    }
    setTimeout(() => fetchChatList && fetchChatList(), 200);
    prevSelectedChat.current = id;
  };

  // Когда ты уходишь из чата (selectedChat → null), вызвать markChatRead!
  useEffect(() => {
    if (selectedChat === null && prevSelectedChat.current) {
      markChatRead(prevSelectedChat.current);
      setTimeout(() => fetchChatList && fetchChatList(), 200);
      prevSelectedChat.current = null;
    }
  }, [selectedChat]);

  // обновлять chatList и при закрытии мессенджера
  const handleCloseMessenger = () => {
    closeMessenger();
    setTimeout(() => fetchChatList && fetchChatList(), 250);
  };

  // --- Синхронизация выбранного чата с глобальным состоянием ---
  useEffect(() => {
    if (chatId !== selectedChat) setSelectedChat(chatId);
  }, [chatId]);

  // Глобальный помощник для кнопки "Перезвонить" внутри CallCard
  useEffect(() => {
    // Старт звонка из UI карточки/шапки
    window.__transinfo_call = (cid) => {
      const id = cid || selectedChat || chatId;
      try {
        window.dispatchEvent(
          new CustomEvent("call_start", { detail: { chatId: id } })
        );
      } catch {}
    };
    // Мост для модуля звонков: репорт исхода звонка
    // Примеры:
    //   window.reportCall("ended",   { chatId, duration: 83, direction: "outgoing" });
    //   window.reportCall("missed",  { chatId, direction: "incoming" });
    //   window.reportCall("rejected",{ chatId, direction: "incoming" });
    //   window.reportCall("canceled",{ chatId, direction: "outgoing" });
    window.reportCall = (status, detail = {}) => {
      const evt = `call_${status}`;
      try {
        window.dispatchEvent(new CustomEvent(evt, { detail }));
      } catch {}
    };
    return () => {
      try {
        delete window.__transinfo_call;
      } catch {}
      try {
        delete window.reportCall;
      } catch {}
    };
  }, [selectedChat, chatId]);

  if (!isOpen) return null;

  // На страницах /messages рендерим ноль, чат работает в page-компонентах
  if (pathname?.startsWith("/messages")) {
    return null;
  }

  // Мобилка: рисуем bottom-sheet; Десктоп: прежняя модалка по центру
  return isMobile ? (
    <MobileBottomSheet
      isOpen
      onClose={handleCloseMessenger}
      initialVH={92}
      onBack={selectedChat ? () => setSelectedChat(null) : undefined}
      onSwipeLeft={
        selectedChat ? () => setSelectedChat(null) : handleCloseMessenger
      }
      closeOnPullDown={!selectedChat} // закрываем вниз только в списке
      closeOnBackdrop={!selectedChat} // тап по фону закрывает только в списке
    >
      {selectedChat ? (
        <MessengerChat
          chatId={selectedChat}
          closeMessenger={handleCloseMessenger}
          peerUser={peerUser}
          goBack={() => setSelectedChat(null)}
        />
      ) : (
        <MessengerSidebar
          onSelectChat={handleSelectChat}
          selectedChat={selectedChat}
        />
      )}
    </MobileBottomSheet>
  ) : (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#191c22cc]"
      onClick={handleCloseMessenger}
    >
      <div
        id="chat-root"
        className="relative w-full max-w-5xl h-[100svh] rounded-2xl shadow-2xl overflow-hidden flex"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          // Малая кнопка закрытия внутри хэдера — на десктопе «сливаем» с фоном,␊
          // чтобы она не была видна (есть большой белый X справа).␊
          className="␊
                        absolute right-5 top-5 z-50 hidden md:block text-3xl transition␊
                        md:text-transparent md:hover:text-transparent md:focus:text-transparent␊
                        md:opacity-0 md:pointer-events-none␊
                    "
          onClick={handleCloseMessenger}
          title={t("bottomSheet.close", "Закрыть чат")}
        ></button>
        <div className="flex h-full w-full">
          <div className="w-[340px] border-r border-[#e7eaf1] dark:border-[#232c39] h-full overflow-y-auto">
            <MessengerSidebar
              onSelectChat={handleSelectChat}
              selectedChat={selectedChat}
            />
          </div>
          <div className="flex-1 h-full">
            {selectedChat ? (
              <MessengerChat
                chatId={selectedChat}
                closeMessenger={handleCloseMessenger}
                peerUser={peerUser}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                {t("messenger.selectChatLeft", "Выберите чат слева")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
