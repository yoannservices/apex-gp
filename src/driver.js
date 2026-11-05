// Pilote IA : suivi de trajectoire (pure pursuit), contrôle de vitesse sur le profil, dépassements, erreurs, stands.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const clamp = A.clamp, WB = 3.6;

  // err : fréquence des fautes ; att : envie d'attaquer (écart max pour tenter un dépassement, m) ; def : tendance à défendre ; gap : distance de suivi souhaitée (m)
  const STYLES = {
    prudent: { err: 0.7, att: 14, def: 0.1, gap: 9 },
    regulier: { err: 0.85, att: 22, def: 0.35, gap: 7 },
    agressif: { err: 1.1, att: 32, def: 0.6, gap: 5.5 },
    cannibale: { err: 1.4, att: 42, def: 0.85, gap: 4.5 },
  };
  const CAR_LEN = 5.6, LANE = 2.2, PASS_SEP = 2.9;

  A.Driver = class Driver {
    constructor(car, tr, line, drv) {
      this.car = car; this.tr = tr; this.line = line; this.drv = drv;
      this.st = STYLES[drv.style] || STYLES.regulier;
      this.lvl = A.diffAt(2);
      this.off = 0; this.n1 = 0; this.n2 = 0; this.errT = 0; this.sd = 0; this.defend = 0; this.lastErr = 0;
      this.pass = null; this.defOff = null; this.defT = 0; this.defCool = 0; this.passCool = 0; this.react = 0.12 + Math.random() * 0.18;
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
      if (ctx.phase === 'grid') { inp.thr = 0; inp.brk = 1; inp.steer = 0; this.off = this.gridLat = car.lat; return; }
      const u = car.u, i = car.idx, relS = tr.rel(car.s);
      const pit = car.pit.state;

      // bruit lisse (irrégularité du pilote)
      this.n1 += (Math.random() * 2 - 1 - this.n1) * dt * 0.9;
      this.n2 += (Math.random() * 2 - 1 - this.n2) * dt * 3;
      this.errT = Math.max(0, this.errT - dt);
      if (this.errT === 0 && u > 35 && !pit && ctx.phase === 'race' && Math.random() < (lv.err * st.err / 60) * dt * (1 + 1.5 * ctx.wet)) this.errT = 1.1 + Math.random() * 0.8;

      // ---- voisins : voiture devant sur ma trajectoire, voitures à côté, attaquant derrière ----
      this.defT = Math.max(0, this.defT - dt); this.defCool = Math.max(0, this.defCool - dt); this.passCool = Math.max(0, this.passCool - dt);
      let front = null, fgap = 1e9, behind = null, bgap = 1e9, besideL = false, besideR = false;
      if (!pit && A.AI_RC !== false) for (const o of ctx.cars) {
        if (o === car || o.hidden || o.isSC || o.pit.state || o.idx < 0) continue;
        const dd = o.dist - car.dist; if (dd > 90 || dd < -22) continue;
        const dl = o.lat - car.lat, adl = Math.abs(dl);
        if (dd > 0 && adl < LANE + (o.u < 8 ? 1.0 : 0.4) && dd - CAR_LEN < fgap) { front = o; fgap = dd - CAR_LEN; }
        if (dd < -1 && adl < LANE && -dd < bgap) { behind = o; bgap = -dd; }
        if (Math.abs(dd) < CAR_LEN + 1.5 && adl < LANE + 0.9) { if (dl > 0) besideL = true; else besideR = true; }
      }
      const kHere = Math.abs(L.k[i]), kAhead = Math.abs(L.k[(i + Math.ceil(Math.max(30, u * 1.2) / ds)) % N]);
      const straight = kHere < 1 / 260 && kAhead < 1 / 200;
      const restricted = ctx.speedCap && ctx.speedCap(car, this) < 900;
      const hw = tr.hw - 1.5;

      // Chaque bot suit sa ligne idéale, sauf pour dépasser, défendre ou éviter un contact.
      let target = L.off[i];
      // dépassement : on choisit le côté libre et on s'y tient jusqu'à ce que la voiture soit derrière
      if (this.pass) {
        const o = this.pass.car, dd = o.dist - car.dist;
        if (dd < -(CAR_LEN + 2) || this.pass.t > 9 || o.hidden || o.pit.state || restricted) { this.pass = null; this.passCool = 1.5; }
        else {
          this.pass.t += dt; this.pass.lat = clamp(o.lat + this.pass.side * PASS_SEP, -hw, hw); target = this.pass.lat;
          if (Math.abs(this.pass.lat - o.lat) < PASS_SEP - 0.45 && dd > -2) { this.pass = null; this.passCool = 1; target = L.off[i]; } // plus de place : on abandonne
        }
      }
      if (!this.pass && front && !restricted && !pit && this.passCool <= 0 && ctx.phase === 'race' && ctx.since > 12) { // pas d'attaque dans la mêlée du départ
        const pace0 = L.vmax[i] * lv.pace * this.gripScale(ctx.wet), closing = Math.max(pace0 - front.u, u - front.u);
        // il faut le temps de se décaler (≈0,8 s) sans toucher : écart minimal selon la vitesse de rapprochement
        const room = fgap > 4 + Math.max(0, u - front.u) * 0.9;
        const want = room && (front.u < 14 || closing > 1.2 + 2.5 * (1 - lv.agg)) && fgap < st.att * (0.5 + lv.agg) + 25 && (straight || front.u < 14);
        if (want) {
          let best = null;
          for (const sd of [-1, 1]) {
            const lat = clamp(front.lat + sd * PASS_SEP, -hw, hw);
            if (Math.abs(lat - front.lat) < PASS_SEP - 0.5) continue;
            if (sd > 0 ? besideL : besideR) continue;
            let free = true;
            for (const o of ctx.cars) { if (o === car || o === front || o.hidden || o.isSC) continue; const dd = o.dist - car.dist; if (dd > -6 && dd < fgap + 14 && Math.abs(o.lat - lat) < LANE) { free = false; break; } }
            if (!free) continue;
            const score = Math.abs(lat - L.off[(i + Math.ceil(120 / ds)) % N]) + (Math.abs(lat) > hw - 0.5 ? 2 : 0);
            if (!best || score < best.score) best = { sd, lat, score };
          }
          if (best) this.pass = { car: front, side: best.sd, lat: best.lat, t: 0 };
        }
      }
      // défense : une seule feinte vers la trajectoire de l'attaquant, sans zigzag
      if (!this.pass && behind && !restricted && ctx.phase === 'race' && this.defCool <= 0 && this.defT <= 0 && straight && bgap < 14 && behind.u > u - 1 && Math.random() < st.def * lv.agg * dt * 2.4) {
        this.defOff = clamp(behind.lat, -hw, hw); this.defT = 1.3; this.defCool = 7 + Math.random() * 6;
      }
      if (this.defT > 0 && this.defOff !== null && !this.pass && !besideL && !besideR) target = this.defOff;
      // voiture à côté : on garde son couloir, on s'écarte si elle serre
      if (besideL && target > car.lat) target = Math.min(target, car.lat - 0.3);
      if (besideR && target < car.lat) target = Math.max(target, car.lat + 0.3);
      // obstacle imminent : esquive du côté libre
      let slew = this.pass ? 4 : 3.2;
      if (front && fgap < 14 && (u - front.u) > 2 && !this.pass) {
        const sd = front.lat > car.lat ? -1 : 1;
        if (!(sd > 0 ? besideL : besideR)) { target = clamp(front.lat + sd * (LANE + 0.2), -hw, hw); slew = 4.6; }
      }
      // départ : chacun garde son couloir jusqu'au premier freinage (pas de convergence au centre de la grille)
      if (ctx.since < 7 && this.gridLat !== undefined && !this.pass && !pit) { target = this.gridLat; slew = 1.2; }
      // séparation latérale : jamais moins de 2.7 m avec une voiture à notre hauteur ; sans place, la plus en arrière lève le pied
      let squeeze = null;
      if (!pit) for (const o of ctx.cars) {
        if (o === car || o.hidden || o.isSC || o.pit.state || o.idx < 0) continue;
        const dd = o.dist - car.dist; const win = CAR_LEN + 1.5 + Math.min(8, Math.abs(o.u - u) * 0.5); if (dd > win || dd < -win) continue; // fenêtre élargie quand la vitesse relative est grande
        if (Math.abs(target - o.lat) < 2.7) {
          const sg = Math.abs(car.lat - o.lat) > 0.25 ? Math.sign(car.lat - o.lat) : (car.id - o.id >= 0 ? 1 : -1);
          target = clamp(o.lat + sg * 2.7, -hw, hw);
          if (Math.abs(target - o.lat) < 2.7 - 0.35 && dd > -1) squeeze = o;
          if (Math.abs(car.lat - o.lat) < 2.7 * 0.6 && dd > 0.5) squeeze = o; // déjà trop près : celle de derrière lève le pied
        }
      }
      const d0 = this.off;
      this.off += clamp(target - d0, -slew * dt, slew * dt);

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
      const pace = lv.pace * (1 + this.n1 * lv.noise * 0.6) * (0.985 + (this.drv.skill - 0.97) * 0.5);
      vt *= pace * this.gripScale(ctx.wet);
      if (this.pass) vt *= 1 + 0.012 * lv.agg; // freinage un peu plus tardif pour conclure le dépassement
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
      // suivi : on ne tamponne jamais la voiture de devant, on garde la distance de l'écurie dans les freinages
      if (front && !this.pass) {
        const gapDes = st.gap + 0.12 * u * (1 - lv.agg * 0.5), closing = u - front.u;
        let vf = front.u + (fgap - gapDes) * 0.55;
        if (fgap < 2.5) vf = Math.min(vf, front.u - 3);
        vt = Math.min(vt, Math.max(vf, 3));
        if (closing > 4 && fgap < (closing * closing) / 26 + 4) { vt = Math.min(vt, front.u * 0.8); }
      } else if (front && this.pass) vt = Math.min(vt, front.u + Math.max(0.5, (fgap - 4) * 0.4)); // on ne se rapproche pas tant qu'on n'est pas décalé
      // distance de sécurité cinématique : on doit pouvoir s'arrêter derrière la voiture de devant, même si elle freine à fond
      let vsafe = 1e9, gapNeed = 0;
      if (front && Math.abs(front.lat - car.lat) < LANE + 0.5) {
        const B = A.BOT, aS = 0.6 * (Math.min(0.9 * B.mu * (B.g + (B.cd * u * u) / B.mass), (B.brake / B.mass) * 0.92) + (B.drag * u * u) / B.mass);
        const vf = front.drv && front.drv.vtCmd != null && !(front.isPlayer && !front.auto_ap) ? Math.min(front.u, front.drv.vtCmd) : Math.max(0, front.u + Math.min(0, front.axL != null ? front.axL : front.ax || 0) * 0.6);
        gapNeed = Math.max(fgap - 2.0 - u * 0.12, 0.3);
        vsafe = Math.sqrt(Math.max(0, vf * vf + 2 * aS * gapNeed));
        vt = Math.min(vt, vsafe);
      }
      if (squeeze && squeeze.dist > car.dist) vt = Math.min(vt, squeeze.u - 1.5);
      // voisin devant sur le côté : on le laisse passer plutôt que de se coller à lui
      if (!front && (besideL || besideR)) for (const o of ctx.cars) { if (o === car || o.hidden || o.isSC) continue; const dd = o.dist - car.dist; if (dd > 0 && dd < CAR_LEN + 3 && Math.abs(o.lat - car.lat) < LANE + 0.9 && kHere > 1 / 300) { vt = Math.min(vt, o.u - 1.5); break; } }
      // drapeau jaune / safety car / formation
      if (ctx.speedCap) vt = Math.min(vt, ctx.speedCap(car, this));
      const e = vt - u;
      if (u < 2 && ctx.phase === 'start') { inp.thr = 1; inp.brk = 0; }
      else {
        inp.thr = clamp(0.15 + e * 0.35, 0, 1);
        inp.brk = e < -0.8 ? clamp(-e * 0.14, 0, 1) : 0;
        if (vt <= 0.01) { inp.thr = 0; inp.brk = 1; }
      }
      if (vsafe < 1e8 && u > vsafe + 0.5) { // freinage proportionnel à la décélération nécessaire (pas seulement à l'écart de vitesse)
        const B = A.BOT, aMax = Math.min(0.9 * B.mu * (B.g + (B.cd * u * u) / B.mass), (B.brake / B.mass) * 0.92) + (B.drag * u * u) / B.mass;
        inp.brk = Math.max(inp.brk, clamp(((u * u - vsafe * vsafe) / (2 * gapNeed)) / aMax, 0, 1)); inp.thr = 0;
      }
      this.vtCmd = vt;
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
