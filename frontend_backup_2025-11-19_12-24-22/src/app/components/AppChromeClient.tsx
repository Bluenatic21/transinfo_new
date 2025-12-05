"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Footer from "./Footer";
import MessengerOverlay from "./MessengerOverlay";

export default function AppChromeClient() {
  const pathname = usePathname();

  // ВАЖНО: экранируем слэш перед ?$
  const isChat = /^\/messages\/[\w-]+\/?$/.test(pathname || "");
  const isMessages = (pathname || "").startsWith("/messages");

  // Правила:
  //  - MessengerOverlay не рендерим на любых путях /messages*
  //  - Footer скрываем только на экране конкретного чата /messages/[id]
  return (
    <>
      {!isMessages && <MessengerOverlay />}
      {!isChat && <Footer />}
    </>
  );
}
