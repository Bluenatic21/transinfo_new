"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/app/UserContext";

const PUBLIC = new Set([
  "/",
  "/auth",
  "/auth/reset",   // ← разрешаем страницу смены пароля
  "/auth/forgot",  // ← и "забыли пароль"
  "/register",
  "/legal/terms",
  "/pricing",
  "/matches",
]);

export default function AuthGate() {
  const ctx = useUser();
  const user = ctx?.user ?? null;
  const ready = typeof ctx?.authReady === "boolean" ? ctx.authReady : !!ctx?.isUserLoaded;
  const pathname = usePathname() || "/";
  const router = useRouter();
  const redirectedOnce = useRef(false);

  useEffect(() => {
    if (!ready) return;                 // ждём, пока закончат проверку токена/профиля
    if (PUBLIC.has(pathname)) return;   // публичные пути не трогаем
    if (user) { redirectedOnce.current = false; return; } // авторизован — ок

    if (!redirectedOnce.current && pathname !== "/auth") {
      redirectedOnce.current = true;
      router.replace("/auth");          // одноразово отправляем на авторизацию
    }
  }, [ready, user, pathname, router]);

  return null;
}

