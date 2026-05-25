const CFG = {
  GAS_URL:  '',
  TG_URL:   'https://t.me/wowwear',
  IG_URL:   'https://instagram.com/wow.wear',
  TT_URL:   'https://www.tiktok.com/@wowwear',
  GA_ID:    '',
  FB_PIXEL_ID: '',
  TT_PIXEL_ID: '',
  OG_IMAGE: '',
  CACHE_KEY:    'wow_wear_v1',
  CACHE_TTL_MS: 5 * 60 * 1000,
  MIN_PRODUCTS: 5,
  SIZES_MALE:   ['XS','S','M','L','XL','XXL','XXXL'],
  SIZES_FEMALE: ['XS','S','M','L','XL','XXL'],
  SIZES_ALL:    ['XS','S','M','L','XL','XXL','XXXL'],
  HOT_SIZES_MALE:   ['M','L','XL'],
  HOT_SIZES_FEMALE: ['S','M','L'],
  GRID_BATCH: 24,
  MATCH_HISTORY_KEY: 'wow_wear_seen',
};

const STATIC_REVIEWS = [
  { emoji:'😍', author:'Аня',    location:'Київ',   stars:5, text:'Якість відмінна, доставка швидка. Оплата після отримання — зручно!' },
  { emoji:'😄', author:'Максим', location:'Харків', stars:5, text:'Замовляю вже вдруге. Все відповідає опису. Рекомендую!' },
  { emoji:'😎', author:'Олена',  location:'Одеса',  stars:5, text:'Ціна нижче ніж в магазинах, якість не поступається. Відмінно!' },
  { emoji:'🤩', author:'Катя',   location:'Львів',  stars:4, text:'Доставка 2 дні, упаковка ціла. Задоволена покупкою!' },
  { emoji:'🙂', author:'Олег',   location:'Дніпро', stars:5, text:'Все чудово. Буду замовляти ще!' },
];
