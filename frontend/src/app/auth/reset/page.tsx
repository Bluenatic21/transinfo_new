"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLang } from "../../i18n/LangProvider";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/config/env";

type ResetResp = { ok?: boolean; detail?: unknown; error?: unknown };

export default function ResetPasswordPage() {
  const { t } = useLang();
  const params = useSearchParams();
  const router = useRouter();

  // токен из query (?token=...) или из hash (#token=...)
  const tokenFromURL = useMemo(() => {
    // 1) Пробуем достать из query
    const qTok = params?.get("token") || params?.get("access_token") || "";
    if (qTok) return qTok;

    // 2) Пробуем достать из hash
    if (typeof window !== "undefined" && window.location.hash) {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hTok = h.get("token") || h.get("access_token") || "";
      if (hTok) return hTok;
    }
    return "";
  }, [params]);

  const [token, setToken] = useState(tokenFromURL);
  useEffect(() => {
    setToken(tokenFromURL);

    // Если токен пришёл в hash (или есть type=recovery), очищаем hash
    // и при необходимости нормализуем URL до ?token=...
    if (typeof window !== "undefined" && window.location) {
      const hasHash = !!window.location.hash;
      const h = hasHash
        ? new URLSearchParams(window.location.hash.replace(/^#/, ""))
        : null;
      const isRecovery =
        params?.get("type") === "recovery" || h?.get("type") === "recovery";

      const hashToken = h?.get("token") || h?.get("access_token") || "";
      if (hasHash && (hashToken || isRecovery)) {
        const url = new URL(window.location.href);
        url.hash = "";
        // если в query ещё нет токена — проставим, чтобы страница была стабильной
        if (!params?.get("token") && !params?.get("access_token") && tokenFromURL) {
          url.searchParams.set("token", tokenFromURL);
        }
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [tokenFromURL, params]);

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pwd.length < 8) {
      setErr(t("reset.error.min8"));
      return;
    }
    if (pwd !== pwd2) {
      setErr(t("reset.error.mismatch"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(api("/password/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: (token || "").trim(), new_password: pwd }),
        credentials: "include",
      });

      let data: ResetResp = {};
      try {
        data = (await res.json()) as ResetResp;
      } catch {
        // оставляем data пустым объектом, если сервер вернул пустой ответ
      }

      if (res.ok && (data?.ok || data?.detail == null)) {
        setDone(true);
        setTimeout(() => router.push("/auth"), 1200);
      } else {
        const arrayDetailMsg =
          Array.isArray((data as { detail?: unknown }).detail) &&
          (data as { detail?: unknown }).detail &&
          (data as { detail?: Array<{ msg?: unknown }> }).detail![0]?.msg;

        const msg =
          (typeof data?.detail === "string" && data.detail) ||
          (typeof data?.error === "string" && data.error) ||
          (typeof arrayDetailMsg === "string" && arrayDetailMsg) ||
          "Reset failed";

        setErr(String(msg));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold mb-4">{t("reset.title")}</h1>
      {!token && <div className="text-red-600">{t("reset.linkInvalid")}</div>}
      {done ? (
        <div className="text-green-700">{t("reset.done")}</div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={pwd}
            onChange={(ev) => setPwd(ev.target.value)}
            placeholder={t("reset.newPasswordPlaceholder")}
            className="w-full border rounded px-3 py-2"
            autoComplete="new-password"
          />
          <input
            type="password"
            value={pwd2}
            onChange={(ev) => setPwd2(ev.target.value)}
            placeholder={t("reset.repeatPasswordPlaceholder")}
            className="w-full border rounded px-3 py-2"
            autoComplete="new-password"
          />
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button disabled={busy || !token} className="w-full rounded px-4 py-2 border">
            {busy ? t("reset.saving") : t("reset.save")}
          </button>
        </form>
      )}
    </div>
  );
}
