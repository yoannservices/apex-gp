// Pilote IA : suivi de trajectoire (pure pursuit), contrôle de vitesse sur le profil, dépassements, erreurs, stands.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const clamp = A.clamp, WB = 3.6;

  const STYLES = {
    prudent: { err: 0.7 },
    regulier: { err: 0.85 },
    agressif: { err: 1.1 },
    cannibale: { err: 1.4 },
  };

  A.Driver = class Driver {
    constructor(car, tr, line, drv) {
      this.car = car; this.tr = tr; this.line = line; this.drv = drv;
      this.st = STYLES[drv.style] || STYLES.regulier;
      this.lvl = A.diffAt(2);
      this.off = 0; this.n1 = 0; this.n2 = 0; this.errT = 0; this.sd = 0; this.defend = 0; this.lastErr = 0;
      this.relStart = 0;
    }
    setLevel(lv) { this.lvl = typeof lv === 'number' ? A.diffAt(lv) : lv; }

    // Facteur de vitesse lié à l'état des pneus et à la météo
    gripScale(wet) {
      const c = this.car;
      let g = 0;
      for (const t of c.tires) g += t.tempFactor() * t.wearFactor() * (1 - 0.55 * t.punct);
      g = (g / 4) * A.wetGrip(c.tires[0].c.type, wet);
      const d = c.d, dam = 0.55 + 0.45 * Math.min(d.fw, d.rw) * d.floor;
      return clamp(Math.sqrt(g) * Math.sqrt(dam), 0.45, 1.04) / 0.98;
    }

    drive(dt, ctx) {
      const car = this.car, tr = this.tr, L = this.line, inp = car.in, N = tr.N, ds = tr.ds;
      const lv = this.lvl, st = this.st;
      if (car.idx < 0) return;
      if (ctx.phase === 'grid') { inp.thr = 0; inp.brk = 1; inp.steer = 0; return; }
      const u = car.u, i = car.idx, relS = tr.rel(car.s);
      const pit = car.pit.state;

      // bruit lisse (irrégularité du pilote)
      this.n1 += (Math.random() * 2 - 1 - this.n1) * dt * 0.9;
      this.n2 += (Math.random() * 2 - 1 - this.n2) * dt * 3;
      this.errT = Math.max(0, this.errT - dt);
      if (this.errT === 0 && u > 35 && !pit && ctx.phase === 'race' && Math.random() < (lv.err * st.err / 60) * dt * (1 + 1.5 * ctx.wet)) this.errT = 1.1 + Math.random() * 0.8;

      // Chaque bot suit sa ligne idéale sans adapter sa trajectoire aux autres voitures.
      const target = L.off[i];
      const d0 = this.off;
      this.off += clamp(target - d0, -3.2 * dt, 3.2 * dt);

      // voie des stands
      let dOff = this.off, pitLat = -2.6; // voie rapide ; voie de travail près du stand
      if (pit === 2 || (pit === 1 && car.pit.slot >= 0 && tr.pitSlotS(car.pit.slot) - relS < 28)) pitLat = 0.5;
      if (pit) { const f = tr.pitOff[i] / tr.pitCenter; dOff = this.off * (1 - f) + (tr.pitOff[i] + pitLat) * f; this.off = dOff; }

      // ---- cible de suivi ----
      const Ld = clamp(5 + 0.22 * Math.abs(u), 8, 34) * (pit ? 0.7 : 1);
      const k = (i + Math.ceil(Ld / ds)) % N;
      let kOff = dOff;
      if (!pit) kOff = this.off + (L.off[k] - L.off[i]);
      else { const f = tr.pitOff[k] / tr.pitCenter; kOff = L.off[k] * (1 - f) + (tr.pitOff[k] + pitLat) * f; }
      const tx = tr.px[k] + tr.nx[k] * kOff, tz = tr.pz[k] + tr.nz[k] * kOff;
      const alpha = A.wrap(Math.atan2(tx - car.x, tz - car.z) - car.h);
      let delta = Math.atan2(2 * WB * Math.sin(alpha), Math.max(6, Math.hypot(tx - car.x, tz - car.z)));
      const dmax = 0.42 / (1 + (Math.abs(u) / 38) ** 2) + 0.045;
      let steer = delta / dmax;
      const beta = Math.atan2(car.v, Math.max(8, Math.abs(u)));
      steer += clamp(beta * 3.2, -0.8, 0.8) + (this.n2 * lv.noise * 2.2);
      if (this.errT > 0) steer *= 0.75;
      inp.steer = clamp(steer, -1, 1);

      // ---- vitesse cible ----
      const look = Math.ceil((Math.abs(u) * 0.35) / ds);
      let vt = Math.min(L.vmax[i], L.vmax[(i + look) % N]);
      const pace = lv.pace * (1 + this.n1 * lv.noise * 0.6);
      vt *= pace * this.gripScale(ctx.wet);
      if (this.errT > 0) vt *= 0.96;
      // hors piste : on revient doucement
      const off = Math.abs(car.lat) - tr.hw;
      if (off > 0.5 && !pit && tr.pitOff[i] < 0.5) vt = Math.min(vt, 28);
      if (car.d.fw < 0.2) vt *= 0.9;
      if (car.d.wheel.some(w => !w)) vt = Math.min(vt, 25);

      // arrêt au stand / limiteur
      if (pit) {
        const lim = 20.8;
        vt = Math.min(vt, Math.sqrt(lim * lim + 2 * 22 * Math.max(0, -230 - relS)));
        if (pit === 1 && relS > -230) vt = Math.min(vt, lim);
        if (pit === 3) vt = Math.min(vt, relS < 230 ? lim : 99);
        if (pit === 1 && car.pit.slot >= 0) {
          const dist = tr.pitSlotS(car.pit.slot) - relS;
          if (dist < 90) vt = Math.min(vt, Math.sqrt(2 * 6.5 * Math.max(0, dist - 0.4)) + (dist > 1 ? 0.8 : 0));
          if (dist < 0.4) vt = 0;
        }
        if (pit === 2) { inp.thr = 0; inp.brk = 1; inp.steer = 0; return; }
      }
      // drapeau jaune / safety car / formation
      if (ctx.speedCap) vt = Math.min(vt, ctx.speedCap(car, this));
      const e = vt - u;
      if (u < 2 && ctx.phase === 'start') { inp.thr = 1; inp.brk = 0; }
      else {
        inp.thr = clamp(0.15 + e * 0.35, 0, 1);
        inp.brk = e < -0.8 ? clamp(-e * 0.14, 0, 1) : 0;
        if (vt <= 0.01) { inp.thr = 0; inp.brk = 1; }
      }
      // sécurité : trop de glissement -> on lève
      if (car.slip > 0.3 && inp.thr > 0.3) inp.thr *= 0.5;
      if (car.locked > 0 && !car.assists.abs) inp.brk *= 0.6;
      if (Math.abs(inp.steer) > 0.85 && inp.thr > 0.6) inp.thr *= 0.7;

      // DRS : ligne droite, autorisé, pas de freinage
      const kk = Math.abs(L.k[i]);
      car.drsOpen = car.drsOk && inp.thr > 0.9 && inp.brk < 0.05 && kk < 1 / 700;
      if (!car.drsOk || inp.brk > 0.05) car.drsOpen = false;
    }
  };
})();
