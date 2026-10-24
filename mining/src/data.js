// каталоги: монеты, видеокарты, охлаждение, тарифы, апгрейды, события

export const DAY_SEC = 1.5; // реальных секунд в игровых сутках при x1
export const START_DATE = Date.UTC(2027, 2, 1); // 1 марта 2027
export const GOAL = 10000000;

export const COINS = [
  { id: 'BTK', name: 'Биток', color: '#f7a531', price: 61000, vol: 0.028, base: 0.92, anchorK: 0.004, desc: 'старый добрый, спокойный' },
  { id: 'ETK', name: 'Эфирка', color: '#8c9cff', price: 3100, vol: 0.042, base: 1.0, anchorK: 0.007, desc: 'середнячок, любит хайп' },
  { id: 'KOT', name: 'КотоКоин', color: '#ff5fa2', price: 0.38, vol: 0.085, base: 1.22, anchorK: 0.016, desc: 'мемкоин: x3 или ноль' },
];

// hash — условные MH/s, w — ватты, usd — базовая цена, fans — сколько вертушек, len — длина платы
export const GPUS = [
  { id: 'gt710', name: 'GT 710 «Пенсионер»', hash: 3, w: 25, usd: 40, fans: 1, len: 0.17, col: 0x4a8f3a, tier: 0, note: 'шутки ради. греет как свечка' },
  { id: 'gtx1050', name: 'GTX 1050 Ti', hash: 13, w: 75, usd: 90, fans: 1, len: 0.19, col: 0x7ccf3a, tier: 0, note: 'тихая, без доп. питания' },
  { id: 'rx470', name: 'RX 470 «Шахтёр»', hash: 28, w: 130, usd: 100, fans: 2, len: 0.24, col: 0xe8342a, tier: 0, note: 'после майнинга, но живая' },
  { id: 'rx580', name: 'RX 580 8GB', hash: 31, w: 150, usd: 130, fans: 2, len: 0.25, col: 0xff4b3a, tier: 0, note: 'народная печка' },
  { id: 'gtx1660', name: 'GTX 1660 Super', hash: 31, w: 90, usd: 170, fans: 2, len: 0.23, col: 0x9be15a, tier: 1, note: 'экономная, мало жрёт' },
  { id: 'rtx3060', name: 'RTX 3060 Ti', hash: 60, w: 130, usd: 330, fans: 2, len: 0.26, col: 0x38e07a, tier: 1, note: 'лучшее за свои деньги' },
  { id: 'rtx3070', name: 'RTX 3070', hash: 62, w: 120, usd: 420, fans: 3, len: 0.28, col: 0x2fd0c0, tier: 2, note: 'холодная и тихая' },
  { id: 'rtx3080', name: 'RTX 3080', hash: 98, w: 230, usd: 650, fans: 3, len: 0.3, col: 0x31b8ff, tier: 2, note: 'мощная, но горячая' },
  { id: 'cmp170', name: 'CMP 170HX', hash: 164, w: 250, usd: 900, fans: 0, len: 0.27, col: 0xb7c2cc, tier: 3, note: 'чисто майнинговая, без видеовыходов, турбина' },
  { id: 'rtx4090', name: 'RTX 4090 «Монстр»', hash: 140, w: 320, usd: 1250, fans: 3, len: 0.33, col: 0xff9a1f, tier: 3, note: 'топ. плавит разъёмы' },
];
export const GPU_BY_ID = {};
GPUS.forEach(g => { GPU_BY_ID[g.id] = g; });

export const RIG = { usd: 90, slots: 6, psu: 1500, psuUp: 2600, psuUpUsd: 110, immUsd: 650 };

// разгон: множители хешрейта, мощности, износа, нагрева
export const OC = [
  { id: 'eco', name: 'ЭКО', hash: 0.86, w: 0.7, wear: 0.6, dt: 0.78 },
  { id: 'std', name: 'СТОК', hash: 1, w: 1, wear: 1, dt: 1 },
  { id: 'max', name: 'ТУРБО', hash: 1.16, w: 1.32, wear: 2.2, dt: 1.25 },
];

