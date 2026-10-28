// Entrées : clavier (AZERTY + QWERTY + flèches) et manette (Gamepad API). Lissage de la direction et des pédales.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const clamp = A.clamp;
  const down = new Set(), hit = new Set(), pad = { prev: [] };

  const KEYS = {
    thr: ['KeyW', 'KeyZ', 'ArrowUp'], brk: ['KeyS', 'ArrowDown'], left: ['KeyA', 'KeyQ', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  };
  const any = codes => codes.some(c => down.has(c));

  A.Input = {
    steer: 0, thr: 0, brk: 0, pad: false, lookBack: false,
    init() {
      addEventListener('keydown', e => {
        if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
        if (!e.repeat) hit.add(e.code);
        down.add(e.code);
      });
      addEventListener('keyup', e => down.delete(e.code));
      addEventListener('blur', () => down.clear());
    },
    // vrai une seule fois par appui
    pressed(...codes) { return codes.some(c => hit.has(c)); },
    held(...codes) { return any(codes); },
    endFrame() { hit.clear(); pad.hit = null; },

    // Mappage des actions ponctuelles (clavier + manette)
    actions() {
      const p = this._pollPad(), h = c => hit.has(c), a = {};
      a.drs = h('Space') || p.btn[0]; a.up = h('KeyE') || h('ShiftLeft') || h('ShiftRight') || p.btn[5]; a.down = h('KeyF') || h('ControlLeft') || p.btn[4];
      a.pit = h('KeyX') || p.btn[2]; a.cam = h('KeyC') || p.btn[3]; a.pause = h('Escape') || h('KeyP') || p.btn[9];
      a.yes = h('KeyY') || p.btn[14]; a.no = h('KeyN') || p.btn[15]; a.eco = h('KeyG'); a.look = down.has('KeyV') || !!(p.btn[10]);
      a.radio = h('KeyT'); a.map = h('KeyM'); a.mirror = h('KeyB');
      a.restart = h('KeyR') && down.has('ShiftLeft'); a.reset = h('KeyR') && !down.has('ShiftLeft'); a.one = h('Digit1'); a.two = h('Digit2'); a.three = h('Digit3');
      return a;
    },

    _pollPad() {
      const out = { btn: [], ax: [0, 0, 0, 0], thr: 0, brk: 0, on: false };
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const g of pads) {
        if (!g || !g.connected) continue;
        out.on = true;
        out.ax = [g.axes[0] || 0, g.axes[1] || 0, g.axes[2] || 0, g.axes[3] || 0];
        out.thr = g.buttons[7] ? g.buttons[7].value : 0; out.brk = g.buttons[6] ? g.buttons[6].value : 0;
        g.buttons.forEach((b, i) => { out.btn[i] = b.pressed && !pad.prev[i]; pad.prev[i] = b.pressed; });
        if (g.buttons[12] && g.buttons[12].pressed) out.thr = Math.max(out.thr, 1);
        break;
      }
      this.pad = out.on;
      return out;
    },

    // Mise à jour continue : speed en m/s pour adapter la vitesse de braquage au clavier.
    update(dt, speed) {
      const p = this._pollPad();
      const ts = (any(KEYS.left) ? 1 : 0) - (any(KEYS.right) ? 1 : 0); // gauche = +1
      const dz = v => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
      const sx = -dz(p.ax[0]);
      if (Math.abs(sx) > 0) this.steer = Math.sign(sx) * Math.pow(Math.abs(sx), 1.4);
      else {
        const k = 1 / (1 + speed / 28); // plus lent à haute vitesse
        const rate = (ts !== 0 && Math.sign(ts) !== Math.sign(this.steer) && this.steer !== 0 ? 9 : ts !== 0 ? 4.2 * (0.5 + k) : 7);
        const d = ts - this.steer;
        this.steer += clamp(d, -rate * dt, rate * dt);
      }
      const kt = any(KEYS.thr) ? 1 : 0, kb = any(KEYS.brk) ? 1 : 0;
      this.thr += clamp(Math.max(kt, p.thr) - this.thr, -9 * dt, 6 * dt);
      this.brk += clamp(Math.max(kb, p.brk) - this.brk, -12 * dt, 9 * dt);
      if (p.thr > 0 || p.brk > 0) { this.thr = Math.max(p.thr, kt ? this.thr : 0); this.brk = Math.max(p.brk, kb ? this.brk : 0); }
    },
  };
})();
