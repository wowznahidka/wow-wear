const HEADERS = [
  "ID","Бренд","Назва","Ціна","Стара ціна","Фото",
  "Розміри","Нове","Стать","Постачальник","Опис","TG","Категорія"
];

const BILYZNA_SHEET_ID = '1P6OMrMpgrozpZ_t5oV_uyeKIMope-qX6QZTbCFI8lnk';
const ODYAG_SHEET_ID   = '1M-hjIl3FkwtuTZy_nT2DpGYd783m3REX7lCIyurUXQM';

const SUPPLIERS = [
  { id: BILYZNA_SHEET_ID, category: 'bilyzna', gender: 'Жінка', margin: 1.40,
    tabs: ['VS','Білизна','Базова білизна','Трусики'] },
  { id: ODYAG_SHEET_ID,   category: 'wear',    gender: 'Жінка', margin: 1.35,
    tabs: ['одяг'] },
];

const MIN_PRODUCTS_SAFETY = 5;

const ORD_COL = {
  date:0,fio:1,phone:2,city:3,delivery:4,
  items:5,total:6,promo:7,status:8,
  utmSrc:9,utmCamp:10,utmVideo:11,npTrack:12,notes:13,
};

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getTGConfig() {
  const p = PropertiesService.getScriptProperties();
  return { token: p.getProperty('TG_BOT_TOKEN'), chatId: p.getProperty('TG_CHAT_ID') };
}

function normalize(v) {
  return String(v||'').replace(/[​-‍﻿]/g,'').replace(/\s+/g,' ').trim();
}

function parsePrice(v) {
  if (!v) return 0;
  const n = String(v).replace(/[^\d.,]/g,'').replace(',','.');
  const num = parseFloat(n);
  return isNaN(num) ? 0 : Math.round(num);
}

function extractImageUrl(formula) {
  if (!formula) return '';
  const patterns = [
    /IMAGE\s*\(\s*"([^"]+)"/i,
    /HYPERLINK\s*\(\s*"([^"]+)"/i,
    /https?:\/\/[^"')\s]+/i,
  ];
  for (const p of patterns) {
    const m = String(formula).match(p);
    if (m) return m[1] || m[0];
  }
  return '';
}

function sendTelegramMessage(text) {
  try {
    const tg = getTGConfig();
    if (!tg.token || !tg.chatId) return;
    UrlFetchApp.fetch('https://api.telegram.org/bot' + tg.token + '/sendMessage', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload: JSON.stringify({ chat_id:tg.chatId, text, parse_mode:'HTML' }),
    });
  } catch(e) {}
}

function _findHeaderRow(data) {
  for (let r = 0; r < Math.min(8, data.length); r++) {
    const row = data[r];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c]).toLowerCase();
      if (v.includes('найменуван') || v.includes('наименован')) return r;
    }
  }
  return -1;
}

function _mapColumns(headerRow) {
  const cols = { photo:-1,avail:-1,art:-1,name:-1,price:-1,sizeStart:-1,sizeEnd:-1,desc:-1,rrts:-1 };
  headerRow.forEach((h,i) => {
    const v = String(h).toLowerCase().trim();
    if (v.includes('фото'))                                      cols.photo = i;
    else if (v.includes('наявн') || v.includes('наличн'))        cols.avail = i;
    else if (v.includes('артикул') || v === 'код' || v==='арт')  cols.art   = i;
    else if (v.includes('найменуван') || v.includes('назва'))    cols.name  = i;
    else if ((v.includes('ціна')||v.includes('цена')||v.includes('дроп')) && cols.price<0) cols.price = i;
    else if (v.includes('ррц') || v.includes('рекомен'))         cols.rrts  = i;
    else if (v.includes('розмір') || v.includes('размер')) {
      if (cols.sizeStart < 0) cols.sizeStart = i;
      cols.sizeEnd = i;
    }
    else if (v.includes('опис') || v.includes('описан'))         cols.desc  = i;
  });
  return cols;
}

