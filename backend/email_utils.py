import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate, make_msgid
import logging
from pathlib import Path

log = logging.getLogger("email")


def _bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _cfg():
    """
    Берём переменные окружения КАЖДЫЙ ВЫЗОВ,
    чтобы порядок импортов не ломал отправку.
    """
    # Гарантированно подтянем .env.local / .env,
    # даже если основной код не положил их в os.environ
    _ensure_env_loaded()
    transport = os.getenv("EMAIL_TRANSPORT", "smtp" if os.getenv(
        "SMTP_USER") else "console").lower()
    host = os.getenv("SMTP_HOST", "mail.transinfo.ge")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "") or ""
    pwd = os.getenv("SMTP_PASSWORD", "") or os.getenv("SMTP_PASS", "") or ""
    from_email = os.getenv("FROM_EMAIL", user or "no-reply@transinfo.ge")
    use_tls = _bool("SMTP_USE_TLS", True)
    use_ssl = _bool("SMTP_USE_SSL", False)
    debug = 1 if _bool("SMTP_DEBUG", False) else 0
    return {"transport": transport, "host": host, "port": port, "user": user, "pwd": pwd,
            "from": from_email, "use_tls": use_tls, "use_ssl": use_ssl, "debug": debug}


def _ensure_env_loaded() -> None:
    """
    Ленивая подгрузка .env.local / .env.
    Если python-dotenv есть — используем его.
    Если нет — простым парсером кладём пары KEY=VALUE в os.environ (не перезаписывая).
    """
    base = Path(__file__).resolve().parent
    for name in (".env.local", ".env"):
        p = base / name
        if not p.exists():
            continue
        # попробуем через python-dotenv
        try:
            from dotenv import load_dotenv  # type: ignore
            load_dotenv(p, override=False)
            return
        except Exception:
            pass
        # fallback: ручной парсер
        try:
            for raw in p.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                os.environ.setdefault(k, v)
            return
        except Exception:
            # ничего не делаем — пусть дальше будут дефолты
            return


def _to_plain(html: str) -> str:
    # максимально простой fallback без внешних зависимостей
    import re
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _build_message(from_email: str, to_email: str, subject: str, html_body: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1])
    # сначала plaintext, затем html — так рекомендуют SMTP-провайдеры
    msg.attach(MIMEText(_to_plain(html_body), "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


def _ssl_context() -> ssl.SSLContext:
    # Нормальный безопасный контекст
    return ssl.create_default_context()


def _print_to_console(to_email: str, subject: str, html_body: str) -> None:
    print("\n=== EMAIL (console) ===")
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print("Body (HTML):")
    print(html_body)
    print("=== /EMAIL ===\n")


def send_email(to_email: str, subject: str, html_body: str) -> None:
    """
    EMAIL_TRANSPORT=console -> печатаем письмо.
    EMAIL_TRANSPORT=smtp    -> отправляем через SMTP.
    """
    cfg = _cfg()
    msg = _build_message(cfg["from"], to_email, subject, html_body)

    # DEV / fallback
    if cfg["transport"] == "console":
        _print_to_console(to_email, subject, html_body)
        return

    # --- SMTP: пытаемся отправить, но не ломаем регистрацию на ошибке
    try:
        log.info(
            f"[EMAIL] transport={cfg['transport']} host={cfg['host']} port={cfg['port']} TLS={cfg['use_tls']} SSL={cfg['use_ssl']} user={'set' if cfg['user'] else 'none'}")
        if cfg["use_ssl"] or cfg["port"] == 465:
            # SMTPS
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=_ssl_context(), timeout=20) as server:
                if cfg["debug"]:
                    server.set_debuglevel(1)
                if cfg["user"]:
                    server.login(cfg["user"], cfg["pwd"])
                server.sendmail(cfg["from"], [to_email], msg.as_string())
        else:
            # SMTP + STARTTLS
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20) as server:
                if cfg["debug"]:
                    server.set_debuglevel(1)
                server.ehlo()
                if cfg["use_tls"] or cfg["port"] == 587:
                    server.starttls(context=_ssl_context())
                    server.ehlo()
                if cfg["user"]:
                    server.login(cfg["user"], cfg["pwd"])
                server.sendmail(cfg["from"], [to_email], msg.as_string())
    except Exception as e:
        # На DEV/стейдже не хотим 500 из-за SMTP — лог и тихий возврат
        print(f"[EMAIL][warning] SMTP failed: {type(e).__name__}: {e}")
        # В качестве fallback напечатаем письмо, чтобы видеть код
        _print_to_console(to_email, subject, html_body)