// охлаждение. U — отвод тепла наружу Вт/°C, ac — отбор тепла кВт (кондиционеры), pw — потребление кВт, noise — шум
export const COOLERS = [
  { id: 'fan', name: 'Вытяжной вентилятор', icon: '🌀', rub: 4500, max: 4, U: 90, pw: 0.06, noise: 0.8, desc: 'тянет воздух с улицы. зимой — отлично, летом почти бесполезен' },
  { id: 'hood', name: 'Промышленная вытяжка', icon: '🏭', rub: 32000, max: 3, U: 420, pw: 0.35, noise: 2.6, desc: 'большой короб под потолком. мощно, но гудит на весь дом' },
  { id: 'ac', name: 'Кондиционер', icon: '❄️', rub: 48000, max: 4, ac: 3.5, pw: 1.15, noise: 0.6, desc: 'снимает 3.5 кВт тепла в любую жару, сам ест 1.15 кВт' },
  { id: 'chiller', name: 'Промышленный чиллер', icon: '🧊', rub: 260000, max: 2, ac: 14, pw: 3.6, noise: 1.6, need: 3, desc: 'холодильная машина на 14 кВт. только для бомбоубежища' },
];
export const COOLER_BY_ID = {};
COOLERS.forEach(c => { COOLER_BY_ID[c.id] = c; });

export const TARIFFS = [
  { id: 'home', name: 'Бытовой', rate: 5.6, sus: 0, desc: 'дёшево и законно, но если месяц больше 4000 кВт·ч — энергосбыт придёт с проверкой' },
  { id: 'biz', name: 'Коммерческий', rate: 9.4, sus: 0, desc: 'дорого, зато никаких вопросов. подключение 25 000 ₽', fee: 25000 },
  { id: 'kolya', name: 'Дядя Коля-электрик', rate: 2.9, sus: 0.07, desc: '«договорился» с электриком. 15 000 ₽ в месяц ему лично, слегка палевно', monthly: 15000 },
  { id: 'hack', name: 'Врезка мимо счётчика', rate: 0, sus: 0.3, desc: 'бесплатно. палево растёт с каждым киловаттом, провода могут загореться' },
];
export const TARIFF_BY_ID = {};
TARIFFS.forEach(t => { TARIFF_BY_ID[t.id] = t; });

export const LINES = [
  { kw: 7, name: 'Старая алюминиевая проводка', rub: 0 },
  { kw: 16, name: 'Новая медная проводка', rub: 38000 },
  { kw: 42, name: 'Трёхфазный ввод', rub: 190000 },
  { kw: 110, name: 'Своя трансформаторная будка', rub: 950000 },
];

export const ROOMS = [
  { name: 'Подвал хрущёвки', spots: 4, rub: 0 },
  { name: 'Соседний отсек (пробить стену)', spots: 10, rub: 140000 },
  { name: 'Старое бомбоубежище', spots: 16, rub: 720000 },
];

export const UPGRADES = [
  { id: 'insul', name: 'Шумоизоляция', icon: '🧱', rub: 36000, desc: 'гул ферм слышно в 2.5 раза меньше. бабушки у подъезда спят спокойно' },
  { id: 'cams', name: 'Камеры и сторож', icon: '📹', rub: 55000, desc: 'видишь проверку заранее — успеешь всё выключить или занести' },
  { id: 'bot', name: 'Бот-переключатель', icon: '🤖', rub: 24000, desc: 'каждые сутки сам переключает риги на самую выгодную монету' },
  { id: 'sensor', name: 'Датчики дыма + огнетушители', icon: '🧯', rub: 18000, desc: 'пожар тушится сам, сгорает максимум одна карта' },
  { id: 'krysha', name: '«Крыша»', icon: '🕶️', rub: 70000, monthly: 45000, desc: 'знакомый в органах. палево растёт вдвое медленнее. 45 000 ₽/мес' },
  { id: 'dryer', name: 'Тёплый пол соседям', icon: '♨️', rub: 60000, desc: 'отдаёшь тепло в подъезд: соседи довольны, палево от тепла и шума падает' },
];

export const RANKS = [
  { at: 0, name: 'Студент с видюхой' },
  { at: 300000, name: 'Гаражный шахтёр' },
  { at: 1500000, name: 'Подвальный барон' },
  { at: 5000000, name: 'Крипто-олигарх района' },
  { at: 15000000, name: 'Король подземелья' },
];

