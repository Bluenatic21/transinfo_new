# backend/geo_rest.py
import time
from collections import OrderedDict
from fastapi import APIRouter, Query, Depends, Response, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models import Place
import re
import requests
import logging
import json
import uuid
import os
from typing import Dict, Any, List, Optional

# Логгер для гео‑автокомлита
log = logging.getLogger("geo_autocomplete")

# Таймауты и бюджеты по времени (можно переопределить через ENV)
HTTP_TIMEOUT = float(os.getenv("GEO_HTTP_TIMEOUT", "0.7") or "0.7")
TOTAL_TIME_BUDGET = float(os.getenv("GEO_TOTAL_TIME_BUDGET", "0.9") or "0.9")

# Проверять ли SSL у внешних геокодеров (по умолчанию да)
VERIFY_SSL = os.getenv("GEO_VERIFY_SSL", "1").lower() not in ("0", "false", "no")

# Сколько результатов считается «достаточно», чтобы не ждать остальных провайдеров
FAST_ENOUGH_RESULTS = int(os.getenv("GEO_FAST_ENOUGH_RESULTS", "5") or "5")

# Простая эвристика для аэропортов
_RE_AIRPORT = re.compile(r"airport|аэропорт|aerodrome|airfield", re.IGNORECASE)

# Веса типов населённых пунктов для сортировки
TYPE_WEIGHT: Dict[str, int] = {
    "city": 100,
    "town": 90,
    "village": 80,
    "hamlet": 70,
    "suburb": 60,
    "locality": 50,
    "neighbourhood": 40,
    "quarter": 30,
    "administrative": 80,
    "city_district": 70,
    "borough": 70,
}

router = APIRouter(prefix="/geo", tags=["geo"])

# Поддерживаемые языки для переводов названий
SUPPORTED_LANGS = {"ru", "en", "ka", "tr", "az"}

# Значение по умолчанию для параметра limit в /geo/autocomplete
# (используется в Query(DEFAULT_LIMIT, ...))
DEFAULT_LIMIT = 8

NOMINATIM = "https://nominatim.openstreetmap.org"
PHOTON = "https://photon.komoot.io/api/"
MAPSCO = "https://geocode.maps.co/search"
OPENMETEO = "https://geocoding-api.open-meteo.com/v1/search"

# --- HTTP session with keep-alive / connection pool for speed ---
try:
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    SESSION = requests.Session()
    adapter = HTTPAdapter(
        pool_connections=20, pool_maxsize=50,
        max_retries=Retry(total=2, backoff_factor=0.1,
                          status_forcelist=[502, 503, 504])
    )
    SESSION.mount("http://", adapter)
    SESSION.mount("https://", adapter)
except Exception:
    SESSION = requests  # fallback

# --- simple in-process TTL cache ---
_CACHE = OrderedDict()  # key -> (ts, data)
# 0 = полностью выключить кэш
CACHE_TTL = int(os.getenv("GEO_CACHE_TTL", "0") or "0")
CACHE_MAX = int(os.getenv("GEO_CACHE_MAX", "0") or "0")


def prune_expired_cache(current_time: Optional[float] = None) -> int:
    """Remove expired entries from the in-memory cache.

    Parameters
    ----------
    current_time:
        Optional timestamp (in seconds) used for comparisons.  Supplying a
        value allows deterministic unit tests; when omitted ``time.time()`` is
        used.  The function returns the number of entries that were evicted so
        the caller may log or otherwise react to aggressive pruning.
    """

    if current_time is None:
        current_time = time.time()

    expired: List[str] = []
    for key, (ts, _data) in list(_CACHE.items()):
        if current_time - ts > CACHE_TTL:
            expired.append(key)

    for key in expired:
<<<<<<< HEAD
=======
        _CACHE.pop(key, None)

    return len(expired)

def _cache_get(key):
    rec = _CACHE.get(key)
    if not rec:
        return None
    ts, data = rec
    if time.time() - ts > CACHE_TTL:
>>>>>>> 079ad89ca93d100fb39ef229da87d088028674ce
        _CACHE.pop(key, None)

    return len(expired)

