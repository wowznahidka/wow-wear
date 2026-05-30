// ============================================================
//  WOW.WEAR — Google Apps Script
//  Читає каталог одягу → подає сайту + приймає замовлення
//  Адаптовано під формат Angells та інших fashion-постачальників
// ============================================================

// ── ПОСТАЧАЛЬНИКИ ──────────────────────────────────────────
// Додай ID Google Sheet постачальника і стать за замовчуванням
const SUPPLIERS = [
  { id: "1M-hjIl3FkwtuTZy_nT2DpGYd783m3REX7lCIyurUXQM", gender: "Жінка", margin: 400 },
  // { id: "ДРУГИЙ_ПОСТАЧАЛЬНИК_ID", gender: "Жінка", margin: 350 },
];

// ── МАРЖА ──────────────────────────────────────────────────
const DEFAULT_MARGIN     = 400;   // +грн якщо не вказано в постачальнику
const MARGIN_PERCENT     = false; // false = фіксована, true = відсоток
const MIN_PRODUCTS_SAFETY = 5;

// ── ЗАГОЛОВКИ НАШОЇ ТАБЛИЦІ ────────────────────────────────
const HEADERS = [
  "ID", "Бренд", "Назва", "Ціна", "Стара ціна",
  "Фото", "Розміри", "Нове", "Стать", "Постачальник", "Колір"
];

// ── СТАТУСИ НАЯВНОСТІ ──────────────────────────────────────
// Angells використовує ці значення в колонці "Наявність"
const STATUS_AVAILABLE = ["в наявності", "наявність", "є", "+", "sale", "залишки"];
const STATUS_SKIP      = ["продано", "очікуємо", "немає", "відсутній", "0"];

// ── FASHION БРЕНДИ ─────────────────────────────────────────
const KNOWN_BRANDS = [
  "Zara", "H&M", "Bershka", "Pull&Bear", "Stradivarius", "Mango",
  "ASOS", "COS", "Arket", "Reserved", "Cropp", "House",
  "Nike", "Adidas", "Puma", "New Balance", "Champion", "Under Armour",
  "Tommy Hilfiger", "Calvin Klein", "Guess", "Lacoste", "Ralph Lauren",
  "Liu Jo", "Versace", "Dolce", "Armani", "Balenciaga", "Gucci",
  "Angells", "ANGELLS",
];

// ── УТИЛІТИ ────────────────────────────────────────────────

function getTGConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    token:  props.getProperty("TG_BOT_TOKEN"),
    chatId: props.getProperty("TG_CHAT_ID"),
  };
}

function normalize(v) {
  return String(v || "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLower(v) {
  return normalize(v).toLowerCase();
}

function parsePrice(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = String(v).replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(n);
  return isNaN(num) ? 0 : Math.round(num);
}

function calcPrice(supplierPrice, margin) {
  if (!supplierPrice) return 0;
  if (MARGIN_PERCENT) return Math.round(supplierPrice * (1 + margin / 100));
  return supplierPrice + (margin || DEFAULT_MARGIN);
}

function isAvailableStatus(v) {
  if (v === null || v === undefined || v === "") return true; // якщо немає статусу — вважаємо є
  const s = normalizeLower(String(v));
  if (STATUS_SKIP.some(k => s.includes(k))) return false;
  return true; // не знайшли SKIP → доступний
}

// ── РОЗМІРИ ОДЯГУ ──────────────────────────────────────────
// Підтримує: XS S M L XL XXL XXXL 4XL
//            числові 34 36 38 40 42 44 46 48 50 52 54 56
//            ONE SIZE / Uni / OS

function parseClothingSize(v) {
  if (!v && v !== 0) return null;
  const s = normalize(String(v)).toUpperCase().replace(/[-–—\s]/g, "");
  if (!s) return null;

  // Стандартні текстові
  const TEXT_SIZES = ["4XL", "3XL", "XXXL", "XXL", "XL", "XS", "S", "M", "L", "OS", "UNI", "ONESIZE", "OSFM"];
  for (const ts of TEXT_SIZES) {
    if (s.includes(ts)) return ts.replace("ONESIZE", "ONE SIZE").replace("UNI", "ONE SIZE").replace("OS", "ONE SIZE").replace("OSFM", "ONE SIZE");
  }

  // Числові (EU) 30-60
  const m = s.match(/\b(3[0-9]|4[0-9]|5[0-9]|6[0])\b/);
  if (m) return m[1];

  return null;
}

function extractSizesFromRow(row, startCol) {
  const sizes = [];
  for (let i = startCol; i < row.length; i++) {
    const sz = parseClothingSize(row[i]);
    if (sz && !sizes.includes(sz)) sizes.push(sz);
  }
  return sizes;
}

function extractBrand(name) {
  const n = normalize(name);
  for (const b of KNOWN_BRANDS) {
    if (n.toLowerCase().includes(b.toLowerCase())) return b;
  }
  return "";
}

function extractImageUrl(formula) {
  if (!formula) return "";
  const f = String(formula);
  const patterns = [
    /IMAGE\s*\(\s*"([^"]+)"/i,
    /HYPERLINK\s*\(\s*"([^"]+)"/i,
    /https?:\/\/[^"')\s,]+/i,
  ];
  for (const p of patterns) {
    const m = f.match(p);
    if (m) return m[1] || m[0];
  }
  return "";
}

