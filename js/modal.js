/* ============================================================
   WOW.ZNAHIDKA вЂ” MODALS: SIZE PICKER & PRODUCT DETAIL
   ============================================================ */

function _copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).catch(() => {}); return; }
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  } catch(e) {}
}

// в”Ђв”Ђ SIZE PICKER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */
let _autoSelectTimer = null;

function openSizePicker(product) {
  if (!product) return;
  clearTimeout(_autoSelectTimer);
  _autoSelectTimer = null;
  S.spProduct      = product;
  S.spSelectedSize = null;

  // Product info row
  document.getElementById('sp-product-info').innerHTML = `
    ${product.image && product.image.startsWith('http')
      ? `<img class="sp-img" src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" onload="this.classList.add('loaded')">`
      : `<div class="sp-img-ph" aria-hidden="true"></div>`}
    <div class="sp-info">
      <div class="sp-brand">${esc(product.brand)}</div>
      <div class="sp-name">${esc(product.name)}</div>
      <div class="sp-price">${product.price}в‚ґ</div>
    </div>`;

  // Size grid
  const grid  = document.getElementById('sp-size-grid');
  const mySize = getRememberedSize();
  const hasMySz = mySize && (product.sizes.includes(mySize) || product.sizes.includes(String(mySize)));
  const low    = product.sizes.length === 1 && product.sizes[0] !== 'ONE SIZE';

  const qty = product.sizeQty || {};
  const hasQtyData = Object.keys(qty).length > 0;

  grid.innerHTML = product.sizes.map(sz => {
    const szArg    = sz === 'ONE SIZE' ? "'ONE SIZE'" : sz;
    const pairQty  = hasQtyData ? (qty[sz] || 1) : null;
    const isLast   = low || (hasQtyData && pairQty === 1);
    const badge    = (hasQtyData && pairQty >= 2)
      ? `<span class="sz-qty">${pairQty}</span>`
      : '';
    return `<button class="sz-btn${isLast ? ' sz-btn-last' : ''}" data-size="${sz}" onclick="selectSize(${szArg})" aria-label="Р РѕР·РјС–СЂ ${sz}">
      ${sz}${badge}
    </button>`;
  }).join('');

  // My size shortcut
  const mySzWrap = document.getElementById('sp-my-size-bar-wrap');
  if (mySzWrap) {
    mySzWrap.innerHTML = hasMySz
      ? `<div class="sp-my-size-bar" role="button" onclick="selectSize(${mySize});_haptic(12)">
           вњ… ${L.mySizeLabel}: <strong>${mySize}</strong>
           <span style="margin-left:auto">${L.mySizeTap}</span>
         </div>`
      : '';
    if (hasMySz) {
      _autoSelectTimer = setTimeout(() => {
        if (S.spProduct && S.spProduct.id === product.id) selectSize(mySize);
        _autoSelectTimer = null;
      }, 80);
    }
  }

  // Urgency banner вЂ” РѕРґРёРЅ СЂРѕР·РјС–СЂ Р·Р°Р»РёС€РёРІСЃСЏ
  const urgencyEl  = document.getElementById('sp-urgency');
  const confirmBtn = document.querySelector('.sp-confirm-btn');
  const isLastSize = product.sizes.length === 1 && product.sizes[0] !== 'ONE SIZE';
  if (urgencyEl) {
    urgencyEl.innerHTML = isLastSize
      ? `<div class="sp-urgency-banner" role="alert">вљЎ РћСЃС‚Р°РЅРЅС–Р№ СЂРѕР·РјС–СЂ вЂ” Р±СЂРѕРЅСЋР№ Р·Р°СЂР°Р·</div>`
      : '';
  }
  if (confirmBtn) {
    confirmBtn.style.background = isLastSize ? 'var(--red)' : '';
    confirmBtn.style.boxShadow  = isLastSize ? 'var(--shadow-red)' : '';
  }

  // Open sheet
  closeAllSheets();
  document.getElementById('sheet-size')?.classList.add('on');
  document.getElementById('overlay')?.classList.add('on');
  _openSheetId = 'sheet-size';
}


function selectSize(sz) {
  S.spSelectedSize = sz;
  document.querySelectorAll('.sz-btn').forEach(b => {
    const bv = b.dataset.size;
    b.classList.toggle('sel', bv === String(sz) || Number(bv) === Number(sz));
  });
  rememberSize(sz);
  _haptic(12);
}

function requestPhoto() {
  if (!S.spProduct) return;
  const p = S.spProduct;
  if (p.tgLink) { openTgLink(p.tgLink); return; }
  const szText = S.spSelectedSize ? `РћР±'С”Рј: ${S.spSelectedSize}` : '';
  const productUrl = `${location.origin}${location.pathname}?product=${p.id}`;
  const msg = `РџСЂРёРІС–С‚! рџ‘‹ РҐРѕС‡Сѓ Р·Р°РјРѕРІРёС‚Рё РїР°СЂС„СѓРј рџЊё\n${p.brand} ${p.name}\n${szText}\nрџ’° ${p.price}в‚ґ\nрџ”— ${productUrl}`;
  postData({ action: 'photo_request', product: p, size: S.spSelectedSize });
  openTgLink(`${CFG.TG_URL}?text=${encodeURIComponent(msg)}`);
}