def _cache_get(key: str) -> Optional[List[Dict[str, Any]]]:
    """
    Достаём из кэша список айтемов, если он включён и не протух.
    """
    # Кэш гео можно полностью отключить через ENV:
    #   GEO_CACHE_MAX=0 или GEO_CACHE_TTL=0
    if CACHE_MAX <= 0 or CACHE_TTL <= 0:
        return None

    entry = _CACHE.get(key)
    if not entry:
        return None

    ts, data = entry
    if time.time() - ts > CACHE_TTL:
        # устарело — выкидываем
        try:
            del _CACHE[key]
        except KeyError:
            pass
        return None

    return data


def _cache_set(key: str, items: List[Dict[str, Any]]) -> None:
    """
    Кладём в кэш (в простом формате: (timestamp, items)).
    """
    if CACHE_MAX <= 0 or CACHE_TTL <= 0:
        return

    now = time.time()
    _CACHE[key] = (now, items)

    # Лишнее выкидываем с начала (самые старые)
    while len(_CACHE) > CACHE_MAX:
        _CACHE.popitem(last=False)



def _looks_like_poi(item: Dict[str, Any]) -> bool:
    cls = (item.get("class") or "").lower()
    typ = (item.get("type") or "").lower()
    name = (item.get("name") or "")
    if cls == "aeroway" or typ == "aerodrome":
        return True
    if _RE_AIRPORT.search(name):
        return True
    return False


def _type_weight(item: Dict[str, Any]) -> int:
    t = (item.get("type") or "").lower()
    c = (item.get("class") or "").lower()
    w = TYPE_WEIGHT.get(t, 0)
    if c == "boundary" and t in ("administrative", "city_district", "borough"):
        w = max(w, TYPE_WEIGHT["administrative"])
    return w


# автоопределение языка по самому запросу
_RE_GE = re.compile(r"[\u10A0-\u10FF\u1C90-\u1CBF]")
_RE_RU = re.compile(r"[А-Яа-яЁё]")
_RE_TR = re.compile(r"[ğüşöçıİĞÜŞÖÇ]")
_RE_AZ = re.compile(r"[əƏ]")
_RE_EN = re.compile(r"[A-Za-z]")


def _detect_lang_from_query(q: str) -> str:
    s = q or ""
    ka = len(_RE_GE.findall(s))
    ru = len(_RE_RU.findall(s))
    tr = len(_RE_TR.findall(s))
    az = len(_RE_AZ.findall(s))
    en = len(_RE_EN.findall(s))
    best = max([("ka", ka), ("ru", ru), ("tr", tr),
               ("az", az), ("en", en)], key=lambda x: x[1])
    return best[0] if best[1] > 0 else "en"


# --- простая транслитерация грузинского → латиница (fallback) ---
_KA2LAT = {
    "ა": "a", "ბ": "b", "გ": "g", "დ": "d", "ე": "e", "ვ": "v", "ზ": "z", "თ": "t", "ი": "i",
    "კ": "k", "ლ": "l", "მ": "m", "ნ": "n", "ო": "o", "პ": "p", "ჟ": "zh", "რ": "r", "ს": "s",
    "ტ": "t", "უ": "u", "ფ": "p", "ქ": "k", "ღ": "gh", "ყ": "q", "შ": "sh", "ჩ": "ch", "ც": "ts",
    "ძ": "dz", "წ": "ts", "ჭ": "ch", "ხ": "kh", "ჯ": "j", "ჰ": "h", "ყ": "q", "ქ": "k", "ღ": "gh"
}


def _ka_to_lat(s: str) -> str:
    if not s:
        return ""
    return "".join(_KA2LAT.get(ch, ch) for ch in s)


def _ka_variants(q: str) -> List[str]:
    t = _ka_to_lat(q or "")
    out: List[str] = []
    if t and t != q:
        out.append(t)
        if t.endswith("i") and len(t) > 3:
            out.append(t[:-1])
    return list(dict.fromkeys(out))


def _local_fallback_items(db: Session, q: str, eff_lang: str, limit: int) -> List[Dict[str, Any]]:
    like = f"{q}%"
    rows = (
        db.query(Place)
        .filter(
            text(
                "EXISTS (SELECT 1 "
                "FROM jsonb_each_text(translations) AS t(key, value) "
                "WHERE t.value ILIKE :like)"
            )
        )
        .params(like=like)
        .limit(limit * 2)
        .all()
    )
    out: List[Dict[str, Any]] = []
    for r in rows:
        tr = r.translations or {}
        name = tr.get(eff_lang) or tr.get("en") or tr.get(
            "ru") or next(iter(tr.values()), "")
        out.append({
            "source": "local",
            "osm_id": r.external_id,
            "osm_type": r.osm_type,
            "class": "place",
            "type": "city",
            "lat": float(r.lat),
            "lon": float(r.lon),
            "country_iso2": (r.country_iso2 or "").upper(),
            "name": name,
            "translations": tr,
            "container_city": None,
            "address": {},
        })
    return out[:limit]


