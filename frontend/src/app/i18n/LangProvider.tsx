"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, Locale } from "./locales";
import ka from "./dictionaries/ka.json";
import ru from "./dictionaries/ru.json";
import en from "./dictionaries/en.json";
import tr from "./dictionaries/tr.json";
import az from "./dictionaries/az.json";
import hy from "./dictionaries/hy.json";

// тип словаря: ключ -> строка
type Dict = Record<string, string>;

// словари по языкам
const DICTS: Record<Locale, Dict> = {
  ka,
  ru,
  en,
  tr,
  az,
  hy,
};

type Ctx = {
  lang: Locale;
  setLang: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
  // I18next-совместимый контракт: чтобы старые компоненты могли читать i18n.language
  i18n: {
    language: Locale;
    changeLanguage: (l: Locale) => void;
  };
};

const LangContext = createContext<Ctx>({
  lang: DEFAULT_LOCALE,
  setLang: () => {},
  t: (k, d) => d || k,
  i18n: {
    language: DEFAULT_LOCALE,
    changeLanguage: () => {},
  },
});

function getInitialLang(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const fromCookie = (
    document.cookie.match(/(?:^|; )lang=([^;]+)/)?.[1] || ""
  ).toLowerCase();
  const fromStorage = (localStorage.getItem("lang") || "").toLowerCase();
  const cand = (fromCookie || fromStorage) as Locale;
  return (SUPPORTED_LOCALES as readonly string[]).includes(cand)
    ? (cand as Locale)
    : DEFAULT_LOCALE;
}

export function LangProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang?: Locale;
}) {
  // Берём язык, который пришёл с сервера (SSR) — чтобы не было рассинхрона при гидрации
  const [lang, setLangState] = useState<Locale>(
    initialLang ?? getInitialLang()
  );

  useEffect(() => {
    // синхронизируем <html lang="..">
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((l: Locale) => {
    setLangState(l);
    try {
      document.cookie = `lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}`;
      localStorage.setItem("lang", l);
    } catch {}
  }, []);

  const t = useMemo(() => {
    const dict = DICTS[lang] || {};
    const ruDict = DICTS["ru"] || {};
    return (key: string, fallback?: string) => {
      // для en / tr / az / hy: lang → ru → fallback → key
      if (lang === "en" || lang === "tr" || lang === "az" || lang === "hy") {
        return dict[key] ?? ruDict[key] ?? fallback ?? key;
      }
      // остальные: dict → fallback → key
      return dict[key] ?? fallback ?? key;
    };
  }, [lang]);

  const i18n = useMemo(
    () => ({ language: lang, changeLanguage: setLang }),
    [lang, setLang]
  );

  const value: Ctx = useMemo(
    () => ({ lang, setLang, t, i18n }),
    [lang, setLang, t, i18n]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
