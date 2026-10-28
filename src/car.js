// Voiture : état dynamique, réglages, pneus, dégâts, stats de course. Contact piste mis à jour par A.contact.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});

  A.Car = class Car {
    constructor(id, o) {
      this.id = id; this.name = o.name; this.number = o.number; this.teamIdx = o.team;
      this.team = A.TEAMS[o.team]; this.perf = Object.assign({}, this.team.perf);
      this.driver = o.driver || null; this.isPlayer = !!o.isPlayer;
      this.setup = Object.assign({}, A.DEFAULT_SETTINGS.setup, o.setup);
      this.assists = Object.assign({ abs: true, tc: true, auto: true, line: false, limiter: true }, o.assists);
      this.auto = this.assists.auto;
      this.tires = [0, 1, 2, 3].map(() => new A.Tire(o.tire || 'M'));
      this.compound = o.tire || 'M';
      this.in = { thr: 0, brk: 0, steer: 0, up: false, down: false, drs: false };
      this.d = A.newDamage();
      this.surf = [0, 0, 0, 0];
      this.stint = 0; this.usedCompounds = new Set([this.compound]);
      this.reset({ x: 0, z: 0, h: 0 }, 100);
    }

    reset(pose, fuel) {
      this.x = pose.x; this.z = pose.z; this.h = pose.h;
      this.u = this.v = this.r = this.delta = 0; this.ax = this.ay = 0;
      this.gear = 1; this.rpm = 4200; this.shiftT = 0; this.bank = 0; this.t = 0; this.odo = 0;
      this.fuel = fuel; this.fuelSave = false; this.drsOpen = false; this.limiter = false;
      this.slip = 0; this.locked = 0; this.spun = 0;
      this.idx = -1; this.s = 0; this.lat = 0; this.height = 0;
      // course
      this.lap = 0; this.dist = 0; this.lapStartT = 0; this.lapT = 0; this.last = 0; this.best = 0;
      this.sec = [0, 0, 0]; this.secBest = [0, 0, 0]; this.secStart = 0; this.secIdx = 0; this.curSec = [0, 0, 0];
      this.pos = 0; this.finished = false; this.dnf = false; this.finT = 0; this.gridPos = 0;
      this.pen = 0; this.penServe = 0; this.warn = 0; this.cuts = 0; this.drsOk = false;
      this.pit = { state: 0, slot: -1, t: 0, req: null, stops: 0, want: false, tire: null, count: 0 };
      this.bumpT = 0; this.offT = 0; this.stuckT = 0; this.wrongT = 0;
      this.lift = 0; this.stintLap = 0; this.lapValid = true; this.drsArm = 0; this.inZ = -1; this.drsPrev = undefined; this.dnf = false; this.hidden = false;
    }

    fit(id) { this.tires.forEach(t => t.fit(id)); this.compound = id; this.usedCompounds.add(id); }
    usedDry() { return new Set([...this.usedCompounds].filter(k => A.COMPOUNDS[k].type === 'slick')); }
    get speed() { return Math.hypot(this.u, this.v); }
    get kmh() { return Math.abs(this.u) * 3.6; }
    get avgWear() { return this.tires.reduce((a, t) => a + t.wear, 0) / 4; }
    get avgTemp() { return this.tires.reduce((a, t) => a + t.temp, 0) / 4; }
  };

  // Mise à jour du contact avec la piste (appelée une fois par frame physique, pas par sous-pas)
  const WQ = { i: 0, d: 0, a: 0, s: 0 };
  A.contact = (car, tr) => {
    const sh = Math.sin(car.h), ch = Math.cos(car.h), hint = car.idx;
    const q = tr.query(car.x, car.z, hint, tr.q);
    car.idx = q.i; car.s = q.s; car.lat = q.d;
    const th = Math.atan2(tr.tx[q.i], tr.tz[q.i]);
    car.rhead = A.wrap(car.h - th); // cap relatif à la piste
    car.bank = tr.bank[q.i] * Math.cos(car.rhead);
    car.height = tr.height(q.i, q.d);
    for (let w = 0; w < 4; w++) {
      const wx = car.x + sh * A.WHEEL_X[w] + ch * A.WHEEL_Y[w], wz = car.z + ch * A.WHEEL_X[w] - sh * A.WHEEL_Y[w];
      const p = tr.query(wx, wz, q.i, WQ);
      car.surf[w] = tr.surface(p.i, p.d);
    }
  };
})();
