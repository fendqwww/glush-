// экономика и физика фермы. всё время — в игровых сутках
import { COINS, GPUS, GPU_BY_ID, RIG, OC, COOLERS, COOLER_BY_ID, TARIFFS, TARIFF_BY_ID, LINES, ROOMS, UPGRADES, EVENTS, FLUFF, START_DATE, RANKS, GOAL } from './data.js';

const P0 = 3.4 / 92; // $ на MH в сутки при «нормальной» сложности
const rnd = () => Math.random();
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
let uid = 1;

export class Sim {
  constructor(save) {
    this.listeners = [];
    if (save) this.load(save); else this.fresh();
  }

  fresh() {
    this.day = 0;
    this.money = 45000;
    this.wallet = {}; this.price = {}; this.anchor = {}; this.hist = {}; this.halv = {};
    for (const c of COINS) { this.wallet[c.id] = 0; this.price[c.id] = c.price; this.anchor[c.id] = c.price * 0.93; this.hist[c.id] = []; this.halv[c.id] = 1; }
    this.usd = 92; this.usdMean = 92; this.hist.USD = [];
    // предыстория для графиков
    for (let i = 0; i < 60; i++) { this.tickMarket(true); }
    for (const c of COINS) this.anchor[c.id] = this.price[c.id] * 0.92;
    this.rigs = [this.newRig(0)];
    this.stock = [];
    this.coolers = { fan: 0, hood: 0, ac: 0, chiller: 0 };
    this.tariff = 'home'; this.line = 0; this.room = 0; this.up = {};
    this.sus = 0; this.roomT = 11; this.tout = 2; this.monthKwh = 0; this.kolyaRate = 15000; this.idx = 1;
    this.tripped = false; this.blackout = 0; this.weather = 0; this.weatherT = 0; this.toutNoise = 0;
    this.gpuEvt = 1; this.gpuEvtT = 0; this.regime = 0; this.regimeT = 30;
    this.autoSell = true; this.debtDays = 0; this.bribeCD = 0; this.raidT = -1; this.hideT = 0;
    this.stats = { mined: 0, power: 0, bestWorth: 0, fires: 0, raids: 0 };
    this.news = []; this.hints = {}; this.won = false; this.over = false;
    this.flow = { inc: 0, pw: 0, kw: 0 };
    this.lastTick = 0;
  }

  newRig(spot) { return { spot, cards: [], coin: 'ETK', oc: 1, psu: false, imm: false, off: 0, on: true }; }

  save() {
    const o = {};
    for (const k of ['day', 'money', 'wallet', 'price', 'anchor', 'hist', 'halv', 'usd', 'usdMean', 'rigs', 'stock', 'coolers', 'tariff', 'line', 'room', 'up', 'sus', 'roomT', 'tout', 'monthKwh', 'kolyaRate', 'idx', 'tripped', 'blackout', 'weather', 'weatherT', 'gpuEvt', 'gpuEvtT', 'regime', 'regimeT', 'autoSell', 'debtDays', 'bribeCD', 'raidT', 'hideT', 'stats', 'hints', 'won', 'over', 'lastTick', 'toutNoise']) o[k] = this[k];
    return JSON.stringify(o);
  }
  load(s) {
    this.fresh();
    const o = JSON.parse(s);
    Object.assign(this, o);
    for (const r of this.rigs) for (const c of r.cards) c.uid = uid++;
    for (const c of this.stock) c.uid = uid++;
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, a, b) { for (const f of this.listeners) f(type, a, b); }
  say(text, cls) { this.news.unshift({ text, cls, day: this.day }); if (this.news.length > 40) this.news.pop(); this.emit('news', text, cls); }
  hint(key, text) { if (this.hints[key]) return; this.hints[key] = 1; this.emit('hint', text); }

