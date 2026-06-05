const CFG = {
  GAS_URL:  'https://script.google.com/macros/s/AKfycbzif18Ohhvp2TANIKKMtBlyJ7OuHspVeuCctJ02Iyytp0A_kHQB_cBOuYKIIJ88nwpfpQ/exec',
  VAPID_PUBLIC_KEY: '',
  TG_URL:   'https://t.me/wowwear',
  IG_URL:   'https://instagram.com/wow.wear',
  TT_URL:   'https://www.tiktok.com/@wowwear',
  GA_ID:    'G-9L346ZDWLK',
  FB_PIXEL_ID: '970568042186153',
  TT_PIXEL_ID: '',
  OG_IMAGE: '',
  CACHE_KEY:    'wow_wear_v1',
  CACHE_TTL_MS: 5 * 60 * 1000,
  MIN_PRODUCTS: 3,
  SIZES_ALL:    ['XS','S','M','L','XL','XXL','XXXL','ONE SIZE'],
  SIZES_MALE:   ['S','M','L','XL','XXL'],
  SIZES_FEMALE: ['XS','S','M','L','XL','XXL'],
  HOT_SIZES_MALE:   ['L','XL'],
  HOT_SIZES_FEMALE: ['S','M'],
  GRID_BATCH: 24,
  MATCH_HISTORY_KEY: 'wow_wear_seen',
};

const STATIC_REVIEWS = [
  { emoji:'🔥', author:'Аня',    location:'Київ',   stars:5, text:'Якість відмінна! Замовляла плаття — точно відповідає розміру, тканина приємна.' },
  { emoji:'😍', author:'Юля',    location:'Харків', stars:5, text:'Купила комплект білизни, дуже задоволена. Все якісно, оплата після — супер!' },
  { emoji:'😎', author:'Оксана', location:'Одеса',  stars:5, text:'Замовляю вже втретє. Одяг відповідає фото. Рекомендую всім!' },
  { emoji:'🤩', author:'Катя',   location:'Львів',  stars:4, text:'Доставка швидка, упаковка акуратна. Розмір підійшов ідеально.' },
  { emoji:'💫', author:'Марія',  location:'Дніпро', stars:5, text:'Без передоплати — це взагалі кайф! Прийшло все як описано.' },
];