function _extractSizes(row, cols, lastCol) {
  const start = cols.sizeStart >= 0 ? cols.sizeStart : (cols.price >= 0 ? cols.price + 1 : 5);
  const end   = cols.sizeEnd   >= 0 ? cols.sizeEnd   : (cols.desc  >= 0 ? cols.desc  - 1 : Math.min(start + 10, lastCol - 1));

  const parts = [];
  for (let sc = start; sc <= end; sc++) {
    const sv = String(row[sc] || '').trim();
    if (!sv) continue;
    const up = sv.toUpperCase();
    if (up.includes('ОЧІКУЄ') || up.includes('НЕМАЄ') || up.includes('НЕМАЄ В')) continue;
    if (up.includes('РОЗМІР') || up.includes('SIZE')) continue;
    // Remove inline "ОЧІКУЄМО" markers
    const clean = sv.replace(/\s*[\(\[]?ОЧІКУЄМО[\)\]]?/ig,'').replace(/\s*[\(\[]?НЕМАЄ[\)\]]?/ig,'').trim();
    if (clean.length > 0 && clean.length < 40) parts.push(clean);
  }

  if (parts.length) return parts.join(', ');

  // Fallback: extract from name/desc
  const fullText = String(row[cols.name >= 0 ? cols.name : 0]||'') + ' ' + String(row[cols.desc >= 0 ? cols.desc : 0]||'');
  const textSz = [];
  const letterMatch = [...fullText.matchAll(/\b(XS|S|M|L|XL|XXL|XXXL)\b/gi)];
  letterMatch.forEach(m => { const v=m[1].toUpperCase(); if(!textSz.includes(v)) textSz.push(v); });
  const numMatch = [...fullText.matchAll(/\b(4[2-9]|5[0-8]|6[02])\b/g)];
  numMatch.forEach(m => { if(!textSz.includes(m[1])) textSz.push(m[1]); });
  if (textSz.length) return textSz.join(', ');

  return 'ONE SIZE';
}

function parseAngellsSheet(sheet, category, gender, margin) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 5 || lastCol < 3) return [];

  const data     = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const formulas = sheet.getRange(1, 1, lastRow, lastCol).getFormulas();

  const hRow = _findHeaderRow(data);
  if (hRow < 0) return [];

  const cols    = _mapColumns(data[hRow]);
  if (cols.name < 0 || cols.price < 0) return [];

  const products = [];
  const seen     = new Set();

  for (let r = hRow + 1; r < data.length; r++) {
    const row = data[r];

    // Availability check
    if (cols.avail >= 0) {
      const avail = String(row[cols.avail] || '').toUpperCase();
      if (!avail.includes('В НАЯВН') && !avail.includes('В НАЛИЧН')) continue;
    }

    const name = normalize(row[cols.name] || '');
    if (!name || name.length < 3) continue;

    const article = cols.art >= 0 ? normalize(row[cols.art] || '') : '';
    const key     = article || name.substring(0, 28);
    if (seen.has(key)) { seen.add(key); continue; }
    seen.add(key);

    const priceRaw = parsePrice(row[cols.price] || 0);
    if (priceRaw < 50) continue;
    const price = Math.ceil(priceRaw * margin / 50) * 50 - 10;
    const rrts  = cols.rrts >= 0 ? parsePrice(row[cols.rrts] || 0) : 0;
    const oldPrice = (rrts > price) ? rrts : 0;

    // Photo
    let photo = '';
    if (cols.photo >= 0) {
      photo = extractImageUrl(formulas[r][cols.photo] || '');
      if (!photo) {
        const pv = String(row[cols.photo] || '');
        if (pv.startsWith('http')) photo = pv;
      }
    }

    const sizesStr = _extractSizes(row, cols, lastCol);
    const desc     = cols.desc >= 0 ? normalize(row[cols.desc] || '') : '';
    const isNew    = String(row[cols.avail] || '').toUpperCase().includes('НОВИ') ? '1' : '';

    products.push([
      article || ('ang_' + r + '_' + (Date.now() % 100000).toString(36)),
      'Angells',
      name,
      price,
      oldPrice,
      photo,
      sizesStr,
      isNew,
      gender,
      1,
      desc,
      '',
      category,
    ]);
  }

  return products;
}