function fingerprint(p) {
  return [
    normalizeLower(p[2]),      // назва
    String(p[3]),              // ціна
    normalizeLower(p[8]),      // стать
  ].join("|");
}

// ── ФОТО З EMBEDDED IMAGES через Sheets API v4 ─────────────
// Потрібно: Розширення → Служби → Google Sheets API → увімкнути
// Повертає map { rowIndex: imageUrl }

function extractEmbeddedPhotos(sheet) {
  const photoMap = {};
  try {
    const ssId     = sheet.getParent().getId();
    const sheetId  = sheet.getSheetId();
    const response = Sheets.Spreadsheets.get(ssId, {
      includeGridData: true,
      ranges: [sheet.getName() + '!A:A'],
    });

    const sheetData = response.sheets.find(s => s.properties.sheetId === sheetId);
    if (!sheetData || !sheetData.data || !sheetData.data[0].rowData) return photoMap;

    sheetData.data[0].rowData.forEach((row, rowIdx) => {
      if (!row.values || !row.values[0]) return;
      const cell = row.values[0];

      // In-cell image → userEnteredValue.imageValue або effectiveValue.imageValue
      const imgVal = (cell.userEnteredValue  && cell.userEnteredValue.imageValue)
                  || (cell.effectiveValue     && cell.effectiveValue.imageValue);

      if (imgVal) {
        const url = imgVal.sourceUri || imgVal.contentUri || '';
        if (url) photoMap[rowIdx + 1] = url; // rowIdx 0-based → 1-based
      }
    });
  } catch (e) {
    // Sheets API не увімкнено або помилка — тихо пропускаємо
  }
  return photoMap;
}

// ── ПАРСЕР ФОРМАТУ ANGELLS ─────────────────────────────────
// Структура таблиці Angells:
//   A: Фото (embedded)
//   B: Наявність
//   C: Артикул
//   D: Найменування
//   E: Ціна
//   F+: Розміри (1-5 колонок)

function parseAngellsSheet(rows, formulas, gender, margin, sheet) {
  const products = [];
  let idCounter = 1;

  // Витягуємо embedded photos якщо є sheet (рядок → URL)
  const photoMap = sheet ? extractEmbeddedPhotos(sheet) : {};

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 4) continue;

    const rowStr = row.map(c => normalizeLower(String(c || ""))).join("|");
    if (rowStr.includes("найменування") || rowStr.includes("наявність") || rowStr.includes("ціна")) continue;

    // Статична структура Angells: A=фото B=статус C=артикул D=назва E=ціна F+=розміри
    // rows передається як slice(1), тому реальний рядок у sheet = r + 2
    const sheetRow     = r + 2;
    const photoEmbedded = photoMap[sheetRow] || "";
    const photoFormula  = formulas[r] ? extractImageUrl(formulas[r][0] || "") : "";
    const photo        = photoEmbedded || photoFormula;

    const statusRaw = normalize(String(row[1] || ""));
    const article   = normalize(String(row[2] || ""));
    const name      = normalize(String(row[3] || ""));
    const priceRaw  = parsePrice(row[4]);

    if (!name || name.length < 2) continue;
    if (!isAvailableStatus(statusRaw)) continue;
    if (!priceRaw || priceRaw < 50) continue;

    const sizes      = extractSizesFromRow(row, 5);
    const sizesStr   = sizes.length ? sizes.join(",") : "ONE SIZE";
    const finalPrice = calcPrice(priceRaw, margin);
    const brand      = extractBrand(name);

    products.push([
      article || `wear_${idCounter++}`,
      brand, name, finalPrice, priceRaw,
      photo, sizesStr, "", gender || "Жінка", 0, "",
    ]);
  }

  return products;
}