  // ===== справочные =====
  date() { return new Date(START_DATE + Math.floor(this.day) * 86400000); }
  month() { return this.date().getUTCMonth(); }
  get T() { return TARIFF_BY_ID[this.tariff]; }
  rate() { return this.T.rate * this.idx; }
  lineKw() { return LINES[this.line].kw; }
  spots() { return ROOMS[this.room].spots; }
  // ₽ в сутки за 1 MH на монете
  profit(id) {
    const c = COINS.find(x => x.id === id);
    const decay = Math.pow(0.9994, this.day);
    return P0 * c.base * decay * this.halv[id] * (this.price[id] / this.anchor[id]) * this.usd;
  }
  bestCoin() { let b = null, bv = -1; for (const c of COINS) { const v = this.profit(c.id); if (v > bv) { bv = v; b = c.id; } } return b; }
  gpuDemand() {
    let s = 0; for (const c of COINS) s += this.price[c.id] / this.anchor[c.id];
    return clamp(0.72 + 0.3 * s / COINS.length, 0.7, 1.9) * this.gpuEvt;
  }
  gpuPrice(id, used) { const g = GPU_BY_ID[id]; return Math.round(g.usd * this.usd * this.gpuDemand() * (used ? 0.58 : 1) / 10) * 10; }
  cardSell(c) { return Math.round(this.gpuPrice(c.id) * 0.55 * (1 - c.wear / 130) / 10) * 10; }
  rigPrice() { return Math.round(RIG.usd * this.usd / 10) * 10; }
  psuPrice() { return Math.round(RIG.psuUpUsd * this.usd / 10) * 10; }
  immPrice() { return Math.round(RIG.immUsd * this.usd / 10) * 10; }
  coinRub(id) { return this.price[id] * this.usd; }
  worth() {
    let w = this.money;
    for (const c of COINS) w += this.wallet[c.id] * this.coinRub(c.id);
    for (const r of this.rigs) { w += this.rigPrice() * 0.4; for (const c of r.cards) w += this.cardSell(c); }
    for (const c of this.stock) w += this.cardSell(c);
    return w;
  }
  rank() { const w = Math.max(this.stats.bestWorth, 0); let r = RANKS[0]; for (const x of RANKS) if (w >= x.at) r = x; return r; }
  bribeCost() { return Math.round((25000 + this.worth() * 0.03) / 1000) * 1000; }
  noiseLevel() {
    let n = 0;
    for (const r of this.rigs) {
      if (!this.rigWorks(r) || r.imm) continue;
      for (const c of r.cards) { const g = GPU_BY_ID[c.id]; n += (g.fans ? g.fans * 0.06 : 0.3) * (0.6 + 0.4 * OC[r.oc].dt) * (0.5 + clamp((c.temp - 40) / 50, 0, 1)); }
    }
    if (this.powered()) for (const k in this.coolers) n += COOLER_BY_ID[k].noise * this.coolers[k];
    if (this.up.insul) n *= 0.4;
    return n;
  }
  powered() { return !this.blackout && !this.tripped && this.debtDays < 10 && this.hideT <= 0; }
  rigWorks(r) { return r.on && r.off <= 0 && r.cards.length > 0 && this.powered(); }
  rigPower(r) { // Вт
    let w = 0; for (const c of r.cards) w += GPU_BY_ID[c.id].w * OC[r.oc].w; return w + 60;
  }
  psuCap(r) { return r.psu ? RIG.psuUp : RIG.psu; }

  addMoney(v, why) { this.money += v; this.emit('money', v, why); }
  addSus(v) { this.sus = clamp(this.sus + v * (this.up.krysha && v > 0 ? 0.5 : 1), 0, 100); }
  shock(id, k) { this.price[id] *= k; }
  shockAll(k) { for (const c of COINS) this.price[c.id] *= k * (0.9 + rnd() * 0.2); }

