// Gestionnaire de session : grille, feux, boucle physique à pas fixe, tours, secteurs, classement, arrivée.
// Événements émis (race.on) : lights, start, lap, sector, pb, fastest, crash, wall, scrape, damage, detach, yellow, sc, penalty, limits,
// drs, pitin, service, pitout, missed, overtake, finish, end, recover, dnf.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const SUB = 1 / 240;
  const NUMS = [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];

  A.Race = class Race {
    // cfg : { tr, settings, mode: race|tt|quali|practice, laps, scene?, bots?, grid?: ordre des numéros d'écurie, models? }
    constructor(cfg) {
      this.cfg = cfg; this.tr = cfg.tr; this.scene = cfg.scene || null; this.set = cfg.settings; this.mode = cfg.mode || 'race';
      this.laps = this.mode === 'race' ? cfg.laps : this.mode === 'quali' ? 2 : Infinity;
      this.env = { wet: 0, air: 24 }; this.listeners = [];
      this.line = A.buildRacingLine(this.tr);
      this.baseLevel = this.set.diff; this.clock = 0; this.startT = 0; this.phase = 'intro'; this.phaseT = 0; this.lightsOut = 0;
      this.cars = []; this.drivers = []; this.models = new Map(); this.bestSec = [0, 0, 0]; this.fastest = null; this.finishing = false; this.allowSC = this.mode === 'race' && this.set.sc !== false;
      this.fx = this.scene ? new A.Fx(this.scene) : null;
      this.rules = new A.Rules(this); this.pits = new A.Pits(this); this.adaptive = new A.Adaptive(this, this.mode === 'race' && this.set.adaptive);
      this.resultsDone = false; this.sc = null; this.all = [];
      this._build();
    }

    on(fn) { this.listeners.push(fn); }
    emit(type, data) { for (const f of this.listeners) f(type, data || {}); }
    leader() { return this.cars.find(c => c.pos === 1) || this.cars[0]; }
    get player() { return this._player; }

    _build() {
      const set = this.set, tr = this.tr, nBots = this.mode === 'race' ? (this.cfg.bots != null ? this.cfg.bots : 19) : this.mode === 'practice' ? (this.cfg.bots || 0) : 0;
      const total = nBots + 1, fuel = this.laps === Infinity ? 100 : Math.min(100, 8 + this.laps * 2.3);
      // ordre de grille : indices de voitures (0 = joueur)
      const ids = [], bots = [];
      for (let i = 1; i <= nBots; i++) bots.push(i);
      bots.sort(() => Math.random() - 0.5);
      bots.sort((a, b) => (A.TEAMS[A.DRIVERS[b - 1].team].perf.power + Math.random() * 0.06) - (A.TEAMS[A.DRIVERS[a - 1].team].perf.power + Math.random() * 0.06));
      const pg = A.clamp(this.cfg.playerGrid != null ? this.cfg.playerGrid : 10, 0, nBots);
      bots.forEach(b => ids.push(b)); ids.splice(pg, 0, 0);
      const nums = NUMS.filter(n => n !== set.number);
      const wet0 = this.cfg.wet0 || 0;
      ids.forEach((id, k) => {
        const isP = id === 0, drv = isP ? null : A.DRIVERS[id - 1];
        const tire = isP ? set.tire : wet0 > 0.6 ? 'W' : wet0 > 0.25 ? 'I' : A.pick(['M', 'M', 'M', 'S', 'S', 'H', 'H']);
        const c = new A.Car(id, { name: isP ? set.name : drv.name, number: isP ? set.number : nums[(id - 1) % nums.length], team: isP ? set.team : drv.team, driver: drv, isPlayer: isP, setup: isP ? set.setup : { wing: A.rand(0.4, 0.6), bias: A.rand(0.56, 0.6), pF: 21, pR: 20.5 }, assists: isP ? set.assists : { abs: true, tc: true, auto: true }, tire });
        const pose = tr.gridPose(this.cfg.noGrid ? 0 : k);
        c.reset(pose, fuel); c.gridPos = k; c.pit.slot = k; c.pos = k + 1; c.s = pose.s; c.idx = -1;
        A.contact(c, tr);
        c.dist = c.s - tr.L; c.lastClean = false;
        c.onDetach = (car, part) => { this.fx && this.fx.detach(car, this.models.get(car), part); this.emit('detach', { car, part }); };
        c.onDamage = (car, sev) => this.emit('damage', { car, sev });
        c.onRepair = () => {};
        if (isP) this._player = c;
        this.cars.push(c);
        const d = new A.Driver(c, tr, this.line, drv || { name: c.name, style: 'regulier', skill: 1 });
        d.jitter = isP ? 0 : (Math.random() - 0.5) * 0.5; d.setLevel(A.clamp(this.baseLevel + d.jitter, 0, 4));
        this.drivers.push(d); c.drv = d;
        if (this.scene) { const m = A.buildCarModel(c.teamIdx, c.number); this.scene.add(m.root); this.models.set(c, m); }
        if (this.cfg.rolling) { c.u = 45; c.gear = 5; }
      });
      this.all = this.cars.slice();
      if (this.mode !== 'race') { this.phase = 'race'; this.startT = 0; }
      else if (this.cfg.rolling) this._go();
      this.sortPositions();
    }

    // ---------- Safety car ----------
    spawnSC(leader) {
      const tr = this.tr, c = new A.Car(98, { name: 'Safety Car', number: 'SC', team: 3, tire: 'M' });
      const p = tr.at(leader.s + 60, 0);
      c.reset({ x: p.x, z: p.z, h: p.h }, 30); c.isSC = true; c.u = 38; c.gear = 5; c.pos = 0; c.assists = { abs: true, tc: true, auto: true }; c.auto = true;
      A.contact(c, tr); c.dist = leader.dist + 60; c.prevS = c.s;
      const d = new A.Driver(c, tr, this.line, { name: 'SC', style: 'regulier', skill: 1.0 }); d.setLevel(2.5); c.drv = d; this.scDrv = d;
      if (this.scene) { const m = A.buildCarModel(3, 'SC'); const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: 0xffa000 })); bar.position.set(0, 1.05, -0.3); m.hi.add(bar); this.scBar = bar; this.scene.add(m.root); this.models.set(c, m); }
      this.rules.sc.car = c; this.sc = c; this.all.push(c);
    }
    removeSC() {
      const c = this.sc; if (!c) return;
      const m = this.models.get(c); if (m && this.scene) { this.scene.remove(m.root); this.models.delete(c); }
      this.all = this.all.filter(x => x !== c); this.sc = null; this.scDrv = null; this.rules.sc.car = null;
    }

    // ---------- Joueur ----------
    // inp : {steer, thr, brk} lissés ; act : actions ponctuelles de Input.actions()
    setPlayer(inp, act) {
      const p = this._player; if (!p) return;
      if (p.finished || p.auto_ap) return;
      p.in.steer = inp.steer; p.in.thr = inp.thr; p.in.brk = inp.brk;
      if (act) {
        if (act.up) p.in.up = true; if (act.down) p.in.down = true;
        if (act.drs) p.in.drs = p.drsOk ? !p.in.drs : false;
        if (act.eco) p.fuelSave = !p.fuelSave;
        if (act.pit && this.mode !== 'quali') { p.pit.want ? this.pits.cancel(p) : this.pits.request(p); this.emit('pitreq', { car: p, want: p.pit.want }); }
        if (act.reset) this.recover(p);
      }
      if (!p.drsOk) p.in.drs = false;
      p.drsOpen = p.drsOk && p.in.drs && p.in.brk < 0.1;
      if (this.phase === 'intro' || this.phase === 'lights') { p.in.thr = 0; p.in.brk = 1; p.in.steer = 0; }
      if (p.pit.state === 2) { p.in.thr = 0; p.in.brk = 1; }
    }

    // remet la voiture sur la piste à son abscisse (ou à la ligne de ses stands si bloquée)
    recover(c) {
      const tr = this.tr, p = tr.at(c.s, A.clamp(c.lat, -tr.hw + 3, tr.hw - 3));
      c.x = p.x; c.z = p.z; c.h = p.h; c.u = c.isPlayer ? 8 : 15; c.v = 0; c.r = 0; c.delta = 0; c.ax = c.ay = 0; c.gear = 2;
      c.lapValid = false; c.idx = p.i;
      if (c.drv) c.drv.off = A.clamp(c.lat, -tr.hw + 3, tr.hw - 3);
      this.emit('recover', { car: c });
    }

    sortPositions() {
      const cs = this.cars, tl = this.tr.L;
      const key = c => (c.finished ? 1e9 - (c.finT + c.pen) : c.dnf ? -1e6 + c.dist : c.dist);
      const old = new Map(cs.map(c => [c, c.pos]));
      cs.slice().sort((a, b) => key(b) - key(a)).forEach((c, i) => {
        c.pos = i + 1;
        if (this.phase === 'race' && old.get(c) !== c.pos && c.isPlayer && !c.finished) this.emit('overtake', { car: c, from: old.get(c), to: c.pos });
      });
    }
    byPos() { return this.cars.slice().sort((a, b) => a.pos - b.pos); }
    // écart en secondes entre deux voitures (a derrière b)
    gap(a, b) { return b ? Math.max(0, (b.dist - a.dist)) / Math.max(25, (a.u + b.u) / 2) : null; }
    ahead(c) { return c.pos > 1 ? this.byPos()[c.pos - 2] : null; }
    behind(c) { return this.byPos()[c.pos] || null; }

    // ---------- Boucle ----------
    update(dt) {
      dt = Math.min(dt, 0.05);
      if (dt <= 0) return;
      this.clock += dt;
      const tr = this.tr, racing = this.phase === 'race' || this.phase === 'finished';
      this._phase(dt);

      const sinceStart = this.clock - this.startT;
      const ctx = {
        phase: this.phase === 'race' || this.phase === 'finished' ? (sinceStart < 4.5 && this.mode === 'race' && this.lightsOut && !this.cfg.rolling ? 'start' : 'race') : 'grid',
        cars: this.all, wet: this.env.wet, sc: this.rules.sc.mode > 0,
        speedCap: c => (c.finished ? Math.min(42, this.rules.speedCap(c)) : this.rules.speedCap(c)),
      };
      if (this.cfg.rolling && this.phase === 'race' && sinceStart < 5) ctx.speedCap = () => 55;
      for (const c of this.all) {
        if (c.hidden) continue;
        A.contact(c, tr);
        if (c.dnf) { c.in.thr = 0; c.in.brk = c.u > 3 ? 0.4 : 1; c.in.steer = 0; c.drsOpen = false; }
        else if (!c.isPlayer || c.finished || c.auto_ap) c.drv.drive(dt, ctx);
        if (c.isSC) { c.in.thr = A.clamp(c.in.thr, 0, 1); }
        if (c.pit.state === 2) { c.in.thr = 0; c.in.brk = 1; }
      }
      const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n, em = (t, d) => this._phys(t, d);
      for (let k = 0; k < n; k++) {
        for (const c of this.all) if (!c.hidden) A.stepCar(c, h, this.env);
        A.collide(this.all, tr, em);
      }
      for (const c of this.all) { if (c.bumpT > 0) c.bumpT -= dt; }
      this._post(dt, racing);
      if (this.fx) this._visual(dt);
    }

    _phys(type, d) {
      if (type === 'crash') { this.rules.crash(d.a, d.b, d.sev); if (this.fx) this.fx.spark(d.x, 0.4, d.z, 0, 0, Math.min(40, 8 + d.sev * 2)); }
      else if (type === 'wall' && this.fx) this.fx.spark(d.x, 0.3, d.z, 0, 0, Math.min(40, 8 + d.sev * 2));
      else if (type === 'scrape' && this.fx && Math.random() < 0.5) this.fx.spark(d.x, 0.3, d.z, 0, 0, 3);
      this.emit(type, d);
    }

    _phase(dt) {
      this.phaseT += dt;
      if (this.phase === 'intro' && this.phaseT > 3) {
        this.phase = 'lights'; this.phaseT = 0; this.nLights = 0; this.hold = A.rand(0.6, 2.0);
      } else if (this.phase === 'lights') {
        const n = Math.min(5, Math.floor(this.phaseT / 0.9));
        if (n !== this.nLights && n <= 5) { this.nLights = n; this.emit('lights', { n }); }
        if (n >= 5 && this.phaseT > 5 * 0.9 + this.hold) { this.nLights = 0; this._go(); }
        this.setLights(this.nLights);
      }
    }
    setLights(n) { const L = this.tr.startLights; if (L) L.forEach((m, i) => m.color.setHex(i < n ? 0xff1a10 : 0x300000)); }
    _go() { this.phase = 'race'; this.phaseT = 0; this.startT = this.clock; this.lightsOut = 1; this.setLights(0); this.cars.forEach(c => (c.lapStartT = this.clock)); this.emit('start', {}); }

    _post(dt, racing) {
      const tr = this.tr, L = tr.L;
      const scOn = this.rules.sc.mode > 0;
      for (const c of this.cars) {
        if (c.idx < 0) continue;
        if (scOn) c.scTaint = true;
        // franchissement de la ligne / secteurs
        const prev = c.prevS === undefined ? c.s : c.prevS;
        if (prev > L * 0.75 && c.s < L * 0.25) this._cross(c, 1);
        else if (prev < L * 0.25 && c.s > L * 0.75) this._cross(c, -1);
        else if (c.secIdx < 2 && racing) {
          const lim = (c.secIdx + 1) * L / 3;
          if (prev < lim && c.s >= lim && c.s < lim + L / 6) this._sector(c);
        }
        c.prevS = c.s;
        c.dist = (c.lap - 1) * L + c.s;
        c.lapT = this.clock - c.lapStartT;
        // voiture bloquée / à l'envers : récupération des bots
        if (racing && !c.dnf && !c.finished && !c.pit.state) {
          const stuck = Math.abs(c.u) < 1.5 && this.phase === 'race' && this.clock - this.startT > 6;
          c.stuckT = stuck ? c.stuckT + dt : 0;
          const wrong = Math.abs(c.rhead) > 2 && Math.abs(c.u) < 12;
          c.wrongT = wrong ? c.wrongT + dt : 0;
          if (!c.isPlayer && (c.stuckT > 5 || c.wrongT > 3)) {
            const wheels = c.d.wheel.filter(w => !w).length;
            c.recoveries = (c.recoveries || 0) + 1;
            if (wheels >= 2 || c.d.engine < 0.35 || c.recoveries > 4) { c.dnf = true; this.emit('dnf', { car: c }); } else { this.recover(c); c.stuckT = c.wrongT = 0; }
          }
        }
      }
      const sc = this.sc;
      if (sc && sc.idx >= 0) { let d = sc.s - sc.prevS; if (d < -L / 2) d += L; else if (d > L / 2) d -= L; sc.dist += d; sc.prevS = sc.s; }
      this.pits.update(dt);
      this.rules.update(dt);
      if (this.sc && this.scDrv && this.rules.sc.mode === 0) this.removeSC();
      if (this.mode === 'race' || this.mode === 'quali') this.sortPositions();
      // fin de session
      if (!this.resultsDone) {
        const p = this._player;
        if (p && p.finished && this.clock - p.finClock > 4 && (this.cars.every(c => c.finished || c.dnf) || this.clock - p.finClock > 130)) this._results();
      }
    }

    _sector(c) {
      const t = this.clock - c.lapStartT, i = c.secIdx, st = i === 0 ? t : t - c.curSec.slice(0, i).reduce((a, b) => a + b, 0);
      c.curSec[i] = st; c.secIdx = i + 1;
      if (c.isPlayer) this.emit('sector', { car: c, i, t: st, color: this._secColor(c, i, st) });
    }
    _secColor(c, i, t) { return this.bestSec[i] && t <= this.bestSec[i] + 1e-6 ? 'purple' : c.secBest[i] && t <= c.secBest[i] + 1e-6 ? 'green' : 'yellow'; }

    _cross(c, dir) {
      const L = this.tr.L;
      if (dir < 0) { c.lap = Math.max(0, c.lap - 1); c.secIdx = 2; return; }
      const wasLap = c.lap, now = this.clock;
      c.lap++;
      if (this.phase !== 'race' && this.phase !== 'finished') return;
      if (wasLap >= 1) {
        const lapT = now - c.lapStartT;
        if (c.secIdx === 2) { c.curSec[2] = lapT - c.curSec[0] - c.curSec[1]; }
        const clean = c.lapValid, sc = this.rules.sc.mode > 0 || c.scTaint;
        c.last = lapT; c.lastClean = clean && !sc && !c.pit.state && !c.pit.count;
        if (clean && !sc) {
          if (!c.best || lapT < c.best) { c.best = lapT; c.pb = true; }
          for (let i = 0; i < 3; i++) { const t = c.curSec[i]; if (t > 0 && (!c.secBest[i] || t < c.secBest[i])) c.secBest[i] = t; if (t > 0 && (!this.bestSec[i] || t < this.bestSec[i])) this.bestSec[i] = t; }
        }
        const isFast = clean && !sc && (!this.fastest || lapT < this.fastest.t);
        if (isFast) this.fastest = { car: c, t: lapT };
        if (c.isPlayer || this.mode !== 'race') this.emit('lap', { car: c, t: lapT, valid: clean && !sc, best: c.best, pb: clean && c.best === lapT, fastest: isFast, lap: wasLap });
        if (c.isPlayer) this.adaptive.onLap(c, c.lastClean ? lapT : 0);
      }
      c.lapStartT = now; c.scTaint = this.rules.sc.mode > 0; c.secIdx = 0; c.curSec = [0, 0, 0]; c.lapValid = true; c.pit.count = 0;
      this.pits.strategy(c);
      // arrivée
      if (this.mode === 'race' || this.mode === 'quali') {
        if (c.lap > this.laps && !c.finished) {
          c.finished = true; c.finT = now - this.startT; c.finClock = now; c.auto_ap = true;
          if (!this.finishing) { this.finishing = true; this.phase = 'finished'; }
          this.emit('finish', { car: c });
        }
      }
    }

    _results() {
      this.resultsDone = true;
      const cs = this.cars.slice().sort((a, b) => (a.finished === b.finished ? (a.finished ? a.finT + a.pen - (b.finT + b.pen) : (a.dnf === b.dnf ? b.dist - a.dist : a.dnf ? 1 : -1)) : a.finished ? -1 : 1));
      const win = cs[0];
      const res = cs.map((c, i) => ({
        car: c, pos: i + 1, time: c.finished ? c.finT + c.pen : null, gap: c.finished && win.finished ? c.finT + c.pen - (win.finT + win.pen) : null, laps: c.finished ? this.laps : Math.max(0, c.lap - 1), best: c.best, pen: c.pen, dnf: c.dnf,
        points: i < 10 && this.mode === 'race' && !c.dnf ? A.POINTS[i] + (this.fastest && this.fastest.car === c && i < 10 ? 1 : 0) : 0,
      }));
      this.results = res;
      this.emit('end', { results: res });
    }

    // modèles, effets, voitures proches
    _visual(dt) {
      const cam = this.cam, far2 = 90 * 90;
      let k = 0;
      const pl = this._player, near = cam || pl;
      for (const c of this.all) {
        const m = this.models.get(c); if (!m) continue;
        m.root.visible = !c.hidden;
        if (c.hidden) continue;
        const dx = c.x - near.x, dz = c.z - near.z, d2 = dx * dx + dz * dz, farL = d2 > 140 * 140 && c !== pl;
        A.syncModel(c, m, dt, farL, d2 < 55 * 55);
        if (d2 < far2) this.fx.carFx(c, this.env.wet, dt);
        if (this.scBar && c === this.sc) this.scBar.visible = Math.floor(this.clock * 4) % 2 === 0;
      }
      this.fx.update(dt);
      // débris sur la piste : crevaison
      for (const h of this.fx.hazards) for (const c of this.cars) {
        if (c.u < 15) continue;
        const dx = c.x - h.mesh.position.x, dz = c.z - h.mesh.position.z;
        if (dx * dx + dz * dz < 1.2 && !h.hit) { h.hit = c; const w = (Math.random() * 4) | 0; c.tires[w].punct = Math.min(1, c.tires[w].punct + 0.7); this.emit('puncture', { car: c, w }); }
      }
    }

    dispose() {
      if (!this.scene) return;
      this.models.forEach(m => this.scene.remove(m.root));
      if (this.fx) { this.scene.remove(this.fx.sparks.mesh, this.fx.smoke.mesh); this.fx.debris.forEach(o => this.scene.remove(o.mesh)); }
      this.pits.crews.forEach(cr => this.scene.remove(cr.g));
    }
  };
})();
