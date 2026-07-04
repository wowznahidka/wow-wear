/* ============================================================
   WOW.WEAR — LOOK BUILDER
   Рейка з вішалками → збери лук → купи весь образ.
   Анімації: гойдання вішалок, переліт речі у слот, drop-in,
   count-up ціни, glow при повному луку.
   ============================================================ */

const LOOK_SLOTS = {
  kofta:  { label: 'Кофта',    icon: '🧥', types: ['Худі', 'Зіп-худі', 'Світшот'] },
  tee:    { label: 'Футболка', icon: '👕', types: ['Футболка', 'Поло'] },
  bottom: { label: 'Низ',      icon: '👖', types: ['Штани', 'Шорти'] },
  acc:    { label: 'Аксесуар', icon: '🧢', types: ['Аксесуари', 'Інше'] },
};
const LOOK_CORE   = ['kofta', 'tee', 'bottom'];   // повний лук = ці три
const LOOK_RAIL_N = 40;                            // вішалок на рейці

S.look = _safeParse('wow_look', {});               // { slotKey: {id, size} }

let _lkRailCat    = 'tee';
let _lkPools      = null;
let _lkPrevTotal  = 0;
let _lkCelebrated = false;
let _lkSwayVel    = 0;
let _lkSwayRAF    = null;
let _lkLastScroll = 0;

// ── INIT ─────────────────────────────────────────── */
function initLook() {
  const cat = S.catalog && S.catalog.all;
  if (!cat || !cat.length) { setTimeout(() => { if (S.activeTab === 'look') initLook(); }, 1200); return; }
  if (!_lkPools) _lkBuildPools();
  _lkRenderCats();
  renderLookSlots(false);
  renderLookRail();
  _lkUpdateFooter(false);
}

function _lkBuildPools() {
  const all = (S.catalog.all || []).filter(p => p.image && String(p.image).startsWith('http'));
  _lkPools = {};
  for (const [key, cfg] of Object.entries(LOOK_SLOTS)) {
    const pool = all.filter(p => cfg.types.includes(p.clothingType));
    // Перемішуємо стабільно в межах доби — рейка щодня трохи інша
    const seed = Math.floor(Date.now() / 86400000);
    pool.sort((a, b) => hashStr(a.id + seed) - hashStr(b.id + seed));
    _lkPools[key] = pool;
  }
}

function _lkSlotOf(p) {
  for (const [key, cfg] of Object.entries(LOOK_SLOTS))
    if (cfg.types.includes(p.clothingType)) return key;
  return 'acc';
}

// ── КАТЕГОРІЇ НАД РЕЙКОЮ ─────────────────────────── */
function _lkRenderCats() {
  const el = document.getElementById('lk-cats');
  if (!el) return;
  el.innerHTML = Object.entries(LOOK_SLOTS).map(([key, cfg]) => {
    const n = (_lkPools[key] || []).length;
    if (!n) return '';
    return `<button class="lk-cat${key === _lkRailCat ? ' active' : ''}" role="tab"
      aria-selected="${key === _lkRailCat}" onclick="lookSetCat('${key}')">${cfg.icon} ${cfg.label}</button>`;
  }).join('');
}

function lookSetCat(key) {
  if (_lkRailCat === key) return;
  _lkRailCat = key;
  _lkRenderCats();
  renderLookRail();
  _haptic(10);
}

