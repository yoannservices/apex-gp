// Règlement : limites de piste, pénalités, drapeaux jaunes/bleus, safety car, zones DRS.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const SC_SPEED = 38;

  A.Rules = class Rules {
    constructor(race) {
      this.race = race; this.tr = race.tr;
      this.yellow = [false, false, false]; this.sc = { mode: 0, laps: 0, car: null, done: 0 }; this.scCount = 0;
      this.stoppedT = new Map(); this.order = []; this.blue = false;
      this._zones();
    }

    // zones DRS = les plus longues lignes droites ; détection 80 m avant
    _zones() {
      const tr = this.tr, N = tr.N, runs = [];
      let start = -1;
      const straight = i => Math.abs(tr.kS[i]) < 1 / 2500;
      let first = 0; while (first < N && straight(first)) first++; // départ hors d'une droite pour ne pas couper la boucle
      for (let k = 0; k <= N; k++) {
        const i = (first + k) % N, ok = k < N && straight(i);
        if (ok && start < 0) start = i;
        if (!ok && start >= 0) { const e = (i - 1 + N) % N, len = ((e - start + N) % N) * tr.ds; if (len > 300) runs.push({ a: start, b: e, len }); start = -1; }
      }
      runs.sort((p, q) => q.len - p.len);
      this.zones = runs.slice(0, runs[1] && runs[1].len > 650 ? 2 : 1).map(r => ({ a: (r.a + 8) % N, b: (r.b - 8 + N) % N, det: (r.a - Math.round(80 / tr.ds) + N) % N, len: r.len }));
    }

    inZone(i, z) { const N = this.tr.N; return (i - z.a + N) % N <= (z.b - z.a + N) % N; }

    // vitesse imposée par drapeau jaune / safety car (utilisée par le pilote IA)
    speedCap(car) {
      const sc = this.sc;
      if (car.isSC) return SC_SPEED;
      if (sc.mode) {
        const k = this.order.indexOf(car), ahead = k > 0 ? this.order[k - 1] : sc.car && !sc.car.hidden ? sc.car : null;
        if (!ahead) return SC_SPEED;
        const gap = ahead.dist - car.dist - 5;
        return gap > 70 ? SC_SPEED + 6 : A.clamp(ahead.u + (gap - 14) * 0.35, 6, SC_SPEED + 6);
      }
      const sec = Math.min(2, Math.floor((car.s / this.tr.L) * 3));
      if (this.yellow[sec] && !car.dnf) return 55;
      return 999;
    }

    update(dt) {
      const R = this.race, tr = this.tr, cars = R.cars, sc = this.sc;
      this.order = cars.filter(c => !c.isSC).sort((a, b) => a.pos - b.pos);
      const racing = R.phase === 'race';
      // ---- limites de piste ----
      for (const c of cars) {
        if (c.isSC || c.dnf || c.pit.state) { c.offT = 0; continue; }
        const off = c.surf.every(s => s === 2 || s === 3) && Math.abs(c.lat) > tr.hw + 0.5;
        if (off) {
          c.offT += dt;
          if (c.offT > 0.15 && !c.cutFlag && racing) {
            c.cutFlag = true; c.cuts++; c.lapValid = false;
            if (c.cuts % 3 === 0) this.penalty(c, 5, 'limits');
            else R.emit('limits', { car: c, n: c.cuts % 3 });
          }
        } else if (c.offT > 0) { c.offT = Math.max(0, c.offT - dt * 2); if (c.offT === 0) c.cutFlag = false; }
        else c.cutFlag = false;
      }
      // ---- voitures arrêtées / drapeaux jaunes ----
      if (racing) {
        this.yellow = [false, false, false];
        let blocking = 0;
        for (const c of cars) {
          if (c.isSC || c.pit.state || c.hidden) continue;
          const stopped = Math.abs(c.u) < 4 && (c.dnf || Math.abs(c.lat) > tr.hw - 1 || Math.abs(c.rhead) > 1.2);
          const spinning = Math.abs(c.rhead) > 1.3 && Math.abs(c.u) < 25;
          if (stopped || spinning) {
            const t = (this.stoppedT.get(c) || 0) + dt; this.stoppedT.set(c, t);
            this.yellow[Math.min(2, Math.floor((c.s / tr.L) * 3))] = true;
            if (t > 1 && !c.yellowSent) { c.yellowSent = true; R.emit('yellow', { car: c, sector: Math.min(2, Math.floor((c.s / tr.L) * 3)) + 1 }); }
            if (t > 6 && (c.dnf || stopped)) blocking++;
          } else { this.stoppedT.set(c, 0); c.yellowSent = false; }
        }
        // déclenchement du safety car : voiture immobilisée dans le trajet, au plus 2 fois
        if (!sc.mode && blocking > 0 && this.scCount < 2 && R.allowSC && R.leader() && R.leader().lap >= 1 && R.leader().lap < R.laps - 1) this.deploySC();
      }
      if (sc.mode) this._tickSC(dt);
      // ---- drapeau bleu pour le joueur : une voiture à un tour d'avance arrive derrière lui ----
      const p = R.player;
      this.blue = false;
      if (p && racing && !sc.mode) for (const o of cars) {
        if (o === p || o.isSC || o.dnf || o.dist - p.dist < tr.L * 0.5) continue;
        if (((p.s - o.s) % tr.L + tr.L) % tr.L < 120 && o.u > p.u + 2) { this.blue = true; break; }
      }
      // ---- DRS : armé si on passe le point de détection à moins d'1 s de la voiture devant ----
      for (const c of cars) {
        const i = c.idx;
        c.drsOk = false;
        if (c.isSC || c.dnf || !racing || sc.mode || R.env.wet > 0.4 || c.pit.state || c.lap < 3 || i < 0) { c.drsArm = 0; continue; }
        const z = this.zones.findIndex(zz => this.inZone(i, zz));
        if (z >= 0) { c.drsOk = c.drsArm === z + 1; if (c.drsOk && c.isPlayer && !c.drsSeen) { c.drsSeen = true; R.emit('drs', { car: c }); } }
        else { c.drsSeen = false; if (c.inZ >= 0) c.drsArm = 0; }
        c.inZ = z;
        this.zones.forEach((zz, zi) => {
          const past = (i - zz.det + tr.N) % tr.N, before = ((c.drsPrev === undefined ? i : c.drsPrev) - zz.det + tr.N) % tr.N;
          if (past < 12 && before > tr.N / 2) {
            const k = this.order.indexOf(c), ah = k > 0 ? this.order[k - 1] : null;
            c.drsArm = ah && !ah.dnf && (ah.dist - c.dist) / Math.max(c.u, 20) < 1.0 ? zi + 1 : 0;
          }
        });
        c.drsPrev = i;
      }
      // ---- vitesse dans les stands pour le joueur sans limiteur ----
      if (p && p.pit.state && !p.limiter && p.u > A.PIT_LIMIT + 1.5 && R.tr.rel(p.s) > -230 && R.tr.rel(p.s) < 230 && !p.speedingT) { p.speedingT = 1; this.penalty(p, 5, 'pitspeed'); }
      if (p && !p.pit.state) p.speedingT = 0;
    }

    // chaque pénalité s'ajoute au temps final
    penalty(car, secs, why) {
      car.pen += secs;
      this.race.emit('penalty', { car, secs, why });
    }

    // contact : la voiture qui percute l'autre par l'arrière est fautive
    crash(a, b, sev) {
      if (sev < 4 || this.race.phase !== 'race') return;
      const ds = this.tr.rel(b.s - a.s), at = Math.abs(a.lat - b.lat);
      if (at < 1.7 && Math.abs(ds) > 1.5 && !a.isSC && !b.isSC) {
        const rear = ds > 0 ? a : b, front = ds > 0 ? b : a;
        if (rear.u > front.u + 3 && !rear.dnf && this.race.clock - (rear.penT || -9) > 4) { rear.penT = this.race.clock; this.penalty(rear, 5, 'collision'); }
      }
    }

    deploySC() {
      const R = this.race, sc = this.sc, L = R.leader();
      this.scCount++;
      sc.mode = 1; sc.laps = 0; sc.startLap = L.lap;
      R.spawnSC(L);
      R.emit('sc', { on: true });
    }

    _tickSC(dt) {
      const R = this.race, sc = this.sc, L = R.leader();
      if (!L) return;
      if (sc.mode === 1 && L.lap - sc.startLap >= 2) {
        sc.mode = 2; R.emit('sc', { ending: true });
      }
      if (sc.mode === 2) {
        const rel = this.tr.rel(sc.car.s);
        if (rel > -300 && rel < -200 && !sc.car.hidden) sc.car.hidden = true;
        if (L.lap > sc.startLap + 2 && sc.car.hidden) { sc.mode = 0; R.removeSC(); R.emit('sc', { on: false }); }
      }
    }
  };
})();
