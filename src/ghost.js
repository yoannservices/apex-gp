// Fantôme du meilleur tour (contre-la-montre) : enregistrement à 10 Hz, sauvegarde par circuit, rejeu translucide et écart en direct.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;
  const KEY = id => 'ghost.' + id;

  A.Ghost = class Ghost {
    constructor(scene, tr, settings) {
      this.scene = scene; this.tr = tr; this.cur = []; this.acc = 0; this.q = {};
      this.best = A.Save.get(KEY(tr.id), null);
      const m = (this.m = A.buildCarModel(settings.team, settings.number));
      m.root.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const cl = mats.map(x => { const c = x.clone(); c.transparent = true; c.opacity = 0.35; c.depthWrite = false; return c; });
        o.material = Array.isArray(o.material) ? cl : cl[0];
      });
      m.root.visible = false; scene.add(m.root);
    }

    startLap() { this.cur = []; this.acc = 1; }

    // t : temps depuis le début du tour
    record(t, car, dt) {
      this.acc += dt;
      if (this.acc < 0.1) return;
      this.acc = 0;
      const r = x => Math.round(x * 100) / 100;
      this.cur.push([r(t), r(car.x), r(car.z), r(car.h), r(car.s)]);
    }

    endLap(lapT, valid) {
      if (valid && this.cur.length > 20 && (!this.best || lapT < this.best.t)) {
        this.best = { t: lapT, d: this.cur };
        A.Save.set(KEY(this.tr.id), this.best);
      }
      this.startLap();
    }

    // index du premier échantillon dont la clé k (0 = temps, 4 = abscisse) dépasse v
    _find(k, v) {
      const d = this.best.d; let a = 0, b = d.length - 1;
      while (a < b) { const m = (a + b) >> 1; if (d[m][k] < v) a = m + 1; else b = m; }
      return a;
    }

    update(t) {
      const m = this.m, d = this.best && this.best.d;
      if (!d || t > this.best.t + 1) { m.root.visible = false; return; }
      const j = Math.max(1, this._find(0, t)), a = d[j - 1], b = d[j], f = A.clamp((t - a[0]) / Math.max(1e-3, b[0] - a[0]), 0, 1);
      const x = A.lerp(a[1], b[1], f), z = A.lerp(a[2], b[2], f), h = a[3] + A.wrap(b[3] - a[3]) * f;
      const q = this.tr.query(x, z, this.qi === undefined ? -1 : this.qi, this.q); this.qi = q.i;
      m.root.visible = true;
      m.root.position.set(x, this.tr.height(q.i, q.d), z);
      m.root.rotation.set(0, h, 0, 'YXZ');
    }

    // écart (s) du joueur au fantôme à l'abscisse s : > 0 = le joueur est en retard
    delta(s, t) {
      const d = this.best && this.best.d;
      if (!d || s < 5) return null;
      const j = this._find(4, s);
      if (j <= 0 || j >= d.length || d[j][4] < s - 30) return null;
      const a = d[j - 1], b = d[j], f = A.clamp((s - a[4]) / Math.max(1e-3, b[4] - a[4]), 0, 1);
      return t - A.lerp(a[0], b[0], f);
    }

    dispose() { this.scene.remove(this.m.root); }
  };
})();