// ── РЕЙКА З ВІШАЛКАМИ ────────────────────────────── */
const _LK_HANGER_SVG = `<svg class="lk-h-svg" viewBox="0 0 60 22" aria-hidden="true">
  <path d="M30 1 a3.2 3.2 0 1 1 3.2 3.2 c-1.4.4-2.2 1.2-2.2 2.6 L57 18.6 a1.6 1.6 0 0 1-.9 3H3.9 a1.6 1.6 0 0 1-.9-3 L29 6.8"
        fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function renderLookRail() {
  const rail = document.getElementById('lk-rail');
  if (!rail) return;
  const pool   = (_lkPools[_lkRailCat] || []).slice(0, LOOK_RAIL_N);
  const usedId = S.look[_lkRailCat] && S.look[_lkRailCat].id;

  rail.innerHTML = pool.map((p, i) => `
    <button class="lk-hanger${p.id === usedId ? ' used' : ''}" style="--i:${i};--k:${(0.7 + (hashStr(p.id) % 7) / 10).toFixed(1)}"
            onclick="lookPick('${esc(p.id)}', this)" aria-label="${esc(p.brand)} ${esc(p.name)}, ${p.price}₴">
      <span class="lk-h-swing">
        ${_LK_HANGER_SVG}
        <img class="lk-h-img" src="${esc(p.image)}" alt="" loading="lazy" onload="this.classList.add('loaded')">
        <span class="lk-h-meta"><b>${esc(p.brand)}</b>${fmtPrice(p.price)}</span>
      </span>
    </button>`).join('') ||
    `<div class="lk-rail-empty">Порожньо 😔</div>`;

  rail.scrollLeft = 0;
  rail.onscroll = _lkOnScroll;
}

// Гойдання від швидкості скролу
function _lkOnScroll(e) {
  const el = e.target;
  const v  = el.scrollLeft - _lkLastScroll;
  _lkLastScroll = el.scrollLeft;
  _lkSwayVel = Math.max(-14, Math.min(14, _lkSwayVel + v * 0.35));
  if (!_lkSwayRAF) _lkSwayTick(el);
}

function _lkSwayTick(el) {
  _lkSwayRAF = requestAnimationFrame(() => {
    _lkSwayVel *= 0.90;
    el.style.setProperty('--sway', _lkSwayVel.toFixed(2) + 'deg');
    if (Math.abs(_lkSwayVel) > 0.15) _lkSwayTick(el);
    else { el.style.setProperty('--sway', '0deg'); _lkSwayRAF = null; }
  });
}

// ── ВИБІР РЕЧІ: ПЕРЕЛІТ У СЛОТ ───────────────────── */
function lookPick(id, hangerEl) {
  const p = findProd(id);
  if (!p) return;
  const slotKey = _lkSlotOf(p);
  const already = S.look[slotKey] && S.look[slotKey].id === id;
  if (already) { lookRemove(slotKey); return; }

  const slotEl = document.querySelector(`.lk-slot[data-slot="${slotKey}"]`);
  const imgEl  = hangerEl && hangerEl.querySelector('.lk-h-img');

  if (imgEl && slotEl) _lkFly(imgEl, slotEl, () => _lkCommit(slotKey, p));
  else _lkCommit(slotKey, p);

  _haptic(15);
}

function _lkFly(fromEl, toEl, done) {
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const ghost = fromEl.cloneNode();
  ghost.className = 'lk-ghost';
  ghost.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const sc = Math.min(b.width / a.width, 1) * 0.72;
    ghost.style.transform = `translate(${dx}px,${dy}px) scale(${sc}) rotate(${dx > 0 ? 8 : -8}deg)`;
    ghost.style.opacity = '0.25';
  });
  setTimeout(() => { ghost.remove(); done(); }, 520);
}

function _lkCommit(slotKey, p) {
  const defSize = p.sizes && p.sizes.length
    ? (p.sizes.map(String).includes('M') ? 'M' : String(p.sizes[0])) : 'ONE SIZE';
  S.look[slotKey] = { id: p.id, size: defSize };
  _lkSave();
  renderLookSlots(true, slotKey);
  renderLookRail();
  _lkUpdateFooter(true);
  _lkMaybeCelebrate();
}

function lookRemove(slotKey) {
  delete S.look[slotKey];
  _lkCelebrated = false;
  _lkSave();
  renderLookSlots(false);
  renderLookRail();
  _lkUpdateFooter(true);
  _haptic(10);
}

function lookSetSize(slotKey, size, ev) {
  if (ev) ev.stopPropagation();
  if (S.look[slotKey]) { S.look[slotKey].size = size; _lkSave(); renderLookSlots(false); }
}

function _lkSave() { localStorage.setItem('wow_look', JSON.stringify(S.look)); }

// ── СЛОТИ ОБРАЗУ ─────────────────────────────────── */
function renderLookSlots(animate, animKey) {
  const wrap = document.getElementById('lk-slots');
  if (!wrap) return;
  wrap.innerHTML = Object.entries(LOOK_SLOTS).map(([key, cfg]) => {
    const it = S.look[key];
    const p  = it && findProd(it.id);
    const anim = animate && key === animKey ? ' lk-drop' : '';
    if (!p) return `
      <button class="lk-slot empty" data-slot="${key}" onclick="lookSetCat('${key}')" aria-label="Додати: ${cfg.label}">
        <span class="lk-slot-ico" aria-hidden="true">${cfg.icon}</span>
        <span class="lk-slot-lbl">${cfg.label}</span>
        <span class="lk-slot-plus" aria-hidden="true">+</span>
      </button>`;
    const sizes = (p.sizes && p.sizes[0] !== 'ONE SIZE' ? p.sizes.slice(0, 6) : []);
    return `
      <div class="lk-slot filled${anim}" data-slot="${key}">
        <button class="lk-slot-rm" onclick="lookRemove('${key}')" aria-label="Прибрати">✕</button>
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
        <div class="lk-slot-info">
          <span class="lk-slot-brand">${esc(p.brand)}</span>
          <span class="lk-slot-price">${fmtPrice(p.price)}</span>
        </div>
        ${sizes.length ? `<div class="lk-slot-sizes">${sizes.map(sz =>
          `<button class="lk-sz${String(it.size) === String(sz) ? ' sel' : ''}"
                   onclick="lookSetSize('${key}','${sz}',event)">${sz}</button>`).join('')}</div>` : ''}
      </div>`;
  }).join('');
}

// ── ФУТЕР: ЦІНА + КУПИТИ ─────────────────────────── */
function _lkItems() {
  return Object.values(S.look).map(it => {
    const p = findProd(it.id);
    return p ? { p, size: it.size } : null;
  }).filter(Boolean);
}

function _lkUpdateFooter(animate) {
  const items = _lkItems();
  const total = items.reduce((s, x) => s + (Number(x.p.price) || 0), 0);
  const btn   = document.getElementById('lk-buy');
  const out   = document.getElementById('lk-total');
  if (btn) {
    btn.disabled = !items.length;
    btn.textContent = items.length ? `Купити лук (${items.length})` : 'Купити лук';
    btn.classList.toggle('ready', LOOK_CORE.every(k => S.look[k]));
  }
  if (!out) return;
  if (!animate) { out.textContent = fmtPrice(total); _lkPrevTotal = total; return; }
  const from = _lkPrevTotal, t0 = performance.now();
  const tick = now => {
    const k = Math.min(1, (now - t0) / 420);
    out.textContent = fmtPrice(from + (total - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick); else _lkPrevTotal = total;
  };
  requestAnimationFrame(tick);
}

function _lkMaybeCelebrate() {
  if (_lkCelebrated || !LOOK_CORE.every(k => S.look[k])) return;
  _lkCelebrated = true;
  _haptic([20, 40, 20]);
  toast('🔥 ЛУК ГОТОВИЙ! Виглядатиме шалено');
  if (window.fbq) fbq('trackCustom', 'LookBuilt', { items: _lkItems().length });
  const sec = document.getElementById('page-look');
  if (sec) { sec.classList.remove('lk-celebrate'); void sec.offsetWidth; sec.classList.add('lk-celebrate'); }
}

// ── ВИПАДКОВИЙ ЛУК ───────────────────────────────── */
function randomLook() {
  if (!_lkPools) return;
  const keys = Object.keys(LOOK_SLOTS).filter(k => (_lkPools[k] || []).length);
  S.look = {};
  _lkCelebrated = false;
  renderLookSlots(false);
  keys.forEach((key, i) => {
    setTimeout(() => {
      const pool = _lkPools[key];
      const p = pool[Math.floor(Math.random() * Math.min(pool.length, 60))];
      _lkCommit(key, p);
      _haptic(12);
    }, 180 * (i + 1));
  });
  if (window.fbq) fbq('trackCustom', 'LookRandom');
}

// ── КУПИТИ ВЕСЬ ЛУК ──────────────────────────────── */
function buyLook() {
  const items = _lkItems();
  if (!items.length) return;
  let added = 0, total = 0;
  for (const { p, size } of items) {
    const sz = p.sizes && p.sizes[0] === 'ONE SIZE' ? 'ONE SIZE'
             : (p.sizes && p.sizes.map(String).includes(String(size)) ? size : String((p.sizes || ['M'])[0]));
    const szVal = sz === 'ONE SIZE' ? 'ONE SIZE' : (isNaN(Number(sz)) ? sz : Number(sz));
    if (!S.cart.some(c => c.id === p.id && String(c.size) === String(szVal))) {
      S.cart.push({ ...p, size: szVal, qty: 1 });
      added++;
    }
    total += Number(p.price) || 0;
  }
  saveCart();
  updateBadges();
  _haptic(30);
  if (window.fbq) fbq('trackCustom', 'LookOrderClick', { currency: 'UAH', value: total, num_items: items.length });
  toast(added ? `✅ Лук у кошику — ${items.length} ${items.length === 1 ? 'річ' : items.length < 5 ? 'речі' : 'речей'}!` : 'Лук вже в кошику 😉');
  openSheet('sheet-cart');
}
