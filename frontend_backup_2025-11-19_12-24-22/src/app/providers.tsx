// src/app/providers.tsx
"use client";
import React from "react";
import { UserProvider } from "./UserContext";
import { MessengerProvider } from "./components/MessengerContext";
import LayoutClientWrapper from "./components/LayoutClientWrapper";
import BlockedGateClient from "./components/BlockedGateClient";
import GpsRequestToastClient from "./components/GpsRequestToastClient";
import SupportFab from "./components/SupportFab";
import AppChromeClient from "./components/AppChromeClient";
import MobileBackButtonClient from "./components/MobileBackButtonClient";
import { LangProvider } from "./i18n/LangProvider";
import type { Locale } from "./i18n/locales";
import { ThemeProvider } from "./providers/ThemeProvider";

// добавлено
import HotkeysShield from "./components/HotkeysShield";
import GlobalEnvClient from "./components/GlobalEnvClient";

function isRenderable(v: unknown): v is React.ReactNode {
  return (
    React.isValidElement(v) ||
    typeof v === "string" ||
    typeof v === "number" ||
    Array.isArray(v)
  );
}

export default function Providers(
  props: { children?: React.ReactNode; initialLang?: Locale }
): React.JSX.Element {
  const { children, initialLang } = props || {};
  const content = isRenderable(children) ? children : null;

  if (
    process.env.NODE_ENV !== "production" &&
    content === null &&
    children &&
    typeof children === "object"
  ) {
    // eslint-disable-next-line no-console
    console.error("[Providers] Нерендеримый child (plain object) проигнорирован:", children);
  }

  return (
    <ThemeProvider>
      {/* глобально кладём API_URL в window */}
      <GlobalEnvClient />

      {/* глушим глобальные хоткеи внутри инпутов/поиска */}
      <HotkeysShield />

      <LangProvider initialLang={initialLang}>
        <UserProvider>
          <MessengerProvider>
            <BlockedGateClient>
              <LayoutClientWrapper>
                {content}

                {/* Управляем приложенческим chrome/оверлеями по роуту */}
                <AppChromeClient />

                {/* Мобильная кнопка "Назад" + свайп — только на /messages/[id] */}
                <MobileBackButtonClient />

                <GpsRequestToastClient />
                <SupportFab />
              </LayoutClientWrapper>
            </BlockedGateClient>
          </MessengerProvider>
        </UserProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
