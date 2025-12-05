// src/app/components/truckOptions.js
// ВНИМАНИЕ: для локализованного UI используйте новые хелперы ниже:
//   getLoadingTypes(t), getTruckBodyTypes(t), getTransportKindOptions(t)
// (старые константы оставлены для обратной совместимости)

export const LOADING_TYPES = [
    "верхняя",
    "боковая",
    "задняя",
    "с полной растентовкой",
    "со снятием поперечных перекладин",
    "со снятием стоек",
    "без ворот",
    "гидроборт",
    "аппарели",
    "с обрешеткой",
    "с бортами",
    "боковая с 2-х сторон",
    "налив",
    "электрический",
    "гидравлический",
    "пневматический",
    "дизельный компрессор",
];

// Тот же список, что в OrderForm, включая вложенные варианты:
export const TRUCK_BODY_TYPES = [
    { label: "Тентованный", value: "тентованный", popular: true },
    { label: "Рефрижератор", value: "рефрижератор", popular: true },
    { label: "Реф/тент", value: "реф/тент", popular: true },
    { label: "Изотермический", value: "изотермический", popular: true },
    { label: "Бортовой", value: "бортовой", popular: true },
    { label: "Платформа", value: "платформа" },
    { label: "Контейнер", value: "контейнер" },
    { label: "Фургон", value: "фургон" },
    { label: "Цельнометалл.", value: "цельнометалл" },
    { label: "Самосвал", value: "самосвал" },
    { label: "Шаланда", value: "шаланда" },
    {
        label: "Реф.+изотерм",
        children: [
            { label: "Рефрижератор (изотерм)", value: "рефрижератор (изотерм)" },
            { label: "Реф. с перегородкой", value: "реф. с перегородкой" },
        ],
    },
    { label: "Открытый конт.", value: "открытый конт." },
    { label: "Автовоз", value: "автовоз" },
    { label: "Цистерна", value: "цистерна" },
    { label: "Контейнеровоз", value: "контейнеровоз" },
    { label: "Малотоннажка", value: "малотоннажка" },
    { label: "Автобус", value: "автобус" },
    { label: "Битумовоз", value: "битумовоз" },
    { label: "Бензовоз", value: "бензовоз" },
    { label: "Газовоз", value: "газовоз" },
    { label: "Щеповоз", value: "щеповоз" },
    { label: "Зерновоз", value: "зерновоз" },
    { label: "Коневоз", value: "коневоз" },
    { label: "Кран", value: "кран" },
    { label: "Лесовоз", value: "лесовоз" },
    { label: "Манипулятор", value: "манипулятор" },
    { label: "Микроавтобус", value: "микроавтобус" },
    { label: "Мукомоз", value: "мукомоз" },
    { label: "Панелевоз", value: "панелевоз" },
    { label: "Пикап", value: "пикап" },
    { label: "Пухтовоз", value: "пухтовоз" },
    { label: "Пирамида", value: "пирамида" },
    { label: "Рулоновоз", value: "рулоновоз" },
    { label: "Седельный тягач", value: "седельный тягач" },
    { label: "Скотовоз", value: "скотовоз" },
    { label: "Стекловоз", value: "стекловоз" },
    { label: "Трубовоз", value: "трубовоз" },
    { label: "Цементовоз", value: "цементовоз" },
    { label: "Автоцистерна", value: "автоцистерна" },
    { label: "Эвакуатор", value: "эвакуатор" },
    { label: "Грузопассажирский", value: "грузопассажирский" },
    { label: "Клюшковоз", value: "клюшковоз" },
    { label: "Мусоровоз", value: "мусоровоз" },
    { label: "Jumbo", value: "jumbo" },
    { label: "20' танк-контейнер", value: "20' танк-контейнер" },
    { label: "40' танк-контейнер", value: "40' танк-контейнер" },
    { label: "Мега фура", value: "мега фура" },
    { label: "Допельшток", value: "допельшток" },
    { label: "Раздвижной полуприцеп 20'/40'", value: "Раздвижной полуприцеп 20'/40'" },
];

