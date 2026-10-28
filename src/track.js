// Circuit : échantillonnage régulier de la ligne centrale, requêtes de position, géométrie (piste, vibreurs, herbe, gravier, murs).
// Convention : d > 0 = côté gauche de la piste, s = abscisse curviligne (0 = ligne de départ).
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;
  const DS = 4;

  A.Track = class Track {
    constructor(def) {
      this.def = def; this.id = def.id; this.name = def.name;
      this.hw = def.width / 2; this.kerbW = 1.6;
      this.city = def.grass === 'city';
      this.grassW = this.city ? Math.min(2, def.gap - 1) : 7;
      this.gravelW = this.city ? 0 : 6;
      this.pitHW = 4.5; this.pitCenter = this.hw + 3.5 + this.pitHW;
      this.PIT_RAMP = [-300, -180, 180, 300]; // s relatifs : début/fin des rampes d'entrée et de sortie
      this._sample();
      this.q = { i: 0, d: 0, s: 0 };
    }

    _sample() {
      const { pts } = A.expandOps(this.def);
      const M = pts.length, cum = [0];
      for (let i = 0; i < M; i++) { const a = pts[i], b = pts[(i + 1) % M]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
      const L0 = cum[M];
      const N = (this.N = Math.round(L0 / DS)), ds = (this.ds = L0 / N);
      this.L = L0;
      const f = n => new Float32Array(n);
      const px = (this.px = f(N)), pz = (this.pz = f(N));
      let j = 0, prev = -1;
      for (let k = 0; k < N; k++) {
        const t = (k * ds + L0 - this.def.startBack) % L0;
        if (t < prev) j = 0; // repli modulo : on repart du début
        prev = t;
        while (cum[j + 1] < t) j++;
        const a = pts[j % M], b = pts[(j + 1) % M], u = (t - cum[j]) / (cum[j + 1] - cum[j] || 1);
        px[k] = a[0] + (b[0] - a[0]) * u; pz[k] = a[1] + (b[1] - a[1]) * u;
      }
      const tx = (this.tx = f(N)), tz = (this.tz = f(N)), nx = (this.nx = f(N)), nz = (this.nz = f(N));
      const hd = f(N), curv = (this.curv = f(N));
      for (let i = 0; i < N; i++) {
        const a = (i + N - 1) % N, b = (i + 1) % N;
        const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
        tx[i] = dx / l; tz[i] = dz / l; nx[i] = tz[i]; nz[i] = -tx[i]; hd[i] = Math.atan2(tx[i], tz[i]);
      }
      for (let i = 0; i < N; i++) curv[i] = A.wrap(hd[(i + 1) % N] - hd[(i + N - 1) % N]) / (2 * ds);
      const avg = (arr, i, w) => { let s = 0; for (let k = -w; k <= w; k++) s += arr[(i + k + N) % N]; return s / (2 * w + 1); };
      const kS = f(N), kM = f(N);
      for (let i = 0; i < N; i++) { kS[i] = avg(curv, i, 15); kM[i] = avg(curv, i, 3); }
      this.kS = kS;
      // dévers automatique dans les courbes rapides (positif = bord gauche plus bas)
      const bank = (this.bank = f(N)), bm = this.def.bank || 0;
      for (let i = 0; i < N; i++) { const a = Math.abs(kS[i]); bank[i] = Math.sign(kS[i]) * bm * A.smooth(1 / 450, 1 / 200, a) * (1 - A.smooth(1 / 90, 1 / 60, a)); }
      // vibreurs à l'intérieur des virages, gravier à l'extérieur
      const flag = (fn, dil) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (fn(i)) for (let k = -dil; k <= dil; k++) o[(i + k + N) % N] = 1; return o; };
      this.kerbL = flag(i => kM[i] > 1 / 600, 4); this.kerbR = flag(i => kM[i] < -1 / 600, 4);
      this.gravL = this.city ? new Uint8Array(N) : flag(i => kS[i] < -1 / 500, 8);
      this.gravR = this.city ? new Uint8Array(N) : flag(i => kS[i] > 1 / 500, 8);
      // voie des stands
      const [r0, r1, r2, r3] = this.PIT_RAMP, po = (this.pitOff = f(N));
      for (let i = 0; i < N; i++) { const rel = this.rel(i * ds); po[i] = rel > r0 && rel < r3 ? this.pitCenter * A.smooth(r0, r1, rel) * (1 - A.smooth(r2, r3, rel)) : 0; }
      // distances aux murs depuis l'axe
      const wl = (this.wallL = f(N)), wr = (this.wallR = f(N));
      for (let i = 0; i < N; i++) { wr[i] = this.hw + this.def.gap; wl[i] = Math.max(this.hw + this.def.gap, po[i] + this.pitHW + 13); }
      this.sectorIdx = [Math.floor(N / 3), Math.floor((2 * N) / 3)];
    }

    rel(s) { s = ((s % this.L) + this.L) % this.L; return s > this.L / 2 ? s - this.L : s; } // s relatif à la ligne, ∈ [-L/2, L/2]

    // Position monde à l'abscisse s (réel) et au décalage latéral d.
    at(s, d, out) {
      const N = this.N, f = (((s / this.ds) % N) + N) % N, i = Math.floor(f), j = (i + 1) % N, u = f - i;
      const x = this.px[i] + (this.px[j] - this.px[i]) * u, z = this.pz[i] + (this.pz[j] - this.pz[i]) * u;
      const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * u, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * u, l = Math.hypot(tx, tz) || 1;
      out = out || {};
      out.x = x + (tz / l) * d; out.z = z - (tx / l) * d; out.h = Math.atan2(tx, tz); out.i = i;
      return out;
    }

    // Échantillon le plus proche (fenêtre autour de hint, sinon recherche globale) + décalage latéral.
    query(x, z, hint, q) {
      q = q || this.q;
      const N = this.N, px = this.px, pz = this.pz;
      let best = -1, bd = 1e18;
      if (hint >= 0) for (let k = -10; k <= 10; k++) { const i = (hint + k + N) % N, dx = x - px[i], dz = z - pz[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
      if (best < 0 || bd > 2500) {
        bd = 1e18;
        for (let i = 0; i < N; i += 4) { const dx = x - px[i], dz = z - pz[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
        const c = best;
        for (let k = -4; k <= 4; k++) { const i = (c + k + N) % N, dx = x - px[i], dz = z - pz[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
      }
      const i = best, dx = x - px[i], dz = z - pz[i];
      q.i = i; q.d = dx * this.nx[i] + dz * this.nz[i];
      q.a = dx * this.tx[i] + dz * this.tz[i];
      q.s = (i * this.ds + q.a + this.L) % this.L;
      return q;
    }

    height(i, d) {
      const b = this.bank[i];
      if (b === 0) return 0;
      const E = this.hw + this.kerbW, ad = Math.abs(d);
      let y = -Math.tan(b) * (d < 0 ? -Math.min(ad, E) : Math.min(ad, E));
      if (ad > E) y *= Math.max(0, 1 - (ad - E) / 6);
      return y;
    }

    // 0 asphalte, 1 vibreur, 2 herbe, 3 gravier
    surface(i, d) {
      const po = this.pitOff[i];
      if (d > 0 && po > 0.5 && d < po + this.pitHW + 0.3) return 0;
      const e = Math.abs(d) - this.hw, left = d > 0;
      if (e <= 0) return 0;
      if (e <= this.kerbW && (left ? this.kerbL[i] : this.kerbR[i])) return 1;
      if (e <= this.grassW) return 2;
      if (e <= this.grassW + this.gravelW && (left ? this.gravL[i] : this.gravR[i])) return 3;
      return 2;
    }

    // Poses de départ et de stands
    gridPose(k) { const row = k >> 1, o = this.at(-10 - row * 9, k & 1 ? -3.6 : 3.6); return { x: o.x, z: o.z, h: o.h, s: this.L - 10 - row * 9 }; }
    pitSlotS(k) { return -170 + 17 * k; }
    pitPose(k) { const o = this.at(this.pitSlotS(k), this.pitCenter + 0.5); return { x: o.x, z: o.z, h: o.h }; }

    // ---------- géométrie ----------
    _strip(fn, mat, opt = {}) {
      const N = this.N, ds = this.ds, y0 = opt.y || 0, vs = opt.vs || 8, us = opt.us || 8;
      const pos = new Float32Array((N + 1) * 6), nor = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
      for (let i = 0; i <= N; i++) {
        const k = i % N, r = fn(k), s = i * ds;
        for (let c = 0; c < 2; c++) {
          const d = r[c], o = (i * 2 + c) * 3;
          pos[o] = this.px[k] + this.nx[k] * d; pos[o + 1] = y0 + this.height(k, d); pos[o + 2] = this.pz[k] + this.nz[k] * d;
          nor[o + 1] = 1;
          uv[(i * 2 + c) * 2] = opt.across ? c : d / us; uv[(i * 2 + c) * 2 + 1] = s / vs;
        }
        if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new T.Mesh(g, mat);
      m.receiveShadow = true;
      return m;
    }

    _wall(side, mat, y0, h, inset, wallFn) {
      const N = this.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
      for (let i = 0; i <= N; i++) {
        const k = i % N, d = side * (wallFn(k) - inset);
        for (let c = 0; c < 2; c++) {
          const o = (i * 2 + c) * 3;
          pos[o] = this.px[k] + this.nx[k] * d; pos[o + 1] = y0 + c * h; pos[o + 2] = this.pz[k] + this.nz[k] * d;
          uv[(i * 2 + c) * 2] = (i * this.ds) / 40; uv[(i * 2 + c) * 2 + 1] = c;
        }
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, mat);
      m.castShadow = false; m.receiveShadow = true;
      return m;
    }

    build() {
      const g = (this.group = new T.Group());
      const std = (map, o = {}) => new T.MeshStandardMaterial(Object.assign({ map, roughness: 0.95, metalness: 0 }, o));
      const px = (n, c) => (ctx, w, h) => { ctx.fillStyle = c; ctx.fillRect(0, 0, w, h); };

      const asphalt = A.canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#3b3d42'; c.fillRect(0, 0, w, h);
        A.speckle(c, w, h, 2600, ['#2f3136', '#46484e', '#3a3c41', '#505359'], 2);
        c.fillStyle = 'rgba(20,20,22,0.35)'; c.fillRect(w * 0.28, 0, w * 0.14, h); c.fillRect(w * 0.58, 0, w * 0.14, h);
        c.fillStyle = '#f0f0f0'; c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
      });
      this.roadMat = std(asphalt);
      const kerbTex = A.canvasTex(32, 64, c => { c.fillStyle = '#d4141c'; c.fillRect(0, 0, 32, 32); c.fillStyle = '#f4f4f4'; c.fillRect(0, 32, 32, 32); });
      const grassTex = A.canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#3f7a35'; c.fillRect(0, 0, w, h); A.speckle(c, w, h, 900, ['#386d2f', '#488a3c', '#3a7230', '#4f9444'], 2); });
      const gravelTex = A.canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#b9a98a'; c.fillRect(0, 0, w, h); A.speckle(c, w, h, 1400, ['#9d8f74', '#cdbd9e', '#a89878', '#c4b494'], 2); });
      const wallTex = A.canvasTex(512, 64, (c, w, h) => {
        c.fillStyle = '#c9c9cc'; c.fillRect(0, 0, w, h);
        const ads = [['#d8101a', 'APEX'], ['#1747d6', 'VELO'], ['#f2d21b', 'NITRO'], ['#0c8f4a', 'GRIP'], ['#222', 'TURBO'], ['#ff7a00', 'BOLT']];
        ads.forEach((a, k) => { c.fillStyle = a[0]; c.fillRect(k * 85 + 3, 10, 79, 44); c.fillStyle = a[0] === '#f2d21b' ? '#111' : '#fff'; c.font = 'bold 22px sans-serif'; c.fillText(a[1], k * 85 + 10, 40); });
        c.fillStyle = '#d8101a'; c.fillRect(0, 0, w, 6); c.fillStyle = '#fff'; c.fillRect(0, 58, w, 6);
      });
      const metalTex = A.canvasTex(64, 16, (c, w, h) => { c.fillStyle = '#9aa0a6'; c.fillRect(0, 0, w, h); c.fillStyle = '#6e747a'; c.fillRect(0, 6, w, 3); });
      this.grassMat = std(grassTex); this.gravelMat = std(gravelTex);
      const kerbMat = std(kerbTex, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      this.roadMat.polygonOffset = true; this.roadMat.polygonOffsetFactor = -1; this.roadMat.polygonOffsetUnits = -1;

      const hw = this.hw, kw = this.kerbW, gw = this.grassW, grv = this.gravelW;
      const none = (i, side) => (side > 0 ? this.pitOff[i] > 0.5 : false); // pas d'accotement côté stands

      // sol herbeux infini
      const gt = grassTex.clone(); gt.needsUpdate = true; gt.repeat.set(500, 500);
      const ground = new T.Mesh(new T.PlaneGeometry(10000, 10000).rotateX(-Math.PI / 2), std(gt, { color: 0xa8b8a0 }));
      ground.position.y = -0.06; ground.receiveShadow = true; g.add(ground);

      g.add(this._strip(i => [-hw, hw], this.roadMat, { across: true, vs: 20, y: 0.0 }));
      // accotements herbeux (plus clairs) puis gravier
      const wl = i => this.wallL[i], wr = i => this.wallR[i];
      g.add(this._strip(i => (none(i, 1) ? [hw, hw] : [hw, Math.min(wl(i), hw + gw + grv + 30)]), this.grassMat, { y: -0.02, us: 8, vs: 8 }));
      g.add(this._strip(i => [-hw, -Math.min(wr(i), hw + gw + grv + 30)], this.grassMat, { y: -0.02, us: 8, vs: 8 }));
      g.add(this._strip(i => (none(i, 1) || !this.gravL[i] ? [hw + gw, hw + gw] : [hw + gw, hw + gw + grv]), this.gravelMat, { y: -0.01, us: 6, vs: 6 }));
      g.add(this._strip(i => (!this.gravR[i] ? [-hw - gw, -hw - gw] : [-hw - gw, -hw - gw - grv]), this.gravelMat, { y: -0.01, us: 6, vs: 6 }));
      g.add(this._strip(i => (this.kerbL[i] && !none(i, 1) ? [hw, hw + kw] : [hw, hw]), kerbMat, { y: 0.03, across: true, vs: 4 }));
      g.add(this._strip(i => (this.kerbR[i] ? [-hw, -hw - kw] : [-hw, -hw]), kerbMat, { y: 0.03, across: true, vs: 4 }));

      // murs + rails de sécurité
      const wallMat = std(wallTex, { side: T.DoubleSide, roughness: 0.8 });
      const railMat = std(metalTex, { side: T.DoubleSide, roughness: 0.4, metalness: 0.5 });
      for (const side of [1, -1]) {
        const wf = side > 0 ? wl : wr;
        g.add(this._wall(side, wallMat, 0, 1.3, 0, wf));
        if (!this.city) g.add(this._wall(side, railMat, 0.45, 0.45, 1.2, wf));
      }
      // ligne de départ + marques de grille
      const chk = A.canvasTex(64, 16, c => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) & 1 ? '#fff' : '#111'; c.fillRect(x * 4, y * 4, 4, 4); } });
      const o = this.at(0, 0), line = new T.Mesh(new T.PlaneGeometry(this.hw * 2, 2.4).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: chk }));
      line.position.set(o.x, 0.04, o.z); line.rotation.y = o.h; g.add(line);
      const marks = [];
      for (let k = 0; k < 20; k++) { const p = this.gridPose(k); marks.push(A.part(new T.PlaneGeometry(2.4, 0.3).rotateX(-Math.PI / 2), 0xffffff, p.x, 0.04, p.z, 0, p.h, 0)); }
      g.add(new T.Mesh(A.merge(marks), new T.MeshBasicMaterial({ vertexColors: true })));

      A.buildPitlane(this, g, std);
      A.buildScenery(this, g, std);
      return g;
    }

    setWet(w) {
      this.wet = w;
      this.roadMat.color.setScalar(1 - 0.5 * w);
      this.roadMat.roughness = 0.95 - 0.6 * w;
    }
  };
})();
