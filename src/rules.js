// Règlement : limites de piste, pénalités, drapeaux jaunes/bleus, safety car, zones DRS.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const SC_SPEED = 38;
  const DSQ_SECS = 30, WARN_SECS = 20; // total de pénalités qui vaut le drapeau noir
  const MAJOR_MAX = 3;                 // fautes graves avant exclusion

  A.Rules = class Rules {
    constructor(race) {
      this.race = race; this.tr = race.tr;
      this.yellow = [false, false, false]; this.sc = { mode: 0, laps: 0, car: null, done: 0 }; this.scCount = 0;
      this.stoppedT = new Map(); this.order = []; this.blue = false; this.rank = new Map();
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
            if (c.cuts % 3 === 0) this.penalty(c, c.cuts === 3 ? 1 : 5, 'limits');
            else R.emit('limits', { car: c, n: c.cuts % 3 });
            // une voiture poussée dehors : la faute revient à celle qui l'a touchée juste avant
            const pb = c.pushedBy; if (pb && R.clock - pb.t < 2 && !pb.car.dnf) { c.pushedBy = null; this.penalty(pb.car, 5, 'forced'); }
          }
        } else if (c.offT > 0) { c.offT = Math.max(0, c.offT - dt * 2); if (c.offT === 0) c.cutFlag = false; }
        else c.cutFlag = false;
      }
      // ---- vitesse latérale (qui se déporte sur qui), dépassements interdits, exclusions ----
      for (const c of cars) {
        if (c.isSC) continue;
        c.latV = dt > 0 && c.prevLat !== undefined ? (c.latV || 0) * 0.7 + 0.3 * (c.lat - c.prevLat) / dt : 0; c.prevLat = c.lat;
        if (c.dsq && !c.hidden) { c.dsqT = (c.dsqT || 0) + dt; if (!c.isPlayer && (c.u < 3 || c.dsqT > 12 || c.pit.state)) c.hidden = true; }
      }
      if (racing) this._illegalPass(dt);
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

    // chaque pénalité s'ajoute au temps final ; trop de secondes ou de fautes graves = drapeau noir
    penalty(car, secs, why) {
      if (car.dsq || car.isSC) return;
      car.pen += secs;
      (car.penLog = car.penLog || []).push({ secs, why, lap: car.lap });
      if (secs >= 10) car.major = (car.major || 0) + 1;
      this.race.emit('penalty', { car, secs, why });
      if (this.race.mode === 'race') {
        if (car.pen >= DSQ_SECS || (car.major || 0) >= MAJOR_MAX) this.disqualify(car, car.pen >= DSQ_SECS ? 'penalties' : 'reckless');
        else if (car.pen >= WARN_SECS && !car.blackWarned) { car.blackWarned = true; this.race.emit('blackwarn', { car }); }
      }
    }

    // drapeau noir : la voiture s'arrête (le joueur voit l'écran de résultats quelques secondes plus tard)
    disqualify(car, why) {
      if (car.dsq || car.finished) return;
      car.dsq = true; car.dnf = true; car.dsqWhy = why;
      this.race.emit('dsq', { car, why });
      if (car.isPlayer) this.race.forceEnd = this.race.clock + 7;
    }

    // contact entre a et b (sev : vitesse relative d'impact en m/s) : on cherche le fautif et on gradue la sanction
    contact(a, b, sev) {
      const R = this.race;
      if (R.phase !== 'race' || a.isSC || b.isSC || a.dsq || b.dsq || R.clock - R.startT < 6) return; // mêlée du départ : accrochage de course
      if (a.dnf && b.dnf) return;
      const tr = this.tr, ds = tr.rel(b.s - a.s), dl = b.lat - a.lat;
      const toward = (c, o) => (c.latV || 0) * Math.sign(o.lat - c.lat); // vitesse latérale vers l'autre voiture (m/s)
      let guilty = null, why = 'contact';
      if (Math.abs(ds) > 2.2 && Math.abs(dl) < 2.2) {
        // choc par l'arrière : fautif = la voiture de derrière, sauf si celle de devant s'est déportée devant elle
        const rear = ds > 0 ? a : b, front = ds > 0 ? b : a;
        guilty = rear; why = 'rearend';
        if (toward(front, rear) > 2.2 && Math.abs(front.latV) > Math.abs(rear.latV) + 1.2) { guilty = front; why = 'weave'; }
        else if (front.u < rear.u - 25) guilty = rear;
      } else {
        // choc latéral : celle qui se déporte le plus vers l'autre a tort ; sinon accrochage de course
        const ta = toward(a, b), tb = toward(b, a);
        if (Math.abs(ta - tb) > 0.6 && Math.max(ta, tb) > 0.5) { guilty = ta > tb ? a : b; why = 'sidehit'; }
        else if (sev > 4) { guilty = a.u > b.u ? a : b; why = 'incident'; }
      }
      if (!guilty) return;
      const victim = guilty === a ? b : a, t = R.clock;
      if (t - (guilty.penT || -9) < 4) return;
      guilty.penT = t; victim.pushedBy = { car: guilty, t };
      const secs = sev >= 9 || victim.dnf || victim.d.wheel.some(w => !w) ? 10 : sev >= 3.5 ? 5 : 1;
      this.penalty(guilty, secs, why);
    }

    // dépassement interdit sous safety car ou drapeau jaune : 5 s
    _illegalPass(dt) {
      const R = this.race, cars = R.cars.filter(c => !c.isSC && !c.dnf && !c.hidden && c.idx >= 0), sc = this.sc.mode > 0, ranks = new Map();
      cars.slice().sort((p, q) => q.dist - p.dist).forEach((c, i) => ranks.set(c, i));
      if (this.rank.size) for (const c of cars) {
        const was = this.rank.get(c), now = ranks.get(c);
        if (was === undefined || now >= was || c.pit.state || c.finished) continue;
        const sec = Math.min(2, Math.floor((c.s / this.tr.L) * 3)), banned = sc || this.yellow[sec];
        if (!banned || R.clock - (c.passT || -99) < 6) continue;
        // une voiture réellement dépassée : en mouvement, en piste, qui n'a pas ralenti pour céder la place
        for (const q of cars) {
          if (q === c || q.pit.state || q.u < 8 || this.rank.get(q) === undefined) continue;
          if (this.rank.get(q) < was && this.rank.get(q) >= now && ranks.get(q) > now && Math.abs(q.lat - c.lat) < 5) { c.passT = R.clock; this.penalty(c, 5, sc ? 'scpass' : 'yellowpass'); break; }
        }
      }
      this.rank = ranks;
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
