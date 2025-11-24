"use client";
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
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
import { useRouter } from "next/navigation";
import useIsMobile from "../../hooks/useIsMobile";
import { CURRENCIES } from "../utils/currency";
import { useLang } from "../i18n/LangProvider";
import { api, abs } from "@/config/env";

// Язык интерфейса
const UI_LANG =
  typeof navigator !== "undefined"
    ? (navigator.language || "ru").split("-")[0]
    : "ru";

// Отправка выбранного города в /places/upsert
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
    const resp = await fetch(api("/places/upsert"), {
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

// i18n factories (делаем функции, чтобы вызывать t внутри компонента)
const makePackagingOptions = (t) => [
  t("packaging.notSet", "не указано"),
  t("packaging.bulk", "навалом"),
  t("packaging.boxes", "коробки"),
  t("packaging.bulkPieces", "россыпью"),
  t("packaging.pallets", "палеты"),
  t("packaging.packs", "пачки"),
  t("packaging.bags", "мешки"),
  t("packaging.bigBags", "биг-бэги"),
  t("packaging.crates", "ящики"),
  t("packaging.sheets", "листы"),
  t("packaging.barrels", "бочки"),
  t("packaging.canisters", "канистры"),
  t("packaging.rolls", "рулоны"),
  t("packaging.pyramid", "пирамида"),
  t("packaging.ibc", "еврокუბы"),
  t("packaging.coils", "катушки"),
  t("packaging.drums", "барабаны"),
];
const makeRateTypes = (t) => [
  t("rate.kind.auction", "Торги"),
  t("rate.kind.fixed", "Без торга"),
  t("rate.kind.request", "Запрос"),
];
// Список валют централизован (../utils/currency)

const makeRequestOptions = (t) => [
  t("payment.req.withVat", "С НДС, безнал"),
  t("payment.req.noVat", "Без НДС, безнал"),
  t("payment.req.cash", "Наличными"),
];
const makePaymentScenarios = (t) => [
  { key: "unload", label: t("payment.atUnload", "На выгрузке") },
  {
    key: "after_x_days",
    label: t("payment.afterDays", "Через X дней после выгрузки"),
  },
  { key: "prepay", label: t("payment.prepay", "Предоплата") },
  { key: "contract", label: t("payment.contract", "По договору") },
];
const makePrepayTypes = (t) => [
  { key: "money", label: t("prepay.money", "Деньгами") },
  { key: "fuel", label: t("prepay.fuel", "Топливом") },
];

// --- МУЛЬТИСЕЛЕКТ "Вид(ы) загрузки" ---
function LoadingTypeDropdown({ value, onChange, options }) {
  const { t } = useLang();
  value = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(lower));
  }, [search, options]);

  const LOADING_TYPES_I18N = useMemo(() => getLoadingTypes(t), [t]);

  function handleToggle(opt) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }

  function renderSelected() {
    if (!value.length) return t("order.loadingTypes", "Вид(ы) загрузки");
    if (value.length <= 2) return value.join(", ");
    return `${value.slice(0, 2).join(", ")} +${value.length - 2}`;
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", minWidth: 170, width: "100%" }}
    >
      <div
        tabIndex={0}
        style={{
          border: "none",
          borderRadius: 8,
          padding: "9px 15px",
          fontSize: 15,
          background: "var(--of-input-bg)",
          color: value.length ? "var(--accent)" : "var(--of-text-muted)",
          cursor: "pointer",
          minHeight: 38,
          transition: "border 0.14s",
          outline: "none",
          boxShadow: "none", // убран box-shadow
          userSelect: "none",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {renderSelected()}
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 99,
            left: 0,
            top: 39,
            background: "var(--of-input-bg)",
            border: "1.5px solid var(--accent)",
            borderRadius: 9,
            minWidth: "100%",
            maxHeight: 320,
            overflowY: "auto",
            padding: 7,
            boxShadow: "none", // убран box-shadow
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
              border: "1px solid var(--of-border)",
              padding: "7px 10px",
              fontSize: 15,
              marginBottom: 8,
              color: "var(--of-text-strong)",
              background: "var(--of-surface-strong)",
            }}
          />
          {filtered.length ? (
            filtered.map((opt) => (
              <div
                key={opt}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleToggle(opt);
                }}
                style={{
                  padding: "7px 10px",
                  borderRadius: 7,
                  cursor: "pointer",
                  background: value.includes(opt)
                    ? "var(--accent-hover)"
                    : "none",
                  color: value.includes(opt) ? "#fff" : "var(--of-text-strong)",
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: value.includes(opt) ? 600 : 400,
                  outline: "none",
                  border: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt)}
                  readOnly
                  style={{
                    pointerEvents: "none",
                    marginRight: 7,
                    accentColor: "var(--accent)",
                  }}
                />
                {opt}
              </div>
            ))
          ) : (
            <div style={{ color: "var(--accent)", padding: 6 }}>
              {t("common.noMatches", "Нет соответствий")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TruckTypeDropdown({ value, onChange, options, inputRef }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  // найти отображаемый лейбл по сохраненному value
  const findLabelByValue = useCallback((opts, val) => {
    if (!val) return "";
    for (const o of opts || []) {
      if (o.children) {
        const hit = findLabelByValue(o.children, val);
        if (hit) return hit;
      } else if (o.value === val) {
        return o.label;
      }
    }
    return "";
  }, []);
  const selectedLabel = useMemo(
    () => findLabelByValue(options, value),
    [options, value, findLabelByValue]
  );

  useEffect(() => {
    if (!open) return;
    function handleClick(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = useMemo(() => {
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

  function renderOpt(opt) {
    if (opt.children) {
      return (
        <div
          key={opt.label}
          style={{
            fontWeight: 600,
            margin: "6px 0 2px 0",
            color: "var(--accent)",
          }}
        >
          {opt.label}
          <div style={{ marginLeft: 10 }}>
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
          padding: "7px 11px",
          borderRadius: 7,
          cursor: "pointer",
          background:
            value === opt.value ? "var(--accent-hover, #FFD60022)" : "none",
          color:
            value === opt.value ? "var(--accent)" : "var(--of-text-strong)",
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
      ref={containerRef}
      style={{ position: "relative", minWidth: 170, width: "100%" }}
    >
      <div
        ref={inputRef}
        tabIndex={0}
        style={{
          border: "none",
          borderRadius: 8,
          padding: "9px 15px",
          fontSize: 15,
          background: "var(--of-input-bg)",
          color: value ? "var(--accent)" : "var(--of-text-muted)",
          cursor: "pointer",
          minHeight: 38,
          transition: "border 0.14s",
          outline: "none",
          boxShadow: "none",
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
            top: 39,
            background: "var(--of-input-bg)",
            border: "1.5px solid var(--accent)",
            borderRadius: 9,
            minWidth: "100%",
            maxHeight: 320,
            overflowY: "auto",
            padding: 7,
            boxShadow: "none",
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
              border: "1px solid var(--of-border)",
              padding: "7px 10px",
              fontSize: 15,
              marginBottom: 8,
              color: "var(--of-text-strong)",
              background: "var(--of-surface-strong)",
            }}
          />
          {filtered.length ? (
            filtered.map((opt) => renderOpt(opt))
          ) : (
            <div style={{ color: "var(--accent)", padding: 6 }}>
              {t("common.noMatches", "Нет соответствий")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getDefaultForm(user) {
  return {
    requested_rate_options: [],
    cargo_items: [
      {
        name: "",
        tons: "",
        volume: "",
        showDetails: false,
        packaging: "",
        pieces: "",
        length: "",
        width: "",
        height: "",
        diameter: "",
        description: "",
      },
    ],
    title: "",
    from_locations: [""],
    to_locations: [""],
    from_locations_coords: [null],
    to_locations_coords: [null],
    gps_monitoring: false,
    attachments: [],
    load_date: "",
    transport_type: "FTL",
    unload_date: "",
    truck_type: "",
    loading_types: [],
    adr: false,
    adr_class: "",
    temp_mode: false,
    temp_from: "",
    temp_to: "",
    comment: "",
    phone: user?.phone || "",
    routes: [""],
    has_customs: false,
    customs_info: "",
    // проставим позже из локализованного массива
    rate_type: "",
    rate_with_vat: "",
    rate_no_vat: "",
    rate_cash: "",
    rate_currency: "₾",
    rate_to_card: false,
    payment_scenario: "unload",
    payment_days: "",
    prepay_type: "",
    prepay_amount: "",
    prepay_fuel_comment: "",
    postpay_days: "",
    payment_comment: "",
    truck_quantity: 1,
  };
}

// --- ГЛАВНАЯ ФОРМА ---
export default function OrderForm({ order = null, onSaved }) {
  const isMobile = useIsMobile();
  const { t } = useLang?.() || { t: (_k, f) => f };
  // локализованные опции (имена совпадают с прежними, чтобы не переписывать вызовы ниже)
  const PACKAGING_OPTIONS = useMemo(() => makePackagingOptions(t), [t]);
  const RATE_TYPES = useMemo(() => makeRateTypes(t), [t]);
  const REQUEST_OPTIONS = useMemo(() => makeRequestOptions(t), [t]);
  const PAYMENT_SCENARIOS = useMemo(() => makePaymentScenarios(t), [t]);
  const PREPAY_TYPES = useMemo(() => makePrepayTypes(t), [t]);
  const BODY_TYPES = useMemo(() => getTruckBodyTypes(t), [t]);
  const LOADING_TYPES_I18N = useMemo(() => getLoadingTypes(t), [t]);
  const priceRef = useRef(null);
  const [wasTriedSubmit, setWasTriedSubmit] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false); // <-- добавили
  const { user } = useUser();
  const { authFetchWithRefresh } = useUser();
  const isEdit = !!order;
  const fromRefs = useRef([]);
  const toRefs = useRef([]);

  const [fromFocused, setFromFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);
  const [loadDateFocused, setLoadDateFocused] = useState(false);
  const [truckTypeFocused, setTruckTypeFocused] = useState(false);

  const router = useRouter();

  const getInputStyle = ({ error, focused }) => ({
    borderRadius: 7,
    border: error
      ? "2px solid #ffd600"
      : focused
      ? "2px solid #5fd8ff"
      : "1.5px solid var(--of-border)",
    boxShadow: focused
      ? "0 0 0 2px #4fd4fd33"
      : "0 1px 6px rgba(27,51,77,0.13)",
    background: "var(--of-input-bg)",
    color: "var(--of-text)",
    padding: "8px 13px",
    fontSize: 16,
    outline: "none",
    width: "100%",
    transition: "border .2s, box-shadow .22s",
  });

  // SSR-safe: только дефолт или order
  const [form, setForm] = useState(() => {
    if (order) {
      return {
        ...getDefaultForm(user),
        ...order,
        cargo_items: order.cargo_items || [
          {
            name: "",
            tons: "",
            volume: "",
            showDetails: false,
            packaging: "",
            pieces: "",
            length: "",
            width: "",
            height: "",
            diameter: "",
            description: "",
          },
        ],
        from_locations: order.from_locations || [""],
        to_locations: order.to_locations || [""],
        from_locations_coords: order.from_locations_coords || [null],
        to_locations_coords: order.to_locations_coords || [null],
        attachments: order.attachments || [],
        loading_types: order.loading_types || [],
        truck_quantity: order.truck_quantity || 1,
        phone: order.phone || user?.phone || "",
        requested_rate_options: order?.requested_rate_options || [],
      };
    }
    return getDefaultForm(user);
  });
  // если пришли без rate_type — установим локализованный дефолт
  useEffect(() => {
    if (!form?.rate_type && RATE_TYPES?.length) {
      setForm((f) => ({ ...f, rate_type: RATE_TYPES[0] }));
    }
  }, [RATE_TYPES]);

  useEffect(() => {
    if (!isEdit && user?.phone && !form.phone) {
      setForm((f) => ({ ...f, phone: user.phone }));
    }
  }, [user?.phone]);

  // === Стили как в TransportForm ===
  const section = {
    background: "var(--of-surface)",
    borderRadius: 18,
    padding: "20px 26px",
    marginBottom: 22,
    boxShadow: "var(--of-shadow)",
    border: "1px solid var(--of-border)",
  };
  const label = {
    fontWeight: 500,
    color: "var(--of-text-muted)",
    marginBottom: 3,
    display: "block",
    letterSpacing: 0.01,
  };
  const input = {
    width: "100%",
    marginBottom: 13,
    borderRadius: 7,
    border: "none",
    padding: "8px 13px",
    fontSize: 16,
    background: "var(--of-input-bg)",
    color: "var(--of-text)",
    boxShadow: "0 1px 6px rgba(27,51,77,0.13)",
    outline: "none",
  };

  const [previewImage, setPreviewImage] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const imageUrls = useMemo(() => {
    return (form.attachments || [])
      .filter((a) => a.__type === "images")
      .map((a) => (a.file_url ? abs(a.file_url) : a.preview_url || ""))
      .filter(Boolean);
  }, [form.attachments]);

  useEffect(() => {
    function onKey(e) {
      if (previewIndex < 0 || !imageUrls.length) return;
      if (e.key === "Escape") {
        setPreviewIndex(-1);
        setPreviewImage(null);
      }
      if (e.key === "ArrowRight") {
        const i = (previewIndex + 1) % imageUrls.length;
        setPreviewIndex(i);
        setPreviewImage(imageUrls[i]);
      }
      if (e.key === "ArrowLeft") {
        const i = (previewIndex - 1 + imageUrls.length) % imageUrls.length;
        setPreviewIndex(i);
        setPreviewImage(imageUrls[i]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewIndex, imageUrls]);

  const loadDateRef = useRef(null);
  const truckTypeRef = useRef(null);
  const adrClassRef = useRef(null);
  const cargoRefs = useRef([]);

  function handleCargoChange(idx, e) {
    const { name, value } = e.target;
    setForm((f) => {
      const arr = [...f.cargo_items];
      arr[idx] = { ...arr[idx], [name]: value };
      return { ...f, cargo_items: arr };
    });
  }
  function handleLoadingTypesChange(idx, value) {
    setForm((f) => {
      const arr = [...f.cargo_items];
      arr[idx] = { ...arr[idx], loading_types: value };
      return { ...f, cargo_items: arr };
    });
  }
  function addCargo() {
    setForm((f) => ({
      ...f,
      cargo_items: [
        ...f.cargo_items,
        {
          name: "",
          tons: "",
          volume: "",
          showDetails: false,
          packaging: "",
          pieces: "",
          length: "",
          width: "",
          height: "",
          diameter: "",
          description: "",
          loading_types: [],
        },
      ],
    }));
  }
  function removeCargo(idx) {
    setForm((f) => ({
      ...f,
      cargo_items: f.cargo_items.filter((_, i) => i !== idx),
    }));
  }
  function handleArrayChange(field, idx, value) {
    setForm((f) => {
      const arr = [...f[field]];
      let v = value;
      if (typeof v === "object" && v !== null) {
        v =
          typeof v.label === "string"
            ? v.label
            : typeof v.value === "string"
            ? v.value
            : "";
      }
      arr[idx] = v;
      return { ...f, [field]: arr };
    });
  }
  function addArrayItem(field) {
    setForm((f) => {
      const newFields = [...f[field], ""];
      let coords = [];
      if (field === "from_locations") {
        coords = [...(f.from_locations_coords || []), null];
        return {
          ...f,
          from_locations: newFields,
          from_locations_coords: coords,
        };
      }
      if (field === "to_locations") {
        coords = [...(f.to_locations_coords || []), null];
        return { ...f, to_locations: newFields, to_locations_coords: coords };
      }
      return { ...f, [field]: newFields };
    });
  }

  function removeArrayItem(field, idx) {
    setForm((f) => {
      const newFields = f[field].filter((_, i) => i !== idx);
      let coords = [];
      if (field === "from_locations") {
        coords = (f.from_locations_coords || []).filter((_, i) => i !== idx);
        return {
          ...f,
          from_locations: newFields,
          from_locations_coords: coords,
        };
      }
      if (field === "to_locations") {
        coords = (f.to_locations_coords || []).filter((_, i) => i !== idx);
        return { ...f, to_locations: newFields, to_locations_coords: coords };
      }
      return { ...f, [field]: newFields };
    });
  }

  // --- Вспомогательные для загрузки файлов/изображений ---
  const MAX_PER_KIND = 12; // <= 12 изображений и 12 файлов
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const isImageFile = (file) => /^image\//.test(file?.type || "");
  const isAllowedDoc = (file) => !isImageFile(file); // остальное — «файлы»
  const getExt = (name = "") => (name.split(".").pop() || "").toLowerCase();
  const isOversize = (f) => (f?.size || 0) > MAX_FILE_SIZE;

  async function uploadOne(file) {
    const fd = new FormData();
    fd.append("file", file);
    const resp = await fetch(api("/upload"), { method: "POST", body: fd });
    if (resp.status === 413) {
      throw new Error("FILE_TOO_LARGE");
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(t || "UPLOAD_FAILED");
    }
    return resp.json();
  }

  async function handleFile(e, kind /* "images" | "files" */) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // сброс input

    if (!files.length) return;

    // Счётчики уже выбранных
    const alreadyImages = (form.attachments || []).filter(
      (a) => a.__type === "images"
    ).length;
    const alreadyFiles = (form.attachments || []).filter(
      (a) => a.__type === "files"
    ).length;

    const willImages = kind === "images" ? files.filter(isImageFile) : [];
    const willFiles = kind === "files" ? files.filter(isAllowedDoc) : [];

    if (kind === "images" && alreadyImages + willImages.length > MAX_PER_KIND) {
      setMsg(
        t(
          "upload.limitImages",
          "Лимит изображений — {limit}. Сейчас выбрано {count}."
        )
          .replace("{limit}", String(MAX_PER_KIND))
          .replace("{count}", String(alreadyImages))
      );
      return;
    }
    if (kind === "files" && alreadyFiles + willFiles.length > MAX_PER_KIND) {
      setMsg(
        t(
          "upload.limitFiles",
          "Лимит файлов — {limit}. Сейчас выбрано {count}."
        )
          .replace("{limit}", String(MAX_PER_KIND))
          .replace("{count}", String(alreadyFiles))
      );
      return;
    }

    // Отбрасываем слишком большие
    const overs = files.filter(isOversize);
    if (overs.length) {
      setMsg(
        t(
          "upload.filesTooBig",
          "Файл(ы) слишком большие (лимит 10MB): {names}"
        ).replace("{names}", overs.map((f) => f.name).join(", "))
      );
    }
    const filtered = files.filter((f) => !isOversize(f));
    if (!filtered.length) return;

    setLoading(true);
    try {
      const uploaded = [];
      for (const f of filtered) {
        try {
          const res = await uploadOne(f);
          // res => { name, file_type, file_url }
          uploaded.push({
            __type: kind,
            name: res.name || f.name,
            file_type: res.file_type || f.type,
            file_url: res.file_url,
            ext: getExt(res.name || f.name),
          });
        } catch (err) {
          if (err?.message === "FILE_TOO_LARGE") {
            setMsg(
              t(
                "upload.fileTooLargeOne",
                "Файл слишком большой: {name} (лимит 10MB)"
              ).replace("{name}", f.name)
            );
          } else {
            setMsg(
              t("upload.cantUploadOne", "Не удалось загрузить: {name}").replace(
                "{name}",
                f.name
              )
            );
          }
        }
      }
      if (uploaded.length) {
        // Добавляем "сверху"
        setForm((prev) => ({
          ...prev,
          attachments: [...uploaded, ...(prev.attachments || [])],
        }));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  }
  function setRateType(type) {
    setForm((f) => ({ ...f, rate_type: type }));
  }
  function setPaymentScenario(key) {
    setForm((f) => ({
      ...f,
      payment_scenario: key,
      payment_days: "",
      prepay_type: "",
      prepay_amount: "",
      prepay_fuel_comment: "",
      postpay_days: "",
      payment_comment: "",
    }));
  }
  function setPrepayType(key) {
    setForm((f) => ({
      ...f,
      prepay_type: key,
      prepay_amount: "",
      prepay_fuel_comment: "",
    }));
  }

  const ADR_CLASS_INFO = {
    1: t("adr.info.1", "Класс 1: Взрывчатые вещества и изделия"),
    2: t("adr.info.2", "Класс 2: Газы"),
    3: t("adr.info.3", "Класс 3: Легковоспламеняющиеся жидкости"),
    4: t("adr.info.4", "Класс 4: Легковоспламеняющиеся твёрдые вещества"),
    5: t("adr.info.5", "Класс 5: Окисляющие вещества и органические перекиси"),
    6: t("adr.info.6", "Класс 6: Ядовитые и инфекционные вещества"),
    7: t("adr.info.7", "Класс 7: Радиоактивные материалы"),
    8: t("adr.info.8", "Класс 8: Коррозионные вещества"),
    9: t("adr.info.9", "Класс 9: Прочие опасные вещества"),
  };

  function ADRClassTooltip({ value, children }) {
    const [show, setShow] = useState(false);
    return (
      <span
        style={{ position: "relative", display: "inline-block" }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        {children}
        {show && value && ADR_CLASS_INFO[value] && (
          <span
            style={{
              position: "absolute",
              left: "105%",
              top: "50%",
              transform: "translateY(-50%)",
              background: "var(--of-surface-strong)",
              color: "#FFD600",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 14,
              fontWeight: 500,
              minWidth: 180,
              boxShadow: "0 4px 22px rgba(16,21,33,0.33)",
              zIndex: 99,
              whiteSpace: "pre-line",
            }}
          >
            {ADR_CLASS_INFO[value]}
          </span>
        )}
      </span>
    );
  }

  async function handleSubmit(e) {
    setWasTriedSubmit(true);
    e.preventDefault();
    setMsg("");

    // --- ВСТАВЬТЕ ЭТИ ЛОГИ для полной диагностики ---
    console.log("form.from_locations:", form.from_locations);
    console.log("form.to_locations:", form.to_locations);

    // Всегда массив строк (с нормализацией) — используем везде!
    const from_locations = Array.isArray(form.from_locations)
      ? form.from_locations
          .map((v) =>
            typeof v === "string"
              ? v.trim()
              : v && typeof v.label === "string"
              ? v.label.trim()
              : v && typeof v.value === "string"
              ? v.value.trim()
              : ""
          )
          .filter((v) => typeof v === "string" && v.length > 0)
      : [];

    const to_locations = Array.isArray(form.to_locations)
      ? form.to_locations
          .map((v) =>
            typeof v === "string"
              ? v.trim()
              : v && typeof v.label === "string"
              ? v.label.trim()
              : v && typeof v.value === "string"
              ? v.value.trim()
              : ""
          )
          .filter((v) => typeof v === "string" && v.length > 0)
      : [];

    // ПРОВЕРЬ ЧТО ТЫ ВИДИШЬ В КОНСОЛИ!
    console.log("Normalized from_locations:", from_locations);
    console.log("Normalized to_locations:", to_locations);

    // Связываем адреса и координаты только с валидными (т.е. не пустыми и с координатами)
    const from_pairs = from_locations
      .map((addr, i) => ({ addr, coords: form.from_locations_coords[i] }))
      .filter(
        (pair) =>
          pair.addr &&
          pair.coords &&
          typeof pair.coords.lat === "number" &&
          typeof pair.coords.lng === "number"
      );

    const to_pairs = to_locations
      .map((addr, i) => ({ addr, coords: form.to_locations_coords[i] }))
      .filter(
        (pair) =>
          pair.addr &&
          pair.coords &&
          typeof pair.coords.lat === "number" &&
          typeof pair.coords.lng === "number"
      );

    const from_locations_clean = from_pairs.map((pair) => pair.addr);
    const from_locations_coords_clean = from_pairs.map((pair) => pair.coords);

    const to_locations_clean = to_pairs.map((pair) => pair.addr);
    const to_locations_coords_clean = to_pairs.map((pair) => pair.coords);

    if (
      form.cargo_items.length === 0 ||
      form.cargo_items.some((c) => !c.name.trim() || !c.tons.trim())
    ) {
      setMsg(
        t(
          "order.err.nameAndWeight",
          "Укажите наименование и вес для каждого груза!"
        )
      );
      const errorIdx = form.cargo_items.findIndex(
        (c) => !c.name.trim() || !c.tons.trim()
      );
      if (cargoRefs.current[errorIdx]) {
        cargoRefs.current[errorIdx].scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        cargoRefs.current[errorIdx].focus({ preventScroll: true });
      }
      return;
    }

    const fromIdx = from_locations.findIndex(
      (v) => typeof v !== "string" || !v.trim()
    );
    if (fromIdx !== -1) {
      setMsg(t("order.err.fillFrom", "Заполните все поля 'Откуда'!"));
      fromRefs.current[fromIdx]?.focus();
      fromRefs.current[fromIdx]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    const toIdx = to_locations.findIndex(
      (v) => typeof v !== "string" || !v.trim()
    );
    if (toIdx !== -1) {
      setMsg(t("order.err.fillTo", "Заполните все поля 'Куда'!"));
      toRefs.current[toIdx]?.focus();
      toRefs.current[toIdx]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    if (!form.load_date) {
      setMsg(t("order.err.pickLoadDate", "Выберите дату погрузки!"));
      loadDateRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      loadDateRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!form.truck_type) {
      setMsg(t("order.err.pickLoadDate", "Выберите дату погрузки!"));
      truckTypeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setTimeout(() => truckTypeRef.current?.focus(), 400); // только если действительно надо
      return;
    }
    if (form.adr && !form.adr_class) {
      setMsg(t("order.err.pickADRClass", "Укажите класс ADR!"));
      adrClassRef.current?.focus();
      adrClassRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    // ВАЛИДАЦИЯ: Все выбранные адреса должны иметь координаты!
    if (
      !form.from_locations_coords[0] ||
      typeof form.from_locations_coords[0].lat !== "number"
    ) {
      setMsg(
        t(
          "order.err.fromSuggestOnly",
          "Погрузка: выберите адрес только из выпадающего списка!"
        )
      );
      fromRefs.current[0]?.focus?.();
      fromRefs.current[0]?.scrollIntoView?.({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    if (
      !form.to_locations_coords[0] ||
      typeof form.to_locations_coords[0].lat !== "number"
    ) {
      setMsg(
        t(
          "order.err.toSuggestOnly",
          "Выгрузка: выберите адрес только из выпадающего списка!"
        )
      );
      toRefs.current[0]?.focus?.();
      toRefs.current[0]?.scrollIntoView?.({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    // === ВАЛИДАЦИЯ: Если "Без торга", обязательна хотя бы одна цена ===
    if (
      form.rate_type === t("rate.kind.fixed", "Без торга") &&
      !form.rate_with_vat &&
      !form.rate_no_vat &&
      !form.rate_cash
    ) {
      setMsg("");
      priceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);
    const mainCargo = form.cargo_items[0] || {};
    const from_locations_coords = (form.from_locations_coords || []).filter(
      (c) => c && typeof c.lat === "number" && typeof c.lng === "number"
    );
    const to_locations_coords = (form.to_locations_coords || []).filter(
      (c) => c && typeof c.lat === "number" && typeof c.lng === "number"
    );

    // Показываем переводы, но в API отправляем канонические русские значения
    const mapLoadingToCanonical = (arr) => {
      const i18n = LOADING_TYPES_I18N || [];
      return (arr || []).map((v) => {
        const idx = i18n.indexOf(v);
        return idx >= 0 ? LOADING_TYPES[idx] : v;
      });
    };
    // Перед отправкой — только URL’ы

    const attachmentsPayload = (form.attachments || [])
      .map((a) => {
        // поддержим разные формы элемента (объект из uploadOne, либо вдруг строка-URL)
        if (typeof a === "string") {
          return { name: "", file_type: "", file_url: a };
        }
        return {
          name: a.name || a.filename || a.file?.name || "",
          file_type: a.file_type || a.type || a.file?.type || "",
          file_url: a.file_url || a.url || a.href || "",
        };
      })
      .filter((x) => !!x.file_url);
    const payload = {
      requested_rate_options: form.requested_rate_options || [],
      title: mainCargo.name || "",
      description: mainCargo.description || "",
      cargo_items: (form.cargo_items || []).map((c) => ({
        ...c,
        loading_types: mapLoadingToCanonical(c.loading_types),
      })),
      from_locations: from_locations_clean,
      from_locations_coords: from_locations_coords_clean,
      to_locations: to_locations_clean,
      to_locations_coords: to_locations_coords_clean,
      loading_types: mapLoadingToCanonical(form.loading_types),
      routes: form.routes,
      attachments: attachmentsPayload,
      gps_monitoring: form.gps_monitoring,
      truck_type: form.truck_type,
      transport_type: form.transport_type,
      load_date: form.load_date,
      unload_date: form.unload_date,
      has_customs: form.has_customs,
      customs_info: form.customs_info,
      adr: form.adr,
      adr_class: form.adr_class,
      temp_mode: form.temp_mode,
      temp_from: form.temp_from,
      temp_to: form.temp_to,
      rate_type: form.rate_type,
      rate_with_vat: form.rate_with_vat,
      rate_no_vat: form.rate_no_vat,
      rate_cash: form.rate_cash,
      rate_currency: form.rate_currency,
      rate_to_card: form.rate_to_card,
      payment_scenario: form.payment_scenario,
      payment_days: form.payment_days,
      prepay_amount: form.prepay_amount,
      truck_quantity: form.truck_quantity,
      postpay_days: form.postpay_days,
      payment_comment: form.payment_comment,
      comment: form.comment,
      phone: form.phone,
      price: form.rate_with_vat,
      username: user?.email || "",
    };
    let url = api("/orders");
    let method = "POST";
    if (order && order.id) {
      url = api(`/orders/${order.id}`);
      method = "PATCH";

      // Автоактивация после обновления даты:
      // Если заявка была неактивной, и пользователь поменял дату загрузки — активируем её.
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
      const oldD = normalizeDate(order.load_date);
      const newD = normalizeDate(form.load_date);
      if (order.is_active === false && newD && newD !== oldD) {
        // сервер принимает is_active в PATCH (см. OrderBase.is_active)
        payload.is_active = true;
      }
    }
    try {
      console.log("Payload отправляется на сервер:", payload);
      const res = await authFetchWithRefresh(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      console.log("=== Ответ res:", res);
      if (res && typeof res.text === "function") {
        const text = await res.text();
        console.log("=== Тело ответа (text):", text);
        try {
          const json = JSON.parse(text);
          console.log("=== Тело ответа (json):", json);
        } catch (e) {
          console.log("=== Не JSON, ошибка парса:", e);
        }
      } else {
        console.log("=== res не похож на Response:", res);
      }
      if (res.ok) {
        setMsg(
          order
            ? t("order.saved.updated", "Заявка обновлена!")
            : t("order.saved.created", "Заявка добавлена!")
        );
        if (!order) {
          setForm({
            cargo_items: [
              {
                name: "",
                tons: "",
                volume: "",
                showDetails: false,
                packaging: "",
                pieces: "",
                length: "",
                width: "",
                height: "",
                diameter: "",
                description: "",
                loading_types: [],
              },
            ],
            from_locations: [""],
            to_locations: [""],
            from_locations_coords: [null],
            to_locations_coords: [null],
            gps_monitoring: false,
            attachments: [],
            load_date: "",
            transport_type: "FTL",
            unload_date: "",
            truck_type: "",
            loading_types: [],
            adr: false,
            adr_class: "",
            temp_mode: false,
            temp_degrees: "",
            comment: "",
            phone: user?.phone || "",
            routes: [""],
            has_customs: false,
            customs_info: "",
            rate_type: RATE_TYPES[0],
            rate_with_vat: "",
            rate_no_vat: "",
            rate_cash: "",
            rate_currency: "₾",
            rate_to_card: false,
            payment_scenario: "unload",
            payment_days: "",
            prepay_type: "",
            prepay_amount: "",
            prepay_fuel_comment: "",
            postpay_days: "",
            payment_comment: "",
          });

          // --- ВСТАВЬ ЭТУ СТРОЧКУ для перехода в профиль (раздел заявки):
          router.push("/profile?orders=1");
          return;
        }
        if (onSaved) onSaved();
      } else {
        setMsg(
          order
            ? t("order.err.updateFailed", "Ошибка при обновлении заявки")
            : t("order.err.createFailed", "Ошибка при добавлении заявки")
        );
      }
    } catch (err) {
      console.log("=== ERROR CATCH:", err);
      setMsg(t("error.network", "Ошибка соединения с сервером"));
    }
    setLoading(false);
  }

  return (
    <form
      id="orderform"
      className="form-root mobile-form"
      data-mobile={isMobile ? "1" : undefined}
      onSubmit={handleSubmit}
      style={{
        maxWidth: isMobile ? "100%" : 820,
        width: "100%",
        margin: "0 auto",
        padding: isMobile ? "0 10px 70px" : "0",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
      autoComplete="off"
    >
      {/* --- Маршрут --- */}
      <div
        className="order-card"
        style={{
          ...section,
          padding: 20,
          marginTop: 10,
        }}
      >
        <div
          className="order-title"
          style={{
            fontWeight: 700,
            fontSize: 17,
            color: "var(--accent)",
            marginBottom: 6,
          }}
        >
          {t("of.section.route", "Маршрут")}
        </div>
        <div
          className="stack-mobile"
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ color: "var(--of-text-muted)", fontWeight: 500 }}>
              {t("common.from", "Погрузка")} *
            </label>
            {form.from_locations.map((item, idx) => (
              <div
                key={idx}
                className="stack-mobile-inline"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 4,
                }}
              >
                <LocationAutocomplete
                  lang={UI_LANG}
                  scope="settlement"
                  ref={(el) => (fromRefs.current[idx] = el)}
                  value={item}
                  placeholder={t(
                    "common.startTypingCountryCity",
                    "Начните вводить страну или город."
                  )}
                  onFocus={() => setFromFocused(true)}
                  onBlur={() => setFromFocused(false)}
                  onSelect={([lat, lng], displayName, sug) => {
                    handleArrayChange("from_locations", idx, displayName);
                    setForm((f) => {
                      const coords = [...(f.from_locations_coords || [])];
                      if (lat !== undefined && lng !== undefined) {
                        coords[idx] = { lat, lng };
                      } else {
                        coords[idx] = null;
                      }
                      const ids = Array.isArray(f.from_place_ids)
                        ? [...f.from_place_ids]
                        : [];
                      return {
                        ...f,
                        from_locations_coords: coords,
                        from_place_ids: ids,
                      };
                    });
                    upsertPlaceFromSuggest(sug, displayName).then((placeId) => {
                      if (!placeId) return;
                      setForm((f) => {
                        const ids = Array.isArray(f.from_place_ids)
                          ? [...f.from_place_ids]
                          : [];
                        ids[idx] = placeId;
                        return { ...f, from_place_ids: ids };
                      });
                    });
                  }}
                  onInputChange={(text) => {
                    if (!text)
                      setForm((f) => {
                        const arr = [...(f.from_locations_coords || [])];
                        arr[idx] = null;
                        const ids = Array.isArray(f.from_place_ids)
                          ? [...f.from_place_ids]
                          : [];
                        ids[idx] = null;
                        return {
                          ...f,
                          from_locations_coords: arr,
                          from_place_ids: ids,
                        };
                      });
                  }}
                  style={getInputStyle({
                    error: !form.from_locations_coords[idx] && wasTriedSubmit,
                    focused: fromFocused,
                  })}
                />
                {!form.from_locations_coords[idx] && wasTriedSubmit && (
                  <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                    {t(
                      "common.selectAddressFromDropdown",
                      "Выберите адрес из выпадающего списка!"
                    )}
                  </div>
                )}
                {form.from_locations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeArrayItem("from_locations", idx)}
                    style={{
                      color: "var(--accent)",
                      background: "none",
                      border: "none",
                      fontSize: 19,
                      cursor: "pointer",
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    –
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => addArrayItem("from_locations")}
              style={{
                color: "var(--accent)",
                background: "none",
                border: "none",
                fontSize: 16,
                cursor: "pointer",
                padding: 0,
                marginTop: 3,
              }}
            >
              + {t("order.addPickup", "Место погрузки")}
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ color: "var(--of-text-muted)", fontWeight: 500 }}>
              {t("common.to", "Выгрузка")} *
            </label>
            {form.to_locations.map((item, idx) => (
              <div
                key={idx}
                className="stack-mobile-inline"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 4,
                }}
              >
                <LocationAutocomplete
                  lang={UI_LANG}
                  scope="settlement"
                  ref={(el) => (toRefs.current[idx] = el)}
                  value={item}
                  placeholder={t(
                    "common.startTypingCountryCity",
                    "Начните вводить страну или город."
                  )}
                  onFocus={() => setToFocused(true)}
                  onBlur={() => setToFocused(false)}
                  onSelect={([lat, lng], displayName, sug) => {
                    handleArrayChange("to_locations", idx, displayName);
                    setForm((f) => {
                      const coords = [...(f.to_locations_coords || [])];
                      if (lat !== undefined && lng !== undefined) {
                        coords[idx] = { lat, lng };
                      } else {
                        coords[idx] = null;
                      }
                      const ids = Array.isArray(f.to_place_ids)
                        ? [...f.to_place_ids]
                        : [];
                      return {
                        ...f,
                        to_locations_coords: coords,
                        to_place_ids: ids,
                      };
                    });
                    upsertPlaceFromSuggest(sug, displayName).then((placeId) => {
                      if (!placeId) return;
                      setForm((f) => {
                        const ids = Array.isArray(f.to_place_ids)
                          ? [...f.to_place_ids]
                          : [];
                        ids[idx] = placeId;
                        return { ...f, to_place_ids: ids };
                      });
                    });
                  }}
                  onInputChange={(text) => {
                    if (!text)
                      setForm((f) => {
                        const arr = [...(f.to_locations_coords || [])];
                        arr[idx] = null;
                        const ids = Array.isArray(f.to_place_ids)
                          ? [...f.to_place_ids]
                          : [];
                        ids[idx] = null;
                        return {
                          ...f,
                          to_locations_coords: arr,
                          to_place_ids: ids,
                        };
                      });
                  }}
                  style={getInputStyle({
                    error: !form.to_locations_coords[idx] && wasTriedSubmit,
                    focused: toFocused,
                  })}
                />
                {!form.to_locations_coords[idx] && wasTriedSubmit && (
                  <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                    {t(
                      "common.selectAddressFromDropdown",
                      "Выберите адрес из выпадающего списка!"
                    )}
                  </div>
                )}
                {form.to_locations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeArrayItem("to_locations", idx)}
                    style={{
                      color: "var(--accent)",
                      background: "none",
                      border: "none",
                      fontSize: 19,
                      cursor: "pointer",
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    –
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => addArrayItem("to_locations")}
              style={{
                color: "var(--accent)",
                background: "none",
                border: "none",
                fontSize: 16,
                cursor: "pointer",
                padding: 0,
                marginTop: 3,
              }}
            >
              + {t("order.addDropoff", "Место выгрузки")}
            </button>
          </div>
        </div>

        <div
          className="stack-mobile"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 150 }}>
            <DateInput
              ref={loadDateRef}
              label={t("order.loadDate", "Дата погрузки")}
              required
              name="load_date"
              value={form.load_date}
              onFocus={() => setLoadDateFocused(true)}
              onBlur={() => setLoadDateFocused(false)}
              onChange={(v) => setForm((f) => ({ ...f, load_date: v }))}
              style={{
                background: "var(--of-surface-strong)",
                marginTop: 2,
              }}
              inputStyle={{
                borderRadius: 7,
                border:
                  !form.load_date && wasTriedSubmit
                    ? "2px solid #ffd600"
                    : "1.5px solid var(--of-border)",
                background: "var(--of-surface-strong)",
                color: "var(--of-text-strong)",
                padding: "8px 13px",
                fontSize: 15,
                outline: "none",
                width: "100%",
                transition: "border .2s",
              }}
            />
            {!form.load_date && wasTriedSubmit && (
              <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                {t("order.selectLoadDate", "Выберите дату погрузки!")}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <DateInput
              label={t("order.unloadDate", "Дата разгрузки")}
              name="unload_date"
              value={form.unload_date}
              onChange={(v) => setForm((f) => ({ ...f, unload_date: v }))}
              style={{
                background: "var(--of-surface-strong)",
                marginTop: 2,
              }}
              inputStyle={{
                borderRadius: 7,
                border: "none",
                background: "var(--of-surface-strong)",
                color: "var(--of-text-strong)",
                padding: "8px 13px",
                fontSize: 15,
                outline: "none",
                width: "100%",
                transition: "border .2s",
              }}
            />
          </div>
        </div>
      </div>

      {/* --- Грузы --- */}
      <div
        className="order-card"
        style={{
          padding: 20,
          marginTop: 10,
          background: "rgba(28,38,65,0.93)",
          borderRadius: 18,
          border: "none",
          boxShadow: "var(--of-shadow)",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 17,
            color: "var(--accent)",
            marginBottom: 6,
          }}
        >
          {t("cargo.singular", "Груз")}
        </div>
        <div
          className="stack-mobile chip-row"
          style={{ display: "flex", gap: 10, marginBottom: 14 }}
        >
          <button
            type="button"
            style={{
              background:
                form.transport_type === "LTL"
                  ? "var(--accent)"
                  : "var(--background)",
              color:
                form.transport_type === "LTL" ? "#fff" : "var(--of-text-muted)",
              border: "1.5px solid var(--accent)",
              borderRadius: 8,
              fontWeight: 700,
              padding: "9px 22px",
              fontSize: 16,
              cursor: "pointer",
              transition: "none",
              boxShadow: "none",
            }}
            onClick={() => setForm((f) => ({ ...f, transport_type: "LTL" }))}
          >
            {t("cargo.type.ltl", "Сборный груз (LTL)")}
          </button>
          <button
            type="button"
            style={{
              background:
                form.transport_type === "FTL"
                  ? "var(--accent)"
                  : "var(--background)",
              color:
                form.transport_type === "FTL" ? "#fff" : "var(--of-text-muted)",
              border: "1.5px solid var(--accent)",
              borderRadius: 8,
              fontWeight: 700,
              padding: "9px 22px",
              fontSize: 16,
              cursor: "pointer",
              transition: "background .12s, color .12s, border-color .12s",
              boxShadow: "none",
            }}
            onClick={() => setForm((f) => ({ ...f, transport_type: "FTL" }))}
          >
            {t("cargo.type.ftl", "Целая машина (FTL)")}
          </button>
        </div>
        {form.cargo_items.map((cargo, idx) => (
          <div
            key={idx}
            className="order-card"
            style={{
              padding: 20,
              marginTop: 10,
              background: "rgba(28,38,65,0.93)",
              borderRadius: 18,
              border: "none",
              boxShadow: "var(--of-shadow)",
            }}
          >
            {/* --- Основные поля --- */}
            <div
              className="stack-mobile"
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <input
                ref={(el) => (cargoRefs.current[idx] = el)}
                name="name"
                value={cargo.name}
                onChange={(e) => handleCargoChange(idx, e)}
                style={{
                  flex: 2,
                  minWidth: 120,
                  borderRadius: 7,
                  border:
                    wasTriedSubmit && !cargo.name.trim()
                      ? "2px solid #ffd600"
                      : "1.5px solid var(--of-border)",
                  background: "var(--of-surface-strong)",
                  color: "var(--of-text-strong)",
                  padding: "8px 13px",
                  fontSize: 15,
                  marginTop: 2,
                  outline: "none",
                  transition: "border .2s",
                }}
                placeholder={t("cargo.name.required", "Наименование *")}
              />
              {wasTriedSubmit && !cargo.name.trim() && (
                <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                  {t("cargo.name.requiredMsg", "Укажите наименование груза!")}
                </div>
              )}
              <input
                name="tons"
                value={cargo.tons}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                onChange={(e) => handleCargoChange(idx, e)}
                style={{
                  flex: 1,
                  minWidth: 80,
                  borderRadius: 7,
                  border:
                    wasTriedSubmit && !cargo.tons.trim()
                      ? "2px solid #ffd600"
                      : "1.5px solid var(--of-border)",
                  background: "var(--of-surface-strong)",
                  color: "var(--of-text-strong)",
                  padding: "8px 13px",
                  fontSize: 15,
                  marginTop: 2,
                  outline: "none",
                  transition: "border .2s",
                }}
                placeholder={t("cargo.weight.required", "Вес, т *")}
              />
              {wasTriedSubmit && !cargo.tons.trim() && (
                <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                  {t("cargo.weight.requiredMsg", "Укажите вес груза!")}
                </div>
              )}
              <input
                name="volume"
                value={cargo.volume}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                onChange={(e) => handleCargoChange(idx, e)}
                style={{
                  flex: 1,
                  minWidth: 80,
                  borderRadius: 7,
                  border: "none",
                  background: "var(--of-surface-strong)",
                  color: "var(--of-text-strong)",
                  padding: "8px 13px",
                  fontSize: 15,
                  marginTop: 2,
                  outline: "none",
                }}
                placeholder={t("cargo.volume.m3", "Объем, м³")}
              />
              {form.cargo_items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCargo(idx)}
                  style={{
                    marginLeft: 10,
                    background: "var(--of-surface-strong)",
                    border: "1.5px solid var(--accent)",
                    color: "var(--accent)",
                    borderRadius: 6,
                    padding: "2px 12px",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                    transition: "none",
                  }}
                >
                  –
                </button>
              )}
            </div>
            {/* --- Кнопка и детали --- */}
            <div style={{ marginTop: 3 }}>
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({
                    ...f,
                    cargo_items: f.cargo_items.map((item, i) =>
                      i === idx
                        ? { ...item, showDetails: !item.showDetails ?? true }
                        : item
                    ),
                  }));
                }}
                style={{
                  background: "none",
                  color: "var(--accent)",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 2,
                  marginLeft: -2,
                  padding: 0,
                  boxShadow: "none",
                  outline: "none",
                }}
              >
                {cargo.showDetails
                  ? t("cargo.details.less", "Меньше деталей")
                  : t("cargo.details.more", "Больше деталей")}
              </button>
            </div>
            {/* --- Детальные поля (видны только если showDetails) --- */}
            {cargo.showDetails && (
              <div style={{ marginTop: 8 }}>
                <div
                  className="stack-mobile"
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 5,
                  }}
                >
                  <select
                    name="packaging"
                    value={cargo.packaging}
                    onChange={(e) => handleCargoChange(idx, e)}
                    style={{
                      flex: 1,
                      minWidth: 95,
                      borderRadius: 7,
                      border: "none",
                      background: "var(--of-surface-strong)",
                      color: "var(--of-text-strong)",
                      padding: "8px 13px",
                      fontSize: 15,
                      marginTop: 2,
                      outline: "none",
                    }}
                  >
                    <option value="">{t("cargo.packaging", "Упаковка")}</option>
                    {PACKAGING_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <input
                    name="pieces"
                    value={cargo.pieces}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    onChange={(e) => handleCargoChange(idx, e)}
                    style={{
                      flex: 1,
                      minWidth: 80,
                      borderRadius: 7,
                      border: "none",
                      background: "var(--of-surface-strong)",
                      color: "var(--of-text-strong)",
                      padding: "8px 13px",
                      fontSize: 15,
                      marginTop: 2,
                      outline: "none",
                    }}
                    placeholder={t("cargo.pieces", "Мест")}
                  />
                  <input
                    name="length"
                    value={cargo.length}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    onChange={(e) => handleCargoChange(idx, e)}
                    style={{
                      flex: 1,
                      minWidth: 90,
                      borderRadius: 7,
                      border: "none",
                      background: "var(--of-surface-strong)",
                      color: "var(--of-text-strong)",
                      padding: "8px 13px",
                      fontSize: 15,
                      marginTop: 2,
                      outline: "none",
                    }}
                    placeholder={t("dimensions.length.m", "Длина, м")}
                  />
                  <input
                    name="width"
                    value={cargo.width}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    onChange={(e) => handleCargoChange(idx, e)}
                    style={{
                      flex: 1,
                      minWidth: 90,
                      borderRadius: 7,
                      border: "none",
                      background: "var(--of-surface-strong)",
                      color: "var(--of-text-strong)",
                      padding: "8px 13px",
                      fontSize: 15,
                      marginTop: 2,
                      outline: "none",
                    }}
                    placeholder={t("dimensions.width.m", "Ширина, м")}
                  />
                  <input
                    name="height"
                    value={cargo.height}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    onChange={(e) => handleCargoChange(idx, e)}
                    style={{
                      flex: 1,
                      minWidth: 90,
                      borderRadius: 7,
                      border: "none",
                      background: "var(--of-surface-strong)",
                      color: "var(--of-text-strong)",
                      padding: "8px 13px",
                      fontSize: 15,
                      marginTop: 2,
                      outline: "none",
                    }}
                    placeholder={t("dimensions.height.m", "Высота, м")}
                  />
                  <input
                    name="diameter"
                    value={cargo.diameter}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    onChange={(e) => handleCargoChange(idx, e)}
                    style={{
                      flex: 1,
                      minWidth: 90,
                      borderRadius: 7,
                      border: "none",
                      background: "var(--of-surface-strong)",
                      color: "var(--of-text-strong)",
                      padding: "8px 13px",
                      fontSize: 15,
                      marginTop: 2,
                      outline: "none",
                    }}
                    placeholder={t("dimensions.diameter.m", "Диаметр, м")}
                  />
                </div>
                <div>
                  <textarea
                    name="description"
                    value={cargo.description}
                    onChange={(e) => handleCargoChange(idx, e)}
                    style={{
                      width: "100%",
                      minHeight: 30,
                      borderRadius: 7,
                      border: "none",
                      background: "var(--of-surface-strong)",
                      color: "var(--of-text-strong)",
                      padding: "8px 13px",
                      fontSize: 15,
                      marginTop: 2,
                      resize: "vertical",
                      outline: "none",
                    }}
                    placeholder={t("common.description", "Описание")}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* --- Транспорт --- */}
      <div
        className="order-card"
        style={{
          padding: 20,
          marginTop: 10,
          background: "rgba(28,38,65,0.93)",
          borderRadius: 18,
          border: "none",
          boxShadow: "var(--of-shadow)",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 17,
            color: "var(--accent)",
            marginBottom: 6,
          }}
        >
          {t("of.section.transport", "Транспорт")}
        </div>
        <div
          className="stack-mobile"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: 2, minWidth: 140 }}>
            <label
              style={{
                color: "var(--of-text-muted)",
                fontWeight: 500,
                marginBottom: 3,
                display: "block",
              }}
            >
              {t("order.truckBodyType", "Тип кузова")} *
            </label>
            <div
              ref={truckTypeRef}
              tabIndex={-1}
              onFocus={() => setTruckTypeFocused(true)}
              onBlur={() => setTruckTypeFocused(false)}
              style={{
                border:
                  !form.truck_type && wasTriedSubmit
                    ? "2px solid #ffd600"
                    : "1.5px solid var(--of-border)",
                borderRadius: 7,
                background: "var(--of-surface-strong)",
                padding: 0,
                transition: "border .2s",
                marginTop: 2,
                boxSizing: "border-box", // <--- добавь эту строчку!
              }}
            >
              <TruckTypeDropdown
                value={form.truck_type}
                onChange={(val) => setForm((f) => ({ ...f, truck_type: val }))}
                options={BODY_TYPES}
                wasTriedSubmit={wasTriedSubmit}
              />
            </div>
            {!form.truck_type && wasTriedSubmit && (
              <div style={{ color: "#ffd600", fontSize: 13, marginTop: 2 }}>
                {t("order.pickBodyType", "Выберите тип кузова!")}
              </div>
            )}
          </div>
          <div style={{ flex: 2, minWidth: 170 }}>
            <label
              style={{
                color: "var(--of-text-muted)",
                fontWeight: 500,
                marginBottom: 3,
                display: "block",
              }}
            >
              {t("order.loadingTypes", "Вид(ы) загрузки")}
            </label>
            <LoadingTypeDropdown
              value={form.loading_types}
              onChange={(value) =>
                setForm((f) => ({ ...f, loading_types: value }))
              }
              options={LOADING_TYPES_I18N}
            />
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <label
              style={{
                color: "var(--of-text-muted)",
                fontWeight: 500,
                marginBottom: 3,
                display: "block",
              }}
            >
              {t("order.truckCount", "Кол-во машин")}
            </label>
            <input
              type="number"
              inputMode="decimal"
              name="truck_quantity"
              value={form.truck_quantity || ""}
              min={1}
              max={99}
              onChange={handleChange}
              placeholder="1"
              style={{
                width: "100%",
                borderRadius: 7,
                border: "none",
                padding: "8px 13px",
                fontSize: 15,
                marginTop: 2,
                background: "var(--of-surface-strong)",
                color: "var(--accent)",
                outline: "none",
              }}
            />
          </div>
        </div>
        <div
          className="stack-mobile"
          style={{
            display: "flex",
            gap: 24,
            margin: "12px 0 0 0",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div
            className="stack-mobile-inline"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <label style={{ color: "var(--of-text-muted)", fontWeight: 500 }}>
              {t("adr.short", "ADR")}
            </label>
            <input
              type="checkbox"
              name="adr"
              checked={form.adr}
              onChange={handleChange}
              style={{
                width: 18,
                height: 18,
                accentColor: "var(--accent)",
                margin: 0,
              }}
            />
            {form.adr && (
              <>
                <label
                  style={{
                    color: "var(--of-text-muted)",
                    fontWeight: 500,
                    marginLeft: 10,
                  }}
                >
                  {t("adr.class", "Класс")}
                </label>
                <div
                  style={{
                    minWidth: 60,
                    display: "inline-block",
                    verticalAlign: "middle",
                  }}
                >
                  <ADRClassTooltip value={form.adr_class}>
                    <CustomSelect
                      value={form.adr_class}
                      onChange={(v) => setForm((f) => ({ ...f, adr_class: v }))}
                      /* те же цвета меню, что и у селектора валюты */
                      menuStyle={{
                        background: "var(--of-surface-strong)",
                        border: "1.5px solid var(--accent)",
                        borderRadius: 9,
                      }}
                      options={[
                        "1",
                        "2",
                        "3",
                        "4",
                        "5",
                        "6",
                        "7",
                        "8",
                        "9",
                      ].map((num) => ({ value: num, label: num }))}
                      style={{ width: 90 }}
                      name="adr_class"
                      placeholder={t("adr.class", "Класс")}
                      inputRef={adrClassRef}
                    />
                  </ADRClassTooltip>
                </div>
              </>
            )}
          </div>
          <div
            className="stack-mobile-inline"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <label style={{ color: "var(--of-text-muted)", fontWeight: 500 }}>
              {t("temp.mode", "Темп. режим")}
            </label>
            <input
              type="checkbox"
              name="temp_mode"
              checked={form.temp_mode}
              onChange={handleChange}
              style={{
                width: 18,
                height: 18,
                accentColor: "var(--accent)",
                margin: 0,
              }}
            />
            {form.temp_mode && (
              <div
                className="stack-mobile-inline"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginLeft: 7,
                }}
              >
                <input
                  type="number"
                  inputMode="decimal"
                  name="temp_from"
                  value={form.temp_from ?? ""}
                  onChange={handleChange}
                  style={{
                    width: 60,
                    borderRadius: 7,
                    border: "none",
                    background: "var(--of-surface-strong)",
                    color: "var(--of-text-strong)",
                    padding: "6px 8px",
                    fontSize: 15,
                    outline: "none",
                  }}
                  placeholder={t("temp.from", "от")}
                />
                <span style={{ color: "var(--of-text-muted)" }}>—</span>
                <input
                  type="number"
                  inputMode="decimal"
                  name="temp_to"
                  value={form.temp_to ?? ""}
                  onChange={handleChange}
                  style={{
                    width: 60,
                    borderRadius: 7,
                    border: "none",
                    background: "var(--of-surface-strong)",
                    color: "var(--of-text-strong)",
                    padding: "6px 8px",
                    fontSize: 15,
                    outline: "none",
                  }}
                  placeholder={t("temp.to", "до")}
                />
                <span style={{ color: "var(--of-text-soft)" }}>°C</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- СТАВКА (БЛОК) --- */}
      <div
        className="order-card"
        style={{
          padding: 20,
          marginTop: 10,
          background: "rgba(28,38,65,0.93)",
          borderRadius: 18,
          border: "none",
          boxShadow: "var(--of-shadow)",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            marginBottom: 10,
            color: "var(--accent)",
            fontSize: 17,
          }}
        >
          {t("order.rateSection", "Ставка")}
        </div>
        <div
          className="stack-mobile chip-row"
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          {RATE_TYPES.map((opt) => (
            <button
              key={opt}
              type="button"
              style={{
                fontWeight: 600,
                padding: "7px 16px",
                borderRadius: 8,
                border:
                  form.rate_type === opt
                    ? "2px solid var(--accent)"
                    : "1.5px solid var(--of-border)",
                background:
                  form.rate_type === opt
                    ? "var(--accent-bg, #FFD6001A)"
                    : "transparent",
                color:
                  form.rate_type === opt
                    ? "var(--accent)"
                    : "var(--of-text-muted)",
                cursor: "pointer",
                fontSize: 15,
                transition: "border .2s, color .2s",
              }}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  rate_type: opt,
                  // не ломаем старую систему: очищаем блок только когда выбран «Запрос»
                  requested_rate_options:
                    opt === RATE_TYPES[2] ? f.requested_rate_options : [],
                }))
              }
            >
              {opt}
            </button>
          ))}
        </div>
        {form.rate_type === RATE_TYPES[2] ? (
          <div
            className="stack-mobile chip-row"
            style={{ display: "flex", gap: 9, marginBottom: 8 }}
          >
            {[
              ["С НДС, безнал", t("rate.withVat_cashless", "С НДС, безнал")],
              ["Без НДС, безнал", t("rate.noVat_cashless", "Без НДС, безнал")],
              ["Наличными", t("rate.cash", "Наличными")],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setForm((f) => {
                    const exists = f.requested_rate_options?.includes(value);
                    return {
                      ...f,
                      requested_rate_options: exists
                        ? f.requested_rate_options.filter((o) => o !== value)
                        : [...(f.requested_rate_options || []), value],
                    };
                  })
                }
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: form.requested_rate_options?.includes(value)
                    ? "2px solid var(--accent)"
                    : "1.5px solid var(--of-border)",
                  background: form.requested_rate_options?.includes(value)
                    ? "var(--accent)"
                    : "var(--of-surface-strong)",
                  color: form.requested_rate_options?.includes(value)
                    ? "#161616"
                    : "var(--of-text-muted)",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                  minWidth: 60,
                  boxShadow: "none",
                  outline: "none",
                  transition: "all .14s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div ref={priceRef}>
            <div
              className="stack-mobile"
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 2,
                alignItems: "center",
                borderRadius: 9,
                border:
                  form.rate_type === "Без торга" &&
                  wasTriedSubmit &&
                  !form.rate_with_vat &&
                  !form.rate_no_vat &&
                  !form.rate_cash
                    ? "2px solid #ffd600"
                    : "none",
                boxShadow:
                  form.rate_type === "Без торга" &&
                  wasTriedSubmit &&
                  !form.rate_with_vat &&
                  !form.rate_no_vat &&
                  !form.rate_cash
                    ? "0 0 0 2px #ffd60044"
                    : "none",
                padding: 4,
                transition: "border .2s, box-shadow .2s",
              }}
            >
              <input
                placeholder={t("rate.withVat_cashless", "С НДС, безнал")}
                style={{
                  flex: 1,
                  borderRadius: 7,
                  border:
                    form.rate_type === "Без торга" &&
                    wasTriedSubmit &&
                    !form.rate_with_vat &&
                    !form.rate_no_vat &&
                    !form.rate_cash
                      ? "2px solid #ffd600"
                      : "1.5px solid var(--of-border)",
                  padding: "8px 13px",
                  fontSize: 15,
                  background: "var(--of-surface-strong)",
                  color: "var(--of-text-strong)",
                  outline: "none",
                  minWidth: 0,
                  transition: "border .2s",
                }}
                name="rate_with_vat"
                value={form.rate_with_vat}
                onChange={handleChange}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
              />
              <input
                placeholder={t("rate.noVat_cashless", "Без НДС, безнал")}
                style={{
                  flex: 1,
                  borderRadius: 7,
                  border:
                    form.rate_type === "Без торга" &&
                    wasTriedSubmit &&
                    !form.rate_with_vat &&
                    !form.rate_no_vat &&
                    !form.rate_cash
                      ? "2px solid #ffd600"
                      : "1.5px solid var(--of-border)",
                  padding: "8px 13px",
                  fontSize: 15,
                  background: "var(--of-surface-strong)",
                  color: "var(--of-text-strong)",
                  outline: "none",
                  minWidth: 0,
                  transition: "border .2s",
                }}
                name="rate_no_vat"
                value={form.rate_no_vat}
                onChange={handleChange}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
              />
              <input
                placeholder={t("rate.cash", "Наличными")}
                style={{
                  flex: 1,
                  borderRadius: 7,
                  border:
                    form.rate_type === "Без торга" &&
                    wasTriedSubmit &&
                    !form.rate_with_vat &&
                    !form.rate_no_vat &&
                    !form.rate_cash
                      ? "2px solid #ffd600"
                      : "1.5px solid var(--of-border)",
                  padding: "8px 13px",
                  fontSize: 15,
                  background: "var(--of-surface-strong)",
                  color: "var(--of-text-strong)",
                  outline: "none",
                  minWidth: 0,
                  transition: "border .2s",
                }}
                name="rate_cash"
                value={form.rate_cash}
                onChange={handleChange}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
              />
              <div style={{ marginLeft: 10, minWidth: 85, flexShrink: 0 }}>
                <CustomSelect
                  value={form.rate_currency}
                  onChange={(v) => setForm((f) => ({ ...f, rate_currency: v }))}
                  options={CURRENCIES.map((cur) => ({
                    value: cur,
                    label: cur,
                  }))}
                  name="rate_currency"
                  placeholder={t("common.currency", "Валюта")}
                  style={{
                    background: form.rate_currency
                      ? "var(--accent)"
                      : "var(--of-surface-strong)",
                    color: form.rate_currency
                      ? "#161616"
                      : "var(--of-text-strong)",
                    border: form.rate_currency
                      ? "2px solid var(--accent)"
                      : "1.5px solid var(--of-border)",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 15,
                    height: 40,
                    minHeight: 40,
                    minWidth: 110,
                    padding: "9px 14px",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(15,22,41,0.5)",
                    outline: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background .17s, color .17s, border .17s",
                  }}
                  menuStyle={{
                    background: "var(--of-surface-strong)",
                    border: "1.5px solid var(--accent)",
                    borderRadius: 9,
                  }}
                />
              </div>
            </div>
            {/* Сообщение об ошибке прямо под полями */}
            {form.rate_type === "Без торга" &&
              wasTriedSubmit &&
              !form.rate_with_vat &&
              !form.rate_no_vat &&
              !form.rate_cash && (
                <div
                  style={{
                    color: "#ffd600",
                    fontSize: 15,
                    marginTop: 5,
                    fontWeight: 500,
                  }}
                >
                  {t(
                    "rate.validation.oneField",
                    "Укажите цену хотя бы в одном из полей: 'С НДС, безнал', 'Без НДС, безнал' или 'Наличными'."
                  )}
                </div>
              )}
          </div>
        )}

        {/* --- БЛОК "Условия оплаты" --- */}
        <div
          style={{
            borderRadius: 12,
            background: "transparent",
            border: "none",
            marginTop: 10,
            marginBottom: 6,
            padding: "15px 10px 12px 10px",
          }}
        >
          <div
            style={{
              color: "var(--accent)",
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 8,
            }}
          >
            {t("payment.terms", "Условия оплаты:")}
          </div>
          <div
            className="stack-mobile chip-row"
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            {PAYMENT_SCENARIOS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPaymentScenario(opt.key)}
                style={{
                  borderRadius: 8,
                  padding: "6px 16px",
                  border:
                    form.payment_scenario === opt.key
                      ? "2px solid var(--accent)"
                      : "1.5px solid var(--of-border)",
                  background:
                    form.payment_scenario === opt.key
                      ? "var(--accent-bg, #FFD6001A)"
                      : "transparent",
                  color:
                    form.payment_scenario === opt.key
                      ? "var(--accent)"
                      : "var(--of-text-muted)",
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                  marginRight: 3,
                  transition: "border .2s, color .2s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* --- Сценарий: Через X дней --- */}
          {form.payment_scenario === "after_x_days" && (
            <div
              className="stack-mobile-inline"
              style={{
                marginBottom: 6,
                marginLeft: 2,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{t("payment.afterPrefix", "Через")}</span>
              <input
                type="number"
                inputMode="decimal"
                name="payment_days"
                placeholder={t("payment.howManyDays", "Сколько дней?")}
                value={form.payment_days || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payment_days: e.target.value }))
                }
                style={{
                  borderRadius: 7,
                  border: "1.2px solid var(--accent)",
                  padding: "5px 12px",
                  fontSize: 15,
                  minWidth: 90,
                  marginLeft: 4,
                }}
              />
              <span>{t("payment.afterSuffix", "дней после выгрузки")}</span>
            </div>
          )}

          {/* --- Сценарий: Предоплата --- */}
          {form.payment_scenario === "prepay" && (
            <>
              <div
                className="stack-mobile-inline"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 7,
                }}
              >
                <span>
                  {t("payment.prepayAmount", "Сумма/процент предоплаты:")}
                </span>
                <input
                  type="text"
                  name="prepay_amount"
                  placeholder="30% или 100000"
                  value={form.prepay_amount}
                  onChange={handleChange}
                  style={{
                    borderRadius: 7,
                    border: "1.2px solid var(--accent)",
                    padding: "5px 12px",
                    fontSize: 15,
                    minWidth: 65,
                  }}
                />
              </div>
              <div
                className="stack-mobile-inline"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginBottom: 7,
                }}
              >
                <span>{t("payment.balanceAfter", "Остаток через")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  name="postpay_days"
                  placeholder={t("payment.howManyDays", "Сколько дней?")}
                  value={form.postpay_days || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, postpay_days: e.target.value }))
                  }
                  style={{
                    borderRadius: 7,
                    border: "1.2px solid var(--accent)",
                    padding: "5px 12px",
                    fontSize: 15,
                    minWidth: 90,
                    marginLeft: 4,
                  }}
                />
                <span>{t("payment.afterSuffix", "дней после выгрузки")}</span>
              </div>
            </>
          )}

          {/* --- Сценарий: По договору --- */}
          {form.payment_scenario === "contract" && (
            <div style={{ marginTop: 4 }}>
              <input
                name="payment_comment"
                value={form.payment_comment}
                onChange={handleChange}
                placeholder={t(
                  "payment.contractComment",
                  "Комментарий к оплате (по договору)"
                )}
                style={{
                  borderRadius: 7,
                  border: "1.2px solid var(--accent)",
                  padding: "5px 10px",
                  fontSize: 15,
                  width: "100%",
                  minWidth: 120,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* --- Контакты и цена --- */}
      <div
        className="order-card"
        style={{
          padding: 20,
          marginTop: 10,
          background: "rgba(28,38,65,0.93)",
          borderRadius: 18,
          border: "none",
          boxShadow: "var(--of-shadow)",
        }}
      >
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={{ color: "var(--of-text-muted)", fontWeight: 500 }}>
            {t("contacts.phone", "Телефон")} *
          </label>
          <input
            name="phone"
            placeholder="+995..."
            value={form.phone}
            onChange={handleChange}
            style={{
              width: "100%",
              borderRadius: 7,
              border: "none",
              padding: "8px 13px",
              fontSize: 15,
              marginTop: 2,
              background: "var(--of-surface-strong)",
              color: "#fff",
            }}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
      </div>

      {/* --- Комментарий --- */}
      <div
        style={{
          marginTop: 10,
          background: "var(--of-surface-strong)",
          borderRadius: 12,
          border: "none",
          padding: "15px 18px 12px 18px",
        }}
      >
        <label style={{ color: "var(--of-text-muted)", fontWeight: 500 }}>
          {t("comment.title", "Комментарий")}
        </label>
        <textarea
          name="comment"
          placeholder={t(
            "comment.placeholder",
            "Любая доп. информация (по желанию)"
          )}
          value={form.comment}
          onChange={handleChange}
          style={{
            width: "100%",
            minHeight: 54,
            borderRadius: 7,
            border: "none",
            padding: "8px 13px",
            fontSize: 15,
            marginTop: 2,
            resize: "vertical",
            background: "var(--of-surface-strong)",
            color: "#fff",
          }}
        />
      </div>

      {/* --- GPS-мониторинг --- */}
      <div
        className="order-card"
        style={{
          padding: 20,
          marginTop: 10,
          background: "rgba(28,38,65,0.93)",
          borderRadius: 18,
          border: "none",
          boxShadow: "var(--of-shadow)",
        }}
      >
        <input
          type="checkbox"
          id="gps_monitoring"
          name="gps_monitoring"
          checked={form.gps_monitoring}
          onChange={handleChange}
          style={{ width: 18, height: 18, marginTop: 2 }}
        />
        <label
          htmlFor="gps"
          style={{ display: "block", color: "var(--of-text-muted)" }}
        >
          {t("gps.requestFull", "Запросить у перевозчика GPS-мониторинг груза")}
          <div
            style={{ fontSize: 13, color: "var(--of-text-soft)", marginTop: 4 }}
          >
            {t(
              "gps.requestDesc",
              "Вы получите ссылку для онлайн-отслеживания маршрута на время перевозки. Уточните возможность GPS у перевозчика."
            )}
          </div>
        </label>
      </div>

      {/* --- Примечание и файлы --- */}
      <div style={section}>
        <div
          style={{ fontWeight: 700, color: "var(--accent)", marginBottom: 8 }}
        >
          {t("files.imagesAndFiles", "Изображения и файлы")}
        </div>
        <div
          className="chip-row"
          style={{ display: "flex", gap: 12, marginBottom: 13 }}
        >
          <label
            className="full-width-mobile"
            style={{
              background: "var(--of-surface-strong)",
              color: "var(--accent)",
              padding: "8px 18px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 600,
              border: "1.5px solid var(--of-border)",
            }}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFile(e, "images")}
            />
            {t("files.addImagesLimit", "Добавить изображения (до 12)")}
          </label>
          <label
            className="full-width-mobile"
            style={{
              background: "var(--of-surface-strong)",
              color: "var(--accent)",
              padding: "8px 18px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 600,
              border: "1.5px solid #8d6e29",
            }}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx,.zip,.rar,.7z,.csv,.json,.xml,application/*"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e, "files")}
            />
            {t("files.addFilesLimit", "Добавить файлы (до 12)")}
          </label>
        </div>

        {/* --- Отображение прикреплённых файлов --- */}
        {form.attachments.length > 0 && (
          <div style={{ marginTop: 13 }}>
            {/* Изображения */}
            {form.attachments.filter((f) => f.__type === "images").length >
              0 && (
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
                  .filter(({ att }) => att.__type === "images")
                  .map(({ att, idx }) => {
                    const imgKey =
                      (att.file_url || att.preview_url || att.name || "img") +
                      "_" +
                      idx;
                    return (
                      <div
                        key={imgKey}
                        style={{
                          minWidth: 78,
                          minHeight: 60,
                          background: "var(--of-surface-strong)",
                          borderRadius: 10,
                          overflow: "hidden",
                          border: "1px solid var(--of-border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                        className="preview-img-item"
                      >
                        {(() => {
                          const imgSrc = att.file_url
                            ? abs(att.file_url)
                            : att.preview_url || "";

                          return (
                            <img
                              src={imgSrc}
                              alt={att.name || "img"}
                              style={{
                                width: 78,
                                height: 60,
                                objectFit: "cover",
                                cursor: "zoom-in",
                              }}
                              onClick={() => {
                                const i = imageUrls.indexOf(imgSrc);
                                setPreviewImage(imgSrc);
                                setPreviewIndex(i >= 0 ? i : 0);
                              }}
                            />
                          );
                        })()}
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
                            background: "rgba(27,35,51,0.88)",
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
                          title={t("common.delete", "Удалить")}
                        >
                          ×
                        </button>
                        <style>{`.preview-img-item:hover .img-remove-btn{opacity:1 !important;}`}</style>
                      </div>
                    );
                  })}
              </div>
            )}
            {/* Остальные файлы */}
            {form.attachments.filter((f) => f.__type === "files").length >
              0 && (
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
                  .filter(({ att }) => att.__type === "files")
                  .map(({ att, idx }) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        background: "var(--of-surface-strong)",
                        borderRadius: 9,
                        padding: "9px 13px",
                        minWidth: 56,
                        marginBottom: 4,
                        border: "1px solid var(--of-border)",
                        position: "relative",
                      }}
                      className="preview-file-item"
                    >
                      <span style={{ fontSize: 28, color: "var(--accent)" }}>
                        📄
                      </span>
                      <a
                        href={att.file_url ? abs(att.file_url) : ""}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 13,
                          color: "#f1f3f6",
                          marginTop: 3,
                          maxWidth: 60,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          textDecoration: "underline dotted",
                          cursor: "pointer",
                        }}
                        title={t("files.open", "Открыть файл")}
                      >
                        {t("files.open", "Открыть файл")}
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
                          background: "rgba(27,35,51,0.88)",
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

      {/* --- Кнопка и статус --- */}
      <div
        className="order-card"
        style={{
          padding: 20,
          marginTop: 10,
          background: "rgba(28,38,65,0.93)",
          borderRadius: 18,
          border: "none",
          boxShadow: "var(--of-shadow)",
        }}
      >
        {isMobile ? (
          <div className="sticky-actions">
            <button
              className="primary"
              type="submit"
              disabled={loading}
              style={{
                background: "linear-gradient(90deg, #38bdf8 0%, #22d3ee 100%)",
                color: "var(--text-primary)",
                fontWeight: 700,
                fontSize: 18,
                border: 0,
                borderRadius: 16,
                width: "100%",
                padding: "20px 0",
                boxShadow: "0 12px 28px -12px rgba(56,189,248,0.6)",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "transform .06s ease, opacity .18s",
                transform: loading ? "none" : "translateZ(0)",
              }}
              onMouseDown={(e) => {
                if (!loading)
                  e.currentTarget.style.transform = "translateY(1px)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {loading
                ? isEdit
                  ? t("order.saving", "Сохранение...")
                  : t("order.adding", "Добавление...")
                : isEdit
                ? t("order.saveChanges", "Сохранить изменения")
                : t("order.create", "Создать заявку")}
            </button>
          </div>
        ) : (
          <button
            className="primary"
            type="submit"
            disabled={loading}
            style={{
              background: "linear-gradient(90deg, #38bdf8 0%, #22d3ee 100%)",
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: 18,
              border: 0,
              borderRadius: 16,
              width: "100%",
              padding: "20px 0",
              boxShadow: "0 12px 28px -12px rgba(56,189,248,0.6)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "transform .06s ease, opacity .18s",
              transform: loading ? "none" : "translateZ(0)",
            }}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = "translateY(1px)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {loading
              ? isEdit
                ? t("order.saving", "Сохранение...")
                : t("order.adding", "Добавление...")
              : isEdit
              ? t("order.saveChanges", "Сохранить изменения")
              : t("order.create", "Создать заявку")}
          </button>
        )}

        {msg && (
          <div
            style={{
              color: "#ffd600",
              background: "rgba(34, 59, 86, 0.97)",
              border: "1.5px solid #ffd60088",
              borderRadius: 11,
              padding: "10px 26px",
              margin: "0 0 15px 0",
              fontWeight: 700,
              fontSize: 17,
              textAlign: "center",
              letterSpacing: 0.1,
            }}
          >
            {msg}
          </div>
        )}
      </div>
      {isMounted &&
        previewIndex >= 0 &&
        imageUrls.length > 0 &&
        createPortal(
          <div
            onClick={() => {
              setPreviewIndex(-1);
              setPreviewImage(null);
            }}
            style={{
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100vh",
              background: "rgba(18,24,33,0.89)",
              zIndex: 100000,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: 130,
              paddingBottom: 54,
              boxSizing: "border-box",
            }}
          >
            <div
              className="modal-img-wrap"
              onClick={(e) => e.stopPropagation()}
              style={{ position: "relative", display: "inline-block" }}
            >
              <img
                src={previewImage || imageUrls[previewIndex]}
                alt={t("files.preview", "Просмотр")}
                style={{
                  maxWidth: "94vw",
                  maxHeight: "74vh",
                  borderRadius: 14,
                  boxShadow: "0 8px 40px rgba(17,27,39,0.29)",
                  background: "var(--of-surface-strong)",
                  display: "block",
                }}
              />
              <button
                onClick={() => {
                  setPreviewIndex(-1);
                  setPreviewImage(null);
                }}
                className="modal-img-close"
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
                  boxShadow: "0 3px 24px rgba(24,49,83,0.27)",
                }}
                title={t("common.close", "Закрыть")}
              >
                ×
              </button>

              {imageUrls.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      const i =
                        (previewIndex - 1 + imageUrls.length) %
                        imageUrls.length;
                      setPreviewIndex(i);
                      setPreviewImage(imageUrls[i]);
                    }}
                    style={{
                      position: "absolute",
                      left: -56,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "rgba(24,28,38,0.92)",
                      color: "#ffd600",
                      border: "none",
                      borderRadius: "50%",
                      width: 42,
                      height: 42,
                      fontSize: 22,
                      fontWeight: 900,
                      cursor: "pointer",
                      boxShadow: "0 3px 24px rgba(24,49,83,0.27)",
                    }}
                    title={t("common.prev", "Предыдущее")}
                  >
                    ‹
                  </button>

                  <button
                    onClick={() => {
                      const i = (previewIndex + 1) % imageUrls.length;
                      setPreviewIndex(i);
                      setPreviewImage(imageUrls[i]);
                    }}
                    style={{
                      position: "absolute",
                      right: -56,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "rgba(24,28,38,0.92)",
                      color: "#ffd600",
                      border: "none",
                      borderRadius: "50%",
                      width: 42,
                      height: 42,
                      fontSize: 22,
                      fontWeight: 900,
                      cursor: "pointer",
                      boxShadow: "0 3px 24px rgba(24,49,83,0.27)",
                    }}
                    title={t("common.next", "Следующее")}
                  >
                    ›
                  </button>
                </>
              )}

              <style>{`.modal-img-wrap:hover .modal-img-close { opacity: 1 !important; }`}</style>
            </div>
          </div>,
          document.body
        )}
    </form>
  );
}
