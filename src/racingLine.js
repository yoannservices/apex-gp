// Trajectoire idéale (relaxation vers le chemin le plus court dans la piste) + profil de vitesse (passes avant/arrière) + aide visuelle.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;

  const BOT = { mu: 1.3, g: 9.81, cd: 2.6, drag: 1.0, pmax: 780e3, mass: 830, brake: 29000 };
  A.BOT = BOT;

  A.buildRacingLine = tr => {
    const N = tr.N, ds = tr.ds, hw = tr.hw, off = new Float32Array(N), px = new Float32Array(N), pz = new Float32Array(N);
    const lim = hw - 1.7;
    for (let it = 0; it < 900; it++) {
      for (let i = 0; i < N; i++) {
        const a = (i + N - 1) % N, b = (i + 1) % N;
        const ax = tr.px[a] + tr.nx[a] * off[a], az = tr.pz[a] + tr.nz[a] * off[a];
        const bx = tr.px[b] + tr.nx[b] * off[b], bz = tr.pz[b] + tr.nz[b] * off[b];
        const mx = (ax + bx) / 2 - tr.px[i], mz = (az + bz) / 2 - tr.pz[i];
        off[i] = Math.max(-lim, Math.min(lim, off[i] * 0.2 + 0.8 * (mx * tr.nx[i] + mz * tr.nz[i])));
      }
    }
    // lissage final (supprime les angles aux limites)
    const tmp = new Float32Array(N);
    for (let p = 0; p < 12; p++) { for (let i = 0; i < N; i++) tmp[i] = (off[(i + N - 1) % N] + 2 * off[i] + off[(i + 1) % N]) / 4; off.set(tmp); }
    for (let i = 0; i < N; i++) { px[i] = tr.px[i] + tr.nx[i] * off[i]; pz[i] = tr.pz[i] + tr.nz[i] * off[i]; }

    // courbure signée de la trajectoire (gauche > 0 comme tr.curv)
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      const h1 = Math.atan2(px[i] - px[a], pz[i] - pz[a]), h2 = Math.atan2(px[b] - px[i], pz[b] - pz[i]);
      k[i] = A.wrap(h2 - h1) / ds;
    }
    const ks = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let j = -3; j <= 3; j++) s += k[(i + j + N) % N]; ks[i] = s / 7; }

    const prof = A.speedProfile(tr, ks, BOT);
    return { off, px, pz, k: ks, vmax: prof, L: tr.L };
  };

  // vitesse maximale de passage de chaque échantillon puis bornage par l'accélération / le freinage possibles
  A.speedProfile = (tr, k, P) => {
    const N = tr.N, ds = tr.ds, v = new Float32Array(N), VTOP = 98;
    const aLat = (vv) => P.mu * (P.g + (P.cd * vv * vv) / P.mass);
    for (let i = 0; i < N; i++) {
      const kk = Math.abs(k[i]);
      let vv = VTOP;
      if (kk > 1e-5) { // v² k = mu (g + cd v² / m)  =>  v² = mu g / (k - mu cd / m)
        const den = kk - (P.mu * P.cd) / P.mass;
        vv = den > 1e-6 ? Math.min(VTOP, Math.sqrt((P.mu * P.g) / den)) : VTOP;
      }
      v[i] = vv;
    }
    const aBrake = vv => Math.min(0.9 * aLat(vv), P.brake / P.mass * 0.92) + (P.drag * vv * vv) / P.mass;
    const aAcc = vv => Math.max(0.6, Math.min((P.pmax * 0.9) / (P.mass * Math.max(vv, 12)) - (P.drag * vv * vv) / P.mass, 0.55 * aLat(vv)));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N * 2; i > 0; i--) { // arrière : on doit pouvoir freiner jusqu'à la vitesse du point suivant
        const j = i % N, n = (j + 1) % N, vn = v[n];
        const kk = Math.abs(k[j]), fr = Math.min(0.9, (kk * vn * vn) / aLat(vn));
        const a = aBrake(vn) * Math.sqrt(1 - fr * fr * 0.5);
        const vp = Math.sqrt(vn * vn + 2 * a * ds);
        if (vp < v[j]) v[j] = vp;
      }
      for (let i = 0; i < N * 2; i++) { // avant : accélération limitée
        const j = i % N, n = (j + 1) % N, vj = v[j];
        const kk = Math.abs(k[j]), fr = Math.min(0.9, (kk * vj * vj) / aLat(vj));
        const vn = Math.sqrt(vj * vj + 2 * aAcc(vj) * Math.sqrt(1 - fr * fr) * ds);
        if (vn < v[n]) v[n] = vn;
      }
    }
    return v;
  };

  // Ruban coloré sur la trajectoire devant le joueur : vert = pleins gaz, jaune = lever, rouge = freiner
  A.LineAssist = class LineAssist {
    constructor(tr, line) {
      this.tr = tr; this.line = line; this.n = 90;
      const g = new T.BufferGeometry();
      this.pos = new Float32Array(this.n * 2 * 3); this.col = new Float32Array(this.n * 2 * 3);
      g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('color', new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage));
      const idx = [];
      for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      this.mesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.visible = false;
    }
    update(car, on) {
      this.mesh.visible = on;
      if (!on) return;
      const tr = this.tr, L = this.line, N = tr.N, i0 = car.idx < 0 ? 0 : car.idx, pos = this.pos, col = this.col;
      for (let m = 0; m < this.n; m++) {
        const i = (i0 + m + 1) % N, x = L.px[i], z = L.pz[i], nx = tr.nx[i], nz = tr.nz[i], w = 0.55;
        const y = tr.height(i, L.off[i]) + 0.04;
        pos.set([x + nx * w, y, z + nz * w, x - nx * w, y, z - nz * w], m * 6);
        const vm = L.vmax[i], u = car.u;
        const c = u > vm * 1.0 ? [1, 0.15, 0.1] : u > vm * 0.9 ? [1, 0.85, 0.1] : [0.1, 0.95, 0.3];
        col.set([...c, ...c], m * 6);
      }
      this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
    }
  };
})();
