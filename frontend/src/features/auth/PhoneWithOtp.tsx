import { useEffect, useState } from "react";
import { API as API_BASE } from "@/app/lib/apiBase";

async function apiSendPhoneCode(phone: string, lang: string, channel: string) {
  const r = await fetch(`${API_BASE}/phone/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, lang, channel }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiVerifyPhoneCode(phone: string, code: string) {
  const r = await fetch(`${API_BASE}/phone/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ verified: boolean }>;
}

type Props = {
  /** Текущий язык UI (ru/ka/en) */
  lang: string;
  /** Колбэк при успешной верификации */
  onVerified: (phone: string) => void;
  /**
   * Опционально — контролируемый режим:
   * если передан value/onChange, компонент НЕ рисует своё поле телефона,
   * а использует номер родителя (поле уже есть в форме).
   */
  value?: string;
  onChange?: (phone: string) => void;
};

export default function PhoneWithOtp({
  lang,
  onVerified,
  value,
  onChange,
}: Props) {
  const controlled =
    typeof value === "string" && typeof onChange === "function";
  const [phone, setPhone] = useState(controlled ? (value as string) : "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [channel, setChannel] = useState<"sms" | "whatsapp" | "viber">("sms");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const labelCode = lang === "ka" ? "კოდი" : lang === "ru" ? "Код" : "Code";
  const labelEnter =
    lang === "ka"
      ? "შეიყვანეთ კოდი"
      : lang === "ru"
      ? "Введите код"
      : "Enter code";
  const labelChannel =
    lang === "ka"
      ? "სად გავაგზავნოთ"
      : lang === "ru"
      ? "Куда отправить"
      : "Where to send";
  const optionLabel = (key: "sms" | "whatsapp" | "viber") => {
    if (lang === "ru")
      return key === "sms" ? "SMS" : key === "whatsapp" ? "WhatsApp" : "Viber";
    if (lang === "ka")
      return key === "sms" ? "SMS" : key === "whatsapp" ? "WhatsApp" : "Viber";
    return key === "sms" ? "SMS" : key === "whatsapp" ? "WhatsApp" : "Viber";
  };
  const send = async () => {
    try {
      setErr(null);
      await apiSendPhoneCode(
        controlled ? (value as string) : phone,
        lang,
        channel
      );
      setSent(true);
      setCooldown(60);
    } catch (e: any) {
      setErr(e?.message ?? "send_failed");
    }

    const onCodeChange = async (v: string) => {
      setCode(v);
      const d = v.replace(/\D/g, "");
      if (d.length >= 6) {
        try {
          const { verified } = await apiVerifyPhoneCode(
            controlled ? (value as string) : phone,
            d
          );
          if (verified) {
            setVerified(true);
            onVerified(controlled ? (value as string) : phone);
          }
        } catch {
          // оставим поле активным, пользователь снова попробует
        }
      }
    };

    return (
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          {!controlled && (
            <input
              className="input input-bordered flex-1"
              placeholder="+9955XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={verified}
            />
          )}
          <select
            className="select select-bordered"
            value={channel}
            onChange={(e) => setChannel(e.target.value as any)}
            disabled={verified}
            aria-label={labelChannel}
          >
            <option value="sms">{optionLabel("sms")}</option>
            <option value="whatsapp">{optionLabel("whatsapp")}</option>
            <option value="viber">{optionLabel("viber")}</option>
          </select>
          <button
            className="btn"
            type="button"
            onClick={send}
            disabled={!(controlled ? value : phone) || cooldown > 0 || verified}
          >
            {cooldown > 0 ? `${cooldown}s` : labelCode}
          </button>
          {verified && (
            <span className="text-green-600" title="Verified">
              ✔
            </span>
          )}
        </div>
        {sent && !verified && (
          <input
            className="input input-bordered"
            placeholder={labelEnter}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
        )}
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
    );
  };
}
