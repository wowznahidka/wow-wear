/* ============================================================
   WOW.WEAR — STYLIST AI QUIZ
   Collects mini-quiz, POSTs to GAS which calls Groq Llama 3.3
   for analysis, renders result inline with capsule of products
   picked from WEAR catalog. "Save to Telegram" button forwards
   the full result to the owner's TG.
   ============================================================ */

const ST_TG_HANDLE = 'wowwea';
const ST_LS_KEY    = 'wow_stylist_draft';
const ST_RES_KEY   = 'wow_stylist_result';

let _stylistLastResult = null;
let _stylistLastInput  = null;

function initStylist() {
  _stylistBindChips();
  _stylistRestoreDraft();
  _stylistRestoreLastResult();
}

function _stylistBindChips() {
  document.querySelectorAll('#st-quiz .st-chips').forEach(group => {
    if (group.dataset.bound) return;
    group.dataset.bound = '1';
    const multi = group.classList.contains('st-chips-multi');
    group.querySelectorAll('.st-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (multi) {
          chip.classList.toggle('selected');
        } else {
          group.querySelectorAll('.st-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
        }
        _stylistSaveDraft();
      });
    });
  });
  ['st-name','st-goal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('input', _stylistSaveDraft);
    }
  });
}

function _stylistCollect() {
  const data = {
    name:  (document.getElementById('st-name')?.value || '').trim(),
    goal:  (document.getElementById('st-goal')?.value || '').trim(),
  };
  document.querySelectorAll('#st-quiz .st-chips').forEach(group => {
    const field = group.dataset.field;
    const multi = group.classList.contains('st-chips-multi');
    const picked = [...group.querySelectorAll('.st-chip.selected')].map(c => c.dataset.v);
    data[field] = multi ? picked : (picked[0] || '');
  });
  return data;
}

function _stylistSaveDraft() {
  try { localStorage.setItem(ST_LS_KEY, JSON.stringify(_stylistCollect())); } catch(_) {}
}

function _stylistRestoreDraft() {
  let d;
  try { d = JSON.parse(localStorage.getItem(ST_LS_KEY) || 'null'); } catch(_) {}
  if (!d) return;
  if (d.name) { const n = document.getElementById('st-name'); if (n) n.value = d.name; }
  if (d.goal) { const g = document.getElementById('st-goal'); if (g) g.value = d.goal; }
  document.querySelectorAll('#st-quiz .st-chips').forEach(group => {
    const field = group.dataset.field;
    const val   = d[field];
    if (!val) return;
    const vals = Array.isArray(val) ? val : [val];
    group.querySelectorAll('.st-chip').forEach(c => {
      if (vals.includes(c.dataset.v)) c.classList.add('selected');
    });
  });
}

function _stylistRestoreLastResult() {
  try {
    const cached = JSON.parse(localStorage.getItem(ST_RES_KEY) || 'null');
    if (cached && cached.result && cached.input) {
      _stylistLastResult = cached.result;
      _stylistLastInput  = cached.input;
      _stylistRenderResult(cached.result, cached.input);
    }
  } catch(_) {}
}