export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// фон для бегущей строки
export const FLUFF = [
  'аналитик с ютуба: «биток будет по миллиону, но это не точно»',
  'в чате майнеров спорят, что лучше: андервольт или молитва',
  'на авито продают «не майнила, бабушка играла в косынку»',
  'учёные: видеокарта RX 580 способна согреть однушку',
  'курьер привёз коробку, соседи думают, что ты торгуешь кальянами',
  'кот спит на тёплом блоке питания. кот доволен',
  'в соседнем районе накрыли ферму в теплице с огурцами',
  'энергосбыт запустил нейросеть для поиска майнеров по счётчикам',
  'мем дня: «я не майнер, я обогреваю подъезд»',
  'китайские заводы снова штампуют риги',
  'блогер купил 4090 «для игр» и поставил её в риг',
];

// случайные события. fn(sim) применяет эффект, возвращает текст или null, если не подходит
export const EVENTS = [
  { w: 3, fn: s => { s.shock('KOT', 1.7); return 'илон написал в твиттере «котики — будущее». КОТ +70%'; }, cls: 'good' },
  { w: 2, fn: s => { s.shock('KOT', 0.42); return 'разработчики КотоКоина сбежали с кассой. КОТ -58%'; }, cls: 'bad' },
  { w: 2, fn: s => { s.shockAll(0.82); s.addSus(4); return 'госдума снова обсуждает запрет крипты. рынок -18%'; }, cls: 'bad' },
  { w: 1, fn: s => { s.shockAll(0.7); return 'крупная биржа обанкротилась. весь рынок -30%'; }, cls: 'bad' },
  { w: 2, fn: s => { s.shock('BTK', 1.22); s.shock('ETK', 1.12); return 'в США одобрили новый крипто-ETF. BTK +22%'; }, cls: 'good' },
  { w: 2, fn: s => { s.shock('ETK', 1.35); return 'обновление сети ETK прошло успешно. ETK +35%'; }, cls: 'good' },
  { w: 2, fn: s => { s.usd *= 1.08; return 'доллар скакнул на 8% после новых санкций'; }, cls: 'good' },
  { w: 2, fn: s => { s.usd *= 0.94; return 'рубль внезапно укрепился на 6%'; }, cls: 'bad' },
  { w: 2, fn: s => { s.blackout = 2 + Math.floor(Math.random() * 2); return 'авария на подстанции: света нет ' + s.blackout + ' дня'; }, cls: 'bad' },
  { w: 2, fn: s => { if (s.month() < 5 || s.month() > 8) return null; s.weather = 9; s.weatherT = 10; return 'аномальная жара +9°C на 10 дней. следи за температурой!'; }, cls: 'bad' },
  { w: 2, fn: s => { if (s.month() > 2 && s.month() < 10) return null; s.weather = -12; s.weatherT = 10; return 'ударили морозы. вытяжка работает как кондиционер'; }, cls: 'good' },
  { w: 2, fn: s => { s.gpuEvt = 0.72; s.gpuEvtT = 18; return 'в порт пришла фура б/у карт из китая. цены на видюхи -28%'; }, cls: 'good' },
  { w: 2, fn: s => { s.gpuEvt = 1.45; s.gpuEvtT = 18; return 'дефицит чипов: видеокарты подорожали на 45%'; }, cls: 'bad' },
  { w: 3, fn: s => { if (s.noiseLevel() < 3) return null; s.addSus(9); return 'баба валя с третьего этажа жалуется участковому на гул'; }, cls: 'bad' },
  { w: 2, fn: s => { const r = s.rigs.filter(r => r.cards.length); if (!r.length) return null; const x = r[Math.floor(Math.random() * r.length)]; x.off = 1.5; return 'кот залез в риг №' + (s.rigs.indexOf(x) + 1) + ' и выдернул райзер. риг стоит полтора дня'; }, cls: 'bad' },
  { w: 1, fn: s => { if (s.tariff !== 'kolya') return null; s.kolyaRate = Math.round(s.kolyaRate * 1.3); return 'дядя коля поднял «ставку» до ' + s.kolyaRate.toLocaleString('ru') + ' ₽/мес'; }, cls: 'bad' },
  { w: 2, fn: s => { s.addMoney(Math.round(5000 + Math.random() * 15000), 'подарок'); return 'нашёл в старом кошельке сид-фразу. +немного денег'; }, cls: 'good' },
  { w: 1, fn: s => { s.shockAll(1.25); s.regime = 1; s.regimeT = 60; return 'начался бычий рынок! всё зелёное'; }, cls: 'good' },
];
