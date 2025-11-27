"use client";
import React, { useState, useEffect } from "react";
import CustomSelect from "./CustomSelect";
import LocationAutocomplete from "./LocationAutocomplete";
import { useUser } from "../UserContext";
import {
  LOADING_TYPES,
  TRUCK_BODY_TYPES,
  getTruckBodyTypes,
  getLoadingTypes,
} from "./truckOptions";
import DateInput from "./DateInput";
import { FaQuestionCircle } from "react-icons/fa";
import { useRouter } from "next/navigation";
import { CURRENCIES } from "../utils/currency";
import useIsMobile from "../../hooks/useIsMobile";
import BillingPaywallNotice from "./BillingPaywallNotice";
import { useLang } from "../i18n/LangProvider";
import { api } from "@/config/env";

const palette = {
  surface: "var(--surface)",
  surfaceSoft: "var(--bg-card-soft)",
  controlBg: "var(--control-bg)",
  controlHover: "var(--control-bg-hover)",
  border: "var(--border-subtle)",
  text: "var(--text-primary)",
  muted: "var(--text-secondary)",
  accent: "var(--brand-blue)",
  accentStrong: "#ffd600",
  error: "#ff6868",
};

const UI_LANG =
  typeof navigator !== "undefined"
    ? (navigator.language || "ru").split("-")[0]
    : "ru";

async function upsertPlaceFromSuggest(sug, displayName) {
  try {
    if (!sug) return;
    const nd = sug.namedetails || {};
    const translations = {};
    for (const l of ["ru", "en", "ka", "uk", "tr", "de"]) {
      const v = nd[`name:${l}`];
      if (v) translations[l] = v;
    }
    const city = (displayName || "").split(",")[0];
    if (city && !translations[UI_LANG]) translations[UI_LANG] = city;
    const resp = await fetch(api(`/places/upsert`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "nominatim",
        external_id: String(sug.osm_id || sug.place_id),
        osm_type: sug.osm_type,
        lat: Number(sug.lat),
        lon: Number(sug.lon),
        country_iso2: String(sug.address?.country_code || "").toUpperCase(),
        translations,
      }),
    });
    if (!resp.ok) return null;
    const { id } = await resp.json();
    return id || null;
  } catch (_) {
    return null;
  }
}

