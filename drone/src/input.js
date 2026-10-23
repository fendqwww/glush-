// управление: два плавающих сенсорных стика, клавиатура, геймпад
export class Input {
  constructor(layer, ui) {
    this.s = { thr: 0, yaw: 0, pitch: 0, roll: 0 };
    this.mode = 'ANGLE';
    this.sens = 1;
    this.R = 60;
    this.touches = {};
    this.keys = {};
    this.thrAcro = 0;
    this.actions = [];
    this.L = { id: null, ox: 0, oy: 0, x: 0, y: 0, thr0: 0 };
    this.Rt = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.ui = ui;
    this.enabled = false;
    const opt = { passive: false };
    layer.addEventListener('touchstart', e => this.ts(e), opt);
    layer.addEventListener('touchmove', e => this.tm(e), opt);
    layer.addEventListener('touchend', e => this.te(e), opt);
    layer.addEventListener('touchcancel', e => this.te(e), opt);
    // мышь для отладки на ПК
    let mouse = null;
    layer.addEventListener('mousedown', e => { mouse = { identifier: 'm', clientX: e.clientX, clientY: e.clientY }; this.ts({ changedTouches: [mouse], preventDefault() {} }); });
    window.addEventListener('mousemove', e => { if (mouse) { mouse.clientX = e.clientX; mouse.clientY = e.clientY; this.tm({ changedTouches: [mouse], preventDefault() {} }); } });
    window.addEventListener('mouseup', () => { if (mouse) { this.te({ changedTouches: [mouse], preventDefault() {} }); mouse = null; } });
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      const map = { Space: 'drop', KeyC: 'cam', KeyF: 'mode', KeyP: 'pause', Escape: 'pause', KeyR: 'restart', KeyM: 'map' };
      if (map[e.code] && !e.repeat) this.actions.push(map[e.code]);
      if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.padPrev = [];
  }

  setMode(m) {
    this.mode = m;
    if (m === 'ACRO') this.thrAcro = Math.max(this.thrAcro, 0);
  }

  ts(e) {
    e.preventDefault();
    if (!this.enabled) return;
    const w = window.innerWidth;
    for (const t of e.changedTouches) {
      const left = t.clientX < w / 2;
      const st = left ? this.L : this.Rt;
      if (st.id !== null) continue;
      st.id = t.identifier; st.ox = t.clientX; st.oy = t.clientY; st.x = t.clientX; st.y = t.clientY;
      if (left) st.thr0 = this.mode === 'ACRO' ? this.thrAcro : 0.5;
    }
    this.draw();
  }
  tm(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const st of [this.L, this.Rt]) if (st.id === t.identifier) { st.x = t.clientX; st.y = t.clientY; }
    }
    this.draw();
  }
  te(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.L.id === t.identifier) { this.L.id = null; }
      if (this.Rt.id === t.identifier) { this.Rt.id = null; }
    }
    this.draw();
  }

  draw() {
    const u = this.ui;
    const R = this.R;
    for (const [st, base, knob, left] of [[this.L, u.baseL, u.knobL, true], [this.Rt, u.baseR, u.knobR, false]]) {
      if (st.id === null) { base.style.opacity = '0.25'; base.style.left = ''; base.style.top = ''; base.className = 'stick-base ' + (left ? 'sl' : 'sr'); knob.style.transform = 'translate(-50%,-50%)'; continue; }
      base.style.opacity = '0.7';
      base.className = 'stick-base';
      base.style.left = st.ox + 'px'; base.style.top = st.oy + 'px';
      let dx = st.x - st.ox, dy = st.y - st.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }

  poll(dt) {
    const s = this.s, R = this.R * 1.0, k = this.keys;
    let thr, yaw = 0, pitch = 0, roll = 0;
    // сенсор
    if (this.L.id !== null) {
      const dy = (this.L.y - this.L.oy) / (R * 2);
      thr = Math.max(0, Math.min(1, this.L.thr0 - dy));
      yaw = clamp((this.L.x - this.L.ox) / R);
      if (this.mode === 'ACRO') this.thrAcro = thr;
    } else thr = this.mode === 'ACRO' ? this.thrAcro : 0.5;
    if (this.Rt.id !== null) {
      roll = clamp((this.Rt.x - this.Rt.ox) / R);
      pitch = clamp(-(this.Rt.y - this.Rt.oy) / R);
    }
    // клавиатура
    if (k.KeyW || k.KeyS) {
      if (this.mode === 'ACRO') { this.thrAcro = Math.max(0, Math.min(1, this.thrAcro + ((k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)) * dt * 0.8)); thr = this.thrAcro; }
      else thr = k.KeyW ? 0.92 : 0.08;
    }
    if (k.KeyX && this.mode === 'ANGLE') thr = 0;
    if (k.KeyA) yaw = -1; if (k.KeyD) yaw = 1;
    if (k.ArrowUp) pitch = 1; if (k.ArrowDown) pitch = -1;
    if (k.ArrowLeft) roll = -1; if (k.ArrowRight) roll = 1;
    if (k.KeyQ) yaw = -1; if (k.KeyE) yaw = 1;
    // геймпад (Mode 2)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || p.axes.length < 4) continue;
      const dz = v => (Math.abs(v) < 0.08 ? 0 : v);
      const ax = p.axes.map(dz);
      if (ax[0] || ax[1] || ax[2] || ax[3]) {
        yaw = ax[0]; roll = ax[2]; pitch = -ax[3];
        thr = this.mode === 'ACRO' ? (1 - p.axes[1]) / 2 : 0.5 - p.axes[1] * 0.5;
        if (this.mode === 'ACRO') this.thrAcro = thr;
      }
      const btn = [[0, 'drop'], [1, 'cam'], [2, 'mode'], [9, 'pause'], [3, 'restart']];
      for (const [i, a] of btn) {
        const pr = p.buttons[i] && p.buttons[i].pressed;
        if (pr && !this.padPrev[i]) this.actions.push(a);
        this.padPrev[i] = pr;
      }
      break;
    }
    const sens = this.sens;
    s.thr = thr; s.yaw = yaw * sens; s.pitch = clamp(pitch * sens); s.roll = clamp(roll * sens);
    return s;
  }

  resetThrottle() { this.thrAcro = 0; }
  take() { const a = this.actions; this.actions = []; return a; }
}

function clamp(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
