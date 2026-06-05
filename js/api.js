function _loadFromCache() {
  try {
    const raw = localStorage.getItem(CFG.CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CFG.CACHE_TTL_MS) return null;
    data.forEach(p => {
      if (p.gender === 'male')   p.gender = 'Чоловік';
      if (p.gender === 'female') p.gender = 'Жінка';
    });
    return data;
  } catch(e) { return null; }
}

function _saveToCache(products) {
  try {
    localStorage.setItem(CFG.CACHE_KEY, JSON.stringify({ ts: Date.now(), data: products }));
  } catch(e) {}
}

function normalizeProduct(p) {
  const sizesRaw = p['Розміри'] || p['розміри'] || p.sizes || p.Sizes || '';
  let sizes = [];
  const sizeQty = {};
  const TEXT_SIZES = ['XS','S','M','L','XL','XXL','XXXL','3XL','4XL','ONE SIZE','ONESIZE'];

  if (Array.isArray(sizesRaw)) {
    sizesRaw.forEach(s => {
      const str = String(s).trim().toUpperCase();
      if (!str) return;
      if (str === 'ONE SIZE' || str === 'ONESIZE') {
        sizes = ['ONE SIZE']; sizeQty['ONE SIZE'] = 1; return;
      }
      if (TEXT_SIZES.includes(str)) {
        sizes.push(str); sizeQty[str] = (sizeQty[str] || 0) + 1;
      } else {
        const n = Number(str);
        if (!isNaN(n) && n >= 36 && n <= 60) {
          sizes.push(str); sizeQty[str] = (sizeQty[str] || 0) + 1;
        }
      }
    });
  } else {
    const str = String(sizesRaw).trim().toUpperCase();
    if (str === 'ONE SIZE' || str === 'ONESIZE' || !str) {
      if (str) { sizes = ['ONE SIZE']; sizeQty['ONE SIZE'] = 1; }
    } else {
      const found = [...str.matchAll(/\b(XS|S|M|L|XL|XXL|XXXL|3XL|4XL)\b/g)];
      if (found.length) {
        found.forEach(m => {
          const v = m[1];
          if (!sizes.includes(v)) sizes.push(v);
          sizeQty[v] = (sizeQty[v] || 0) + 1;
        });
      } else {
        const nums = [...new Set([...str.matchAll(/\b(3[6-9]|4[0-9]|5[0-9]|60)\b/g)].map(m => m[1]))];
        nums.forEach(v => { sizes.push(v); sizeQty[v] = 1; });
      }
    }
  }

  const price    = Number(p['Ціна']       || p['ціна']       || p.price    || 0);
  let oldPrice   = Number(p['Стара ціна'] || p['стара ціна'] || p.oldPrice || p.old_price || 0);
  if (oldPrice > 0 && oldPrice <= price) oldPrice = 0;

  const rawCat = String(p.category || p.niche || p.type || p['Категорія'] || '').toLowerCase();
  let category = 'wear';
  if (rawCat.includes('bilyzna') || rawCat.includes('білизна') || rawCat.includes('lingerie') || rawCat.includes('underwear')) {
    category = 'bilyzna';
  }

  // photoRaw може бути pipe-separated (multi-photo) або single URL
  const photoRaw = String(p['Фото'] || p['фото'] || p.image || p.img || p.photo || '');
  const photos   = photoRaw.split('|').map(s => s.trim()).filter(s => s.startsWith('http'));
  const image    = photos[0] || '';
  return {
    id:          String(p['ID'] || p['id'] || p['Артикул'] || Math.random().toString(36).slice(2)),
    name:        String(p['Назва']  || p['назва']  || p['Модель'] || p.name || p.model || ''),
    brand:       String(p['Бренд']  || p['бренд']  || p.brand  || p.Brand  || '') || 'WOW',
    price,
    oldPrice,
    image,
    photos,                                         // ← масив URL для галереї
    description: String(p['Опис']   || p['опис']   || p.description || ''),
    sizes,
    sizeQty,
    isNew:       Boolean(p['Нове']  || p['нове']   || p.is_new || p.isNew),
    gender:      String(p['Стать']  || p['стать']  || p.gender || p.Gender || 'Жінка'),
    category,
    tgLink:      String(p['TG'] || p['tg_link'] || ''),
  };
}

async function fetchCatalog() {
  if (S.catalog.all && S.catalog.loadedFromServer) return getCatalog();
  const cached = _loadFromCache();
  if (cached && cached.length) {
    S.catalog.all = cached;
    S.catalog.loadedFromServer = true;
    S.lastFetchTime = new Date();
    updateTimestamp();
    setTimeout(bgRefreshCatalog, 200);
    return getCatalog();
  }
  return bgRefreshCatalog();
}

async function bgRefreshCatalog() {
  try {
    const res  = await fetch(CFG.GAS_URL);
    const json = await res.json();
    const raw  = json.products || json.data || (Array.isArray(json) ? json : []);
    const normalized = raw.map(normalizeProduct);
    if (normalized.length >= CFG.MIN_PRODUCTS) {
      S.catalog.all = normalized;
      S.catalog.loadedFromServer = true;
      _saveToCache(normalized);
      if (json.promo) S.promoCodes = json.promo;
      if (json.dailyDeals && Array.isArray(json.dailyDeals)) S.catalog.dailyDeals = json.dailyDeals;
    }
    S.lastFetchTime = new Date();
    updateTimestamp();
    if (S.activeTab === 'home')    renderHome();
    if (S.activeTab === 'catalog') renderCatalog();
    return getCatalog();
  } catch(e) {
    console.warn('[WOW] fetch failed', e);
    if (!S.catalog.all || !S.catalog.all.length) {
      S.catalog.all = [];
    }
    S.lastFetchTime = new Date();
    updateTimestamp();
    return getCatalog();
  }
}