function fingerprint(p) {
  return [String(p[0]).toLowerCase(), String(p[2]).toLowerCase().substring(0,20)].join('|');
}

// ── DAILY DEALS ───────────────────────────────────────────── //
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
    .filter(function(p){ var sz=String(p['Розміри']||'').trim(); return sz&&sz!=='ONE SIZE'; })
    .sort(function(a,b){ var ia=String(a['ID']||''),ib=String(b['ID']||''); return ia<ib?-1:ia>ib?1:0; });
  if (!eligible.length) return [];
  var rng=_mulberry32GAS(seed), arr=eligible.slice();
  for(var i=arr.length-1;i>0;i--){var j=Math.floor(rng()*(i+1));var tmp=arr[i];arr[i]=arr[j];arr[j]=tmp;}
  return arr.slice(0,count).map(function(p){return String(p['ID']||'');});
}

// ── doGet ─────────────────────────────────────────────────── //
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'ping')   return jsonResp({ ok:true, ts:Date.now() });
  if (action === 'orders') return jsonResp(_adminGetOrders(e.parameter));

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Товари');
  if (!sheet || sheet.getLastRow() <= 1) return jsonResp({ products:[], dailyDeals:[] });

  const data    = sheet.getRange(1, 1, sheet.getLastRow(), HEADERS.length).getValues();
  const headers = data.shift();
  const products = data.filter(r => r[0]).map(r => {
    const obj = {};
    headers.forEach((h,i) => { obj[h] = r[i]; });
    return obj;
  });
  const dailyDeals = _getDailyDealIds(products, 3);
  return jsonResp({ products, dailyDeals });
}