  // ===== рынок, раз в сутки =====
  tickMarket(pre) {
    if (!pre) {
      this.regimeT--;
      if (this.regimeT <= 0) { this.regime = [-1, 0, 0, 1][Math.floor(rnd() * 4)]; this.regimeT = 25 + Math.floor(rnd() * 70); }
    }
    const drift = (this.regime || 0) * 0.0055;
    const common = gauss();
    for (const c of COINS) {
      const z = 0.55 * common + 0.835 * gauss();
      // мемкоин может улететь или сдуться
      let jump = 0;
      if (c.id === 'KOT' && rnd() < 0.02) jump = rnd() < 0.5 ? 0.4 : -0.35;
      this.price[c.id] *= Math.exp(drift * (c.id === 'KOT' ? 1.8 : 1) + c.vol * z - c.vol * c.vol / 2 + jump);
      // защита от нуля и улёта
      const lo = c.price * 0.08, hi = c.price * 12;
      if (this.price[c.id] < lo) this.price[c.id] = lo * (1 + rnd() * 0.1);
      if (this.price[c.id] > hi) this.price[c.id] = hi * (1 - rnd() * 0.1);
      // сложность сети догоняет цену
      if (!pre) this.anchor[c.id] += (this.price[c.id] - this.anchor[c.id]) * c.anchorK;
      this.hist[c.id].push(this.price[c.id]);
      if (this.hist[c.id].length > 400) this.hist[c.id].shift();
    }
    this.usdMean *= Math.exp(0.00012 + 0.002 * gauss());
    this.usd += (this.usdMean - this.usd) * 0.03 + this.usd * 0.006 * gauss();
    this.usd = clamp(this.usd, 55, 190);
    this.hist.USD.push(this.usd);
    if (this.hist.USD.length > 400) this.hist.USD.shift();
  }