def _enrich_with_query(item: Dict[str, Any], q: str, eff_lang: str) -> None:
    if not q or len(q.strip()) < 2:
        return
    patterns = {"ka": _RE_GE, "ru": _RE_RU,
                "tr": _RE_TR, "az": _RE_AZ, "en": _RE_EN}
    pat = patterns.get(eff_lang)
    if not pat or not pat.search(q):
        return
    tr = item.get("translations") or {}
    if not tr.get(eff_lang):
        tr[eff_lang] = q.strip()
        item["translations"] = tr
    cur_name = (item.get("name") or "").strip()
    if not cur_name or not pat.search(cur_name):
        item["name"] = tr.get(eff_lang, q.strip())


def _extract_city_from_address(addr: Dict[str, Any]) -> Optional[str]:
    if not addr:
        return None
    for key in ("city", "town", "municipality", "village", "hamlet", "city_district", "borough", "county", "state_district"):
        val = addr.get(key)
        if val:
            return val
    return None


def _is_settlement_nominatim(item: Dict[str, Any]) -> bool:
    cls = item.get("class")
    typ = item.get("type")
    if cls == "place" and typ in ("city", "town", "village", "hamlet", "municipality", "suburb", "locality", "neighbourhood", "quarter", "island"):
        return True
    if cls == "boundary" and typ in ("administrative", "city_district", "borough", "political", "administrative_area"):
        return True
    return False


def _is_address_nominatim(item: Dict[str, Any]) -> bool:
    cls = item.get("class")
    typ = item.get("type")
    if cls in ("highway", "building", "railway", "aeroway", "aerialway", "amenity", "shop", "tourism", "leisure", "man_made", "natural", "landuse", "waterway"):
        return True
    if cls == "place" and typ in ("neighbourhood", "quarter", "suburb", "locality"):
        return True
    return False


