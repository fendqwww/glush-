// интерфейс поверх 3D: верхняя панель, вкладки, окна, уведомления
import { COINS, GPUS, GPU_BY_ID, OC, COOLERS, TARIFFS, LINES, ROOMS, UPGRADES, RIG, MONTHS, GOAL, RANKS } from './data.js';

const $ = id => document.getElementById(id);
export const rub = v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';
export const rubK = v => { const a = Math.abs(v), s = v < 0 ? '−' : ''; if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' млн ₽'; if (a >= 1e4) return s + Math.round(a / 1000) + ' тыс ₽'; return rub(v); };
const usd = v => '$' + (v >= 100 ? Math.round(v).toLocaleString('en').replace(/,/g, ' ') : v >= 1 ? v.toFixed(2) : v.toFixed(4));
const pct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const cls = v => v >= 0 ? 'up' : 'dn';
const coinN = n => n >= 1 ? n.toFixed(2) : n >= 0.001 ? n.toFixed(4) : n.toFixed(6);

export class UI {
  constructor(game) {
    this.g = game;
    this.sim = null;
    this.tab = null;
    this.rigSel = -1;
    this.touching = false;
    this.lastRender = 0;
    const p = $('pbody');
    p.addEventListener('touchstart', () => { this.touching = true; }, { passive: true });
    p.addEventListener('touchend', () => { setTimeout(() => { this.touching = false; }, 350); }, { passive: true });
    document.body.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b || b.classList.contains('off')) return;
      e.preventDefault();
      this.g.audio.click();
      this.act(b.dataset.a, b.dataset.v, b.dataset.w);
    });
    document.querySelectorAll('#tabs [data-tab]').forEach(b => b.addEventListener('click', () => { this.g.audio.click(); this.open(b.dataset.tab === this.tab ? null : b.dataset.tab); }));
    $('pclose').addEventListener('click', () => this.open(null));
  }

  bind(sim) { this.sim = sim; this.rigSel = -1; }

  open(tab, rigIdx) {
    this.tab = tab;
    if (rigIdx !== undefined) this.rigSel = rigIdx;
    else if (tab !== 'farm') this.rigSel = -1;
    $('panel').classList.toggle('on', !!tab);
    document.querySelectorAll('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.classList.toggle('pan', !!tab);
    if (tab) { $('pbody').scrollTop = 0; this.render(true); }
    this.g.onPanel(tab, this.rigSel);
  }

  act(a, v, w) {
    const s = this.sim, g = this.g;
    const R = s.rigs[+v];
    const ok = () => { g.audio.buy(); this.render(true); g.dirty(); };
    switch (a) {
      case 'speed': g.setSpeed(+v); break;
      case 'mute': g.toggleMute(); break;
      case 'menu': g.showMenu(true); break;
      case 'tab': this.open(v); break;
      case 'rig': this.open('farm', +v); break;
      case 'rigs': this.rigSel = -1; this.render(true); g.onPanel('farm', -1); break;
      case 'coin': R.coin = w; this.render(true); break;
      case 'allcoin': for (const r of s.rigs) r.coin = v; this.render(true); break;
      case 'oc': R.oc = +w; this.render(true); break;
      case 'onoff': R.on = !R.on; this.render(true); break;
      case 'clean': s.cleanRig(R); ok(); g.room.smokePuff(R); break;
      case 'psu': s.upPsu(R); ok(); break;
      case 'imm': s.upImm(R); ok(); break;
      case 'sellcard': s.sellCard(R, +w); g.audio.coin(); this.render(true); g.dirty(); break;
      case 'sellstock': s.sellCard(null, +v); g.audio.coin(); this.render(true); break;
      case 'install': s.installStock(); ok(); break;
      case 'sellrig': if (confirm('Продать раму рига? Карты уйдут на склад.')) { s.sellRig(R); this.rigSel = -1; ok(); } break;
      case 'buyrig': { const r = s.buyRig(v !== undefined && v !== '' ? +v : undefined); if (r) { ok(); g.toast('🛠️ новый риг собран', 'good'); } break; }
      case 'buycard': { const r = s.buyCard(v, w === '1'); if (r) { ok(); g.toast('📦 ' + GPU_BY_ID[v].name + (r === true ? ' — на склад (нет места в ригах)' : ' — установлена'), r === true ? '' : 'good'); } break; }
      case 'autosell': s.autoSell = !s.autoSell; this.render(true); break;
      case 'sell': s.sellCoin(v, +w); g.audio.coin(); this.render(true); break;
      case 'buycoin': s.buyCoin(v, w === 'all' ? s.money : +w); g.audio.buy(); this.render(true); break;
      case 'tariff': s.setTariff(v); this.render(true); break;
      case 'line': s.buyLine(+v); ok(); break;
      case 'reset': s.resetTrip(); g.audio.buy(); this.render(true); break;
      case 'cool': s.buyCooler(v); ok(); break;
      case 'uncool': s.sellCooler(v); g.audio.coin(); this.render(true); g.dirty(); break;
      case 'room': s.buyRoom(); ok(); break;
      case 'up': s.buyUp(v); ok(); break;
      case 'bribe': s.bribe(); this.render(true); $('raid').style.display = 'none'; g.audio.coin(); break;
      case 'hide': s.hide(); this.render(true); $('raid').style.display = 'none'; break;
      case 'risk': $('raid').style.display = 'none'; break;
      case 'hint': $('hint').style.display = 'none'; g.nextHint(); break;
    }
  }

  // ===== верхняя панель =====
  hud() {
    const s = this.sim, f = s.flow;
    const d = s.date();
    $('hMoney').textContent = rubK(s.money);
    $('hMoney').className = s.money < 0 ? 'dn' : '';
    const prof = f.inc - f.pw;
    $('hProf').textContent = (prof >= 0 ? '+' : '') + rubK(prof) + '/д';
    $('hProf').className = cls(prof);
    $('hDate').textContent = d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    $('sTemp').textContent = s.roomT.toFixed(0) + '°';
    $('sTemp').parentNode.className = 'chip' + (s.roomT > 35 ? ' bad' : s.roomT > 30 ? ' warn' : '');
    $('sOut').textContent = (s.tout > 0 ? '+' : '') + s.tout.toFixed(0) + '°';
    $('sKw').textContent = f.kw.toFixed(1) + '/' + s.lineKw();
    $('sKw').parentNode.className = 'chip' + (s.tripped || f.kw > s.lineKw() * 0.9 ? ' bad' : f.kw > s.lineKw() * 0.75 ? ' warn' : '');
    $('sSus').style.width = s.sus.toFixed(0) + '%';
    $('sSus').style.background = s.sus > 75 ? '#ff4433' : s.sus > 45 ? '#ffb020' : '#56d364';
    $('sSusT').textContent = s.sus.toFixed(0) + '%';
    const best = s.bestCoin();
    const c = COINS.find(x => x.id === best);
    const h = s.hist[best], ch = (h[h.length - 1] / h[h.length - 2] - 1) * 100;
    $('sCoin').innerHTML = `<b style="color:${c.color}">${best}</b> ${usd(s.price[best])} <i class="${cls(ch)}">${pct(ch)}</i>`;
    $('sUsd').textContent = s.usd.toFixed(1);
    document.querySelectorAll('[data-a=speed]').forEach(b => b.classList.toggle('on', +b.dataset.v === this.g.speed));
    // крупные тревоги
    let al = '';
    if (s.tripped) al = `<div class="alert"><b>⚡ ВЫБИЛО АВТОМАТ</b><span>нагрузка выше ${s.lineKw()} кВт</span><button data-a="reset">ВКЛЮЧИТЬ</button></div>`;
    else if (s.blackout) al = `<div class="alert"><b>💡 НЕТ СВЕТА</b><span>авария на подстанции, ещё ${s.blackout} д.</span></div>`;
    else if (s.debtDays >= 10) al = `<div class="alert"><b>⛔ ОТКЛЮЧИЛИ ЗА ДОЛГИ</b><span>выйди в плюс: продай монеты или карты</span><button data-a="tab" data-v="market">БИРЖА</button></div>`;
    else if (s.hideT > 0) al = `<div class="alert soft"><b>🤫 ФЕРМА СВЁРНУТА</b><span>ещё ${s.hideT} д.</span></div>`;
    else if (s.raidT > 0) al = `<div class="alert"><b>🚨 ПРОВЕРКА ЧЕРЕЗ ${s.raidT} Д.</b><span>занеси или сверни ферму</span><button data-a="tab" data-v="ups">ЧТО ДЕЛАТЬ</button></div>`;
    else if (s.money < 0) al = `<div class="alert soft"><b>💸 ДОЛГ ${rubK(-s.money)}</b><span>через ${10 - s.debtDays} д. отключат свет</span></div>`;
    if (al !== this.lastAl) { $('alerts').innerHTML = al; this.lastAl = al; }
  }

  // ===== панели =====
  render(force) {
    if (!this.tab) return;
    if (!force && this.touching) return;
    const now = performance.now();
    if (!force && now - this.lastRender < 500) return;
    this.lastRender = now;
    const fn = { farm: this.pFarm, shop: this.pShop, market: this.pMarket, power: this.pPower, climate: this.pClimate, ups: this.pUps }[this.tab];
    const t = { farm: 'ФЕРМА', shop: 'МАГАЗИН', market: 'БИРЖА', power: 'ЭНЕРГИЯ', climate: 'КЛИМАТ', ups: 'ПОДВАЛ И ПАЛЕВО' }[this.tab];
    $('ptitle').textContent = this.tab === 'farm' && this.rigSel >= 0 && this.sim.rigs[this.rigSel] ? 'РИГ №' + (this.rigSel + 1) : t;
    $('pbody').innerHTML = fn.call(this);
    if (this.tab === 'market') this.drawCharts();
  }

  btn(a, v, w, label, off, extra) {
    return `<button data-a="${a}"${v !== undefined ? ` data-v="${v}"` : ''}${w !== undefined ? ` data-w="${w}"` : ''} class="${off ? 'off ' : ''}${extra || ''}">${label}</button>`;
  }

  pFarm() {
    const s = this.sim;
    if (this.rigSel >= 0 && s.rigs[this.rigSel]) return this.pRig(this.rigSel);
    const f = s.flow;
    let hash = 0, n = 0; for (const r of s.rigs) for (const c of r.cards) { hash += c.hr; n++; }
    const best = s.bestCoin();
    let h = `<div class="sum"><div><b>${hash.toFixed(0)}</b><span>MH/s</span></div><div><b>${n}</b><span>карт</span></div><div><b class="up">${rubK(f.inc)}</b><span>доход/д</span></div><div><b class="dn">${rubK(f.pw)}</b><span>свет/д</span></div></div>`;
    h += `<h4>ЧТО ВЫГОДНЕЕ МАЙНИТЬ <i>₽ за 1 MH в сутки</i></h4><div class="coins">`;
    for (const c of COINS) {
      const p = s.profit(c.id);
      h += `<div class="ctile${c.id === best ? ' best' : ''}" data-a="allcoin" data-v="${c.id}"><b style="color:${c.color}">${c.id}</b><span>${p.toFixed(2)} ₽</span><i>${c.id === best ? 'лучшая' : 'все сюда'}</i></div>`;
    }
    h += '</div>';
    if (s.stock.length) {
      h += `<h4>СКЛАД <i>${s.stock.length} карт не установлено</i></h4>`;
      h += s.stock.map((c, i) => `<div class="row"><span>${GPU_BY_ID[c.id].name} <i>износ ${c.wear.toFixed(0)}%</i></span>${this.btn('sellstock', i, undefined, 'продать ' + rubK(s.cardSell(c)))}</div>`).join('');
      h += this.btn('install', undefined, undefined, 'УСТАНОВИТЬ В РИГИ', !s.rigs.some(r => r.cards.length < RIG.slots), 'wide');
    }
    h += `<h4>РИГИ <i>${s.rigs.length} из ${s.spots()} мест</i></h4>`;
    s.rigs.forEach((r, i) => {
      let mt = 0, hr = 0; for (const c of r.cards) { mt = Math.max(mt, c.temp); hr += c.hr; }
      const w = s.rigWorks(r) ? s.rigPower(r) : 0;
      const st = !r.cards.length ? '<i>пустой</i>' : !r.on ? '<i>выключен</i>' : r.off > 0 ? '<i class="dn">стоит</i>' : `<i class="${mt > 85 ? 'dn' : mt > 75 ? 'wn' : 'up'}">${mt.toFixed(0)}°C</i>`;
      const c = COINS.find(x => x.id === r.coin);
      h += `<div class="rigrow" data-a="rig" data-v="${i}"><b>№${i + 1}</b><span>${r.cards.length}/6 · <b style="color:${c.color}">${r.coin}</b> · ${hr.toFixed(0)} MH · ${w} Вт${r.imm ? ' · 💧' : ''}${r.unstable ? ' · <i class="dn">БП не тянет!</i>' : ''}</span>${st}<em>›</em></div>`;
    });
    const fs = s.freeSpot();
    h += this.btn('buyrig', undefined, undefined, fs < 0 ? 'нет мест — расширь подвал' : '+ РИГ ' + rubK(s.rigPrice()), fs < 0 || s.money < s.rigPrice(), 'wide');
    h += `<div class="tgl" data-a="autosell"><span>Автопродажа намайненного</span><b class="${s.autoSell ? 'on' : ''}">${s.autoSell ? 'ВКЛ' : 'ВЫКЛ'}</b></div>`;
    h += `<p class="tip">${s.autoSell ? 'монеты сразу меняются на рубли по текущему курсу.' : 'монеты копятся в кошельке — продавай на бирже, когда курс вырастет.'}</p>`;
    return h;
  }

  pRig(i) {
    const s = this.sim, r = s.rigs[i];
    const w = s.rigPower(r), cap = s.psuCap(r);
    let h = `<div class="back" data-a="rigs">‹ все риги</div>`;
    h += `<div class="sum"><div><b>${r.cards.length}/6</b><span>карт</span></div><div><b class="${w > cap ? 'dn' : ''}">${w}</b><span>Вт из ${cap}</span></div><div><b>${r.cards.reduce((a, c) => a + c.hr, 0).toFixed(0)}</b><span>MH/s</span></div></div>`;
    if (w > cap) h += `<p class="warnbox">⚠️ блок питания перегружен — карты отваливаются. купи мощный БП или включи ЭКО</p>`;
    h += '<h4>МОНЕТА</h4><div class="seg">' + COINS.map(c => this.btn('coin', i, c.id, `<b style="color:${c.color}">${c.id}</b> ${s.profit(c.id).toFixed(1)}₽`, false, r.coin === c.id ? 'sel' : '')).join('') + '</div>';
    h += '<h4>РЕЖИМ <i>хешрейт / мощность / износ</i></h4><div class="seg">' + OC.map((o, k) => this.btn('oc', i, k, `${o.name}<br><i>${Math.round(o.hash * 100)}% / ${Math.round(o.w * 100)}%</i>`, false, r.oc === k ? 'sel' : '')).join('') + '</div>';
    h += '<div class="seg">';
    h += this.btn('onoff', i, undefined, r.on ? '⏻ ВЫКЛЮЧИТЬ' : '⏻ ВКЛЮЧИТЬ', false, r.on ? '' : 'sel');
    h += this.btn('clean', i, undefined, `🧹 чистка ${rub(300 * r.cards.length)}`, r.imm || !r.cards.length);
    h += '</div><div class="seg">';
    h += this.btn('psu', i, undefined, r.psu ? '✔ БП 2600 Вт' : `🔌 БП 2600 Вт ${rubK(s.psuPrice())}`, r.psu || s.money < s.psuPrice());
    h += this.btn('imm', i, undefined, r.imm ? '✔ иммерсия' : `💧 иммерсия ${rubK(s.immPrice())}`, r.imm || s.money < s.immPrice());
    h += '</div>';
    if (!r.imm) h += `<p class="tip">иммерсия: карты в диэлектрической жидкости. −30°C, без пыли и шума, половина тепла уходит на улицу.</p>`;
    h += `<h4>КАРТЫ</h4>`;
    if (!r.cards.length) h += `<p class="tip">пусто. купи карты в магазине — они встанут сюда сами.</p>${this.btn('tab', 'shop', undefined, 'В МАГАЗИН', false, 'wide')}`;
    r.cards.forEach((c, k) => {
      const G = GPU_BY_ID[c.id];
      h += `<div class="card"><div><b>${G.name}</b><span>${c.hr.toFixed(1)} MH · <i class="${c.temp > 85 ? 'dn' : c.temp > 75 ? 'wn' : 'up'}">${c.temp.toFixed(0)}°C</i> · износ <i class="${c.wear > 75 ? 'dn' : ''}">${c.wear.toFixed(0)}%</i> · пыль ${c.dust.toFixed(0)}%</span></div>${this.btn('sellcard', i, k, rubK(s.cardSell(c)))}</div>`;
    });
    if (s.rigs.length > 1) h += this.btn('sellrig', i, undefined, 'разобрать риг', false, 'wide ghost');
    return h;
  }

  pShop() {
    const s = this.sim;
    const best = s.bestCoin(), bp = s.profit(best);
    const dm = s.gpuDemand();
    let h = `<div class="sum"><div><b>${rubK(s.money)}</b><span>на руках</span></div><div><b class="${dm > 1.1 ? 'dn' : dm < 0.9 ? 'up' : ''}">×${dm.toFixed(2)}</b><span>${dm > 1.25 ? 'дефицит' : dm < 0.88 ? 'распродажа' : 'цены'}</span></div><div><b>${s.rigs.reduce((a, r) => a + RIG.slots - r.cards.length, 0)}</b><span>слотов</span></div></div>`;
    const fs = s.freeSpot();
    h += `<div class="item"><div><b>🛠️ Риг: рама + БП 1500 Вт</b><span>6 слотов под карты. ${fs < 0 ? '<i class="dn">нет места в подвале</i>' : 'мест свободно: ' + (s.spots() - s.rigs.length)}</span></div>${this.btn('buyrig', undefined, undefined, rubK(s.rigPrice()), fs < 0 || s.money < s.rigPrice())}</div>`;
    h += `<h4>ВИДЕОКАРТЫ <i>прибыль/д на ${best} за вычетом света</i></h4>`;
    for (const G of GPUS) {
      const pn = s.gpuPrice(G.id), pu = s.gpuPrice(G.id, true);
      const day = G.hash * bp - G.w * 24 / 1000 * s.rate();
      const pb = day > 0 ? Math.round(pn / day) : Infinity;
      h += `<div class="item gpu"><div><b><i class="sw" style="background:#${G.col.toString(16).padStart(6, '0')}"></i>${G.name}</b><span>${G.hash} MH · ${G.w} Вт · ${(G.hash / G.w).toFixed(2)} MH/Вт · <i class="${day > 0 ? 'up' : 'dn'}">${day > 0 ? '+' : ''}${Math.round(day)} ₽/д</i>${pb < 5000 ? ' · окуп. ' + pb + ' д' : ''}</span><span class="note">${G.note}</span></div><div class="bb">${this.btn('buycard', G.id, 0, 'новая ' + rubK(pn), s.money < pn)}${this.btn('buycard', G.id, 1, 'б/у ' + rubK(pu), s.money < pu, 'ghost')}</div></div>`;
    }
    h += `<p class="tip">б/у дешевле на 42%, но уже изношена и в пыли. изношенная карта слабее и может умереть.</p>`;
    return h;
  }

  pMarket() {
    const s = this.sim;
    const uh = s.hist.USD, uch = (uh[uh.length - 1] / uh[Math.max(0, uh.length - 31)] - 1) * 100;
    let h = `<div class="tgl" data-a="autosell"><span>Автопродажа намайненного</span><b class="${s.autoSell ? 'on' : ''}">${s.autoSell ? 'ВКЛ' : 'ВЫКЛ'}</b></div>`;
    h += `<div class="coinbox"><div class="ch"><b>USD/RUB</b><span>${s.usd.toFixed(2)} ₽</span><i class="${cls(uch)}">${pct(uch)} за 30д</i></div><canvas data-c="USD" width="600" height="120"></canvas><p class="tip">монеты в долларах: рубль слабеет — майнинг выгоднее, но и импортные видеокарты дорожают.</p></div>`;
    for (const c of COINS) {
      const hs = s.hist[c.id], ch1 = (hs[hs.length - 1] / hs[hs.length - 2] - 1) * 100, ch30 = (hs[hs.length - 1] / hs[Math.max(0, hs.length - 31)] - 1) * 100;
      const have = s.wallet[c.id], val = have * s.coinRub(c.id);
      h += `<div class="coinbox"><div class="ch"><b style="color:${c.color}">${c.id}</b><span>${usd(s.price[c.id])}</span><i class="${cls(ch1)}">${pct(ch1)}</i><i class="${cls(ch30)}">${pct(ch30)} 30д</i></div><canvas data-c="${c.id}" width="600" height="120"></canvas>`;
      h += `<div class="row"><span>${c.name} — ${c.desc}<br>в кошельке: <b>${coinN(have)}</b> ≈ ${rubK(val)}</span></div>`;
      h += `<div class="seg">${this.btn('sell', c.id, 0.5, 'продать ½', have <= 0)}${this.btn('sell', c.id, 1, 'продать всё', have <= 0)}${this.btn('buycoin', c.id, 10000, 'купить 10к', s.money < 10000, 'ghost')}${this.btn('buycoin', c.id, 'all', 'на все', s.money <= 0, 'ghost')}</div></div>`;
    }
    h += `<p class="tip">комиссия обмена 1%. сложность сети догоняет цену: после роста курса доходность постепенно падает.</p>`;
    return h;
  }

  drawCharts() {
    const s = this.sim;
    document.querySelectorAll('#pbody canvas[data-c]').forEach(cv => {
      const id = cv.dataset.c, g = cv.getContext('2d'), w = cv.width, hh = cv.height;
      const hs = s.hist[id].slice(-180);
      let lo = Infinity, hi = -Infinity; for (const v of hs) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const col = id === 'USD' ? '#9fb3c8' : COINS.find(x => x.id === id).color;
      g.clearRect(0, 0, w, hh);
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * hh / 4); g.lineTo(w, i * hh / 4); g.stroke(); }
      const X = i => i / (hs.length - 1) * w, Y = v => hh - 8 - (v - lo) / (hi - lo + 1e-12) * (hh - 16);
      const gr = g.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00');
      g.beginPath(); hs.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.lineTo(w, hh); g.lineTo(0, hh); g.fillStyle = gr; g.fill();
      g.beginPath(); hs.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.strokeStyle = col; g.lineWidth = 3; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '20px -apple-system, Arial'; g.fillText('180 дней', 8, 22);
    });
  }

  pPower() {
    const s = this.sim, f = s.flow, lim = s.lineKw();
    let h = `<div class="sum"><div><b class="${f.kw > lim * 0.9 ? 'dn' : ''}">${f.kw.toFixed(2)}</b><span>кВт из ${lim}</span></div><div><b>${s.rate().toFixed(2)} ₽</b><span>за кВт·ч</span></div><div><b class="dn">${rubK(f.pw)}</b><span>в сутки</span></div></div>`;
    h += `<div class="bar"><i style="width:${Math.min(100, f.kw / lim * 100)}%;background:${f.kw > lim * 0.9 ? '#ff4433' : f.kw > lim * 0.75 ? '#ffb020' : '#56d364'}"></i></div>`;
    if (s.tripped) h += this.btn('reset', undefined, undefined, '⚡ ВКЛЮЧИТЬ АВТОМАТ', false, 'wide hot');
    if (s.tariff === 'home') h += `<h4>ЗА МЕСЯЦ <i>${Math.round(s.monthKwh)} из 4000 кВт·ч до проверки</i></h4><div class="bar"><i style="width:${Math.min(100, s.monthKwh / 40)}%;background:${s.monthKwh > 3500 ? '#ff4433' : '#ffb020'}"></i></div>`;
    h += `<h4>ТАРИФ</h4>`;
    for (const t of TARIFFS) {
      const on = s.tariff === t.id;
      h += `<div class="item${on ? ' cur' : ''}"><div><b>${t.name} · ${(t.rate * s.idx).toFixed(2)} ₽/кВт·ч</b><span>${t.desc}</span></div>${on ? '<em>✔</em>' : this.btn('tariff', t.id, undefined, t.fee ? rubK(t.fee) : 'выбрать', t.fee && s.money < t.fee)}</div>`;
    }
    h += `<h4>ПРОВОДКА</h4>`;
    LINES.forEach((l, i) => {
      h += `<div class="item${i === s.line ? ' cur' : ''}"><div><b>${l.name}</b><span>до ${l.kw} кВт</span></div>${i <= s.line ? '<em>✔</em>' : this.btn('line', i, undefined, rubK(l.rub), i !== s.line + 1 || s.money < l.rub)}</div>`;
    });
    h += `<p class="tip">если нагрузка выше лимита — выбивает автомат и всё встаёт. на старой проводке и врезке это может закончиться пожаром.</p>`;
    return h;
  }

  pClimate() {
    const s = this.sim, f = s.flow;
    let mt = 0; for (const r of s.rigs) for (const c of r.cards) mt = Math.max(mt, c.temp);
    let h = `<div class="sum"><div><b class="${s.roomT > 35 ? 'dn' : s.roomT > 30 ? 'wn' : ''}">${s.roomT.toFixed(1)}°</b><span>в подвале</span></div><div><b>${s.tout > 0 ? '+' : ''}${s.tout.toFixed(0)}°</b><span>на улице</span></div><div><b class="${mt > 85 ? 'dn' : mt > 75 ? 'wn' : ''}">${mt.toFixed(0)}°</b><span>горячая карта</span></div><div><b>${f.heat.toFixed(1)}</b><span>кВт тепла</span></div></div>`;
    h += `<p class="tip">карты троттлят выше 83°C, выше 90°C быстро изнашиваются, выше 100°C могут загореться. пыль греет карты — чисти риги.</p>`;
    for (const c of COOLERS) {
      const n = s.coolers[c.id], lock = c.need && s.room < c.need - 1;
      h += `<div class="item"><div><b>${c.icon} ${c.name} <i>${n}/${c.max}</i></b><span>${c.desc}</span><span class="note">${c.U ? '+' + c.U + ' Вт/°C' : '−' + c.ac + ' кВт тепла'} · ест ${c.pw} кВт · шум ${c.noise}</span></div><div class="bb">${lock ? '<em>🔒</em>' : this.btn('cool', c.id, undefined, rubK(c.rub), n >= c.max || s.money < c.rub)}${n ? this.btn('uncool', c.id, undefined, 'продать', false, 'ghost') : ''}</div></div>`;
    }
    if (s.tout < 0 && f.out > 4) h += `<p class="warnbox">❄️ на улице мороз, а из подвала валит ${f.out.toFixed(1)} кВт тепла: над тобой тает снег. это палево!</p>`;
    return h;
  }

  pUps() {
    const s = this.sim;
    const w = s.worth();
    const rk = s.rank();
    const nx = RANKS.find(r => r.at > Math.max(w, 0));
    let h = `<div class="sum"><div><b>${rubK(w)}</b><span>состояние</span></div><div><b>${rk.name}</b><span>звание</span></div></div>`;
    h += `<h4>ЦЕЛЬ: ${rubK(GOAL)} <i>${(Math.max(0, w) / GOAL * 100).toFixed(1)}%</i></h4><div class="bar"><i style="width:${Math.min(100, Math.max(0, w) / GOAL * 100)}%;background:#ffae1a"></i></div>`;
    if (nx) h += `<p class="tip">следующее звание «${nx.name}» — от ${rubK(nx.at)}</p>`;
    // палево
    const ds = s.flow.ds || 0;
    h += `<h4>ПАЛЕВО ${s.sus.toFixed(0)}% <i class="${ds > 0 ? 'dn' : 'up'}">${ds > 0 ? '▲' : '▼'} ${Math.abs(ds).toFixed(2)}%/д</i></h4><div class="bar"><i style="width:${s.sus}%;background:${s.sus > 75 ? '#ff4433' : s.sus > 45 ? '#ffb020' : '#56d364'}"></i></div>`;
    const src = [];
    if (s.T.sus) src.push(`тариф «${s.T.name}»`);
    const n = s.noiseLevel(); if (n > 2) src.push(`шум ${n.toFixed(1)}`);
    if (s.tout < 0 && s.flow.out > 4) src.push('тает снег над подвалом');
    if (s.tariff === 'home' && s.monthKwh > 3000) src.push('скоро проверка энергосбыта');
    h += `<p class="tip">${src.length ? 'источники: ' + src.join(', ') : 'сейчас тихо. соседи ничего не подозревают'}. при 100% приходят с рейдом и забирают часть карт.</p>`;
    h += `<div class="seg">${this.btn('bribe', undefined, undefined, s.bribeCD ? `🤝 занести (через ${s.bribeCD} д)` : `🤝 занести участковому ${rubK(s.bribeCost())}`, s.bribeCD > 0 || s.money < s.bribeCost())}${this.btn('hide', undefined, undefined, '🤫 свернуть ферму на 4 дня', s.hideT > 0)}</div>`;
    h += `<h4>ПОДВАЛ</h4>`;
    ROOMS.forEach((r, i) => {
      h += `<div class="item${i === s.room ? ' cur' : ''}"><div><b>${r.name}</b><span>${r.spots} мест под риги</span></div>${i <= s.room ? '<em>✔</em>' : this.btn('room', undefined, undefined, rubK(r.rub), i !== s.room + 1 || s.money < r.rub)}</div>`;
    });
    h += `<h4>АПГРЕЙДЫ</h4>`;
    for (const u of UPGRADES) {
      h += `<div class="item${s.up[u.id] ? ' cur' : ''}"><div><b>${u.icon} ${u.name}</b><span>${u.desc}</span></div>${s.up[u.id] ? '<em>✔</em>' : this.btn('up', u.id, undefined, rubK(u.rub), s.money < u.rub)}</div>`;
    }
    h += `<h4>СТАТИСТИКА</h4><p class="tip">намайнено ${rubK(s.stats.mined)} · за свет ${rubK(s.stats.power)} · пожаров ${s.stats.fires} · рейдов ${s.stats.raids}</p>`;
    return h;
  }
}
