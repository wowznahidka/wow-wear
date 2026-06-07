/* ============================================================
   WOW.WEAR — STYLIST LEAD QUIZ
   Collects mini-quiz answers, builds prefilled Telegram message,
   opens t.me/wowwear with it. Saves draft in localStorage.
   ============================================================ */

const ST_TG_HANDLE = 'wowwea';
const ST_LS_KEY    = 'wow_stylist_draft';

function initStylist() {
  _stylistBindChips();
  _stylistRestoreDraft();
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

function _stylistBuildMsg(d) {
  const lines = [
    'Привіт! 👋 Хочу персональний стилістичний розбір.',
    '',
    d.name  ? `👤 Імʼя: ${d.name}` : null,
    d.hair  ? `💇 Волосся: ${d.hair}` : null,
    d.eyes  ? `👁 Очі: ${d.eyes}` : null,
    d.skin  ? `🎨 Шкіра: ${d.skin}` : null,
    d.body  ? `🧍 Фігура: ${d.body}` : null,
    d.size  ? `📐 Розмір: ${d.size}` : null,
    (Array.isArray(d.style) && d.style.length) ? `✨ Стиль: ${d.style.join(', ')}` : null,
    d.budget ? `💰 Бюджет: ${d.budget}` : null,
    d.goal  ? `\n🎯 Мета:\n${d.goal}` : null,
    '',
    '— надіслано з wow-wear (Стиліст)',
  ].filter(Boolean);
  return lines.join('\n');
}

function submitStylistLead() {
  const btn = document.getElementById('st-submit-btn');
  const d   = _stylistCollect();

  if (!d.name && !d.hair && !d.body) {
    if (typeof toast === 'function') toast('Заповни хоч кілька полів — інакше стилісту нема з чого почати 😊');
    document.getElementById('st-quiz')?.scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }

  _stylistSaveDraft();
  try {
    if (typeof gtag === 'function') gtag('event', 'stylist_lead', { event_category: 'engagement' });
    if (typeof fbq  === 'function') fbq('trackCustom', 'StylistLead');
  } catch(_) {}

  if (btn) { btn.disabled = true; btn.textContent = '✈️ Відкриваю Telegram…'; }

  // Fire-and-forget POST to GAS — saves lead + sends TG notification to owner.
  // We don't await: the TG link must open inside the same user-gesture tick
  // (especially on iOS), otherwise the popup is blocked.
  try {
    let utm = {};
    try { utm = JSON.parse(localStorage.getItem('wow_utm') || '{}'); } catch(_) {}
    const payload = { action:'stylist_lead', ...d, utm };
    if (typeof postData === 'function') {
      postData(payload);
    } else if (typeof CFG !== 'undefined' && CFG.GAS_URL) {
      fetch(CFG.GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload), mode:'no-cors' });
    }
  } catch(_) {}

  const msg = _stylistBuildMsg(d);
  const url = `https://t.me/${ST_TG_HANDLE}?text=${encodeURIComponent(msg)}`;

  if (typeof openTgLink === 'function') openTgLink(url);
  else window.location.href = url;

  setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = '✈️ Надіслати в Telegram'; } }, 2500);
}