def _pick_translations_from_namedetails(nd: Dict[str, Any]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not nd:
        return out
    for lng in SUPPORTED_LANGS:
        v = nd.get(f"name:{lng}")
        if v:
            out[lng] = v
    if "en" not in out and nd.get("name"):
        out["en"] = nd["name"]
    return out


def _normalize_nominatim(it: Dict[str, Any], lang: str) -> Optional[Dict[str, Any]]:
    nd = it.get("namedetails") or {}
    addr = it.get("address") or {}
    name = nd.get(f"name:{lang}") or nd.get(
        "name") or it.get("display_name", "")
    if not name:
        return None
    try:
        lat = float(it["lat"])
        lon = float(it["lon"])
    except Exception:
        return None
    country_iso2 = (addr.get("country_code") or "").upper()
    osm_id = it.get("osm_id")
    try:
        osm_id = int(osm_id) if osm_id is not None else None
    except Exception:
        osm_id = None
    return {
        "source": "osm",
        "osm_id": osm_id,
        "osm_type": it.get("osm_type"),
        "class": it.get("class"),
        "type": it.get("type"),
        "lat": lat,
        "lon": lon,
        "country_iso2": country_iso2,
        "name": name,
        "translations": _pick_translations_from_namedetails(nd),
        "container_city": _extract_city_from_address(addr),
        "address": addr,
    }


def _normalize_photon(feat: Dict[str, Any], lang: str) -> Optional[Dict[str, Any]]:
    prop = feat.get("properties") or {}
    geom = feat.get("geometry") or {}
    coords = (geom.get("coordinates") or [None, None])
    name = prop.get("name") or ""
    if not name or coords[0] is None or coords[1] is None:
        return None
    country = (prop.get("countrycode") or "").upper()
    osm_id_raw = prop.get("osm_id")
    try:
        osm_id = int(osm_id_raw) if str(osm_id_raw).isdigit() else None
    except Exception:
        osm_id = None
    cls = prop.get("osm_key")
    typ = prop.get("type") or prop.get("osm_value")
    return {
        "source": "photon",
        "osm_id": osm_id,
        "osm_type": prop.get("osm_type"),
        "class": cls,
        "type": typ,
        "lat": float(coords[1]),
        "lon": float(coords[0]),
        "country_iso2": country,
        "name": name,
        "translations": {lang: name},
        "container_city": None,
        "address": {},
    }


def _normalize_mapsco(it: Dict[str, Any], lang: str) -> Optional[Dict[str, Any]]:
    try:
        lat = float(it.get("lat"))
        lon = float(it.get("lon"))
    except Exception:
        return None
    nd = it.get("namedetails") or {}
    addr = it.get("address") or {}
    name = nd.get(f"name:{lang}") or nd.get(
        "name") or it.get("display_name") or ""
    if not name:
        return None
    country_iso2 = (addr.get("country_code") or "").upper()
    osm_id = it.get("osm_id")
    try:
        osm_id = int(osm_id) if osm_id is not None else None
    except Exception:
        osm_id = None
    return {
        "source": "mapsco",
        "osm_id": osm_id,
        "osm_type": it.get("osm_type"),
        "class": it.get("class"),
        "type": it.get("type"),
        "lat": lat, "lon": lon,
        "country_iso2": country_iso2,
        "name": name,
        "translations": _pick_translations_from_namedetails(nd) or {lang: name},
        "container_city": _extract_city_from_address(addr),
        "address": addr,
    }


def _normalize_openmeteo(it: Dict[str, Any], lang: str) -> Optional[Dict[str, Any]]:
    name = it.get("name")
    if not name:
        return None
    try:
        lat = float(it["latitude"])
        lon = float(it["longitude"])
    except Exception:
        return None
    country_iso2 = (it.get("country_code") or "").upper()
    return {
        "source": "openmeteo",
        "osm_id": None,
        "osm_type": None,
        "class": "place",
        "type": "city",
        "lat": lat, "lon": lon,
        "country_iso2": country_iso2,
        "name": name,
        "translations": {lang: name},
        "container_city": it.get("admin2") or it.get("admin1"),
        "address": {},
    }


def _dedupe(items: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    def _norm_name(s: str) -> str:
        s = (s or "").lower()
        s = re.sub(r"\s*\(.*?\)\s*", " ", s)
        s = re.sub(r"[\s._-]+", " ", s).strip()
        s = s.split(",")[0]
        return s

    def score(it: Dict[str, Any]) -> float:
        base = it.get("population") or it.get(
            "importance") or it.get("rank") or 0
        return float(base) + _type_weight(it)
    by_name: Dict[tuple, Dict[str, Any]] = {}
    for it in items or []:
        k = (_norm_name(it.get("name")), (it.get("country_iso2") or "").upper())
        cur = by_name.get(k)
        if cur is None or score(it) > score(cur) or (score(it) == score(cur) and it.get("source") == "osm" and cur.get("source") != "osm"):
            by_name[k] = it
    by_coord: Dict[tuple, Dict[str, Any]] = {}
    for it in by_name.values():
        k = (_norm_name(it.get("name")), (it.get("country_iso2") or "").upper(),
             round(float(it.get("lat") or 0) * 50), round(float(it.get("lon") or 0) * 50))
        cur = by_coord.get(k)
        if cur is None or score(it) > score(cur):
            by_coord[k] = it
    out = list(by_coord.values())
    out.sort(key=score, reverse=True)
    return out[:limit]


def _passes_scope(item: Dict[str, Any], scope: str, provider: str) -> bool:
    if scope == "any":
        return True
    if provider == "osm":
        if scope == "settlement":
            return _is_settlement_nominatim(item)
        if scope == "address":
            return _is_address_nominatim(item) or _is_settlement_nominatim(item)
    else:  # photon — грубая эвристика
        cls = item.get("class")
        typ = item.get("type")
        if scope == "settlement":
            return (cls == "place" and typ in ("city", "town", "village", "hamlet", "suburb", "locality", "neighbourhood", "quarter")) or (typ in ("administrative", "city_district", "borough"))
        if scope == "address":
            return True
    return True


@router.get("/autocomplete")
def autocomplete(
    q: str = Query(..., min_length=2),
    lang: str = Query("ru"),
    scope: str = Query("settlement"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=20),
    country: Optional[str] = Query(
        None, description="ISO2, например GE, TR, AZ"),
    debug: int = Query(0),
    response: Response = None,
    request: Request = None,
    db: Session = Depends(get_db)
):
    # единый trace-id для склейки фронта/бэка
    rid = (request.headers.get("x-client-trace-id")
           if request else None) or str(uuid.uuid4())
    if response is not None:
        response.headers["X-Trace-Id"] = rid

    # ИНИЦИАЛИЗАЦИЯ DIAG — ставим раньше любых обращений
    diag = {
        "rid": rid,
        "query": {"q": q, "lang_param": lang, "scope": scope, "limit": limit, "country": country},
        "lang_detected": None,
        "nominatim": {},
        "photon": {},
        "mapsco": {},
        "openmeteo": {}
    }

    eff_lang = _detect_lang_from_query(q)
    diag["lang_detected"] = eff_lang
    ka_alts: List[str] = _ka_variants(q) if eff_lang == "ka" else []
    if eff_lang not in SUPPORTED_LANGS:
        eff_lang = "en"
    inp_lang = _detect_lang_from_query(q)
    if eff_lang != inp_lang:
        eff_lang = inp_lang

    cache_key = f"{q}|{eff_lang}|{scope}|{country}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {"items": cached}

    # Полностью оффлайн‑режим: не ходим ни в какие внешние геокодеры,
    # работаем только с локальной таблицей places.
    if os.getenv("GEOCODER_OFFLINE") == "1":
        items = _local_fallback_items(db, q, eff_lang, limit)
        # На всякий случай можем закэшировать, если GEO_CACHE_MAX > 0
        _cache_set(cache_key, items)
        return {"items": items}

    combined: List[Dict[str, Any]] = []

    t0 = time.perf_counter()

    def _within_budget() -> bool:
        return (time.perf_counter() - t0) < TOTAL_TIME_BUDGET

    def _respond(items):
        # финализация + лог
        if not items:
            items = _local_fallback_items(db, q, eff_lang, limit)
        _cache_set(cache_key, items)
        payload = {"items": items}
        if debug:
            payload["diag"] = diag
        try:
            log.info("AC %s %s", rid, json.dumps({
                "rid": rid, "q": q, "lang": eff_lang, "scope": scope,
                "counts": {k: v.get("raw_len") for k, v in diag.items() if isinstance(v, dict)},
                "errors": {k: v.get("error") for k, v in diag.items() if isinstance(v, dict) and v.get("error")}
            }, ensure_ascii=False))
        except Exception:
            pass
        return payload

    # ---------- Nominatim ----------
    try:
        t1 = time.perf_counter()
        params = {
            "q": q, "format": "jsonv2", "addressdetails": 1, "namedetails": 1,
            "limit": min(limit, 20), "dedupe": 1, "extratags": 1,
        }
        if country:
            params["countrycodes"] = country.lower()
        if not country and eff_lang == "ka":
            params["countrycodes"] = "ge"
        headers = {
            "Accept-Language": f"{eff_lang},en;q=0.8,ru;q=0.7",
            "User-Agent": "Transinfo/1.0 (support@transinfo)"
        }
        r = SESSION.get(f"{NOMINATIM}/search", params=params,
                        headers=headers, timeout=HTTP_TIMEOUT)
        diag["nominatim"]["status"] = r.status_code
        diag["nominatim"]["url"] = getattr(r, "url", None)
        r.raise_for_status()
        raw = r.json()
        diag["nominatim"]["raw_len"] = len(raw) if isinstance(raw, list) else 0
        diag["nominatim"]["t_ms"] = round((time.perf_counter() - t1) * 1000)

        for it in raw or []:
            norm = _normalize_nominatim(it, eff_lang)
            if not norm:
                continue
            if not _passes_scope(norm, scope, "osm"):
                continue
            if scope == "settlement" and _looks_like_poi(norm):
                continue
            _enrich_with_query(norm, q, eff_lang)
            combined.append(norm)

        if len(combined) == 0 and eff_lang == "ka":
            alt_q = _ka_to_lat(q)
            if alt_q and alt_q != q:
                params_alt = dict(params)
                params_alt["q"] = alt_q
                t2 = time.perf_counter()
                r2 = SESSION.get(
                    f"{NOMINATIM}/search", params=params_alt, headers=headers, timeout=HTTP_TIMEOUT)
                try:
                    raw2 = r2.json()
                except Exception:
                    raw2 = []
                diag["nominatim"]["alt_url"] = getattr(r2, "url", None)
                diag["nominatim"]["alt_t_ms"] = round(
                    (time.perf_counter() - t2) * 1000)
                for it in raw2 or []:
                    norm = _normalize_nominatim(it, eff_lang)
                    if not norm:
                        continue
                    if not _passes_scope(norm, scope, "osm"):
                        continue
                    if scope == "settlement" and _looks_like_poi(norm):
                        continue
                    _enrich_with_query(norm, q, eff_lang)
                    combined.append(norm)

        if combined:
            items_fast = _dedupe(combined, limit)
            if items_fast:
                return _respond(items_fast)
    except Exception as e:
        diag["nominatim"]["error"] = str(e)
        log.error("AUTO nominatim failed q=%r lang=%r err=%s", q, lang, e)

    if not _within_budget():
        return _respond(_dedupe(combined, limit))

    # ---------- Photon ----------
    try:
        t1 = time.perf_counter()
        pr = SESSION.get(PHOTON, params={"q": q, "lang": eff_lang, "limit": min(
            limit, 20)}, timeout=HTTP_TIMEOUT, verify=VERIFY_SSL)
        pr.raise_for_status()
        pdata = pr.json()
        feats = pdata.get("features") or []
        diag["photon"]["raw_len"] = len(feats)
        diag["photon"]["url"] = getattr(pr, "url", None)
        diag["photon"]["t_ms"] = round((time.perf_counter() - t1) * 1000)
        for feat in feats:
            norm = _normalize_photon(feat, eff_lang)
            if not norm:
                continue
            if not _passes_scope(norm, scope, "photon"):
                continue
            if scope == "settlement" and _looks_like_poi(norm):
                continue
            _enrich_with_query(norm, q, eff_lang)
            combined.append(norm)

        if len(combined) == 0 and eff_lang == "ka":
            alt_q = _ka_to_lat(q)
            if alt_q and alt_q != q:
                t2 = time.perf_counter()
                pr2 = SESSION.get(PHOTON, params={"q": alt_q, "lang": eff_lang, "limit": min(
                    limit, 20)}, timeout=HTTP_TIMEOUT, verify=VERIFY_SSL)
                try:
                    feats2 = pr2.json().get("features") or []
                except Exception:
                    feats2 = []
                diag["photon"]["alt_url"] = getattr(pr2, "url", None)
                diag["photon"]["alt_t_ms"] = round(
                    (time.perf_counter() - t2) * 1000)
                for feat in feats2:
                    norm = _normalize_photon(feat, eff_lang)
                    if norm and _passes_scope(norm, scope, "photon") and not (scope == "settlement" and _looks_like_poi(norm)):
                        _enrich_with_query(norm, q, eff_lang)
                        combined.append(norm)

        if combined and len(combined) >= FAST_ENOUGH_RESULTS:
            items_fast = _dedupe(combined, limit)
            return _respond(items_fast)
    except Exception as e:
        diag["photon"]["error"] = str(e)
        log.error("AUTO photon failed q=%r lang=%r err=%s", q, lang, e)

    if not _within_budget():
        return _respond(_dedupe(combined, limit))

    # ---------- Maps.co ----------
    if len(combined) < limit:
        try:
            mparams = {
                "q": q, "format": "jsonv2", "addressdetails": 1, "namedetails": 1,
                "limit": min(limit, 20),
            }
            if country:
                mparams["countrycodes"] = country.lower()
            elif eff_lang == "ka":
                mparams["countrycodes"] = "ge"
            t1 = time.perf_counter()
            mr = SESSION.get(MAPSCO, params=mparams,
                             timeout=HTTP_TIMEOUT, verify=VERIFY_SSL)
            mr.raise_for_status()
            mraw = mr.json()
            diag["mapsco"] = {"raw_len": len(
                mraw) if isinstance(mraw, list) else 0}
            diag["mapsco"]["url"] = getattr(mr, "url", None)
            diag["mapsco"]["t_ms"] = round((time.perf_counter() - t1) * 1000)
            for it in (mraw or []):
                norm = _normalize_mapsco(it, eff_lang)
                if not norm:
                    continue
                if not _passes_scope(norm, scope, "osm"):
                    continue
                if scope == "settlement" and _looks_like_poi(norm):
                    continue
                _enrich_with_query(norm, q, eff_lang)
                combined.append(norm)

            if combined and len(combined) >= FAST_ENOUGH_RESULTS:
                items_fast = _dedupe(combined, limit)
                return _respond(items_fast)
        except Exception as e:
            diag["mapsco"] = {"error": str(e)}
            log.error("AUTO mapsco failed q=%r lang=%r err=%s", q, lang, e)

    # ---------- Open-Meteo ----------
    if len(combined) < limit:
        try:
            om_params = {"name": q, "language": eff_lang,
                         "count": min(limit, 20)}
            if country:
                om_params["country_code"] = country.upper()
            t1 = time.perf_counter()
            om = SESSION.get(OPENMETEO, params=om_params,
                             timeout=HTTP_TIMEOUT, verify=VERIFY_SSL)
            om.raise_for_status()
            oj = om.json() or {}
            results = oj.get("results") or []
            diag["openmeteo"] = {"raw_len": len(results)}
            diag["openmeteo"]["url"] = getattr(om, "url", None)
            diag["openmeteo"]["t_ms"] = round(
                (time.perf_counter() - t1) * 1000)
            for it in results:
                norm = _normalize_openmeteo(it, eff_lang)
                if norm and _passes_scope(norm, scope, "photon"):
                    if scope == "settlement" and _looks_like_poi(norm):
                        continue
                    _enrich_with_query(norm, q, eff_lang)
                    combined.append(norm)

            if len(combined) == 0 and eff_lang == "ka":
                alt_q = _ka_to_lat(q)
                if alt_q and alt_q != q:
                    om_params_alt = dict(om_params)
                    om_params_alt["name"] = alt_q
                    t2 = time.perf_counter()
                    orq2 = SESSION.get(
                        OPENMETEO, params=om_params_alt, timeout=HTTP_TIMEOUT, verify=VERIFY_SSL)
                    try:
                        results2 = orq2.json().get("results") or []
                    except Exception:
                        results2 = []
                    diag["openmeteo"]["alt_url"] = getattr(orq2, "url", None)
                    diag["openmeteo"]["alt_t_ms"] = round(
                        (time.perf_counter() - t2) * 1000)
                    for it in results2:
                        norm = _normalize_openmeteo(it, eff_lang)
                        if norm and _passes_scope(norm, scope, "photon"):
                            if scope == "settlement" and _looks_like_poi(norm):
                                continue
                            _enrich_with_query(norm, q, eff_lang)
                            combined.append(norm)

            if combined and len(combined) >= FAST_ENOUGH_RESULTS:
                items_fast = _dedupe(combined, limit)
                return _respond(items_fast)
        except Exception as e:
            diag["openmeteo"] = {"error": str(e)}
            log.error("AUTO openmeteo failed q=%r lang=%r err=%s", q, lang, e)

    # Локальная БД — последняя страховка
    if not combined:
        like = f"{q}%"
        rows = (
            db.query(Place)
            .filter(
                text(
                    "EXISTS (SELECT 1 FROM jsonb_each_text(translations) AS t(key, value) WHERE t.value ILIKE :like)"
                )
            )
            .params(like=like)
            .limit(limit * 2)
            .all()
        )
        for r in rows:
            tr = r.translations or {}
            name = tr.get(eff_lang) or tr.get(
                "en") or next(iter(tr.values()), "")
            combined.append({
                "source": "local",
                "osm_id": r.external_id,
                "osm_type": r.osm_type,
                "class": "place",
                "type": "city",
                "lat": float(r.lat), "lon": float(r.lon),
                "country_iso2": (r.country_iso2 or "").upper(),
                "name": name,
                "translations": tr,
                "container_city": None,
                "address": {},
            })

    items = _dedupe(combined, limit)

    if not items:
        ql = (q or "").strip().lower()
        if ql in ("тбилиси", "tbilisi", "თბილისი"):
            items = [{
                "source": "demo", "osm_id": 1, "osm_type": "relation",
                "class": "place", "type": "city",
                "lat": 41.715, "lon": 44.827, "country_iso2": "GE",
                "name": {"ru": "Тбилиси", "en": "Tbilisi", "ka": "თბილისი"}.get(eff_lang, "Tbilisi"),
                "translations": {"ru": "Тбилиси", "en": "Tbilisi", "ka": "თბილისი"},
                "container_city": None, "address": {}
            }]

    return _respond(items)