// TruckTypeDropdown — КАСТОМНЫЙ ДРОПДАУН для выбора кузова с поддержкой вложенности и поиска
function TruckTypeDropdown({ value, onChange, options, error, focused }) {
  const { t } = useLang?.() || { t: (_k, f) => f };
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options
      .map((opt) => {
        if (opt.children) {
          const ch = opt.children.filter((c) =>
            c.label.toLowerCase().includes(lower)
          );
          if (ch.length) return { ...opt, children: ch };
          if (opt.label.toLowerCase().includes(lower)) return opt;
          return null;
        }
        if (opt.label.toLowerCase().includes(lower)) return opt;
        return null;
      })
      .filter(Boolean);
  }, [search, options]);

  // Показываем локализованный label для выбранного value
  const selectedLabel = React.useMemo(() => {
    const flat = [];
    for (const opt of options || []) {
      if (opt.children) flat.push(...opt.children);
      else flat.push(opt);
    }
    const found = flat.find((o) => o.value === value);
    return found ? found.label : "";
  }, [value, options]);

  function renderOpt(opt) {
    if (opt.children) {
      return (
        <div
          key={opt.label}
          style={{
            fontWeight: 600,
            margin: "6px 0 2px 0",
            color: "#2dc7ff",
          }}
        >
          {opt.label}
          <div style={{ marginLeft: 14 }}>
            {opt.children.map((ch) => renderOpt(ch))}
          </div>
        </div>
      );
    }
    return (
      <div
        key={opt.value}
        onMouseDown={() => {
          onChange(opt.value);
          setOpen(false);
          setSearch("");
        }}
        style={{
          padding: "7px 12px",
          borderRadius: 7,
          cursor: "pointer",
          background:
            value === opt.value
              ? `color-mix(in srgb, ${palette.accent} 18%, transparent)`
              : "none",
          color: value === opt.value ? palette.accentStrong : palette.text,
          marginBottom: 2,
          fontWeight: value === opt.value ? 600 : 400,
          outline: "none",
          border: "none",
        }}
      >
        {opt.label}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        minWidth: 170,
        width: "100%",
        marginBottom: 12,
      }}
    >
      <div
        tabIndex={0}
        style={{
          border: error
            ? `2px solid ${palette.accentStrong}`
            : focused
              ? `2px solid ${palette.accent}`
              : `1.5px solid ${palette.border}`,
          boxShadow: error
            ? "0 0 0 2px #ffd60044"
            : focused
              ? "0 0 0 2px #4fd4fd33"
              : "var(--shadow-soft)",
          borderRadius: 8,
          padding: "9px 15px",
          fontSize: 16,
          background: palette.controlBg,
          color: value ? palette.accentStrong : palette.muted,
          cursor: "pointer",
          minHeight: 38,
          transition: "border 0.14s, box-shadow 0.14s",
          outline: "none",
          userSelect: "none",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {selectedLabel || t("order.selectTruckType", "Выберите тип кузова")}
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 99,
            left: 0,
            top: 41,
            background: palette.surface,
            border: `1.5px solid ${palette.border}`,
            borderRadius: 9,
            minWidth: "100%",
            maxHeight: 320,
            overflowY: "auto",
            padding: 7,
          }}
        >
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search", "Поиск...")}
            style={{
              width: "97%",
              borderRadius: 6,
              border: `1px solid ${palette.border}`,
              padding: "7px 10px",
              fontSize: 15,
              marginBottom: 8,
              color: palette.text,
              background: palette.controlBg,
            }}
          />
          {filtered.length ? (
            filtered.map((opt) => renderOpt(opt))
          ) : (
            <div style={{ color: "#ffd600", padding: 6 }}>
              {t("common.noMatches", "Нет соответствий")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// RU-тексты оставляем как fallback. Основной текст берём из i18n: adr.info.{1..9}
const ADR_CLASS_FALLBACKS = {
  1: "Взрывчатые вещества и изделия (например, фейерверки, патроны, порох).",
  2: "Газы (сжиженные, сжатые, растворённые; например, баллоны с газом, пропан).",
  3: "Легковоспламеняющиеся жидкости (бензин, спирты, растворители).",
  4: "Легковоспламеняющиеся твёрдые вещества, вещества, способные к самовозгоранию.",
  5: "Окисляющие вещества и органические пероксиды (нитраты, перекись водорода).",
  6: "Ядовитые и инфекционные вещества (яд, пестициды, некоторые лекарства).",
  7: "Радиоактивные материалы.",
  8: "Коррозионные вещества (кислоты, щёлочи, аккумуляторы).",
  9: "Прочие опасные вещества (экологически опасные, сухой лёд и др.)",
};

const initialState = {
  truck_type: "",
  transport_kind: "",
  load_types: [],
  weight: "",
  rate_mode: "есть",
  mode: "готов к загрузке",
  regularity: "",
  ready_date_from: "",
  ready_date_to: "",
  volume: "",
  body_length: "",
  body_width: "",
  body_height: "",
  trailer_length: "",
  trailer_width: "",
  trailer_height: "",
  special: [],
  adr: false,
  adr_classes: [],
  gps_monitor: false,
  ready_time: "",
  from_location: "",
  from_radius: "",
  from_location_coords: null,
  to_locations: [{ location: "", coords: null }],
  possible_unload: "",
  rate_with_vat: "",
  rate_without_vat: "",
  rate_cash: "",
  rate_selected: "rate_with_vat",
  crew: "1",
  currency: "₾",
  bargain: false,
  contact_name: "",
  phone: "",
  email: "",
  comment: "",
  attachments: [],
};

function detectRateSelection(data = {}) {
  if (
    data.rate_with_vat !== undefined &&
    data.rate_with_vat !== null &&
    data.rate_with_vat !== ""
  ) {
    return "rate_with_vat";
  }
  if (
    data.rate_without_vat !== undefined &&
    data.rate_without_vat !== null &&
    data.rate_without_vat !== ""
  ) {
    return "rate_without_vat";
  }
  if (
    data.rate_cash !== undefined &&
    data.rate_cash !== null &&
    data.rate_cash !== ""
  ) {
    return "rate_cash";
  }
  return "rate_with_vat";
}

// Список валют централизован (../utils/currency)

function LoadingTypeDropdown({ value, onChange, options }) {
  const { t } = useLang?.() || { t: (_k, f) => f };
  const [opened, setOpened] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef(null);

  React.useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpened(false);
    };
    if (opened) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [opened]);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 12 }}>
      <div
        style={{
          minHeight: 42,
          display: "flex",
          flexWrap: "wrap",
          gap: 7,
          alignItems: "center",
          background: palette.controlBg,
          border: `1.5px solid ${palette.border}`,
          borderRadius: 7,
          padding: "7px 12px",
          cursor: "pointer",
        }}
        onClick={() => setOpened((v) => !v)}
      >
        {value.length === 0 && (
          <span style={{ color: palette.muted }}>
            {t("common.choose", "Выбрать")}
          </span>
        )}
        {value.map((v) => (
          <span
            key={v}
            style={{
              background: `color-mix(in srgb, ${palette.accent} 18%, transparent)`,
              color: palette.text,
              borderRadius: 7,
              padding: "2px 9px",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
            }}
          >
            {v}
            <span
              style={{
                marginLeft: 5,
                cursor: "pointer",
                color: palette.muted,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((x) => x !== v));
              }}
            >
              ×
            </span>
          </span>
        ))}
      </div>
      {opened && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            background: palette.surface,
            border: `1.5px solid ${palette.border}`,
            borderRadius: 10,
            boxShadow: "var(--shadow-soft)",
            marginTop: 3,
            width: "100%",
            maxHeight: 230,
            overflowY: "auto",
          }}
        >
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search", "Поиск…")}
            style={{
              width: "100%",
              background: palette.controlBg,
              color: palette.text,
              border: "none",
              outline: "none",
              borderRadius: "10px 10px 0 0",
              fontSize: 15,
              padding: "8px 12px",
              boxSizing: "border-box",
            }}
          />
          {filtered.length === 0 && (
            <div style={{ color: palette.muted, padding: 10 }}>
              {t("common.noOptions", "Нет вариантов")}
            </div>
          )}
          {filtered.map((opt) => (
            <label
              key={opt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 12px",
                cursor: "pointer",
                background: value.includes(opt)
                  ? `color-mix(in srgb, ${palette.accent} 12%, transparent)`
                  : "",
                fontWeight: value.includes(opt) ? 700 : 400,
                color: value.includes(opt) ? "#b4e1fd" : "#e3f2fd",
              }}
            >
              <input
                type="checkbox"
                checked={value.includes(opt)}
                style={{ accentColor: "#2dc7ff" }}
                onChange={() => {
                  if (value.includes(opt))
                    onChange(value.filter((x) => x !== opt));
                  else onChange([...value, opt]);
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TransportForm({
  onCreated,
  initialData,
  mode = "create",
  onSuccess,
}) {
  const { t } = useLang?.() || { t: (_k, f) => f };

  // Локализованные витрины: label = i18n, value = канон (RU)
  const BODY_TYPES = React.useMemo(() => getTruckBodyTypes(t), [t]);
  const LOADING_TYPES_I18N = React.useMemo(() => getLoadingTypes(t), [t]);
  const rateOptions = React.useMemo(
    () => [
      { value: "rate_with_vat", label: t("rate.vatIncl", "С НДС") },
      { value: "rate_without_vat", label: t("rate.vatExcl", "Без НДС") },
      { value: "rate_cash", label: t("rate.cash", "Наличными") },
    ],
    [t]
  );

  // Показываем переводы, но в payload отправляем канон по индексу
  const mapLoadingToCanonical = React.useCallback(
    (arr) => {
      const i18n = LOADING_TYPES_I18N || [];
      return (arr || []).map((v) => {
        const idx = i18n.indexOf(v);
        return idx >= 0 ? LOADING_TYPES[idx] : v;
      });
    },
    [LOADING_TYPES_I18N]
  );

  // оставляем канон значений, а подписи локализуем в рендере
  const SPECIAL = React.useMemo(() => ["Экипаж", "ADR"], []);
  const specialLabel = React.useCallback(
    (s) => (s === "Экипаж" ? t("transport.special.crew", "Экипаж") : s),
    [t]
  );

  const ADR_CLASSES = React.useMemo(
    () => [
      { value: "1", label: t("adr.short.1", "Взрывчат. материалы") },
      { value: "2", label: t("adr.short.2", "Сжатые газы") },
      { value: "3", label: t("adr.short.3", "Легковоспл. жидкости") },
      { value: "4", label: t("adr.short.4", "Легковоспл. вещи") },
      { value: "5", label: t("adr.short.5", "Окисляющие вещи") },
      { value: "6", label: t("adr.short.6", "Ядовитые вещи") },
      { value: "7", label: t("adr.short.7", "Радиоактивные вещи") },
      { value: "8", label: t("adr.short.8", "Едкие вещи") },
      { value: "9", label: t("adr.short.9", "С низкой опасностью") },
    ],
    [t]
  );

  const REGULARITY_OPTIONS = React.useMemo(
    () => [
      t("transport.regularity.daily", "ежедневно"),
      t("transport.regularity.twiceWeek", "2 раза в неделю"),
      t("transport.regularity.weekly", "еженедельно"),
      t("transport.regularity.monthly", "ежемесячно"),
      t("transport.regularity.often", "часто"),
      t("transport.regularity.byAgreement", "по согласованию"),
      t("transport.regularity.workdays", "по рабочим дням"),
    ],
    [t]
  );
  const isMobile = useIsMobile();
  const [wasTriedSubmit, setWasTriedSubmit] = useState(false);
  const fromRef = React.useRef(null);
  const { user } = useUser();
  const router = useRouter();
  const [success, setSuccess] = useState(false);
  const toRef = React.useRef(null);

  const truckTypeRef = React.useRef(null);
  const readyDateFromRef = React.useRef(null);
  const regularityRef = React.useRef(null);

  const [fromFocused, setFromFocused] = useState(false);
  const [truckTypeFocused, setTruckTypeFocused] = useState(false);
  const [readyDateFromFocused, setReadyDateFromFocused] = useState(false);
  const [regularityFocused, setRegularityFocused] = useState(false);

  const transportKindRef = React.useRef(null);
  const [transportKindFocused, setTransportKindFocused] = useState(false);

  const [shouldScrollToRegularity, setShouldScrollToRegularity] =
    useState(false);
  const [shouldAutoSubmitRegularity, setShouldAutoSubmitRegularity] =
    useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  function isFile(obj) {
    return obj && (obj instanceof File || obj instanceof Blob);
  }

  const getInputStyle = ({ error, focused }) => ({
    width: "100%",
    marginBottom: 13,
    borderRadius: 7,
    border: error
      ? `2px solid ${palette.accentStrong}`
      : focused
        ? `2px solid ${palette.accent}`
        : `1.5px solid ${palette.border}`,
    boxShadow: focused ? "0 0 0 2px #4fd4fd33" : "var(--shadow-soft)",
    background: palette.controlBg,
    color: palette.text,
    padding: "8px 13px",
    fontSize: 16,
    outline: "none",
    transition: "border .2s, box-shadow .22s",
  });

  // Инициализация state формы
  const [form, setForm] = useState(() => {
    // Выбираем контактное лицо из профиля: contact_person > full_name > name
    const userContact =
      user?.contact_person || user?.full_name || user?.name || "";
    if (initialData) {
      const inferredRate = detectRateSelection(initialData);
      return {
        ...initialState,
        ...initialData,
        load_types: Array.isArray(initialData.load_types)
          ? initialData.load_types
          : [],
        special: Array.isArray(initialData.special) ? initialData.special : [],
        adr: initialData.adr || false,
        adr_classes: Array.isArray(initialData.adr_class)
          ? initialData.adr_class
          : Array.isArray(initialData.adr_classes)
            ? initialData.adr_classes
            : [],
        to_locations: Array.isArray(initialData.to_locations)
          ? initialData.to_locations
          : [{ location: "", coords: null }],
        attachments: Array.isArray(initialData.attachments)
          ? initialData.attachments
          : [],
        phone: initialData.phone || user?.phone || "",
        contact_name: initialData.contact_name || userContact,
        rate_selected: inferredRate,
      };
    }
    return {
      ...initialState,
      phone: user?.phone || "",
      contact_name: userContact,
      rate_selected: detectRateSelection(initialState),
    };
  });

  useEffect(() => {
    if (shouldScrollToRegularity && form.mode === "постоянно") {
      if (regularityRef.current) {
        setTimeout(() => {
          regularityRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          setTimeout(() => {
            regularityRef.current.focus?.();
          }, 360);
        }, 100); // Дать время на ререндер
      }
      setShouldScrollToRegularity(false);
    }
  }, [shouldScrollToRegularity, form.mode]);

  useEffect(() => {
    if (shouldAutoSubmitRegularity && form.mode === "постоянно") {
      setShouldAutoSubmitRegularity(false);
      handleSubmit({ preventDefault: () => { } });
    }
    // eslint-disable-next-line
  }, [shouldAutoSubmitRegularity, form.mode]);

  useEffect(() => {
    const userContact =
      user?.contact_person || user?.full_name || user?.name || "";
    if (user && !form.phone) {
      setForm((f) => ({ ...f, phone: user.phone || "" }));
    }
    if (user && !form.contact_name) {
      setForm((f) => ({ ...f, contact_name: userContact }));
    }
  }, [user?.phone, user?.contact_person, user?.full_name, user?.name]);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // === Billing usage preview (soft paywall, вариант A/слоты) ===
  const [usage, setUsage] = useState(null);
  const [usageErr, setUsageErr] = useState(null);
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const resp = await fetch(`${API}/api/billing/usage/preview`, {
          credentials: "include",
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!abort) setUsage(data);
      } catch (e) {
        if (!abort) setUsageErr(String(e));
      }
    })();
    return () => {
      abort = true;
    };
  }, []);

  const renderBillingHint = () => {
    if (!usage) return null;
    // 1 бесплатный активный слот у MANAGER/TRANSPORT; новая заявка прибавит 1 к активным
    const free = Number(usage.free_slots ?? 1);
    const currentActive = Number(usage.active_transports ?? 0);
    const predictedActive = currentActive + (mode === "edit" ? 0 : 1);
    const predictedChargeable = Math.max(0, predictedActive - free);
    if (predictedChargeable <= 0) return null;
    const usd = predictedChargeable * 7; // без конверсии, фикс. $7/слот
    return (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-[#3a2f12] dark:text-amber-200">
        <div className="font-medium">
          {t("billing.slots.title", "Оплата слотов")}
        </div>
        <div className="text-sm">
          {t("billing.slots.current", "Сейчас активных транспортов:")}{" "}
          <b>{currentActive}</b>.{" "}
          {t("billing.slots.afterPublish", "После публикации будет:")}{" "}
          <b>{predictedActive}</b>.{" "}
          {t("billing.slots.freeIncluded", "Бесплатно входит:")} <b>{free}</b>.{" "}
          {t("billing.slots.paidSlots", "Платные слоты:")}{" "}
          <b>{predictedChargeable}</b> × $7 = <b>${usd}</b>{" "}
          {t("billing.slots.perMonth", "в месяц (добавится к счёту подписки).")}
        </div>
      </div>
    );
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      if (name === "load_types" || name === "special") {
        setForm((prev) => {
          const arr = new Set(prev[name]);
          if (checked) arr.add(value);
          else arr.delete(value);
          return { ...prev, [name]: Array.from(arr) };
        });
      } else {
        setForm((prev) => ({ ...prev, [name]: checked }));
      }
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFile = (e, fileType) => {
    const MAX_IMAGES = 12;
    const MAX_FILES = 12;
    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 МБ

    const filesAll = Array.from(e.target.files || []);
    const isImage = fileType === "images";
    const maxCount = isImage ? MAX_IMAGES : MAX_FILES;

    // Отсечь по размеру
    const okBySize = [];
    let rejectedBySize = 0;
    for (const f of filesAll) {
      if (typeof f.size === "number" && f.size > MAX_FILE_BYTES) {
        rejectedBySize++;
      } else {
        okBySize.push(f);
      }
    }

    // Ограничить по количеству (этот контрол полностью заменяет прошлый выбор этого типа)
    const limited = okBySize.slice(0, maxCount);
    const cutByCount = okBySize.length - limited.length;

    setForm((prev) => {
      let newAttachments = Array.isArray(prev.attachments)
        ? [...prev.attachments]
        : [];
      // удаляем старые files/images этого типа из attachments
      newAttachments = newAttachments.filter((att) => att.__type !== fileType);

      // кладём новые файлы (только прошедшие фильтры)
      const mapped = limited.map((file) => ({
        __type: fileType,
        name: file.name,
        preview_url: URL.createObjectURL(file), // только для превью
        file, // реальный File для аплоада
      }));
      return {
        ...prev,
        attachments: [...newAttachments, ...mapped],
      };
    });

    // Сообщения об ограничениях (не блокируют форму, просто информируют)
    if (rejectedBySize > 0) {
      setError(
        t(
          "upload.sizeRejected",
          `Отклонено по размеру: ${rejectedBySize} файл(ов) > 10 МБ`
        )
      );
    } else if (cutByCount > 0) {
      const noun = isImage
        ? t("upload.images", "изображений")
        : t("upload.files", "файлов");
      setError(
        t(
          "upload.maxExceeded",
          `Можно выбрать максимум ${maxCount} ${noun} — ${t(
            "common.excessDiscarded",
            "лишние отброшены"
          )}`
        )
      );
    }

    // Чтобы повторный выбор тех же файлов сработал
    e.target.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); // <--- только один раз в самом начале!
    setWasTriedSubmit(true);

    if (
      !form.from_location_coords ||
      typeof form.from_location_coords.lat !== "number"
    ) {
      setError(
        t(
          "form.chooseFromDropdown",
          "Выберите 'Откуда' только из выпадающего списка!"
        )
      );
      if (fromRef.current) {
        fromRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          fromRef.current.focus?.();
        }, 360);
      }
      setSending(false);
      return;
    }

    setError("");
    setSending(true);

    if (!form.transport_kind) {
      setError(t("error.transport.kindRequired", "Укажите тип транспорта!"));
      // Сначала скроллим, потом через requestAnimationFrame ставим фокус и вручную подсвечиваем
      transportKindRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setTimeout(() => {
        if (transportKindRef.current) {
          transportKindRef.current.focus();
        }
        setTransportKindFocused(true);
      }, 350);
      setSending(false);
      return;
    }
    if (!form.truck_type) {
      setError("Укажите тип кузова!");
      if (truckTypeRef.current) {
        truckTypeRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      setSending(false);
      return;
    }

    // 2. Доступен с — обязателен если mode === "готов к загрузке"
    if (form.mode === "готов к загрузке" && !form.ready_date_from) {
      setError(t("error.readyFromRequired", "Укажите дату 'Доступен с'!"));
      if (readyDateFromRef.current) {
        // Сначала плавный скролл, потом — фокус
        readyDateFromRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setTimeout(() => {
          readyDateFromRef.current.focus?.();
        }, 360);
      }
      setSending(false);
      return;
    }

    // 3. Регулярность — обязательна если mode === "постоянно"
    // 1. Если режим "готов к загрузке" — проверять только дату
    if (form.mode === "готов к загрузке") {
      if (!form.ready_date_from) {
        setError(t("error.readyFromRequired", "Укажите дату 'Доступен с'!"));
        if (readyDateFromRef.current) {
          readyDateFromRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          setTimeout(() => {
            readyDateFromRef.current.focus?.();
          }, 360);
        }
        setSending(false);
        return;
      }
    }

    // 2. Если режим "постоянно" — проверять только periodicity
    if (form.mode === "постоянно") {
      if (!form.regularity) {
        setError(t("error.periodicityRequired", "Укажите периодичность!"));
        if (regularityRef.current) {
          regularityRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          setTimeout(() => {
            regularityRef.current.focus?.();
          }, 360);
        }
        setSending(false);
        return;
      }
    }

    // ---- Пред-проверка лимитов по количеству ----
    const MAX_IMAGES = 12;
    const MAX_FILES = 12;

    function isImageLike(att) {
      if (att?.file) return (att.file.type || "").startsWith("image/");
      const ft = (att?.file_type || "").toLowerCase();
      const url = (att?.file_url || "").toLowerCase();
      return (
        ft.startsWith("image/") ||
        url.endsWith(".jpg") ||
        url.endsWith(".jpeg") ||
        url.endsWith(".png") ||
        url.endsWith(".webp") ||
        url.endsWith(".gif") ||
        url.endsWith(".bmp")
      );
    }

    const allAtts = Array.isArray(form.attachments) ? form.attachments : [];
    const countImages = allAtts.filter(isImageLike).length;
    const countFiles = allAtts.length - countImages;

    if (countImages > MAX_IMAGES) {
      setError(
        t(
          "upload.maxImages",
          `Максимум ${MAX_IMAGES} ${t(
            "upload.images",
            "изображений"
          )} (сейчас ${countImages}). ${t(
            "common.removeExtra",
            "Уберите лишние."
          )}`
        )
      );
      setSending(false);
      return;
    }
    if (countFiles > MAX_FILES) {
      setError(
        t(
          "upload.maxFiles",
          `Максимум ${MAX_FILES} ${t(
            "upload.files",
            "файлов"
          )} (сейчас ${countFiles}). ${t(
            "common.removeExtra",
            "Уберите лишние."
          )}`
        )
      );
      setSending(false);
      return;
    }

    // 1) Загружаем новые файлы на сервер и получаем постоянные URL
    async function uploadOne(att) {
      if (!att?.file) return null;
      const fd = new FormData();
      fd.append("file", att.file, att.name || "file");
      const res = await fetch(api(`/upload`), { method: "POST", body: fd });

      if (res.status === 413) {
        setError(
          t("upload.tooLarge", "Файл слишком большой (максимум 10 МБ).")
        );
        throw new Error("FILE_TOO_LARGE");
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setError(
          t("upload.failed", "Ошибка загрузки файла. Повторите попытку.")
        );
        throw new Error(`upload failed: ${t}`);
      }
      return await res.json(); // { name, file_type, file_url }
    }

    // 2) Преобразуем attachments формы к виду, который ждёт бэкенд
    const uploadedAttachments = [];
    for (const att of form.attachments || []) {
      if (att.file) {
        const info = await uploadOne(att);
        uploadedAttachments.push({
          name: info.name || att.name || "",
          file_type: info.file_type || (att.file && att.file.type) || "",
          file_url: info.file_url, // ВАЖНО: постоянный URL со стороны сервера
        });
      } else {
        // уже сохранённые ранее элементы (редактирование) — просто нормализуем
        uploadedAttachments.push({
          name: att.name || att.filename || "",
          file_type: att.file_type || att.type || "",
          file_url: att.file_url || att.url || att.href || "",
        });
      }
    }

    // Полный print state формы
    console.log(
      "== СТЕЙТ ПЕРЕД ФОРМИРОВАНИЕМ formToSend ==",
      JSON.stringify(form, null, 2)
    );

    try {
      const formToSend = {
        transport_kind: form.transport_kind || undefined,
        truck_type: form.truck_type || undefined,
        body_length: form.body_length ? String(form.body_length) : undefined,
        body_width: form.body_width ? String(form.body_width) : undefined,
        body_height: form.body_height ? String(form.body_height) : undefined,
        trailer_length: form.trailer_length
          ? String(form.trailer_length)
          : undefined,
        trailer_width: form.trailer_width
          ? String(form.trailer_width)
          : undefined,
        trailer_height: form.trailer_height
          ? String(form.trailer_height)
          : undefined,
        load_types: Array.isArray(form.load_types)
          ? mapLoadingToCanonical(form.load_types)
          : [],
        weight: form.weight ? parseFloat(form.weight) : undefined,
        volume: form.volume ? parseFloat(form.volume) : undefined,
        adr: !!form.adr,
        adr_class: Array.isArray(form.adr_classes) ? form.adr_classes : [],
        gps_monitor: !!form.gps_monitor,
        special: Array.isArray(form.special) ? form.special : [],
        from_location: form.from_location || undefined,
        from_radius: form.from_radius || undefined,
        from_location_coords:
          form.from_location_coords &&
            typeof form.from_location_coords.lat === "number" &&
            typeof form.from_location_coords.lng === "number"
            ? {
              lat: form.from_location_coords.lat,
              lng: form.from_location_coords.lng,
            }
            : null,
        to_locations: Array.isArray(form.to_locations)
          ? form.to_locations
            .map((x) => ({
              location: x.location,
              coords:
                x.coords &&
                  typeof x.coords.lat === "number" &&
                  typeof x.coords.lng === "number"
                  ? { lat: x.coords.lat, lng: x.coords.lng }
                  : null,
            }))
            .filter((x) => x.location && x.coords)
          : [],
        ready_date_from: form.ready_date_from || undefined,
        ready_date_to: form.ready_date_to || undefined,
        mode: form.mode || undefined,
        regularity: form.regularity || undefined,
        rate_type: form.rate_type || undefined,
        rate_with_vat: form.rate_with_vat || undefined,
        rate_without_vat: form.rate_without_vat || undefined,
        rate_cash: form.rate_cash || undefined,
        bargain: form.bargain ? "true" : undefined,
        currency: form.currency || undefined,
        contact_name: form.contact_name || undefined,
        phone: form.phone || undefined,
        comment: form.comment || undefined,
        attachments: uploadedAttachments,
      };

      // Очищаем поля перед отправкой
      ["adr_classes", "rate_mode"].forEach((f) => delete formToSend[f]);
      Object.keys(formToSend).forEach((k) => {
        if (formToSend[k] === undefined || formToSend[k] === "")
          delete formToSend[k];
      });
      if (formToSend.transport_kind !== "Сцепка") {
        delete formToSend.trailer_length;
        delete formToSend.trailer_width;
        delete formToSend.trailer_height;
      }

      // Токен авторизации
      let token = null;
      if (user?.token) token = user.token;
      if (!token) token = localStorage.getItem("token");

      // ПРИНТ payload
      console.log(
        "== PAYLOAD ОТПРАВЛЯЕТСЯ НА СЕРВЕР ==",
        JSON.stringify(formToSend, null, 2)
      );

      let url = api(`/transports`);
      let method = "POST";
      if (mode === "edit" && initialData?.id) {
        url = api(`/transports/${initialData.id}`);
        method = "PATCH";
        // Автоактивация после обновления дат готовности
        const normalizeDate = (s) => {
          if (!s) return null;
          const t = String(s).trim();
          const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
          if (m) {
            const d = m[1].padStart(2, "0");
            const mo = m[2].padStart(2, "0");
            const y = m[3].length === 2 ? "20" + m[3] : m[3];
            return `${y}-${mo}-${d}`;
          }
          if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
          const dt = new Date(t);
          return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
        };
        const oldFrom = normalizeDate(initialData.ready_date_from);
        const oldTo = normalizeDate(initialData.ready_date_to);
        const newFrom = normalizeDate(
          formToSend.ready_date_from || form.ready_date_from
        );
        const newTo = normalizeDate(
          formToSend.ready_date_to || form.ready_date_to
        );
        if (
          initialData.is_active === false &&
          ((newFrom && newFrom !== oldFrom) || (newTo && newTo !== oldTo))
        ) {
          // сервер принимает is_active в PATCH транспорта
          formToSend.is_active = true;
        }
      }

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(formToSend),
      });

      // ПРИНТ ответа сервера
      const text = await res.text();
      console.log("== ОТВЕТ СЕРВЕРА ==", res.status, text);

      let serverTransport = null;
      try {
        serverTransport = text ? JSON.parse(text) : null;
      } catch {
        /* игнорируем ошибки парсинга */
      }

      if (!res.ok) throw new Error("Ошибка сервера");

      // При редактировании сразу подменим attachments на серверные URL
      if (mode === "edit") {
        setForm((f) => ({ ...f, attachments: uploadedAttachments }));
      }

      setMsg(
        mode === "edit"
          ? t("transport.saved.updated", "Заявка обновлена!")
          : t("transport.saved.created", "Заявка добавлена!")
      );
      setForm({
        ...initialState,
        contact_name: user?.name || "",
        phone: user?.phone || "",
      });
      setSuccess(true);
      if (onSuccess) onSuccess();
      if (onCreated && mode !== "edit") onCreated(serverTransport);

      // После успешного создания всегда идём в профиль → вкладка «Транспорт»
      if (mode !== "edit") {
        const highlight = serverTransport?.id
          ? `&highlight_transport=${serverTransport.id}`
          : "";
        router.replace(`/profile?transports=1${highlight}`);
      }
      setTimeout(() => setSuccess(false), 3200);
    } catch (err) {
      setError(
        t("error.saveFailed", "Ошибка при сохранении. Проверьте соединение.")
      );
    } finally {
      setSending(false);
    }
  };

  // ======= ЦВЕТОВАЯ СХЕМА =======
  const section = {
    background: palette.surface,
    borderRadius: 18,
    padding: "20px 26px",
    marginBottom: 22,
    boxShadow: "var(--shadow-soft)",
    border: `1.5px solid ${palette.border}`,
  };
  const label = {
    fontWeight: 500,
    color: palette.muted,
    marginBottom: 3,
    display: "block",
    letterSpacing: 0.01,
  };
  const input = {
    width: "100%",
    marginBottom: 13,
    borderRadius: 7,
    border: `1.5px solid ${palette.border}`,
    padding: "8px 13px",
    fontSize: 16,
    background: palette.controlBg,
    color: palette.text,
    boxShadow: "var(--shadow-soft)",
    transition: "border .2s, box-shadow .22s",
  };
  const col2 = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0 20px",
  };

  return (
    <form
      id="transportform"
      className="form-root mobile-form"
      data-mobile={isMobile ? "1" : undefined}
      onSubmit={handleSubmit}
      style={{
        maxWidth: isMobile ? "100%" : 760,
        width: "100%",
        margin: "0 auto",
        padding: isMobile ? "0 10px 70px" : "0",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {renderBillingHint()}
      {/* --- Даты и маршрут --- */}
      <div style={section} className="form-section">
        <div
          className="section-title"
          style={{
            fontSize: 19,
            fontWeight: 700,
            marginBottom: 9,
            color: palette.accent,
          }}
        >
          {t("tf.section.datesRoute", "Даты и маршрут")}
        </div>

        <div
          className="stack-mobile"
          style={{
            display: "flex",
            gap: 24,
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          {/* Откуда */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              minHeight: 98,
            }}
          >
            <label style={label}>{t("common.from", "Откуда")} *</label>
            <LocationAutocomplete
              lang={UI_LANG}
              scope="settlement"
              ref={fromRef}
              value={form.from_location}
              placeholder={t(
                "common.startTypingCountryCity",
                "Начните вводить страну или город..."
              )}
              onSelect={(coords, displayName, sug) => {
                let lat, lng;
                if (Array.isArray(coords) && coords.length === 2) {
                  lat = coords[0];
                  lng = coords[1];
                } else if (
                  coords &&
                  typeof coords.lat === "number" &&
                  typeof coords.lng === "number"
                ) {
                  lat = coords.lat;
                  lng = coords.lng;
                }
                setForm((f) => ({
                  ...f,
                  from_location: displayName,
                  from_location_coords:
                    lat !== undefined && lng !== undefined
                      ? { lat, lng }
                      : null,
                }));
                upsertPlaceFromSuggest(sug, displayName).then((id) => {
                  if (id) setForm((f) => ({ ...f, from_place_id: id }));
                });
              }}
              onInputChange={(text) => {
                if (!text)
                  setForm((f) => ({
                    ...f,
                    from_location: "",
                    from_location_coords: null,
                  }));
              }}
              onFocus={() => setFromFocused(true)}
              onBlur={() => setFromFocused(false)}
              style={getInputStyle({
                error: !form.from_location_coords && wasTriedSubmit,
                focused: fromFocused,
              })}
            />
            {!form.from_location_coords && wasTriedSubmit && (
              <div style={{ color: "#ff6868", fontSize: 13, marginTop: 2 }}>
                {t(
                  "form.chooseFromDropdown",
                  "Выберите адрес из выпадающего списка!"
                )}
              </div>
            )}

            <div
              style={{
                position: "relative",
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                type="number"
                inputMode="decimal"
                name="from_radius"
                value={form.from_radius}
                onChange={handleChange}
                style={{
                  ...input,
                  width: "100%",
                  marginBottom: 0,
                  paddingRight: 32,
                }}
                placeholder={t("common.radius", "Радиус")}
                min="0"
              />
              {/* Новый компактный вопросик */}
              <span
                style={{
                  position: "absolute",
                  right: 38,
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  zIndex: 3,
                }}
                tabIndex={0}
                className="radius-tooltip-parent"
              >
                <FaQuestionCircle
                  style={{
                    color: "#ffd600",
                    fontSize: 17,
                    background: "rgba(28,38,65,0.8)",
                    borderRadius: "50%",
                    padding: 0,
                  }}
                />
                <span
                  className="radius-tooltip-popup"
                  style={{
                    display: "block",
                    minWidth: 270,
                    maxWidth: 380,
                    position: "absolute",
                    left: "50%",
                    top: "125%",
                    transform: "translateX(-50%)",
                    zIndex: 99,
                    background: "rgba(34, 45, 61, 0.96)",
                    color: "#ffd600",
                    border: "1.5px solid #ffd60077",
                    borderRadius: 13,
                    padding: "13px 18px 13px 18px",
                    fontSize: 15,
                    fontWeight: 400,
                    lineHeight: "20px",
                    boxShadow: "0 2px 20px #141d28cc",
                    transition: "opacity .22s, visibility .22s",
                    opacity: 0,
                    pointerEvents: "none",
                    visibility: "hidden",
                    textAlign: "left",
                    whiteSpace: "pre-line",
                  }}
                >
                  {t(
                    "tf.radius.help",
                    "Радиус — это максимальное расстояние, на которое ваш транспорт готов выехать для загрузки.\n\nЧем больше радиус, тем больше точек загрузки увидят вашу заявку.\n\nИспользуйте радиус, чтобы получать подходящие предложения в нужной вам зоне."
                  )}
                </span>
              </span>
              <span style={{ color: "#a7cff8", fontSize: 14, minWidth: 24 }}>
                {t("units.km", "км")}
              </span>
              <style>
                {`
.radius-tooltip-parent:focus-within .radius-tooltip-popup,
.radius-tooltip-parent:hover .radius-tooltip-popup {
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: all !important;
}
.radius-tooltip-popup {
    pointer-events: none;
}
`}
              </style>
            </div>
          </div>

          {/* Возможные направления */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              minHeight: 98,
            }}
          >
            <label style={label}>
              {t("tf.possibleDirections", "Возможные направления")}
            </label>
            {form.to_locations.map((item, idx) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <div style={{ position: "relative" }}>
                  <LocationAutocomplete
                    lang={UI_LANG}
                    scope="settlement"
                    ref={idx === 0 ? toRef : undefined}
                    value={item.location}
                    placeholder={t(
                      "common.startTypingCountryCity",
                      "Начните вводить страну или город..."
                    )}
                    onSelect={(coords, displayName, sug) => {
                      let lat, lng;
                      if (Array.isArray(coords) && coords.length === 2) {
                        lat = coords[0];
                        lng = coords[1];
                      } else if (
                        coords &&
                        typeof coords.lat === "number" &&
                        typeof coords.lng === "number"
                      ) {
                        lat = coords.lat;
                        lng = coords.lng;
                      }
                      setForm((f) => {
                        const arr = [...f.to_locations];
                        arr[idx] = {
                          ...arr[idx],
                          location: displayName,
                          coords:
                            lat !== undefined && lng !== undefined
                              ? { lat, lng }
                              : null,
                        };
                        return { ...f, to_locations: arr };
                      });
                      upsertPlaceFromSuggest(sug, displayName).then((id) => {
                        if (!id) return;
                        setForm((f) => {
                          const ids = Array.isArray(f.to_place_ids)
                            ? [...f.to_place_ids]
                            : [];
                          ids[idx] = id;
                          return { ...f, to_place_ids: ids };
                        });
                      });
                    }}
                    onInputChange={(text) => {
                      if (!text)
                        setForm((f) => {
                          const arr = [...f.to_locations];
                          arr[idx] = {
                            ...arr[idx],
                            location: "",
                            coords: null,
                          };
                          const ids = Array.isArray(f.to_place_ids)
                            ? [...f.to_place_ids]
                            : [];
                          ids[idx] = null;
                          return { ...f, to_locations: arr, to_place_ids: ids };
                        });
                    }}
                    style={{
                      border:
                        idx === 0 &&
                          !!item.location && // что-то введено!
                          !item.coords &&
                          wasTriedSubmit
                          ? `2px solid ${palette.error}`
                          : `1.5px solid ${palette.border}`,
                      borderRadius: 7,
                      background: palette.controlBg,
                      color: palette.text,
                      padding: "8px 13px",
                      fontSize: 16,
                      marginBottom: 0,
                      boxShadow: "var(--shadow-soft)",
                      width: "100%",
                      paddingRight: 36,
                    }}
                  />
                  {form.to_locations.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          to_locations: f.to_locations.filter(
                            (_, i) => i !== idx
                          ),
                        }))
                      }
                      title={t("common.removeDirection", "Удалить направление")}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "#43bfff",
                        fontSize: 20,
                        lineHeight: 1,
                        cursor: "pointer",
                        padding: 0,
                        zIndex: 3,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {idx === 0 &&
                  !!item.location && // что-то введено!
                  !item.coords &&
                  wasTriedSubmit && (
                    <div
                      style={{ color: "#ff6868", fontSize: 13, marginTop: 2 }}
                    >
                      {t(
                        "form.chooseFromDropdown",
                        "Выберите адрес из выпадающего списка!"
                      )}
                    </div>
                  )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  to_locations: [
                    ...f.to_locations,
                    { location: "", coords: null },
                  ],
                }))
              }
              style={{
                marginTop: 2,
                color: "#43bfff",
                background: "none",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                fontWeight: 700,
                alignSelf: "flex-start",
              }}
            >
              {t("tf.addDirection", "+ добавить направление")}
            </button>
          </div>
        </div>

        {/* Когда */}
        <div>
          <label style={label}>{t("tf.when", "Когда")}</label>
          <select
            name="mode"
            value={form.mode}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                mode: e.target.value,
                ready_date: "",
                ready_days: "1",
                regularity: "",
              }))
            }
            style={input}
          >
            <option value="готов к загрузке">
              {t("transport.mode.ready", "Готов к загрузке")}
            </option>
            <option value="постоянно">
              {t("transport.mode.permanent", "Постоянно")}
            </option>
          </select>

          {form.mode === "постоянно" && (
            <>
              <select
                ref={regularityRef}
                name="regularity"
                value={form.regularity}
                onFocus={() => setRegularityFocused(true)}
                onBlur={() => setRegularityFocused(false)}
                onChange={handleChange}
                style={getInputStyle({
                  error:
                    form.mode === "постоянно" &&
                    !form.regularity &&
                    wasTriedSubmit,
                  focused: regularityFocused,
                })}
              >
                <option value="">
                  {t("transport.regularity.choose", "Выбрать периодичность")}
                </option>
                {REGULARITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              {!form.regularity && wasTriedSubmit && (
                <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                  {t(
                    "transport.regularity.required",
                    "Укажите периодичность или дату!"
                  )}
                </div>
              )}
            </>
          )}

          {form.mode === "готов к загрузке" && (
            <div style={{ display: "flex", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <DateInput
                  ref={readyDateFromRef}
                  name="ready_date_from"
                  value={form.ready_date_from}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, ready_date_from: v }))
                  }
                  placeholder={t("transport.readyFrom", "Доступен с")}
                  required
                  onFocus={() => setReadyDateFromFocused(true)}
                  onBlur={() => setReadyDateFromFocused(false)}
                  inputStyle={getInputStyle({
                    error:
                      form.mode === "готов к загрузке" &&
                      !form.ready_date_from &&
                      wasTriedSubmit,
                    focused: readyDateFromFocused,
                  })}
                />
                <span
                  style={{
                    fontSize: 20,
                    color: "#68caff",
                    fontWeight: 600,
                    margin: "0 8px",
                    userSelect: "none",
                  }}
                >
                  —
                </span>
                <DateInput
                  name="ready_date_to"
                  value={form.ready_date_to}
                  onChange={(v) => setForm((f) => ({ ...f, ready_date_to: v }))}
                  placeholder={t("common.to", "по")}
                  required
                  inputStyle={getInputStyle({
                    error: false,
                    focused: false,
                  })}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- Тип кузова и детали --- */}
      <div style={section} className="form-section">
        <div
          className="section-title"
          style={{
            fontSize: 19,
            fontWeight: 700,
            marginBottom: 9,
            color: palette.accent,
          }}
        >
          {t("tf.section.typeAndDetails", "Тип и детали транспорта")}
        </div>
        <div style={col2} className="split-grid">
          <div>
            <label style={label}>
              {t("transport.bodyType", "Тип кузова")} *
            </label>
            <div
              ref={truckTypeRef}
              tabIndex={-1}
              style={{
                padding: 0,
                marginBottom: 13,
                background: "transparent",
                // УБРАНЫ ВСЕ border/borderRadius/boxShadow!
              }}
            >
              <TruckTypeDropdown
                value={form.truck_type}
                onChange={(val) => setForm((f) => ({ ...f, truck_type: val }))}
                options={BODY_TYPES}
                wasTriedSubmit={wasTriedSubmit}
                error={!form.truck_type && wasTriedSubmit}
              />
            </div>

            {!form.truck_type && wasTriedSubmit && (
              <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                {t("transport.bodyType.required", "Укажите тип кузова!")}
              </div>
            )}
          </div>
          <div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={label}>
                {t("transport.kind", "Тип транспорта")} *
              </label>
              <select
                ref={transportKindRef}
                name="transport_kind"
                value={form.transport_kind}
                onChange={handleChange}
                onFocus={() => setTransportKindFocused(true)}
                onBlur={() => setTransportKindFocused(false)}
                style={{
                  ...input,
                  border:
                    !form.transport_kind && wasTriedSubmit
                      ? "2px solid #ffd600"
                      : transportKindFocused
                        ? "2px solid #5fd8ff"
                        : "1.5px solid #294c7a",
                  boxShadow:
                    !form.transport_kind && wasTriedSubmit
                      ? "0 0 0 2px #ffd60044"
                      : transportKindFocused
                        ? "0 0 0 2px #4fd4fd33"
                        : "0 1px 6px #1b334d22",
                  transition: "border .2s, box-shadow .22s",
                }}
              >
                <option value="">
                  {t("transport.kind.choose", "Выберите тип транспорта")}
                </option>
                <option value="Полуприцеп">
                  {t("transport.kind.semitrailer", "Полуприцеп")}
                </option>
                <option value="Грузовик">
                  {t("transport.kind.truck", "Грузовик")}
                </option>
                <option value="Сцепка">
                  {t("transport.kind.roadTrain", "Сцепка")}
                </option>
              </select>
              {!form.transport_kind && wasTriedSubmit && (
                <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                  {t("transport.kind.required", "Укажите тип транспорта!")}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ margin: "14px 0 4px 0" }}>
          <label style={{ ...label, marginBottom: 6 }}>
            {t("transport.loading", "Загрузка:")}
          </label>
          <LoadingTypeDropdown
            value={form.load_types}
            onChange={(val) => setForm((f) => ({ ...f, load_types: val }))}
            options={LOADING_TYPES_I18N}
          />
        </div>
        <div style={col2} className="split-grid">
          <div>
            <label style={label}>
              {t("transport.capacityTons", "Грузоподъёмность (т)")}
            </label>
            <input
              type="number"
              inputMode="decimal"
              name="weight"
              value={form.weight}
              onChange={handleChange}
              style={input}
              min="0"
            />
          </div>
          <div>
            <label style={label}>
              {t("transport.volumeM3", "Объём кузова (м³)")}
            </label>
            <input
              type="number"
              inputMode="decimal"
              name="volume"
              value={form.volume}
              onChange={handleChange}
              style={input}
              min="0"
            />
          </div>
        </div>
        <div>
          <label style={label}>{t("transport.body", "Кузов")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              name="body_length"
              value={form.body_length}
              onChange={handleChange}
              style={{ ...input, width: 80 }}
              placeholder={t("dimensions.length", "Длина")}
              inputMode="decimal"
              type="number"
              min="0"
            />
            <span style={{ color: "#86b5e6", alignSelf: "center" }}>×</span>
            <input
              name="body_width"
              value={form.body_width}
              onChange={handleChange}
              style={{ ...input, width: 80 }}
              placeholder={t("dimensions.width", "Ширина")}
              inputMode="decimal"
              type="number"
              min="0"
            />
            <span style={{ color: "#86b5e6", alignSelf: "center" }}>×</span>
            <input
              name="body_height"
              value={form.body_height}
              onChange={handleChange}
              style={{ ...input, width: 80 }}
              placeholder={t("dimensions.height", "Высота")}
              type="number"
              inputMode="decimal"
              min="0"
            />
            <span style={{ color: "#86b5e6", alignSelf: "center" }}>
              {t("units.m", "м")}
            </span>
          </div>
        </div>
        {form.transport_kind === "Сцепка" && (
          <div style={{ marginTop: 2 }}>
            <label style={label}>
              {t("transport.trailerDims", "Габариты прицепа")}
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                name="trailer_length"
                value={form.trailer_length}
                onChange={handleChange}
                style={{ ...input, width: 80 }}
                placeholder={t("dimensions.length", "Длина")}
                type="number"
                inputMode="decimal"
                min="0"
              />
              <span style={{ color: "#86b5e6", alignSelf: "center" }}>×</span>
              <input
                name="trailer_width"
                value={form.trailer_width}
                onChange={handleChange}
                style={{ ...input, width: 80 }}
                placeholder={t("dimensions.width", "Ширина")}
                type="number"
                inputMode="decimal"
                min="0"
              />
              <span style={{ color: "#86b5e6", alignSelf: "center" }}>×</span>
              <input
                name="trailer_height"
                value={form.trailer_height}
                onChange={handleChange}
                style={{ ...input, width: 80 }}
                placeholder={t("dimensions.height", "Высота")}
                type="number"
                inputMode="decimal"
                min="0"
              />
              <span style={{ color: "#86b5e6", alignSelf: "center" }}>
                {t("units.m", "м")}
              </span>
            </div>
          </div>
        )}
        {/* --- Добавить --- */}
        <div style={{ margin: "7px 0 0 0" }}>
          <label style={{ ...label, marginBottom: 6 }}>
            {t("common.add", "Добавить:")}
          </label>
          <div className="add-options">
            {SPECIAL.map((s) =>
              s === "Экипаж" ? (
                <span key={s} className="add-option crew-option">
                  <label style={{ fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      name="special"
                      value={s}
                      checked={form.special.includes(s)}
                      onChange={handleChange}
                      style={{ marginRight: 8 }}
                    />
                    {specialLabel(s)}
                  </label>
                  {form.special.includes("Экипаж") && (
                    <select
                      name="crew"
                      value={form.crew}
                      onChange={handleChange}
                      style={{
                        borderRadius: 6,
                        border: `1.5px solid ${palette.border}`,
                        padding: "4px 9px",
                        background: palette.controlBg,
                        color: palette.accent,
                      }}
                    >
                      <option value="1">
                        {t("transport.crew.one", "1 водитель")}
                      </option>
                      <option value="2">
                        {t("transport.crew.two", "2 водителя")}
                      </option>
                    </select>
                  )}
                </span>
              ) : s === "ADR" ? (
                <label key="ADR" className="add-option" style={{ fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="adr"
                    checked={form.adr || false}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        adr: e.target.checked,
                        adr_classes: e.target.checked ? [] : [],
                      }))
                    }
                    style={{ marginRight: 8 }}
                  />
                  ADR
                </label>
              ) : (
                <label key={s} className="add-option" style={{ fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="special"
                    value={s}
                    checked={form.special.includes(s)}
                    onChange={handleChange}
                    style={{ marginRight: 8 }}
                  />
                  {specialLabel(s)}
                </label>
              )
            )}
          </div>
          {/* ВЫВОД СПИСКА ADR */}
          {form.adr && (
            <div
              className={isMobile ? "adr-list-mobile" : "choice-grid"}
              style={{ marginTop: 9, fontSize: 15 }}
            >
              {ADR_CLASSES.map(({ value, label }) => (
                <label
                  key={value}
                  className={isMobile ? "adr-list-item" : "choice-tile"}
                  style={{ fontWeight: 500, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    name="adr_classes"
                    value={value}
                    checked={form.adr_classes?.includes(value)}
                    onChange={(e) => {
                      setForm((f) => {
                        const arr = new Set(f.adr_classes || []);
                        if (e.target.checked) arr.add(value);
                        else arr.delete(value);
                        return { ...f, adr_classes: Array.from(arr) };
                      });
                    }}
                  />
                  <span
                    className="choice-label"
                    tabIndex={0}
                    onMouseEnter={(e) => {
                      const tooltip = document.createElement("div");
                      tooltip.className = "adr-tooltip";
                      tooltip.innerText = t(
                        `adr.info.${value}`,
                        ADR_CLASS_FALLBACKS[value]
                      );
                      Object.assign(tooltip.style, {
                        position: "absolute",
                        left: 12,
                        top: "110%",
                        background: palette.surface,
                        color: palette.text,
                        padding: "10px 14px",
                        borderRadius: 9,
                        boxShadow: "0 4px 18px #18315344",
                        minWidth: 200,
                        zIndex: 9999,
                        fontSize: 14,
                        whiteSpace: "pre-line",
                      });
                      e.currentTarget.appendChild(tooltip);
                    }}
                    onMouseLeave={(e) => {
                      const tooltip =
                        e.currentTarget.querySelector(".adr-tooltip");
                      if (tooltip) tooltip.remove();
                    }}
                  >
                    ADR {value} {label}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        {/* --- GPS мониторинг --- */}
        <div style={{ marginTop: 10 }}>
          <label style={label}>
            <input
              type="checkbox"
              name="gps_monitor"
              checked={form.gps_monitor}
              onChange={handleChange}
              style={{ marginRight: 8 }}
            />
            {t("transport.gpsPossible", "Включение GPS-мониторинга возможно.")}
          </label>
        </div>
      </div>

      {/* --- Ставка и контакты --- */}
      <div style={section} className="form-section">
        <div
          className="section-title"
          style={{
            fontSize: 19,
            fontWeight: 700,
            marginBottom: 9,
            color: palette.accent,
          }}
        >
          {t("tf.section.rateAndContacts", "Ставка и контакты")}
        </div>

        {/* Информация если выбран “Запросить ставку” */}
        {form.rate_mode === "запросить" && (
          <div style={{ color: "#b8d6ef", marginBottom: 16 }}>
            {t(
              "transport.rate.requestInfo",
              "Пользователи будут предлагать свою ставку во встречных предложениях"
            )}
          </div>
        )}

        {form.rate_mode === "есть" && (
          <div
            className="stack-mobile"
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 180,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <label style={label}>{t("rate.type", "Тип ставки")}</label>
              <CustomSelect
                value={form.rate_selected}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    rate_selected: v || "rate_with_vat",
                  }))
                }
                options={rateOptions}
                name="rate_selected"
                placeholder={t("common.choose", "Выбрать")}
                style={{
                  ...input,
                  height: 40,
                  minHeight: 40,
                  padding: "7px 13px",
                  fontSize: 16,
                  lineHeight: "24px",
                  boxSizing: "border-box",
                  verticalAlign: "middle",
                  cursor: "pointer",
                  marginBottom: 0,
                }}
                menuStyle={{
                  background: palette.surface,
                  border: `1.5px solid ${palette.accent}`,
                  borderRadius: 9,
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 170,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <label style={label}>{t("rate.amount", "Ставка")}</label>
              <input
                type="number"
                inputMode="decimal"
                name={form.rate_selected}
                value={form[form.rate_selected] ?? ""}
                onChange={handleChange}
                style={{
                  ...input,
                  height: 40,
                  padding: "7px 13px",
                  lineHeight: "24px",
                  boxSizing: "border-box",
                  verticalAlign: "middle",
                  marginBottom: 0,
                }}
                min="0"
              />
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 150,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <label style={label}>{t("common.currency", "Валюта")}</label>
              <CustomSelect
                value={form.currency}
                onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                options={CURRENCIES.map((cur) => ({ value: cur, label: cur }))}
                name="currency"
                placeholder={t("common.currency", "Валюта")}
                style={{
                  ...input,
                  height: 40,
                  minHeight: 40,
                  padding: "7px 13px", // <--- ОБЯЗАТЕЛЬНО!
                  fontSize: 16,
                  lineHeight: "24px",
                  boxSizing: "border-box",
                  verticalAlign: "middle",
                  cursor: "pointer",
                  marginBottom: 0,
                }}
                menuStyle={{
                  background: palette.surface,
                  border: `1.5px solid ${palette.accent}`,
                  borderRadius: 9,
                }}
              />
            </div>
          </div>
        )}

        <div>
          <label style={label}>
            <input
              type="checkbox"
              name="bargain"
              checked={!!form.bargain}
              onChange={handleChange}
              style={{ marginRight: 8 }}
            />
            {t("rate.noBargain", "Без торга")}
          </label>
        </div>
        <div style={col2} className="split-grid">
          <div>
            <label style={label}>
              {t("contact.person", "Контактное лицо")} *
            </label>
            <input
              name="contact_name"
              value={form.contact_name}
              onChange={handleChange}
              style={input}
              required
            />
          </div>
          <div>
            <label style={label}>{t("contact.phone", "Телефон")} *</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              style={input}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
        </div>
      </div>

      {/* --- Примечание и файлы --- */}
      <div style={section} className="form-section">
        <div
          className="section-title"
          style={{
            fontSize: 19,
            fontWeight: 700,
            marginBottom: 9,
            color: palette.accent,
          }}
        >
          {t("tf.section.noteAndFiles", "Примечание и файлы")}
        </div>
        <label style={label}>{t("common.note", "Примечание")}</label>
        <textarea
          name="comment"
          value={form.comment}
          onChange={handleChange}
          style={{ ...input, minHeight: 64 }}
        />
        <label style={label}>{t("common.attachments", "Вложения")}</label>
        <div
          className="stack-mobile"
          style={{ display: "flex", gap: 12, marginBottom: 13 }}
        >
          <label
            style={{
              background: palette.controlBg,
              color: "color-mix(in srgb, var(--brand-blue) 78%, var(--text-primary) 22%)",
              padding: "8px 18px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 600,
              border: `1.5px solid ${palette.border}`,
            }}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFile(e, "images")}
            />
            {t("common.addImages", "Добавить изображения")}
          </label>
          <label
            style={{
              background: palette.controlBg,
              color:
                "color-mix(in srgb, var(--brand-orange) 72%, var(--text-primary) 28%)",
              padding: "8px 18px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 600,
              border: `1.5px solid ${palette.border}`,
            }}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx,.zip,.rar,.7z,.csv,.json,.xml,application/*"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e, "files")}
            />
            {t("common.addFiles", "Добавить файлы")}
          </label>
        </div>

        {/* --- Отображение прикреплённых файлов --- */}
        {form.attachments.length > 0 && (
          <div style={{ marginTop: 13 }}>
            {/* Изображения */}
            {form.attachments.filter(
              (f) => f.__type === "images" && isFile(f.file)
            ).length > 0 && (
                <div
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    gap: 9,
                    paddingBottom: 6,
                    marginBottom: 9,
                  }}
                >
                  {form.attachments
                    .map((att, idx) => ({ att, idx }))
                    .filter(
                      ({ att }) => att.__type === "images" && isFile(att.file)
                    )
                    .map(({ att, idx }) => (
                      <div
                        key={idx}
                        style={{
                          minWidth: 78,
                          minHeight: 60,
                          background: palette.controlBg,
                          borderRadius: 10,
                          overflow: "hidden",
                          border: `1px solid ${palette.border}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                        className="preview-img-item"
                      >
                        <div
                          style={{ display: "block", cursor: "zoom-in" }}
                          onClick={() =>
                            setPreviewImage(URL.createObjectURL(att.file))
                          }
                          title="Открыть предпросмотр"
                        >
                          <img
                            src={URL.createObjectURL(att.file)}
                            alt={"img" + idx}
                            style={{
                              width: 78,
                              height: 60,
                              objectFit: "cover",
                              cursor: "zoom-in",
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              attachments: f.attachments.filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                          style={{
                            position: "absolute",
                            top: 5,
                            right: 5,
                            background: palette.surface,
                            color: "#ff5e5e",
                            border: "none",
                            borderRadius: "50%",
                            width: 22,
                            height: 22,
                            fontWeight: 900,
                            fontSize: 17,
                            lineHeight: "19px",
                            cursor: "pointer",
                            opacity: 0,
                            transition: "opacity .18s",
                            zIndex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                          className="img-remove-btn"
                          tabIndex={-1}
                        >
                          ×
                        </button>
                        <style>{`
                                .preview-img-item:hover .img-remove-btn { opacity: 1 !important; }
                            `}</style>
                      </div>
                    ))}
                </div>
              )}
            {/* Остальные файлы */}
            {form.attachments.filter(
              (f) => f.__type === "files" && isFile(f.file)
            ).length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {form.attachments
                    .map((att, idx) => ({ att, idx }))
                    .filter(
                      ({ att }) => att.__type === "files" && isFile(att.file)
                    )
                    .map(({ att, idx }) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          background: palette.controlBg,
                          borderRadius: 9,
                          padding: "9px 13px",
                          minWidth: 56,
                          marginBottom: 4,
                          border: `1px solid ${palette.border}`,
                          position: "relative",
                        }}
                        className="preview-file-item"
                      >
                        <span
                          style={{ fontSize: 28, color: palette.accentStrong }}
                        >
                          📄
                        </span>
                        <a
                          href={URL.createObjectURL(att.file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 13,
                            color: palette.text,
                            marginTop: 3,
                            maxWidth: 60,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textDecoration: "underline dotted",
                            cursor: "pointer",
                          }}
                          title="Открыть файл"
                        >
                          {att.file.name}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              attachments: f.attachments.filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            background: palette.surface,
                            color: "#ff5e5e",
                            border: "none",
                            borderRadius: "50%",
                            width: 20,
                            height: 20,
                            fontWeight: 900,
                            fontSize: 15,
                            lineHeight: "17px",
                            cursor: "pointer",
                            opacity: 0,
                            transition: "opacity .18s",
                            zIndex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                          className="file-remove-btn"
                          tabIndex={-1}
                        >
                          ×
                        </button>
                        <style>{`
                                .preview-file-item:hover .file-remove-btn { opacity: 1 !important; }
                            `}</style>
                      </div>
                    ))}
                </div>
              )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: "#ff5a5a", fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {success && msg && (
        <div
          style={{
            color: "#ffd600",
            background: "rgba(34, 59, 86, 0.97)",
            border: "1.5px solid #ffd60088",
            borderRadius: 11,
            padding: "10px 26px",
            margin: "18px 0 0 0",
            fontWeight: 700,
            fontSize: 17,
            textAlign: "center",
            letterSpacing: 0.1,
          }}
        >
          {msg}
        </div>
      )}

      <button
        type="submit"
        style={{
          background: "linear-gradient(90deg,#46b9fc,#40e7fc 80%)",
          color: "#0a2336",
          fontWeight: 800,
          fontSize: 19,
          border: "none",
          borderRadius: 13,
          padding: "15px 36px",
          width: "100%",
          marginTop: 18,
          boxShadow: "0 2px 14px #30cfff35",
          cursor: sending ? "not-allowed" : "pointer",
          opacity: sending ? 0.7 : 1,
          letterSpacing: 0.03,
        }}
        disabled={sending}
      >
        {sending
          ? mode === "edit"
            ? "Сохраняем изменения..."
            : t("adding.transport", "Добавляем...")
          : mode === "edit"
            ? "Сохранить изменения"
            : t("tf.addTransport", "Добавить транспорт")}
      </button>
      {previewImage && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(18,24,33,0.89)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 130,
            paddingBottom: 54,
            boxSizing: "border-box",
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div
            style={{
              position: "relative",
              display: "inline-block",
            }}
            className="modal-img-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage}
              alt="Просмотр"
              style={{
                maxWidth: "94vw",
                maxHeight: "74vh",
                borderRadius: 14,
                boxShadow: "var(--shadow-soft)",
                background: palette.surface,
                display: "block",
              }}
            />
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "rgba(24,28,38,0.92)",
                color: "#ffd600",
                border: "none",
                borderRadius: "50%",
                width: 38,
                height: 38,
                fontWeight: 900,
                fontSize: 23,
                lineHeight: "36px",
                cursor: "pointer",
                opacity: 0,
                transition: "opacity .15s",
                zIndex: 10,
                boxShadow: "0 3px 24px #18315344",
              }}
              className="modal-img-close"
              tabIndex={-1}
              title="Закрыть"
            >
              ×
            </button>
            <style>{`
                .modal-img-wrap:hover .modal-img-close { opacity: 1 !important; }
            `}</style>
          </div>
        </div>
      )}
    </form>
  );
}
