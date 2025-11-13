"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/config/env";
import { useLang } from "../../i18n/LangProvider"; // ← относительный путь (без @)

export default function ForgotPasswordPage() {
  const { t, lang } = useLang();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(api("/password/forgot"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lang": lang,              // дублируем в заголовке на всякий случай
        },
        body: JSON.stringify({ email, lang }),
        credentials: "include",
      });
      const data: { sent?: boolean; detail?: unknown; error?: unknown } =
        await res.json().catch(() => ({} as any));
      if (res.ok) {
        setSent(true);
      } else {
        const msg =
          (typeof data?.detail === "string" && data.detail) ||
          (typeof data?.error === "string" && data.error) ||
          "Request failed";
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
      <h1 className="text-xl font-semibold mb-4">{t("forgot.title")}</h1>
      {sent ? (
        <div className="text-green-700">{t("forgot.sentHint")}</div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder={t("forgot.emailPlaceholder")}
            className="w-full border rounded px-3 py-2"
            autoComplete="email"
          />
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button disabled={busy} className="w-full rounded px-4 py-2 border">
            {busy ? t("forgot.sending") : t("forgot.sendLink")}
          </button>
        </form>
      )}
      <div className="mt-4">
        <button className="underline" onClick={() => router.push("/auth")}>
          {t("forgot.backToLogin")}
        </button>
      </div>
    </div>
  );
}