// ── doPost ────────────────────────────────────────────────── //
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'new_order') {
      let sheet = ss.getSheetByName('Orders');
      if (!sheet) {
        sheet = ss.insertSheet('Orders');
        sheet.appendRow(['Дата','ПІБ','Телефон','Місто','Доставка','Товари','Сума','Промокод','Статус','UTM Source','UTM Campaign','UTM Video','НП Трек','Нотатки']);
      }
      const utm = data.utm || {};
      sheet.appendRow([
        new Date(), data.fio||'', "'"+String(data.phone||''),
        data.city||'', data.delivery||'', data.items||'',
        String(data.total||0)+' ₴', data.promo||'', 'Нове',
        utm.source||'', utm.campaign||'', utm.video||'','','',
      ]);

      const cartItems = Array.isArray(data.cart) ? data.cart : [];
      let itemsBlock = cartItems.map(i =>
        `  · ${i.brand||''} ${i.name||i.id}, розмір ${i.size}${(i.qty||1)>1?' × '+i.qty:''}${i.price?' — '+i.price+'₴':''}`
      ).join('\n') || data.items || '—';

      sendTelegramMessage(
        `👗 <b>НОВЕ ЗАМОВЛЕННЯ WEAR</b>\n\n` +
        `<b>Товари:</b>\n${itemsBlock}\n\n` +
        `👤 <b>Ім'я:</b> ${data.fio||'—'}\n` +
        `📞 <b>Тел:</b> ${data.phone||'—'}\n` +
        `🏙 <b>Місто:</b> ${data.city||'—'}\n` +
        `📦 <b>Доставка:</b> ${data.delivery||'—'}\n` +
        `💰 <b>Сума:</b> ${data.total||0} ₴` +
        (data.promo ? `\n🎟 <b>Промо:</b> ${data.promo}` : '') +
        (utm.video  ? `\n📊 video=${utm.video}, src=${utm.source||'—'}` : '')
      );
    }

    if (data.action === 'review') {
      let sheet = ss.getSheetByName('Відгуки');
      if (!sheet) { sheet = ss.insertSheet('Відгуки'); sheet.appendRow(['Дата','Автор','Оцінка','Текст']); }
      sheet.appendRow([new Date(), data.author||'Анонім', data.stars||5, data.text||'']);
      sendTelegramMessage(`✍️ <b>ВІДГУК WEAR</b>\n${'⭐'.repeat(Math.min(5,data.stars||5))}\n${data.author||'Анонім'}: ${data.text||'—'}`);
    }

    if (data.action === 'upsert_product') {
      const sheet = ss.getSheetByName('Товари') || (() => { const s=ss.insertSheet('Товари'); s.appendRow(HEADERS); return s; })();
      if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
      const idCol    = HEADERS.indexOf('ID')    + 1;
      const nameCol  = HEADERS.indexOf('Назва') + 1;
      const photoCol = HEADERS.indexOf('Фото')  + 1;
      const tgCol    = HEADERS.indexOf('TG')    + 1;
      const descCol  = HEADERS.indexOf('Опис')  + 1;
      const lastRow  = sheet.getLastRow();
      let found = -1;
      if (lastRow > 1) {
        const ids   = sheet.getRange(2,idCol,lastRow-1,1).getValues();
        const names = sheet.getRange(2,nameCol,lastRow-1,1).getValues();
        const inId  = String(data.article||'').toLowerCase();
        const inNm  = String(data.name||'').toLowerCase().substring(0,20);
        for (let i=0;i<ids.length;i++) {
          if ((inId && String(ids[i][0]).toLowerCase().includes(inId)) ||
              (inNm && String(names[i][0]).toLowerCase().substring(0,20)===inNm)) { found=i+2; break; }
        }
      }
      if (found > 0) {
        if (data.photo)       sheet.getRange(found,photoCol).setValue(data.photo);
        if (data.description) sheet.getRange(found,descCol).setValue(data.description);
        if (data.tg_link)     sheet.getRange(found,tgCol).setValue(data.tg_link);
      } else {
        const row = new Array(HEADERS.length).fill('');
        row[HEADERS.indexOf('ID')]         = data.article||('p_'+Date.now());
        row[HEADERS.indexOf('Назва')]      = data.name   ||'';
        row[HEADERS.indexOf('Бренд')]      = 'Angells';
        row[HEADERS.indexOf('Ціна')]       = data.price  ||0;
        row[HEADERS.indexOf('Стара ціна')] = data.oldPrice||0;
        row[HEADERS.indexOf('Фото')]       = data.photo  ||'';
        row[HEADERS.indexOf('Розміри')]    = data.sizes  ||'ONE SIZE';
        row[HEADERS.indexOf('Стать')]      = data.gender ||'Жінка';
        row[HEADERS.indexOf('Нове')]       = '1';
        row[HEADERS.indexOf('Опис')]       = data.description||'';
        row[HEADERS.indexOf('TG')]         = data.tg_link||'';
        row[HEADERS.indexOf('Категорія')]  = data.niche==='wear_bilyzna'?'bilyzna':'wear';
        sheet.appendRow(row);
      }
    }

    if (data.action === 'photo_request') {
      sendTelegramMessage(`📸 ФОТО ЗАПИТ WEAR\n${(data.product?data.product.brand+' '+data.product.name:'')}\n${data.size||''}`);
    }

    return jsonResp({ status:'ok' });
  } catch(e) {
    sendTelegramMessage('❌ WEAR GAS error: '+e.message);
    return jsonResp({ status:'error', message:e.message });
  }
}