  outsideTemp() {
    const d = this.date();
    const doy = (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
    return 5 - 16 * Math.cos(6.2832 * (doy - 18) / 365) + this.weather + this.toutNoise;
  }

  // ===== шаг симуляции =====
  step(dt) {
    if (this.over) return;
    while (dt > 0) { const h = Math.min(dt, 0.02); this.sub(h); dt -= h; }
  }

  sub(dt) {
    this.day += dt;
    const tout = this.tout = this.outsideTemp();
    const powered = this.powered();
    let cardW = 0, heatW = 150, inc = 0, outsideW = 0;
    const roomK = [1, 2, 3.2][this.room];
    for (const r of this.rigs) {
      if (r.off > 0) r.off -= dt;
      const works = this.rigWorks(r);
      const rw = works ? this.rigPower(r) : 0;
      const over = rw > this.psuCap(r);
      if (works && over) { r.unstable = true; } else r.unstable = false;
      for (const c of r.cards) {
        const g = GPU_BY_ID[c.id];
        const o = OC[r.oc];
        let target = this.roomT;
        if (works) {
          const w = g.w * o.w;
          const dT = r.imm ? 9 + 0.025 * w : (22 + 0.14 * w) * o.dt * (1 + c.dust / 100 * 0.6);
          target = this.roomT + dT;
        }
        c.temp += (target - c.temp) * (1 - Math.exp(-dt * 30));
        c.hr = 0;
        if (!works) continue;
        // троттлинг и износ
        let k = 1;
        if (c.temp > 83) k = clamp(1 - (c.temp - 83) / 28, 0.45, 1);
        if (r.unstable && rnd() < dt * 3) k = 0; // блок питания не тянет: карты отваливаются
        k *= 1 - c.wear / 100 * 0.25;
        c.hr = g.hash * o.hash * k;
        c.wear += dt * (0.035 * o.wear + (c.temp > 88 ? (c.temp - 88) * 0.25 : 0));
        if (!r.imm) c.dust = Math.min(100, c.dust + dt * 0.6);
        const coinsDay = c.hr * this.profit(r.coin) / this.coinRub(r.coin);
        const mined = coinsDay * dt;
        inc += c.hr * this.profit(r.coin);
        if (this.autoSell) { const v = mined * this.coinRub(r.coin) * 0.99; this.money += v; this.stats.mined += v; }
        else this.wallet[r.coin] += mined;
      }
      if (works) {
        cardW += rw;
        if (r.imm) { heatW += rw * 0.45; outsideW += rw * 0.55; } else heatW += rw;
        // сгоревшие карты
        for (let i = r.cards.length - 1; i >= 0; i--) {
          const c = r.cards[i];
          if (c.wear >= 100) { r.cards.splice(i, 1); this.say(`💀 ${GPU_BY_ID[c.id].name} в риге №${this.rigs.indexOf(r) + 1} умерла от износа`, 'bad'); this.emit('dead', r); continue; }
          if (c.temp > 100 && rnd() < dt * 0.04 * (c.temp - 99)) { this.fire(r); break; }
        }
      }
    }
    // охлаждение
    let coolW = 0, U = 25, ac = 0;
    for (const k in this.coolers) {
      const n = this.coolers[k], d = COOLER_BY_ID[k];
      if (!n || !powered) continue;
      coolW += d.pw * 1000 * n;
      if (d.U) U += d.U * n;
    }
    const acCap = powered ? (this.coolers.ac * 3500 + this.coolers.chiller * 14000) : 0;
    const acPw = powered ? (this.coolers.ac * 1150 + this.coolers.chiller * 3600) : 0;
    const f = clamp((this.roomT - 20) / 3, 0, 1);
    ac = acCap * f;
    coolW = coolW - acPw + acPw * f;
    heatW += coolW * 0.2;
    if (this.up.dryer && tout < 14) { const g = Math.min(heatW * 0.5, 3000 * roomK); heatW -= g; }
    const Ug = 45 * roomK;
    const Uo = U * (this.roomT > tout ? 1 : 0.25);
    const Teq = (heatW - ac + Ug * 9 + Uo * tout) / (Ug + Uo);
    const C = 6e6 * roomK;
    this.roomT += (Teq - this.roomT) * (1 - Math.exp(-dt * 86400 * (Ug + Uo) / C));
    // электричество
    const totalW = powered ? cardW + coolW + 150 : 0;
    const kw = totalW / 1000;
    if (powered && kw > this.lineKw()) {
      this.tripped = true;
      this.say(`⚡ выбило автомат! нагрузка ${kw.toFixed(1)} кВт при лимите проводки ${this.lineKw()} кВт`, 'bad');
      this.emit('trip');
      this.hint('trip', 'проводка не тянет. выключи часть ригов во вкладке ФЕРМА или поменяй проводку во вкладке ЭНЕРГИЯ, потом включи автомат');
      if ((this.line === 0 || this.tariff === 'hack') && rnd() < 0.18) this.fire(this.rigs[Math.floor(rnd() * this.rigs.length)], 'проводка');
    }
    const kwh = kw * 24 * dt;
    this.monthKwh += kwh;
    const bill = kwh * this.rate();
    this.money -= bill; this.stats.power += bill;
    // для интерфейса — сглаженные показатели в сутки
    const a = 1 - Math.exp(-dt * 8);
    this.flow.inc += (inc - this.flow.inc) * a;
    this.flow.pw += (kw * 24 * this.rate() - this.flow.pw) * a;
    this.flow.kw = kw;
    this.flow.heat = heatW / 1000;
    this.flow.out = outsideW / 1000 + Uo * Math.max(0, this.roomT - tout) / 1000;
    // палево
    let ds = -0.3;
    ds += this.T.sus * kw;
    const noise = this.noiseLevel();
    if (noise > 2.5) ds += 0.11 * (noise - 2.5) * (this.up.dryer ? 0.6 : 1);
    if (tout < 0 && this.flow.out > 4) ds += 0.045 * (this.flow.out - 4) * (this.up.dryer ? 0.5 : 1);
    if (ds > 0 && this.up.krysha) ds *= 0.5;
    this.sus = clamp(this.sus + ds * dt, 0, 100);
    this.flow.ds = ds;
    if (this.roomT > 30) this.hint('hot', 'в подвале жарко! горячие карты теряют хешрейт и изнашиваются. купи вытяжку во вкладке КЛИМАТ или включи режим ЭКО');
    if (this.sus > 45) this.hint('sus', 'растёт палево (глаз сверху). шум, тепло, врезка и большие счета привлекают внимание. при 100% — рейд');
    if (this.day - this.lastTick >= 1) { this.lastTick = Math.floor(this.day); this.daily(); }
  }

  fire(r, why) {
    if (!r || !r.cards.length) return;
    this.stats.fires++;
    const idx = this.rigs.indexOf(r) + 1;
    if (this.up.sensor) {
      const c = r.cards.splice(Math.floor(rnd() * r.cards.length), 1)[0];
      this.say(`🔥 возгорание в риге №${idx}! датчики сработали, сгорела только ${GPU_BY_ID[c.id].name}`, 'bad');
    } else {
      const n = r.cards.length; r.cards = []; r.off = 2;
      this.addSus(22);
      this.say(`🔥 ПОЖАР в риге №${idx}${why ? ' (' + why + ')' : ''}! сгорели все ${n} карт. соседи вызвали пожарных`, 'bad');
      this.hint('fire', 'купи датчики дыма во вкладке АПГРЕЙДЫ — тогда пожар не уничтожит весь риг');
    }
    this.emit('fire', r);
  }

  daily() {
    this.tickMarket(false);
    if (this.gpuEvtT > 0 && --this.gpuEvtT === 0) this.gpuEvt = 1;
    if (this.weatherT > 0 && --this.weatherT === 0) this.weather = 0;
    this.toutNoise = clamp(this.toutNoise * 0.8 + gauss() * 1.6, -6, 6);
    if (this.blackout > 0 && --this.blackout === 0) this.say('💡 свет дали', 'good');
    if (this.hideT > 0 && --this.hideT === 0) this.say('ферма снова работает', 'good');
    if (this.bribeCD > 0) this.bribeCD--;
    if (this.up.bot) for (const r of this.rigs) r.coin = this.bestCoin();
    // долги
    if (this.money < 0) {
      this.debtDays++;
      if (this.debtDays === 10) this.say('⛔ свет отключили за неуплату! продай монеты или карты', 'bad');
      if (this.debtDays > 10 && this.worth() < 0) { this.over = 'bankrupt'; this.emit('over', 'bankrupt'); return; }
    } else this.debtDays = 0;
    const d = this.date();
    if (d.getUTCDate() === 1) this.monthly(d);
    // халвинг битка
    if (Math.floor(this.day) === 420) { this.halv.BTK *= 0.5; this.price.BTK *= 1.08; this.say('⛏️ ХАЛВИНГ BTK: награда за блок упала вдвое', 'bad'); }
    if (rnd() < 1 / 13) this.randomEvent();
    else if (rnd() < 0.12) this.say(FLUFF[Math.floor(rnd() * FLUFF.length)], '');
    // проверка
    if (this.raidT > 0 && --this.raidT === 0) { this.raidT = -1; if (this.hideT > 0) { this.sus = 30; this.say('проверка пришла, а подвал пустой и тихий. пронесло!', 'good'); } else this.raid(); }
    if (this.sus >= 100 && this.raidT < 0) {
      if (this.up.cams) { this.raidT = 3; this.emit('warn'); this.say('📹 сторож: к дому присматриваются. проверка через 3 дня!', 'bad'); }
      else this.raid();
    }
    const w = this.worth();
    if (w > this.stats.bestWorth) this.stats.bestWorth = w;
    if (!this.won && w >= GOAL) { this.won = true; this.emit('win'); }
    this.emit('day');
  }

  monthly(d) {
    const m = d.getUTCMonth();
    if (this.tariff === 'kolya') { this.money -= this.kolyaRate; this.say(`дядя коля забрал свои ${this.kolyaRate.toLocaleString('ru')} ₽`, ''); }
    if (this.up.krysha) { this.money -= 45000; }
    if (this.tariff === 'home' && this.monthKwh > 4000) {
      this.addSus(28);
      const fine = 20000 + Math.round(this.monthKwh * 2);
      this.money -= fine;
      this.say(`🧾 энергосбыт: за месяц ${Math.round(this.monthKwh)} кВт·ч, «это не похоже на квартиру». доначисление ${fine.toLocaleString('ru')} ₽`, 'bad');
      this.hint('home', 'на бытовом тарифе нельзя больше 4000 кВт·ч в месяц. переходи на коммерческий или ищи «обходные» варианты');
    }
    if (m === 6) { this.idx *= 1.09; this.say('📈 с 1 июля тарифы на электричество выросли на 9%', 'bad'); }
    this.monthKwh = 0;
  }

  randomEvent() {
    for (let k = 0; k < 6; k++) {
      let tot = 0; for (const e of EVENTS) tot += e.w;
      let x = rnd() * tot, ev = EVENTS[0];
      for (const e of EVENTS) { x -= e.w; if (x <= 0) { ev = e; break; } }
      const t = ev.fn(this);
      if (t) { this.say(t, ev.cls); return; }
    }
  }

  raid() {
    this.stats.raids++;
    let total = 0, taken = 0;
    for (const r of this.rigs) total += r.cards.length;
    for (const r of this.rigs) {
      if (!r.cards.length) continue;
      if (rnd() < 0.55) { taken += r.cards.length; r.cards = []; }
    }
    const fine = 40000 + Math.round(Math.max(0, this.money) * 0.12);
    this.money -= fine;
    this.sus = 15;
    if (this.tariff === 'hack' || this.tariff === 'kolya') this.tariff = 'home';
    this.say(`🚨 РЕЙД! изъято ${taken} из ${total} карт, штраф ${fine.toLocaleString('ru')} ₽`, 'bad');
    this.emit('raid', taken, fine);
  }

  // ===== действия игрока =====
  canPay(v) { return this.money >= v; }
  pay(v) { if (this.money < v) { this.emit('nomoney'); return false; } this.money -= v; return true; }

  buyCard(id, used) {
    const p = this.gpuPrice(id, used);
    if (!this.pay(p)) return false;
    const c = { id, wear: used ? 30 + rnd() * 30 : 0, dust: used ? 35 : 0, temp: this.roomT, uid: uid++, hr: 0 };
    this.addSus(0.4);
    const r = this.rigs.find(r => r.cards.length < RIG.slots);
    if (r) { r.cards.push(c); this.emit('install', r); }
    else this.stock.push(c);
    this.emit('buy');
    return r || true;
  }
  sellCard(r, i) {
    const c = r ? r.cards.splice(i, 1)[0] : this.stock.splice(i, 1)[0];
    if (!c) return;
    this.money += this.cardSell(c);
    this.emit('sell');
  }
  installStock() {
    let moved = 0;
    for (const r of this.rigs) while (r.cards.length < RIG.slots && this.stock.length) { r.cards.push(this.stock.shift()); moved++; }
    if (moved) this.emit('install');
    return moved;
  }
  freeSpot() {
    const used = {}; for (const r of this.rigs) used[r.spot] = 1;
    for (let i = 0; i < this.spots(); i++) if (!used[i]) return i;
    return -1;
  }
  buyRig(spot) {
    if (spot === undefined || spot < 0) spot = this.freeSpot();
    if (spot < 0 || spot >= this.spots() || this.rigs.some(r => r.spot === spot)) return false;
    if (!this.pay(this.rigPrice())) return false;
    const r = this.newRig(spot);
    r.coin = this.up.bot ? this.bestCoin() : 'ETK';
    this.rigs.push(r);
    this.installStock();
    this.emit('rig', r);
    return r;
  }
  sellRig(r) {
    for (const c of r.cards) this.stock.push(c);
    r.cards = [];
    if (this.rigs.length <= 1) return;
    this.rigs.splice(this.rigs.indexOf(r), 1);
    this.money += Math.round(this.rigPrice() * 0.4);
    this.installStock();
    this.emit('rig');
  }
  cleanRig(r) {
    const cost = 300 * r.cards.length;
    if (!this.pay(cost)) return;
    for (const c of r.cards) c.dust = 0;
    r.off = Math.max(r.off, 0.3);
    this.emit('clean', r);
  }
  upPsu(r) { if (r.psu || !this.pay(this.psuPrice())) return; r.psu = true; this.emit('rig', r); }
  upImm(r) { if (r.imm || !this.pay(this.immPrice())) return; r.imm = true; for (const c of r.cards) c.dust = 0; this.emit('rig', r); }
  buyCooler(id) {
    const d = COOLER_BY_ID[id];
    if (this.coolers[id] >= d.max) return;
    if (d.need && this.room < d.need - 1) return;
    if (!this.pay(d.rub)) return;
    this.coolers[id]++;
    this.emit('cooler', id);
  }
  sellCooler(id) { if (!this.coolers[id]) return; this.coolers[id]--; this.money += Math.round(COOLER_BY_ID[id].rub * 0.45); this.emit('cooler', id); }
  setTariff(id) {
    const t = TARIFF_BY_ID[id];
    if (id === this.tariff) return;
    if (t.fee && !this.pay(t.fee)) return;
    this.tariff = id;
    this.say('тариф: ' + t.name, '');
    this.emit('tariff');
  }
  buyLine(i) { if (i !== this.line + 1 || !this.pay(LINES[i].rub)) return; this.line = i; this.tripped = false; this.say('⚡ ' + LINES[i].name + ': лимит ' + LINES[i].kw + ' кВт', 'good'); this.emit('line'); }
  resetTrip() { this.tripped = false; this.emit('reset'); }
  buyRoom() {
    const i = this.room + 1; if (i >= ROOMS.length || !this.pay(ROOMS[i].rub)) return;
    this.room = i; this.say('🏗️ ' + ROOMS[i].name + ': теперь мест под риги ' + ROOMS[i].spots, 'good'); this.emit('room');
  }
  buyUp(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (this.up[id] || !this.pay(u.rub)) return;
    this.up[id] = 1; this.emit('up', id);
    if (id === 'bot') for (const r of this.rigs) r.coin = this.bestCoin();
  }
  bribe() {
    if (this.bribeCD > 0) return;
    const c = this.bribeCost();
    if (!this.pay(c)) return;
    this.sus = Math.max(0, this.sus - 40); this.bribeCD = 25;
    if (this.raidT > 0) { this.raidT = -1; this.sus = Math.min(this.sus, 35); }
    this.say('🤝 участковый получил «подарок». палево -40%', 'good');
  }
  hide() { this.hideT = 4; this.sus = Math.max(0, this.sus - 25); this.say('ферма свёрнута на 4 дня, всё выключено', ''); }
  sellCoin(id, frac) {
    const n = this.wallet[id] * frac;
    if (n <= 0) return;
    this.wallet[id] -= n;
    const v = n * this.coinRub(id) * 0.99;
    this.money += v; this.emit('coinsell', v);
  }
  buyCoin(id, rub) {
    rub = Math.min(rub, this.money);
    if (rub <= 0) return;
    this.money -= rub;
    this.wallet[id] += rub * 0.99 / this.coinRub(id);
    this.emit('buycoin');
  }
}

export { clamp };
