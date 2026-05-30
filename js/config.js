const CFG = {
  GAS_URL:  'https://script.google.com/macros/s/AKfycbzif18Ohhvp2TANIKKMtBlyJ7OuHspVeuCctJ02Iyytp0A_cBOuYKIIJ88nwpfpQ/exec',
  TG_URL:   'https://t.me/wowwea',
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
  { emoji:'🤩', author:'Вікторія', location:'Київ',    stars:5, text:'Замовила худі — прийшло швидко, якість відмінна. Матеріал м\'який, розмір точний. Примірка на НП — дуже зручно!' },
  { emoji:'😍', author:'Аліна',    location:'Львів',   stars:5, text:'Нарешті знайшла де замовляти одяг без передоплати. Сукня ідеально сіла з першого разу. Беру ще!' },
  { emoji:'🙌', author:'Дмитро',   location:'Харків',  stars:5, text:'Толстовка якісна, шви рівні, принт не злазить. Ціна набагато нижча ніж в магазинах. Рекомендую хлопцям!' },
  { emoji:'✨', author:'Наталя',   location:'Одеса',   stars:5, text:'Замовляю вже третій раз. Стабільна якість, завжди відповідає фото. Доставка 2 дні.' },
  { emoji:'😊', author:'Ірина',    location:'Дніпро',  stars:4, text:'Джинси підійшли ідеально. Єдине — довелось уточнити розмір у Telegram, але менеджер відповів швидко.' },
  { emoji:'🔥', author:'Михайло',  location:'Запоріжжя', stars:5, text:'Купив парку — якість як у брендових магазинах, а ціна в 2-3 рази нижча. Буду рекомендувати!' },
];