// ── updateMasterDB — reads from Angells sheets ────────────── //
function updateMasterDB() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) { sendTelegramMessage('⚠️ WEAR updateMasterDB: lock timeout'); return 0; }
  try {
    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    let   masterSheet = ss.getSheetByName('Товари');
    if (!masterSheet) masterSheet = ss.insertSheet('Товари');
    masterSheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);

    let products = [];
    let ok = 0;

    for (const sup of SUPPLIERS) {
      try {
        const extSS = SpreadsheetApp.openById(sup.id);
        for (const tabName of sup.tabs) {
          try {
            const sheet = extSS.getSheetByName(tabName);
            if (!sheet) continue;
            const parsed = parseAngellsSheet(sheet, sup.category, sup.gender, sup.margin);
            if (parsed.length) { products = products.concat(parsed); ok++; }
          } catch(te) { sendTelegramMessage('⚠️ WEAR tab '+tabName+': '+te.message); }
        }
      } catch(se) { sendTelegramMessage('❌ WEAR supplier '+sup.id+': '+se.message); }
    }

    if (!products.length && ok === 0) { sendTelegramMessage('❌ WEAR: жодного товару не отримано'); return 0; }

    const unique = new Map();
    for (const p of products) { const k=fingerprint(p); if(!unique.has(k)) unique.set(k,p); }
    const final = [...unique.values()];

    if (final.length < MIN_PRODUCTS_SAFETY) {
      sendTelegramMessage(`⚠️ WEAR: мало товарів (${final.length}), каталог НЕ перезаписано`);
      return 0;
    }

    const lastRow = masterSheet.getLastRow();
    if (lastRow > 1) masterSheet.getRange(2,1,lastRow-1,HEADERS.length).clearContent();
    if (final.length) masterSheet.getRange(2,1,final.length,HEADERS.length).setValues(final);

    sendTelegramMessage(`✅ WEAR каталог оновлено: ${final.length} товарів (${final.filter(p=>p[12]==='bilyzna').length} білизна + ${final.filter(p=>p[12]==='wear').length} одяг)`);
    return final.length;
  } finally {
    lock.releaseLock();
  }
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'updateMasterDB') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateMasterDB').timeBased().everyHours(2).create();
  Logger.log('Тригер встановлено: updateMasterDB кожні 2 години');
}

// ── ADMIN ─────────────────────────────────────────────────── //
function _adminGetOrders(params) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Orders');
  if (!sheet || sheet.getLastRow() < 1) return { orders:[], total:0 };
  const data  = sheet.getDataRange().getValues();
  const limit = Number((params||{}).limit) || 200;
  const all = data.map((row,i) => ({
    id: i+1,
    date:     row[ORD_COL.date] instanceof Date ? row[ORD_COL.date].toISOString() : String(row[ORD_COL.date]||''),
    fio:      String(row[ORD_COL.fio]     ||''),
    phone:    String(row[ORD_COL.phone]   ||'').replace(/^'/,''),
    city:     String(row[ORD_COL.city]    ||''),
    delivery: String(row[ORD_COL.delivery]||''),
    items:    String(row[ORD_COL.items]   ||''),
    total:    String(row[ORD_COL.total]   ||''),
    promo:    String(row[ORD_COL.promo]   ||''),
    status:   String(row[ORD_COL.status]  ||'Нове'),
    site:     'wear',
  })).filter(o => o.fio||o.phone);
  return { orders: all.slice().reverse().slice(0,limit), total:all.length, ts:Date.now() };
}

function _adminUpdateOrderStatus(body) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Orders');
  if (!sheet) return { ok:false, error:'no_sheet' };
  const rowNum = parseInt(body.orderId);
  if (!rowNum||rowNum<1||rowNum>sheet.getLastRow()) return { ok:false, error:'invalid_row' };
  if (body.status)   sheet.getRange(rowNum, ORD_COL.status+1).setValue(body.status);
  if (body.np_track) sheet.getRange(rowNum, ORD_COL.npTrack+1).setValue(body.np_track);
  return { ok:true };
}