async function submitStylistLead() {
  const btn = document.getElementById('st-submit-btn');
  const d   = _stylistCollect();

  if (!d.name && !d.hair && !d.body) {
    if (typeof toast === 'function') toast('Заповни хоч кілька полів — інакше стилісту нема з чого почати 😊');
    document.getElementById('st-quiz')?.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }

  _stylistSaveDraft();
  try {
    if (typeof gtag === 'function') gtag('event', 'stylist_analyze', { event_category: 'engagement' });
    if (typeof fbq  === 'function') fbq('trackCustom', 'StylistAnalyze');
  } catch(_) {}

  if (btn) { btn.disabled = true; btn.textContent = '✨ AI готує розбір…'; }
  _stylistShowLoader();

  let utm = {};
  try { utm = JSON.parse(localStorage.getItem('wow_utm') || '{}'); } catch(_) {}
  const payload = { action:'stylist_analyze', ...d, utm };

  let res = null;
  try {
    const r = await fetch(CFG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (r.ok) res = await r.json();
  } catch(err) {
    // network or CORS error; res stays null → show retry
  }

  if (btn) { btn.disabled = false; btn.textContent = '✈️ Згенерувати ще раз'; }

  if (!res || !res.ok || !res.analysis) {
    _stylistShowError();
    return;
  }

  _stylistLastResult = res.analysis;
  _stylistLastInput  = d;
  try { localStorage.setItem(ST_RES_KEY, JSON.stringify({ result: res.analysis, input: d, ts: Date.now() })); } catch(_) {}
  _stylistRenderResult(res.analysis, d);
}

function _stylistShowLoader() {
  const host = document.getElementById('st-result') || _stylistEnsureResultHost();
  host.innerHTML = `
    <div class="st-loader">
      <div class="st-loader-orbit"><span></span><span></span><span></span></div>
      <div class="st-loader-title">✨ AI вивчає твої дані…</div>
      <div class="st-loader-sub">Визначаю колорит, тип фігури, підбираю капсулу з нашого каталогу. ~10-20 секунд.</div>
    </div>`;
  host.scrollIntoView({ behavior:'smooth', block:'start' });
}

function _stylistShowError() {
  const host = document.getElementById('st-result') || _stylistEnsureResultHost();
  host.innerHTML = `
    <div class="st-error">
      <div class="st-error-ico">⚠️</div>
      <div class="st-error-title">Не вдалось згенерувати розбір</div>
      <div class="st-error-sub">Спробуй ще раз або напиши нам у Telegram — допоможемо вручну.</div>
      <button class="st-error-tg" onclick="_stylistFallbackTg()">✈️ Написати в Telegram</button>
    </div>`;
}

function _stylistEnsureResultHost() {
  let host = document.getElementById('st-result');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'st-result';
  host.className = 'st-result';
  const quiz = document.getElementById('st-quiz');
  quiz.parentNode.insertBefore(host, quiz.nextSibling);
  return host;
}

function _stylistRenderResult(a, input) {
  const host = document.getElementById('st-result') || _stylistEnsureResultHost();
  const paletteYes = (a.palette_yes || []).map(c => `<span class="st-color" style="background:${_safeColor(c)}" title="${esc(c)}"></span>`).join('');
  const paletteNo  = (a.palette_no  || []).map(c => `<span class="st-color st-color-no" style="background:${_safeColor(c)}" title="${esc(c)}"></span>`).join('');
  const picks = a.picks_full || [];
  const picksHtml = picks.length
    ? picks.map(p => `
        <article class="st-pick" onclick="openProductDetail(findProd('${esc(p.id)}'))" role="button" tabindex="0">
          <div class="st-pick-img-wrap"><img class="st-pick-img" src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>
          <div class="st-pick-body">
            <div class="st-pick-name">${esc(p.name)}</div>
            <div class="st-pick-price">${p.price}₴</div>
          </div>
        </article>`).join('')
    : '<div class="st-empty">Каталог поки не дає чітких збігів. Напиши нам у Telegram — підберемо вручну.</div>';

  const name = (input && input.name) ? `, ${input.name}` : '';
  host.innerHTML = `
    <div class="st-res-card">
      <div class="st-res-hero">
        <span class="st-res-tag">ТВІЙ КОЛОРИТ</span>
        <h2 class="st-res-season">${esc(a.season || 'Сезон уточнюємо')}</h2>
        <p class="st-res-why">${esc(a.season_why || '')}</p>
      </div>

      <div class="st-res-section">
        <div class="st-res-h3">🎨 Палітра «ТАК»</div>
        <div class="st-res-palette">${paletteYes || '<span class="st-empty">—</span>'}</div>
      </div>

      <div class="st-res-section">
        <div class="st-res-h3">🚫 Палітра «НІ»</div>
        <div class="st-res-palette">${paletteNo || '<span class="st-empty">—</span>'}</div>
      </div>

      <div class="st-res-section">
        <div class="st-res-h3">🧍 Фігура та силует</div>
        <p class="st-res-body">${esc(a.body_advice || '—')}</p>
      </div>

      <div class="st-res-section">
        <div class="st-res-h3">✨ Концепція стилю</div>
        <p class="st-res-body">${esc(a.style_concept || '—')}</p>
      </div>

      <div class="st-res-section">
        <div class="st-res-h3">👗 Капсула з нашого каталогу${name}</div>
        <div class="st-res-picks">${picksHtml}</div>
      </div>

      <div class="st-res-cta-wrap">
        <button class="st-res-tg-btn" onclick="sendStylistResultToTg()">
          ✈️ Зберегти розбір у Telegram
        </button>
        <button class="st-res-redo" onclick="document.getElementById('st-quiz').scrollIntoView({behavior:'smooth',block:'start'})">
          ↺ Змінити відповіді
        </button>
      </div>
    </div>`;

  host.scrollIntoView({ behavior:'smooth', block:'start' });
}

function _safeColor(c) {
  c = String(c || '').trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  return '#888';
}

function sendStylistResultToTg() {
  if (!_stylistLastResult || !_stylistLastInput) return;
  const a = _stylistLastResult;
  const d = _stylistLastInput;
  const picks = (a.picks_full || []).map(p => `  · ${p.name} — ${p.price}₴`).join('\n') || '—';
  const msg = [
    'Привіт! 👋 Я зробила AI-розбір на сайті wow-wear.',
    '',
    d.name  ? `👤 Імʼя: ${d.name}` : null,
    d.body  ? `🧍 Фігура: ${d.body}` : null,
    d.size  ? `📐 Розмір: ${d.size}` : null,
    d.budget? `💰 Бюджет: ${d.budget}` : null,
    '',
    `🎨 Колорит: ${a.season || '—'}`,
    `💡 ${a.season_why || ''}`,
    '',
    `🧍 Фігура: ${a.body_advice || '—'}`,
    `✨ Стиль: ${a.style_concept || '—'}`,
    '',
    '👗 Капсула:',
    picks,
    '',
    'Хочу поспілкуватись зі стилістом — підтвердити підбір і докупити те що бракує.',
  ].filter(Boolean).join('\n');

  const url = `https://t.me/${ST_TG_HANDLE}?text=${encodeURIComponent(msg)}`;
  if (typeof openTgLink === 'function') openTgLink(url);
  else window.location.href = url;
}

function _stylistFallbackTg() {
  const d = _stylistCollect();
  const lines = [
    'Привіт! 👋 Хотіла зробити AI-розбір на сайті, але щось пішло не так.',
    '',
    d.name  ? `👤 Імʼя: ${d.name}` : null,
    d.hair  ? `💇 Волосся: ${d.hair}` : null,
    d.body  ? `🧍 Фігура: ${d.body}` : null,
    d.size  ? `📐 Розмір: ${d.size}` : null,
    d.goal  ? `\n🎯 Мета: ${d.goal}` : null,
  ].filter(Boolean).join('\n');
  const url = `https://t.me/${ST_TG_HANDLE}?text=${encodeURIComponent(lines)}`;
  if (typeof openTgLink === 'function') openTgLink(url);
  else window.location.href = url;
}
