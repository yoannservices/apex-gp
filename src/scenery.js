// Décor : portique de départ, passerelle, tribunes + spectateurs, arbres/immeubles, lampadaires, panneaux, collines. Tout en InstancedMesh.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;

  const mulberry = s => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  A.buildScenery = (tr, group, std) => {
    const rnd = mulberry(tr.id.length * 7919 + tr.N);
    const N = tr.N, up = new T.Vector3(0, 1, 0);
    const wall = (i, side) => (side > 0 ? tr.wallL[i] : tr.wallR[i]);
    const flatAt = i => { for (let k = -15; k <= 15; k++) if (Math.abs(tr.kS[(i + k + N) % N]) > 1 / 3000) return false; return true; };
    const basis = (i, side, d, m4) => { // X le long de la piste, Z vers l'extérieur
      const t = new T.Vector3(tr.tx[i], 0, tr.tz[i]).multiplyScalar(side > 0 ? -1 : 1);
      const z = new T.Vector3().crossVectors(t, up);
      return m4.makeBasis(t, up, z).setPosition(tr.px[i] + tr.nx[i] * side * d, 0, tr.pz[i] + tr.nz[i] * side * d);
    };
    const inst = (geo, mat, mats, cols) => {
      const m = new T.InstancedMesh(geo, mat, Math.max(1, mats.length));
      mats.forEach((x, k) => m.setMatrixAt(k, x));
      if (cols) cols.forEach((c, k) => m.setColorAt(k, c));
      m.count = mats.length; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false;
      group.add(m);
      return m;
    };
    const vmat = (o = {}) => new T.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85 }, o));

    // Repère local des ouvrages : x = latéral (gauche +), y = haut, z = sens de la piste.
    const place = (i, h) => { const g = new T.Group(); g.position.set(tr.px[i], 0, tr.pz[i]); g.rotation.y = h; group.add(g); return g; };

    // ---- portique de départ avec 5 feux ----
    const hwG = tr.hw + 2.5, gant = place(0, tr.at(0, 0).h);
    const gm = new T.Mesh(A.merge([A.box(1.2, 9, 1.2, 0x33363c, hwG, 4.5, 0), A.box(1.2, 9, 1.2, 0x33363c, -hwG, 4.5, 0), A.box(2 * hwG + 2, 1.6, 1.4, 0x222428, 0, 9, 0)]), vmat());
    gm.castShadow = true; gant.add(gm);
    tr.startLights = [];
    for (let k = 0; k < 5; k++) {
      const m = new T.MeshBasicMaterial({ color: 0x300000 }), l = new T.Mesh(new T.SphereGeometry(0.45, 10, 8), m);
      l.position.set((k - 2) * 1.8, 8.9, -0.85); gant.add(l); tr.startLights.push(m);
    }

    // ---- passerelle au-dessus de la piste ----
    let bi = Math.floor(N * 0.33);
    for (let k = 0; k < N; k++) { const i = (bi + k) % N; if (flatAt(i)) { bi = i; break; } }
    {
      const wl = wall(bi, 1) + 3, wr = wall(bi, -1) + 3, W = wl + wr, cx = (wl - wr) / 2;
      const bridge = place(bi, Math.atan2(tr.tx[bi], tr.tz[bi]));
      const bm = new T.Mesh(A.merge([
        A.box(W, 1.4, 10, 0x8a8f96, cx, 7, 0), A.box(W, 1.2, 0.3, 0xd8101a, cx, 8.2, 4.8), A.box(W, 1.2, 0.3, 0xd8101a, cx, 8.2, -4.8),
        A.box(3, 7, 3, 0x6c7178, wl, 3.5, 0), A.box(3, 7, 3, 0x6c7178, -wr, 3.5, 0)]), vmat());
      bm.castShadow = true; bridge.add(bm);
      tr.bridgeS = bi * tr.ds;
    }

    // ---- tribunes + spectateurs ----
    const standParts = [];
    for (let r = 0; r < 4; r++) standParts.push(A.box(60, 1.2, 3, r & 1 ? 0x7d8288 : 0x90959b, 0, 0.6 + r * 1.2, 1.5 + r * 3));
    standParts.push(A.box(62, 0.4, 14, 0x2c5fb8, 0, 7.4, 8), A.box(0.5, 7, 0.5, 0x4a4d52, -29, 3.7, 12.5), A.box(0.5, 7, 0.5, 0x4a4d52, 29, 3.7, 12.5));
    const standGeo = A.merge(standParts), specGeo = new T.BoxGeometry(0.5, 1.1, 0.45).translate(0, 0.55, 0);
    const stands = [], specs = [], specCols = [], tmp = new T.Matrix4(), tmp2 = new T.Matrix4(), col = new T.Color();
    const pal = [0xd8101a, 0x1747d6, 0xf2f2f2, 0xf2d21b, 0x0c8f4a, 0xff7a00, 0x222222];
    for (let i = 0; i < N && stands.length < 22; i += 40 + Math.floor(rnd() * 30)) {
      if (!flatAt(i)) continue;
      const side = rnd() < 0.5 ? 1 : -1, rel = tr.rel(i * tr.ds);
      if (side > 0 && Math.abs(rel) < 340) continue; // côté stands
      const d = wall(i, side) + 3;
      basis(i, side, d, tmp);
      stands.push(tmp.clone());
      for (let r = 0; r < 4; r++) for (let c = -14; c <= 14; c++) {
        if (rnd() < 0.15) continue;
        tmp2.makeTranslation(c * 2 + rnd() * 0.5, 1.2 + r * 1.2, 1.5 + r * 3 + (rnd() - 0.5) * 0.6).premultiply(tmp);
        specs.push(tmp2.clone()); specCols.push(col.setHex(pal[Math.floor(rnd() * pal.length)]).clone());
      }
    }
    inst(standGeo, vmat(), stands);
    inst(specGeo, new T.MeshStandardMaterial({ roughness: 0.9 }), specs, specCols);

    // ---- arbres (circuits nature) ou immeubles (circuits urbains) ----
    const far = (x, z, minD) => { for (let k = 0; k < N; k += 2) { const dx = x - tr.px[k], dz = z - tr.pz[k]; if (dx * dx + dz * dz < minD * minD) return false; } return true; };
    const decor = [], dcol = [];
    const city = tr.city;
    const geo = city ? new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
      : A.merge([A.cyl(0.3, 0.4, 2.4, 6, 0x5b4630, 0, 1.2, 0), A.part(new T.ConeGeometry(2.6, 6, 7), 0x2f6a35, 0, 5, 0), A.part(new T.ConeGeometry(2, 4.5, 7), 0x3a7d40, 0, 7.6, 0)]);
    for (let n = 0, tries = 0; n < (city ? 260 : 480) && tries < 4000; tries++) {
      const i = Math.floor(rnd() * N), side = rnd() < 0.5 ? 1 : -1, dd = wall(i, side) + (city ? 5 + rnd() * 40 : 10 + rnd() * 90);
      const x = tr.px[i] + tr.nx[i] * side * dd, z = tr.pz[i] + tr.nz[i] * side * dd;
      if (!far(x, z, wall(i, side) + (city ? 4 : 8))) continue;
      const sc = city ? new T.Vector3(10 + rnd() * 18, 14 + rnd() * 50, 10 + rnd() * 18) : new T.Vector3(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.9);
      decor.push(new T.Matrix4().compose(new T.Vector3(x, 0, z), new T.Quaternion().setFromAxisAngle(up, rnd() * 6.28), sc));
      if (city) dcol.push(col.setHSL(0.58 + rnd() * 0.1, 0.08 + rnd() * 0.2, 0.35 + rnd() * 0.3).clone());
      n++;
    }
    inst(geo, city ? new T.MeshStandardMaterial({ roughness: 0.8 }) : vmat(), decor, city ? dcol : null);

    // ---- lampadaires ----
    const poles = [], heads = [];
    for (let i = 0; i < N; i += 14) {
      const side = (i / 14) & 1 ? 1 : -1;
      if (side > 0 && Math.abs(tr.rel(i * tr.ds)) < 340) continue;
      const d = wall(i, side) + 1.2;
      basis(i, side, d, tmp);
      poles.push(new T.Matrix4().makeTranslation(0, 4.5, 0).premultiply(tmp));
      heads.push(new T.Matrix4().makeTranslation(0, 9.1, side > 0 ? -1.3 : -1.3).premultiply(tmp));
    }
    inst(new T.BoxGeometry(0.3, 9, 0.3), new T.MeshStandardMaterial({ color: 0x555a60 }), poles);
    tr.lampMat = new T.MeshBasicMaterial({ color: 0x6a6a60 });
    inst(new T.BoxGeometry(1.6, 0.25, 0.7), tr.lampMat, heads);

    // ---- panneaux de freinage (150 / 100 / 50 m) avant chaque virage serré ----
    const boards = [[], [], []];
    for (let i = 1, inC = false; i < N + 1; i++) {
      const k = i % N, tight = Math.abs(tr.kS[k]) > 1 / 300;
      if (tight && !inC) {
        const side = tr.kS[k] > 0 ? -1 : 1; // côté extérieur du virage
        [150, 100, 50].forEach((m, b) => {
          const j = (k - Math.round(m / tr.ds) + N) % N;
          if (side > 0 && tr.pitOff[j] > 0.5) return;
          basis(j, side, wall(j, side) - 0.3, tmp);
          boards[b].push(new T.Matrix4().makeTranslation(0, 2.6, 0).premultiply(tmp));
        });
      }
      inC = tight;
    }
    [150, 100, 50].forEach((m, b) => {
      const t = A.canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8101a'; c.fillRect(0, 0, w, 8); c.fillRect(0, h - 8, w, 8); c.fillStyle = '#111'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText(m, 32, 42); });
      inst(new T.PlaneGeometry(1.8, 1.8).rotateY(Math.PI), new T.MeshBasicMaterial({ map: t, side: T.DoubleSide }), boards[b]);
    });

    // ---- collines lointaines ----
    let cx = 0, cz = 0;
    for (let i = 0; i < N; i++) { cx += tr.px[i] / N; cz += tr.pz[i] / N; }
    let R = 0;
    for (let i = 0; i < N; i++) R = Math.max(R, Math.hypot(tr.px[i] - cx, tr.pz[i] - cz));
    const hills = [];
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * 6.283 + rnd() * 0.2, r = R + 450 + rnd() * 500, s = 160 + rnd() * 220;
      hills.push(new T.Matrix4().compose(new T.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r), new T.Quaternion(), new T.Vector3(s * 1.6, s * (0.5 + rnd() * 0.5), s * 1.6)));
    }
    inst(new T.ConeGeometry(1, 1, 7), new T.MeshStandardMaterial({ color: 0x4d6b4a, roughness: 1, flatShading: true }), hills);
  };
})();