function confirmSize() {
  if (!S.spSelectedSize) {
    toast('вљ пёЏ РћР±РµСЂС–С‚СЊ СЂРѕР·РјС–СЂ!');
    document.getElementById('sp-size-grid')?.animate(
      [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }],
      { duration: 240, iterations: 2 }
    );
    return;
  }
  const p        = S.spProduct;
  const sz       = S.spSelectedSize;
  const existing = S.cart.find(c => c.id === p.id && String(c.size) === String(sz));
  if (existing) {
    toast(`вљ пёЏ ${esc(p.name)} (${sz}) РІР¶Рµ С” РІ РєРѕС€РёРєСѓ! <a onclick="openSheet('sheet-cart')">РџРµСЂРµРіР»СЏРЅСѓС‚Рё в†’</a>`);
    closeAllSheets();
    return;
  }
  S.cart.push({ ...p, size: sz, qty: 1 });
  saveCart();
  updateBadges();
  renderCartSheet();
  closeAllSheets();
  _haptic([10, 30, 10]);
  // GA4 + Meta Pixel
  if (window.gtag) gtag('event', 'add_to_cart', { currency: 'UAH', value: p.price, items: [{ item_id: p.id, item_name: `${p.brand} ${p.name}`, price: p.price }] });
  if (window.fbq)  fbq('track', 'AddToCart', { currency: 'UAH', value: p.price, content_ids: [p.id], content_type: 'product' });
  if (window.ttq)  try { ttq.track('AddToCart', { currency: 'UAH', value: p.price, content_id: p.id, content_name: `${p.brand} ${p.name}`, content_type: 'product', quantity: 1 }); } catch(_) {}
  toast(`вњ… ${esc(p.name)} (${sz}) вЂ” РІ РєРѕС€РёРєСѓ! <a onclick="openSheet('sheet-cart')">РџРµСЂРµРіР»СЏРЅСѓС‚Рё в†’</a>`);
}

// в”Ђв”Ђ PRODUCT DETAIL в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */

function _pdPhotoTg() {
  const p = S.pdProduct;
  if (!p) return;
  if (p.tgLink) { openTgLink(p.tgLink); return; }
  const productUrl = `${location.origin}${location.pathname}?product=${p.id}`;
  const msg = `РџСЂРёРІС–С‚! рџ‘‹ РҐРѕС‡Сѓ Р·Р°РјРѕРІРёС‚Рё РїР°СЂС„СѓРј рџЊё\n${p.brand} ${p.name}\nрџ’° ${p.price}в‚ґ\nрџ”— ${productUrl}`;
  postData({ action: 'photo_request', product: p, size: null });
  openTgLink(`${CFG.TG_URL}?text=${encodeURIComponent(msg)}`);
}