// ── ЗАГАЛЬНИЙ ПАРСЕР (fallback для інших постачальників) ───

function parseGenericFashionSheet(rows, formulas, gender, margin) {
  const products = [];
  let idCounter = 1;

  for (let r = 1; r < rows.length; r++) { // skip header row
    const row = rows[r];
    if (!row || row.length < 3) continue;

    // Шукаємо назву і ціну в будь-яких колонках
    let name = "", price = 0, photo = "", sizes = [];

    for (let c = 0; c < row.length; c++) {
      const v = normalize(String(row[c] || ""));
      if (!v) continue;
      const vLow = v.toLowerCase();

      if (!name && v.length > 5 && !/^\d+/.test(v) && !vLow.includes("наявн")) name = v;
      if (!price && parsePrice(v) > 50 && parsePrice(v) < 10000) price = parsePrice(v);
      const sz = parseClothingSize(v);
      if (sz && sz !== "0") sizes.push(sz);

      if (!photo && formulas[r] && formulas[r][c]) {
        photo = extractImageUrl(formulas[r][c]);
      }
    }

    if (!name || !price) continue;

    products.push([
      `wear_${idCounter++}`,
      extractBrand(name),
      name,
      calcPrice(price, margin),
      price,
      photo,
      sizes.length ? [...new Set(sizes)].join(",") : "ONE SIZE",
      "",
      gender || "Жінка",
      0,
      "",
    ]);
  }

  return products;
}

// ── SOLD SIZE TRACKING ──────────────────────────────────────

function autoRemoveOrderedSizes(ss, cart) {
  if (!cart || !cart.length) return;
  const sheet = ss.getSheetByName("Товари");
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const idCol    = HEADERS.indexOf("ID");
  const sizesCol = HEADERS.indexOf("Розміри");
  if (idCol < 0 || sizesCol < 0) return;

  const data = sheet.getRange(1, 1, lastRow, HEADERS.length).getValues();

  for (let r = 1; r < data.length; r++) {
    const rowId = String(data[r][idCol]);
    const item  = cart.find(c => String(c.id) === rowId);
    if (!item) continue;

    const orderedSize = String(item.size);
    const orderedQty  = item.qty || 1;
    const parts = String(data[r][sizesCol]).split(",").map(s => s.trim()).filter(Boolean);
    const newParts = [];

    for (const part of parts) {
      const m = part.match(/^([^(]+)\((\d+)\)$/);
      if (!m) {
        if (part.trim() !== orderedSize) newParts.push(part);
        continue;
      }
      const sz = m[1].trim();
      const qty = parseInt(m[2]);
      const remaining = qty - (sz === orderedSize ? orderedQty : 0);
      if (remaining > 0) newParts.push(`${sz}(${remaining})`);
    }

    sheet.getRange(r + 1, sizesCol + 1).setValue(newParts.join(","));
  }
}

function _logSoldSizes(ss, cart, orderRef) {
  if (!cart || !cart.length) return;
  let sheet = ss.getSheetByName("Продано");
  if (!sheet) {
    sheet = ss.insertSheet("Продано");
    sheet.appendRow(["Дата", "ID", "Розмір", "К-во", "Замовлення"]);
  }
  const now = new Date();
  for (const item of cart) {
    sheet.appendRow([now, String(item.id), String(item.size), item.qty || 1, orderRef || ""]);
  }
}

function getSoldSizes(ss) {
  const sheet = ss.getSheetByName("Продано");
  if (!sheet || sheet.getLastRow() <= 1) return {};
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const sold = {};
  for (const row of data) {
    const id   = String(row[1]);
    const size = String(row[2]);
    const qty  = parseInt(row[3]) || 1;
    if (!id || !size) continue;
    if (!sold[id]) sold[id] = {};
    sold[id][size] = (sold[id][size] || 0) + qty;
  }
  return sold;
}

function applySoldFilter(products, sold) {
  if (!Object.keys(sold).length) return products;
  return products.map(p => {
    const id = String(p[0]);
    const soldSizes = sold[id];
    if (!soldSizes) return p;

    const parts = String(p[6]).split(",").map(s => s.trim()).filter(Boolean);
    const newParts = [];
    for (const part of parts) {
      const m = part.match(/^([^(]+)\((\d+)\)$/);
      if (!m) { newParts.push(part); continue; }
      const sz  = m[1].trim();
      const qty = parseInt(m[2]);
      const soldQty = soldSizes[sz] || 0;
      if (qty - soldQty > 0) newParts.push(`${sz}(${qty - soldQty})`);
    }
    if (!newParts.length) return null;
    const updated = [...p];
    updated[6] = newParts.join(",");
    return updated;
  }).filter(Boolean);
}

// ── DAILY DEALS ────────────────────────────────────────────

function _mulberry32GAS(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function _getDailyDealIds(products, count) {
  count = count || 3;
  var d    = new Date();
  var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  var eligible = products
    .filter(p => p["Розміри"] && String(p["Розміри"]).trim())
    .sort((a, b) => String(a["ID"]) < String(b["ID"]) ? -1 : 1);
  if (!eligible.length) return [];
  var rng = _mulberry32GAS(seed);
  var arr = eligible.slice();
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr.slice(0, count).map(p => String(p["ID"] || ""));
}

// ── TG NOTIFICATION ────────────────────────────────────────

function sendTelegramMessage(text) {
  try {
    const tg = getTGConfig();
    if (!tg.token || !tg.chatId) return;
    UrlFetchApp.fetch("https://api.telegram.org/bot" + tg.token + "/sendMessage", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ chat_id: tg.chatId, text, parse_mode: "HTML" }),
      muteHttpExceptions: true,
    });
  } catch (e) {}
}