async function postData(payload) {
  const body = JSON.stringify(payload);
  if (!CFG.GAS_URL) return null;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 7000);
    const res  = await fetch(CFG.GAS_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body, signal: ctrl.signal,
    });
    clearTimeout(tid);
    return res.ok ? true : false;
  } catch(e) {
    if (e.name === 'AbortError') return false;
    try { fetch(CFG.GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body, mode:'no-cors' }); } catch(_) {}
    return null;
  }
}

function _injectGA()      { if (!CFG.GA_ID) return; const s=document.createElement('script'); s.src=`https://www.googletagmanager.com/gtag/js?id=${CFG.GA_ID}`; s.async=true; document.head.appendChild(s); window.dataLayer=window.dataLayer||[]; window.gtag=function(){window.dataLayer.push(arguments);}; gtag('js',new Date()); gtag('config',CFG.GA_ID); }
function _injectPixel()   { if (!CFG.FB_PIXEL_ID) return; !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',CFG.FB_PIXEL_ID);fbq('track','PageView'); }
function _injectTTPixel() { if (!CFG.TT_PIXEL_ID) return; !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._r=ttq._r||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(CFG.TT_PIXEL_ID);ttq.page();}(window,document,'ttq'); }

function shareProduct(p, e) {
  if (e) e.stopPropagation();
  const url = `${location.origin}${location.pathname}?product=${p.id}`;
  if (navigator.share) { navigator.share({ title:`${p.brand} ${p.name}`, text:`${p.price}₴`, url }).catch(()=>{}); return; }
  if (navigator.clipboard) { navigator.clipboard.writeText(url).then(() => toast('🔗 Посилання скопійовано!')); }
  else { const ta=document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('🔗 Посилання скопійовано!'); }
}

function checkDeepLink() {
  const productId = new URLSearchParams(location.search).get('product');
  if (!productId) return;
  function tryOpen() { const p=(S.catalog.all||[]).find(x=>x.id===productId); if(p) openProductDetail(p); }
  if (S.catalog.all && S.catalog.all.length) { tryOpen(); return; }
  const poll = setInterval(() => { if (S.catalog.all && S.catalog.all.length) { clearInterval(poll); tryOpen(); } }, 500);
  setTimeout(() => clearInterval(poll), 15000);
}

function getDemoProducts(gender) {
  const gLabel = gender === 'female' ? 'Жінка' : 'Чоловік';
  const wearBrands  = ['Angells','Zara','H&M','Mango','Pull&Bear'];
  const bilBrands   = ['Angells','Victoria\'s Secret','Calvin Klein','H&M'];
  const wearModels  = { 'Angells':['Плаття міді','Блузка шовкова','Костюм трикотаж','Спідниця А-силует'], 'Zara':['Сукня міні','Піджак оверсайз','Штани wide-leg','Топ рубчик'], 'H&M':['Сукня флoral','Лонгслів','Джинси mom','Жилет утеплений'], 'Mango':['Блузка з рюшами','Брюки кльош','Пальто','Топ з вирізом'], 'Pull&Bear':['Худі оверсайз','Штани карго','Топ бавовна','Светр cable-knit'] };
  const bilModels   = { 'Angells':['Комплект DO2024','Боді мереживо','Бюстгальтер пуш-ап','Комплект атлас'], "Victoria's Secret":['Комплект lace','Боді strappy','Пуш-ап demi'], 'Calvin Klein':['Комплект basic','Боді cotton'], 'H&M':['Комплект seamless','Топ-бралет'] };
  const szBase = ['XS','S','M','L','XL'];
  const prods = [];
  let idNum = 1;

  wearBrands.forEach(brand => {
    (wearModels[brand]||[]).forEach(model => {
      const avail = szBase.filter(() => Math.random() > .3).slice(0,Math.floor(Math.random()*4)+1);
      if (!avail.length) avail.push('M');
      prods.push({ id:`demo_w${idNum++}`, brand, name:model, price:Math.round((Math.random()*800+300)/50)*50, oldPrice:Math.random()>.5?Math.round((Math.random()*1000+500)/50)*50:0, image:'', sizes:avail, sizeQty:Object.fromEntries(avail.map(v=>[v,1])), isNew:Math.random()>.7, gender:gLabel, category:'wear' });
    });
  });
  bilBrands.forEach(brand => {
    (bilModels[brand]||[]).forEach(model => {
      const avail = szBase.filter(() => Math.random() > .35).slice(0,Math.floor(Math.random()*3)+1);
      if (!avail.length) avail.push('M');
      prods.push({ id:`demo_b${idNum++}`, brand, name:model, price:Math.round((Math.random()*500+200)/50)*50, oldPrice:Math.random()>.4?Math.round((Math.random()*700+400)/50)*50:0, image:'', sizes:avail, sizeQty:Object.fromEntries(avail.map(v=>[v,1])), isNew:Math.random()>.6, gender:gLabel, category:'bilyzna' });
    });
  });
  return prods;
}