function openProductDetail(product) {
  if (!product) return;
  S.pdProduct = product;
  trackView(product);
  if (window.fbq)  fbq('track', 'ViewContent', { currency: 'UAH', value: product.price, content_ids: [product.id], content_name: `${product.brand} ${product.name}`, content_type: 'product' });
  if (window.gtag) gtag('event', 'view_item', { currency: 'UAH', value: product.price, items: [{ item_id: product.id, item_name: `${product.brand} ${product.name}`, price: product.price }] });
  if (window.ttq)  ttq.track('ViewContent', { currency: 'UAH', value: product.price, content_id: product.id, content_name: `${product.brand} ${product.name}` });

  const faved = isFav(product.id);
  const pct   = discPct(product);

  // Scarcity
  const qty   = product.sizeQty || {};
  const qKeys = Object.keys(qty);
  const total = qKeys.length > 0
    ? qKeys.reduce((s, k) => s + (qty[k] || 1), 0)
    : product.sizes.length;
  const hasRealSizes = product.sizes.length > 0 && product.sizes[0] !== 'ONE SIZE';
  const scarcHtml = hasRealSizes && total === 1
    ? `<div class="pd-scarc-hero sc-last">рџ”Ґ РћСЃС‚Р°РЅРЅСЏ РїР°СЂР°!</div>`
    : hasRealSizes && total === 2
      ? `<div class="pd-scarc-hero sc-low">вљЎ Р—Р°Р»РёС€РёР»РѕСЃСЊ 2 РїР°СЂРё</div>`
      : '';

  // Price row
  const priceHtml = product.oldPrice && product.oldPrice > product.price
    ? `<span class="pd-price">${product.price}в‚ґ</span>
       <span class="pd-old">${product.oldPrice}в‚ґ</span>
       ${pct > 0 ? `<span class="pd-disc-tag">в€’${pct}%</span>` : ''}`
    : `<span class="pd-price">${product.price}в‚ґ</span>`;

  // Size preview chips (non-interactive, max 7)
  const CHIP_MAX = 7;
  const sizesToShow = product.sizes.slice(0, CHIP_MAX);
  const moreCount   = product.sizes.length - sizesToShow.length;
  const sizeChips = product.sizes[0] === 'ONE SIZE' ? '' :
    `<div class="pd-sizes-pre">
      ${sizesToShow.map(s => `<span class="pd-size-chip">${s}</span>`).join('')}
      ${moreCount > 0 ? `<span class="pd-size-chip chip-more">+${moreCount}</span>` : ''}
    </div>`;

  // TG SVG icon (inline, no external requests)
  const tgIco = `<svg class="pd-btn-tg-ico" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.944 2.56a1.5 1.5 0 0 0-1.53-.22L2.53 9.6c-.96.37-1.02 1.7-.1 2.16l4.06 2.02 1.56 5.14c.2.65.99.87 1.49.41l2.3-2.12 4.48 3.29c.59.43 1.42.1 1.57-.61L22.44 4.04a1.5 1.5 0 0 0-.5-1.48zM9.4 14.83l-.83 2.72-.94-3.1 8.33-5.9-6.56 6.28z" fill="#fff"/>
  </svg>`;

  document.getElementById('product-detail-content').innerHTML = `
    <div class="pd-hero">
      ${product.image && product.image.startsWith('http')
        ? `<img class="pd-img" src="${esc(product.image)}" alt="${esc(product.brand)} ${esc(product.name)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')">`
        : `<div class="pd-img-ph" aria-hidden="true">рџЊё</div>`}
      <div class="pd-hero-vignette" aria-hidden="true"></div>
      <button class="pd-fav-float ${faved ? 'on' : ''}" id="pd-fav-btn"
        onclick="togglePdFav()" aria-label="${faved ? 'Р’РёРґР°Р»РёС‚Рё Р· СѓР»СЋР±Р»РµРЅРёС…' : 'Р”РѕРґР°С‚Рё РІ СѓР»СЋР±Р»РµРЅС–'}">
        ${faved ? 'вќ¤пёЏ' : 'рџ¤Ќ'}
      </button>
      ${scarcHtml}
    </div>

    <div class="pd-info">
      <div class="pd-brand">${esc(product.brand)}</div>
      <h2 class="pd-name">${esc(product.name)}</h2>
      <div class="pd-price-row">${priceHtml}</div>
      ${sizeChips}
      ${product.description ? `<p class="pd-desc">${esc(product.description)}</p>` : ''}
      <div class="pd-trust">
        <span class="pd-trust-item">вњ… Р‘РµР· РїРµСЂРµРґРѕРїР»Р°С‚Рё</span>
        <span class="pd-trust-sep">В·</span>
        ${product.isFreeShipping
          ? `<span class="pd-trust-item pd-trust-free">рџљљ Р‘РµР·РєРѕС€С‚РѕРІРЅР° РґРѕСЃС‚Р°РІРєР°</span>`
          : `<span class="pd-trust-item">рџ“¦ РќРѕРІР° РџРѕС€С‚Р°</span><span class="pd-trust-sep">В·</span><span class="pd-trust-item">в†©пёЏ РџСЂРёРјС–СЂРєР°</span>`}
      </div>
    </div>

    <div class="pd-cta">
      <button class="pd-btn-size" onclick="openSizePicker(S.pdProduct)">
        РћР±СЂР°С‚Рё СЂРѕР·РјС–СЂ
      </button>
      <button class="pd-btn-tg" onclick="_pdPhotoTg()">
        ${tgIco}
        Р—Р°РїСЂРѕСЃРёС‚Рё С„РѕС‚Рѕ РІ Telegram
      </button>
      <button class="pd-btn-brand" onclick="closeAllSheets();changeTab('catalog');setTimeout(()=>openBrand('${esc(product.brand)}'),220)">
        Р©Рµ РІС–Рґ ${esc(product.brand)} <span class="i-arr" aria-hidden="true"></span>
      </button>
    </div>`;

  openSheet('sheet-product');
}

function togglePdFav() {
  const p = S.pdProduct;
  if (!p) return;
  if (isFav(p.id)) { S.favs = S.favs.filter(f => f.id !== p.id); }
  else             { S.favs.unshift(p); }
  saveFavs();
  updateBadges();
  const btn   = document.getElementById('pd-fav-btn');
  const faved = isFav(p.id);
  if (btn) {
    btn.className = 'pd-fav-float' + (faved ? ' on' : '');
    btn.textContent = faved ? 'вќ¤пёЏ' : 'рџ¤Ќ';
    btn.setAttribute('aria-label', faved ? 'Р’РёРґР°Р»РёС‚Рё Р· СѓР»СЋР±Р»РµРЅРёС…' : 'Р”РѕРґР°С‚Рё РІ СѓР»СЋР±Р»РµРЅС–');
  }
  toast(faved ? 'вќ¤пёЏ Р”РѕРґР°РЅРѕ РґРѕ СѓР»СЋР±Р»РµРЅРёС…' : 'Р’РёРґР°Р»РµРЅРѕ Р· СѓР»СЋР±Р»РµРЅРёС…');
}