export const TRANSPORT_KIND_OPTIONS = [
    { label: "Полуприцеп", value: "Полуприцеп" },
    { label: "Грузовик", value: "Грузовик" },
    { label: "Сцепка", value: "Сцепка" },
    // Добавь остальные, если нужны!
];

// --- Локализованные помощники ---
export function getLoadingTypes(t) {
    return [
        t("loading.top", "верхняя"),
        t("loading.side", "боковая"),
        t("loading.back", "задняя"),
        t("loading.fullCurtain", "с полной растентовкой"),
        t("loading.removeCrossbars", "со снятием поперечных перекладин"),
        t("loading.removePosts", "со снятием стоек"),
        t("loading.noGates", "без ворот"),
        t("loading.tailLift", "гидроборт"),
        t("loading.ramps", "аппарели"),
        t("loading.crating", "с обрешеткой"),
        t("loading.boards", "с бортами"),
        t("loading.sideBoth", "боковая с 2-х сторон"),
        t("loading.bulkLiquid", "налив"),
        t("loading.electric", "электрический"),
        t("loading.hydraulic", "гидравлический"),
        t("loading.pneumatic", "пневматический"),
        t("loading.dieselCompressor", "дизельный компрессор"),
    ];
}

export function getTruckBodyTypes(t) {
    return [
        { label: t("truck.body.tent", "Тентованный"), value: "тентованный", popular: true },
        { label: t("truck.body.refrigerator", "Рефрижератор"), value: "рефрижератор", popular: true },
        { label: t("truck.body.refrTent", "Реф/тент"), value: "реф/тент", popular: true },
        { label: t("truck.body.isotherm", "Изотермический"), value: "изотермический", popular: true },
        { label: t("truck.body.board", "Бортовой"), value: "бортовой", popular: true },
        { label: t("truck.body.platform", "Платформа"), value: "платформа" },
        { label: t("truck.body.container", "Контейнер"), value: "контейнер" },
        { label: t("truck.body.van", "Фургон"), value: "фургон" },
        { label: t("truck.body.allMetal", "Цельнометалл."), value: "цельнометалл" },
        { label: t("truck.body.dump", "Самосвал"), value: "самосвал" },
        { label: t("truck.body.shalanda", "Шаланда"), value: "шаланда" },
        {
            label: t("truck.body.refIso", "Реф.+изотерм"),
            children: [
                { label: t("truck.body.refIso1", "Рефрижератор (изотерм)"), value: "рефрижератор (изотерм)" },
                { label: t("truck.body.refPartition", "Реф. с перегородкой"), value: "реф. с перегородкой" },
            ],
        },
        { label: t("truck.body.openContainer", "Открытый конт."), value: "открытый конт." },
        { label: t("truck.body.carCarrier", "Автовоз"), value: "автовоз" },
        { label: t("truck.body.tanker", "Цистерна"), value: "цистерна" },
        { label: t("truck.body.containerCarrier", "Контейнеровоз"), value: "контейнеровоз" },
        { label: t("truck.body.lightTruck", "Малотоннажка"), value: "малотоннажка" },
        { label: t("truck.body.bus", "Автобус"), value: "автобус" },
        { label: t("truck.body.bitumen", "Битумовоз"), value: "битумовоз" },
        { label: t("truck.body.fuel", "Бензовоз"), value: "бензовоз" },
        { label: t("truck.body.gas", "Газовоз"), value: "газовоз" },
        { label: t("truck.body.chip", "Щеповоз"), value: "щеповоз" },
        { label: t("truck.body.grain", "Зерновоз"), value: "зерновоз" },
        { label: t("truck.body.horse", "Коневоз"), value: "коневоз" },
        { label: t("truck.body.crane", "Кран"), value: "кран" },
        { label: t("truck.body.timber", "Лесовоз"), value: "лесовоз" },
        { label: t("truck.body.manipulator", "Манипулятор"), value: "манипулятор" },
        { label: t("truck.body.minibus", "Микроавтобус"), value: "микроавтобус" },
        { label: t("truck.body.flour", "Мукомоз"), value: "мукомоз" },
        { label: t("truck.body.panel", "Панелевоз"), value: "панелевоз" },
        { label: t("truck.body.pickup", "Пикап"), value: "пикап" },
        { label: t("truck.body.puhto", "Пухтовоз"), value: "პუხტოვოზ" },
        { label: t("truck.body.pyramid", "Пирамида"), value: "პირამიდა" },
        { label: t("truck.body.roll", "Рулоновоз"), value: "рулоновоз" },
        { label: t("truck.body.tractor", "Седельный тягач"), value: "седельный тягач" },
        { label: t("truck.body.cattle", "Скотовоз"), value: "скотовоз" },
        { label: t("truck.body.glass", "Стекловоз"), value: "стекловоз" },
        { label: t("truck.body.pipe", "Трубовоз"), value: "трубовоз" },
        { label: t("truck.body.cement", "Цементовоз"), value: "цементовоз" },
        { label: t("truck.body.autoTanker", "Автоцистерна"), value: "автоцистерна" },
        { label: t("truck.body.evacuator", "Эвакуатор"), value: "эвакуатор" },
        { label: t("truck.body.passengerCargo", "Грузопассажирский"), value: "грузопассажирский" },
        { label: t("truck.body.klushkovoz", "Клюшковоз"), value: "клюшковоз" },
        { label: t("truck.body.garbage", "Мусоровоз"), value: "мусоровоз" },
        { label: t("truck.body.jumbo", "Jumbo"), value: "jumbo" },
        { label: t("truck.body.tank20", "20' танк-контейнер"), value: "20' танк-контейнер" },
        { label: t("truck.body.tank40", "40' танк-контейнер"), value: "40' танк-контейнер" },
        { label: t("truck.body.mega", "Мега фура"), value: "мега фура" },
        { label: t("truck.body.doppelstock", "Допельшток"), value: "допельшток" },
        { label: t("truck.body.extendable", "Раздвижной полуприцеп 20'/40'"), value: "Раздвижной полуприцеп 20'/40'" },
    ];
}

