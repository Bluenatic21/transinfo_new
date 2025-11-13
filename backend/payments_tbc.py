
import os
import time
import requests

TBC_API_BASE = os.getenv("TBC_API_BASE", "https://api.tbcbank.ge")
TBC_API_KEY = os.getenv("TBC_API_KEY")
TBC_CLIENT_ID = os.getenv("TBC_CLIENT_ID")
TBC_CLIENT_SECRET = os.getenv("TBC_CLIENT_SECRET")


class TbcAuthError(Exception):
    pass


class TbcHTTPError(Exception):
    def __init__(self, status, body): self.status, self.body = status, body


_token = {"val": None, "exp": 0}


def _get_access_token():
    if _token["val"] and time.time() < _token["exp"] - 60:
        return _token["val"]
    r = requests.post(
        f"{TBC_API_BASE}/v1/tpay/access-token",
        headers={"apikey": TBC_API_KEY,
                 "Content-Type": "application/x-www-form-urlencoded"},
        data={"client_id": TBC_CLIENT_ID, "client_secret": TBC_CLIENT_SECRET},
        timeout=20,
    )
    if r.status_code != 200:
        raise TbcAuthError(f"{r.status_code}: {r.text}")
    data = r.json()
    _token["val"] = data["access_token"]
    _token["exp"] = time.time() + int(data.get("expires_in", 3600))
    return _token["val"]


def tbc_ping_auth():
    _get_access_token()
    return {"ok": True}


def create_payment(*, amount, currency, description, metadata, success_url, fail_url, preauthorize=False, methods=None, callback_url=None, user_ip=None):
    """
    Возвращает (pay_id, redirect_url), интерфейс совместим с прежним вызовом.
    """
    token = _get_access_token()
    headers = {"apikey": TBC_API_KEY, "Authorization": f"Bearer {token}"}
    # Централизация редиректов: если не передали явно — берём из ENV
    success_url = success_url or os.getenv("TBC_SUCCESS_URL")
    fail_url = fail_url or os.getenv("TBC_FAIL_URL")
    body = {
        "amount": {"currency": currency, "total": round(float(amount), 2)},
        "returnurl": success_url,
        "preAuth": bool(preauthorize),
        "description": (description or "")[:250],
    }
    cb = callback_url or os.getenv("TBC_CALLBACK_URL")
    if cb:
        body["callbackUrl"] = cb
    if user_ip:
        body["userIpAddress"] = user_ip
    if metadata:
        if "order_id" in metadata:
            body["merchantPaymentId"] = str(metadata["order_id"])
        body["extra"] = f"TransInfo-{metadata.get('type', 'order')}"[:25]
    if methods:
        body["methods"] = methods  # коды методов на стороне TBC

    r = requests.post(f"{TBC_API_BASE}/v1/tpay/payments",
                      json=body, headers=headers, timeout=20)
    if r.status_code not in (200, 201):
        raise TbcHTTPError(r.status_code, r.text)
    data = r.json()
    pay_id = data.get("payId") or data.get(
        "paymentId") or data.get("PaymentId")
    redirect_url = None
    links = data.get("links") or []
    if isinstance(links, list):
        for link in links:
            uri = (link or {}).get("uri")
            if uri:
                redirect_url = uri
                break
    if not (pay_id and redirect_url):
        raise TbcHTTPError(502, f"Unexpected response: {data}")
    return pay_id, redirect_url


def get_payment_details(pay_id: str):
    token = _get_access_token()
    headers = {"apikey": TBC_API_KEY, "Authorization": f"Bearer {token}"}
    r = requests.get(
        f"{TBC_API_BASE}/v1/tpay/payments/{pay_id}", headers=headers, timeout=20)
    if r.status_code != 200:
        raise TbcHTTPError(r.status_code, r.text)
    return r.json()
