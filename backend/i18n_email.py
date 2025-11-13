from typing import Optional
from fastapi import Request

SUPPORTED = {"ka", "ru", "en", "tr", "az", "hy"}
DEFAULT = "ka"


def _normalize(lang: Optional[str]) -> str:
    if not lang:
        return DEFAULT
    lang = lang.lower().strip()
    if lang == "am":  # старый код армянского
        lang = "hy"
    # "ru-RU" -> "ru"
    if "-" in lang:
        lang = lang.split("-", 1)[0]
    return lang if lang in SUPPORTED else DEFAULT


def detect_lang(request: Request) -> str:
    # 1) из фронта (точный язык интерфейса)
    x = request.headers.get("x-ui-lang")
    if x:
        return _normalize(x)
    # 2) из браузера
    al = request.headers.get("accept-language", "")
    if al:
        # "ka,ru;q=0.9,en;q=0.8" -> "ka"
        first = al.split(",", 1)[0]
        return _normalize(first)
    return DEFAULT


def verify_subject(lang: str) -> str:
    lang = _normalize(lang)
    return {
        "ru": "Код подтверждения e-mail",
        "ka": "ელფოსტის დადასტურების კოდი",
        "en": "Email verification code",
    }[lang]


def verify_html(lang: str, code: str, expires_min: int) -> str:
    lang = _normalize(lang)
    if lang == "ru":
        return f"<p>Ваш код подтверждения: <b>{code}</b>.</p><p>Действителен {expires_min} мин.</p>"
    if lang == "ka":
        return f"<p>დადასტურების კოდი: <b>{code}</b>.</p><p>ვადა — {expires_min} წუთი.</p>"
    # en
    return f"<p>Your verification code: <b>{code}</b>.</p><p>Valid for {expires_min} minutes.</p>"