export function getTransportKindOptions(t) {
    return [
        { label: t("transport.kind.semitrailer", "Полуприцеп"), value: "Полуприцеп" },
        { label: t("transport.kind.truck", "Грузовик"), value: "Грузовик" },
        { label: t("transport.kind.roadTrain", "Сцепка"), value: "Сцепка" },
    ];
}

// --- NEW: Универсальная локализация регулярности (для списков и деталей) ---
// --- Универсальная локализация регулярности (распознаёт RU/EN/TR/AZ/HY/KA) ---
export function localizeRegularity(t, raw) {
    if (!raw) return "";
    const s = String(raw)
        .normalize("NFKC")
        .replace(/[\u00A0\u202F\u2009]+/g, " ")
        .trim()
        .toLowerCase();

    // 1) Простые/частые варианты на разных языках
    const DAILY = new Set([
        "ежедневно", "каждый день", "daily", "every day",
        "her gün", "hər gün", "ամեն օր", "ყოველდღე", "ყოველდღიურად"
    ]);
    if (DAILY.has(s)) return t("availability.daily", "ежедневно");

    const WEEKLY = new Set([
        "еженедельно", "каждую неделю", "weekly", "every week",
        "haftalık", "haftada", "həftəlik", "շաբաթական", "ყოველკვირა"
    ]);
    if (WEEKLY.has(s)) return t("availability.weekly", "еженедельно");

    const MONTHLY = new Set([
        "ежемесячно", "каждый месяц", "monthly", "every month",
        "aylıq", "ayda", "ամսական", "ყოველთვე", "ყოველთვიურად"
    ]);
    if (MONTHLY.has(s)) return t("availability.monthly", "ежемесячно");

    const EVERY_OTHER_DAY = new Set([
        "через день", "gün aşırı", "gün asiri", "gün aşiri",
        "մեկ օր անց", "დღეგამოშვებით"
    ]);
    if (EVERY_OTHER_DAY.has(s)) return t("availability.everyOtherDay", "через день");

    // 2) Будни/выходные + короткие формы на разных языках
    const WEEKDAYS = new Set([
        "по рабочим дням", "по будням", "будни", "рабочие дни",
        "weekdays", "workdays", "mon-fri", "mon – fri", "mon—fri",
        "iş günleri", "iş günlərində", "աշխատանքային օրեր", "სამუშაო დღეებში"
    ]);
    if (WEEKDAYS.has(s) || /^пн[—\-–]пт\.?$/.test(s)) {
        return t("availability.weekdays", "по рабочим дням");
    }

    const WEEKENDS = new Set([
        "по выходным", "выходные", "weekends", "sat-sun", "sat–sun",
        "hafta sonu", "hafta sonları", "şənbə-bazar",
        "շաբաթ-կիրակի", "შაბათ-კვირა", "შაბათ-კვირას"
    ]);
    if (WEEKENDS.has(s) || /^(сб|суббота)[—\-–](вс|воскресенье)\.?$/.test(s)) {
        return t("availability.weekends", "по выходным");
    }

    // 3) Числовые шаблоны: «N раз(а) в неделю/месяц» на разных языках
    // RU
    let m = s.match(/^(\d+)\s*раза?\s*в\s*недел[юе]$/);
    if (m) return t("availability.perWeek.count", "{count} раза в неделю").replace("{count}", m[1]);
    m = s.match(/^(\d+)\s*раза?\s*в\s*месяц$/);
    if (m) return t("availability.perMonth.count", "{count} раза в месяц").replace("{count}", m[1]);
    // EN
    m = s.match(/^(\d+)\s*(x|times)?\s*per\s*week$/);
    if (m) return t("availability.perWeek.count", "{count} раза в неделю").replace("{count}", m[1]);
    m = s.match(/^(\d+)\s*(x|times)?\s*per\s*month$/);
    if (m) return t("availability.perMonth.count", "{count} раза в месяц").replace("{count}", m[1]);
    // TR
    m = s.match(/^haftada\s*(\d+)\s*(kez)?$/);
    if (m) return t("availability.perWeek.count", "{count} раза в неделю").replace("{count}", m[1]);
    m = s.match(/^ayda\s*(\d+)\s*(kez)?$/);
    if (m) return t("availability.perMonth.count", "{count} раза в месяц").replace("{count}", m[1]);
    // AZ
    m = s.match(/^həft[əe]d[əa]\s*(\d+)\s*(dəfə|defe)?$/);
    if (m) return t("availability.perWeek.count", "{count} раза в неделю").replace("{count}", m[1]);
    m = s.match(/^ayda\s*(\d+)\s*(dəfə|defe)?$/);
    if (m) return t("availability.perMonth.count", "{count} раза в месяц").replace("{count}", m[1]);
    // HY
    m = s.match(/^շաբաթ(ում|ական)\s*(\d+)\s*անգամ$/);
    if (m) return t("availability.perWeek.count", "{count} раза в неделю").replace("{count}", m[2]);
    m = s.match(/^ամս(ում|ական)\s*(\d+)\s*անգամ$/);
    if (m) return t("availability.perMonth.count", "{count} раза в месяц").replace("{count}", m[2]);
    // KA
    m = s.match(/^კვირაში\s*(\d+)[-\s]*ჯერ$/);
    if (m) return t("availability.perWeek.count", "{count} раза в неделю").replace("{count}", m[1]);
    m = s.match(/^თვეში\s*(\d+)[-\s]*ჯერ$/);
    if (m) return t("availability.perMonth.count", "{count} раза в месяц").replace("{count}", m[1]);

    // 4) Не распознали — вернуть как есть (лучше показать оригинальный текст, чем пусто)
    return raw;
}

export function localizeRegularityMode(t, rawMode) {
    const s = String(rawMode || "").trim().toLowerCase();
    if (["постоянно", "мутнымиват?"].includes(s)) return t("availability.constant", "постоянно");
    if (["систематически", "регулярно"].includes(s)) return t("availability.systematic", "систематически");
    return rawMode || "";
}
