from fastapi import APIRouter, HTTPException, Query, Body, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from database import get_db
from models import Place
from sqlalchemy import text
import logging
import os

log = logging.getLogger("places_upsert")
DEBUG_UPSERT = os.getenv("PLACES_UPSERT_DEBUG", "0").lower() in ("1", "true", "yes")

router = APIRouter(prefix="/places", tags=["places"])


def _merge_translations(old: Dict[str, str], new: Dict[str, str]) -> Dict[str, str]:
    out = dict(old or {})
    for k, v in (new or {}).items():
        if v and not out.get(k):
            out[k] = v
        elif v and out.get(k) and out[k] != v:
            out[k] = v if len(v) >= len(out.get(k, "")) else out[k]
    return out


@router.post("/upsert", response_model=dict)
def upsert_place(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    required = ["source", "external_id", "lat",
                "lon", "country_iso2", "translations"]
    for k in required:
        if k not in payload:
            raise HTTPException(status_code=400, detail="error.missingField")

    try:
        ext_id = int(payload["external_id"])
    except Exception:
        raise HTTPException(status_code=400, detail="error.externalId.notInt")

    translations = payload.get("translations") or {}

    existing = (
        db.query(Place)
        .filter(Place.source == str(payload["source"]))
        .filter(Place.external_id == ext_id)
        .with_for_update(of=Place)
        .first()
    )

    if existing:
        before = existing.translations or {}
        merged = _merge_translations(before, translations)
        existing.lat = float(payload["lat"])
        existing.lon = float(payload["lon"])
        existing.country_iso2 = (payload.get("country_iso2") or "").upper()
        existing.osm_type = payload.get("osm_type")
        existing.translations = merged
        db.flush()
        place_id = existing.id
        if DEBUG_UPSERT:
            log.info(
                "[places_upsert] update id=%s langs_before=%d langs_after=%d",
                place_id, len(before or {}), len(merged or {}),
            )
    else:
        new_place = Place(
            source=str(payload["source"]),
            external_id=ext_id,
            osm_type=payload.get("osm_type"),
            lat=float(payload["lat"]),
            lon=float(payload["lon"]),
            country_iso2=(payload.get("country_iso2") or "").upper(),
            translations=translations,
        )
        db.add(new_place)
        db.flush()
        place_id = new_place.id
        if DEBUG_UPSERT:
            log.info(
                "[places_upsert] insert id=%s langs_after=%d",
                place_id, len(translations or {}),
            )

    db.commit()
    return {"id": place_id}


@router.get("/suggest")
def suggest_places(q: str, lang: str = "ru", limit: int = 8, debug: int = 0, db: Session = Depends(get_db)):
    """
    Локальная подстраховка: ищем в таблице places по префиксу в translations.
    Возвращаем формат, совместимый с geo/autocomplete.
    """
    q = (q or "").strip()
    if len(q) < 2:
        return {"items": []}
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
    items = []
    for r in rows:
        tr = r.translations or {}
        constLang = tr.get(lang)
        name = constLang or tr.get("en") or tr.get(
            "ru") or next(iter(tr.values()), "")
        items.append({
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
            "_prio_lang": 1 if constLang else 0,
        })
    # сначала — записи с переводом на нужном языке; затем — более короткие названия
    items.sort(key=lambda x: (
        x.get("_prio_lang", 0), -len(x["name"])), reverse=True)
    for it in items:
        it.pop("_prio_lang", None)

    payload = {"items": items[:limit]}
    if debug:
        payload["diag"] = {
            "q": q, "lang": lang, "like": like,
            "db_rows": len(rows), "returned": len(payload["items"])
        }
    return payload


@router.get("/{place_id}/label")
def get_place_label(place_id: int, lang: str = Query("ru"), db: Session = Depends(get_db)):
    row = db.query(Place).filter(Place.id == place_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="error.place.notFound")
    translations = row.translations or {}
    city = translations.get(lang) or translations.get(
        "en") or next(iter(translations.values()), "")
    return {"city": city, "country_iso2": row.country_iso2, "label": city}


@router.get("/labels")
def get_place_labels(ids: str = Query(...), lang: str = Query("ru"), db: Session = Depends(get_db)):
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="error.badIds")
    rows = db.query(Place).filter(Place.id.in_(id_list)).all()
    out = {}
    for r in rows:
        translations = r.translations or {}
        city = translations.get(lang) or translations.get(
            "en") or next(iter(translations.values()), "")
        out[r.id] = {"city": city,
                     "country_iso2": r.country_iso2, "label": city}
    return out