// ── doGet — САЙТ ЧИТАЄ КАТАЛОГ ─────────────────────────────

function doGet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Товари");

  if (!sheet || sheet.getLastRow() <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ products: [], dailyDeals: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const data    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data.shift();

  const products = data
    .filter(r => r[0])
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });

  return ContentService
    .createTextOutput(JSON.stringify({ products, dailyDeals: _getDailyDealIds(products, 3) }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doPost — ЗАМОВЛЕННЯ / ВІДГУКИ ──────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === "new_order") {
      let sheet = ss.getSheetByName("Orders");
      if (!sheet) {
        sheet = ss.insertSheet("Orders");
        sheet.appendRow(["Дата","ПІБ","Телефон","Місто","Доставка","Товари","Сума","Промокод","Статус","UTM Source","UTM Campaign","UTM Video"]);
      }
      const totalFormatted = typeof data.total === "number"
        ? data.total + " ₴" : String(data.total || "");

      sheet.appendRow([
        new Date(), data.fio || "", "'" + (data.phone || ""),
        data.city || "", data.delivery || "",
        data.items || "", totalFormatted,
        data.promo || "", "Нове",
        (data.utm || {}).source   || "",
        (data.utm || {}).campaign || "",
        (data.utm || {}).video    || "",
      ]);

      const cartItems = Array.isArray(data.cart) ? data.cart : [];
      let itemsBlock = cartItems.map(item =>
        "  · " + [item.brand, item.name].filter(Boolean).join(" ") +
        ", розмір " + item.size +
        ((item.qty || 1) > 1 ? " × " + item.qty : "") +
        (item.price ? " — " + item.price + "₴" : "")
      ).join("\n") || (data.items || "");

      const utmFooter = data.utm && (data.utm.video || data.utm.source)
        ? "\n📊 video=" + (data.utm.video || "—") + ", src=" + (data.utm.source || "—")
        : "";

      sendTelegramMessage(
        "🛍 <b>НОВЕ ЗАМОВЛЕННЯ [WOW.WEAR]</b>\n\n" +
        "👗 <b>Товар:</b>\n" + itemsBlock + "\n\n" +
        "👤 " + (data.fio || "—") + "\n" +
        "📞 " + (data.phone || "—") + "\n" +
        "🏙 " + (data.city || "—") + "\n" +
        "📦 " + (data.delivery || "—") + "\n" +
        "💰 " + totalFormatted +
        (data.promo ? "\n🎟 " + data.promo : "") +
        utmFooter
      );

      if (cartItems.length) {
        autoRemoveOrderedSizes(ss, cartItems);
        _logSoldSizes(ss, cartItems, data.phone || "");
      }
    }

    if (data.action === "upsert_product") {
      const sheet    = ss.getSheetByName("Товари") || ss.insertSheet("Товари");
      const lastRow  = sheet.getLastRow();
      const idCol    = HEADERS.indexOf("ID") + 1;
      const nameCol  = HEADERS.indexOf("Назва") + 1;
      const photoCol = HEADERS.indexOf("Фото") + 1;
      const sizesCol = HEADERS.indexOf("Розміри") + 1;

      const inArticle = normalize(String(data.article || '')).toLowerCase();
      const inName    = normalize(String(data.name    || '')).toLowerCase();

      let found = -1;
      if (lastRow > 1) {
        const ids   = sheet.getRange(2, idCol,   lastRow - 1, 1).getValues();
        const names = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();

        for (let i = 0; i < ids.length; i++) {
          const rowId   = String(ids[i][0]).toLowerCase().trim();
          const rowName = String(names[i][0]).toLowerCase().trim();

          // Матчинг: артикул → точний збіг; назва → збіг перших 15 символів
          const articleMatch = inArticle && rowId.includes(inArticle);
          const nameMatch    = inName && rowName.substring(0, 15) === inName.substring(0, 15);

          if (articleMatch || nameMatch) { found = i + 2; break; }
        }
      }

      if (found > 0) {
        // Оновити фото (і розміри якщо порожні)
        if (data.photo) sheet.getRange(found, photoCol).setValue(data.photo);
        if (data.sizes) {
          const curSizes = sheet.getRange(found, sizesCol).getValue();
          if (!curSizes || curSizes === 'ONE SIZE') sheet.getRange(found, sizesCol).setValue(data.sizes);
        }
      } else {
        // Новий товар — додати рядок
        const newRow = new Array(HEADERS.length).fill('');
        newRow[HEADERS.indexOf("ID")]         = data.article || ('tg_' + Date.now());
        newRow[HEADERS.indexOf("Назва")]      = data.name    || '';
        newRow[HEADERS.indexOf("Ціна")]       = data.price   || 0;
        newRow[HEADERS.indexOf("Стара ціна")] = data.oldPrice || 0;
        newRow[HEADERS.indexOf("Фото")]       = data.photo   || '';
        newRow[HEADERS.indexOf("Розміри")]    = data.sizes   || 'ONE SIZE';
        newRow[HEADERS.indexOf("Стать")]      = data.gender === 'male' ? 'Чоловік' : 'Жінка';
        newRow[HEADERS.indexOf("Нове")]       = '1';
        sheet.appendRow(newRow);
      }
    }

    if (data.action === "review") {
      let sheet = ss.getSheetByName("Відгуки");
      if (!sheet) {
        sheet = ss.insertSheet("Відгуки");
        sheet.appendRow(["Дата", "Автор", "Оцінка", "Текст"]);
      }
      sheet.appendRow([new Date(), data.author || "Анонім", data.stars || 5, data.text || ""]);
      const stars = Math.min(5, Math.max(1, parseInt(data.stars) || 5));
      sendTelegramMessage(
        "✍️ <b>ВІДГУК [WOW.WEAR]</b>\n" + "⭐".repeat(stars) + "\n" +
        "👤 " + (data.author || "Анонім") + "\n" + (data.text || "—")
      );
    }

    if (data.action === "photo_request") {
      sendTelegramMessage(
        "📸 ФОТО [WOW.WEAR]\n" +
        (data.product ? (data.product.brand + " " + data.product.name) : "") +
        "\nРозмір: " + (data.size || "—")
      );
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    sendTelegramMessage("❌ WOW.WEAR error: " + e.message);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── updateMasterDB — ВИМКНЕНО для WEAR ────────────────────
// Каталог заповнюється через grabber.py → upsert_product
// Не потрібен бо фото приходять разом з товарами через парсер

function updateMasterDB() {
  sendTelegramMessage("ℹ️ WOW.WEAR: каталог заповнюється через парсер @allegator_shop → Telegraph → GAS.");
  return 0;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    sendTelegramMessage("⚠️ WOW.WEAR: lock не отримано, пропуск");
    return 0;
  }

  try {
    const masterSS = SpreadsheetApp.getActiveSpreadsheet();
    let masterSheet = masterSS.getSheetByName("Товари");
    if (!masterSheet) masterSheet = masterSS.insertSheet("Товари");

    masterSheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

    let products = [];
    let successfulSuppliers = 0;

    for (const supplier of SUPPLIERS) {
      try {
        const ss     = SpreadsheetApp.openById(supplier.id);
        const sheets = ss.getSheets();
        let supplierProducts = [];

        for (const sheet of sheets) {
          const name    = sheet.getName();
          const lastRow = sheet.getLastRow();
          const lastCol = sheet.getLastColumn();
          if (!lastRow || !lastCol) continue;

          const range    = sheet.getRange(1, 1, lastRow, lastCol);
          const rows     = range.getValues();
          const formulas = range.getFormulas();

          // Визначаємо формат таблиці по заголовку
          const headerRow = rows[0].map(c => normalizeLower(String(c || "")));
          const isAngells = headerRow.some(h => h.includes("найменування") || h.includes("наявн"));

          const parsed = isAngells
            ? parseAngellsSheet(rows.slice(1), formulas.slice(1), supplier.gender, supplier.margin, sheet)
            : parseGenericFashionSheet(rows, formulas, supplier.gender, supplier.margin);

          if (parsed.length) supplierProducts = supplierProducts.concat(parsed);
        }

        if (supplierProducts.length > 0) {
          products = products.concat(supplierProducts);
          successfulSuppliers++;
        } else {
          sendTelegramMessage("⚠️ WOW.WEAR: постачальник 0 товарів: " + supplier.id);
        }

      } catch (err) {
        sendTelegramMessage("❌ WOW.WEAR supplier error: " + supplier.id + "\n" + err.message);
      }
    }

    // Дедуплікація
    const unique = new Map();
    for (const p of products) {
      const key = fingerprint(p);
      if (!unique.has(key)) unique.set(key, p);
    }

    // Виключити продані розміри
    const sold          = getSoldSizes(masterSS);
    const finalProducts = applySoldFilter([...unique.values()], sold);

    if (finalProducts.length < MIN_PRODUCTS_SAFETY) {
      sendTelegramMessage(
        "⚠️ WOW.WEAR: підозріло мало товарів (" + finalProducts.length +
        "), постачальників: " + successfulSuppliers + ". Каталог НЕ перезаписано."
      );
      return 0;
    }

    // ── ЗБЕРІГАЄМО ФОТО перед перезаписом ──────────────────
    // Щоб фото з Telegraph не зникали після кожної синхронізації
    const photoCache = {}; // { id_or_name_key → photo_url }
    const idColIdx   = HEADERS.indexOf("ID");
    const nameColIdx = HEADERS.indexOf("Назва");
    const photoColIdx = HEADERS.indexOf("Фото");

    const existingLastRow = masterSheet.getLastRow();
    if (existingLastRow > 1) {
      const existingData = masterSheet.getRange(2, 1, existingLastRow - 1, HEADERS.length).getValues();
      for (const row of existingData) {
        const photo = String(row[photoColIdx] || '').trim();
        if (!photo) continue;
        const id   = String(row[idColIdx]   || '').toLowerCase().trim();
        const name = String(row[nameColIdx] || '').toLowerCase().trim().substring(0, 15);
        if (id)   photoCache[id]   = photo;
        if (name) photoCache[name] = photo;
      }
    }

    // Перезаписуємо каталог
    if (existingLastRow > 1) masterSheet.getRange(2, 1, existingLastRow - 1, HEADERS.length).clearContent();

    // Відновлюємо фото в нових рядках
    for (const p of finalProducts) {
      const id   = String(p[idColIdx]   || '').toLowerCase().trim();
      const name = String(p[nameColIdx] || '').toLowerCase().trim().substring(0, 15);
      const savedPhoto = photoCache[id] || photoCache[name] || '';
      if (savedPhoto && !p[photoColIdx]) p[photoColIdx] = savedPhoto;
    }

    if (finalProducts.length) {
      masterSheet.getRange(2, 1, finalProducts.length, HEADERS.length).setValues(finalProducts);
    }

    const withPhotos = finalProducts.filter(p => p[photoColIdx]).length;
    sendTelegramMessage(
      "✅ WOW.WEAR оновлено: " + finalProducts.length + " товарів" +
      (withPhotos ? " · 📸 " + withPhotos + " з фото" : " · фото ще немає (запусти парсер)")
    );
    return finalProducts.length;

  } finally {
    lock.releaseLock();
  }
}

// ── ТРИГЕР — авто-оновлення кожні 3 години ─────────────────

function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "updateMasterDB")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("updateMasterDB").timeBased().everyHours(3).create();
}

// ── DEBUG ───────────────────────────────────────────────────

function debugParser() {
  const supplier = SUPPLIERS[0];
  const ss       = SpreadsheetApp.openById(supplier.id);
  const sheet    = ss.getSheets()[0];
  const lastRow  = sheet.getLastRow();
  const lastCol  = sheet.getLastColumn();
  const rows     = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const formulas = sheet.getRange(1, 1, lastRow, lastCol).getFormulas();

  const parsed = parseAngellsSheet(rows.slice(1), formulas.slice(1), supplier.gender, supplier.margin);
  Logger.log("Знайдено товарів: " + parsed.length);
  Logger.log(JSON.stringify(parsed.slice(0, 10)));
}
