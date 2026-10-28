// Collisions : boîtes orientées (OBB) voiture-voiture par axes séparateurs, voiture-mur par coins. Impulsions avec inertie en lacet.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const HL = 2.9, HW = 0.95, CX = 0.3; // demi-longueur, demi-largeur, décalage du centre vers l'avant
  const E = 0.12, MU = 0.35;
  const Q = { i: 0, d: 0, a: 0, s: 0 };

  const mass = c => A.PHYS.mass + c.fuel;
  // vitesse monde du point de décalage (px, pz) par rapport au centre de la voiture
  const velAt = (c, px, pz) => {
    const sh = Math.sin(c.h), ch = Math.cos(c.h);
    return [c.u * sh + c.v * ch + c.r * pz, c.u * ch - c.v * sh - c.r * px];
  };
  // applique une impulsion monde (jx, jz) au point (px, pz) : met à jour u, v, r
  const push = (c, jx, jz, px, pz) => {
    const sh = Math.sin(c.h), ch = Math.cos(c.h), m = mass(c);
    let vx = c.u * sh + c.v * ch + jx / m, vz = c.u * ch - c.v * sh + jz / m;
    c.u = vx * sh + vz * ch; c.v = vx * ch - vz * sh;
    c.r += (pz * jx - px * jz) / A.PHYS.Iz;
  };
  const local = (c, px, pz) => [px * Math.sin(c.h) + pz * Math.cos(c.h), px * Math.cos(c.h) - pz * Math.sin(c.h)];

  // impulsion normale + frottement entre a et b (b peut être null = mur). n : normale de a vers b (ou vers la piste pour un mur).
  const resolve = (a, b, n, pa, pb) => {
    const t = [-n[1], n[0]];
    const va = velAt(a, pa[0], pa[1]), vb = b ? velAt(b, pb[0], pb[1]) : [0, 0];
    const rv = [vb[0] - va[0], vb[1] - va[1]], vn = rv[0] * n[0] + rv[1] * n[1];
    if (vn >= 0) return 0;
    const ia = 1 / mass(a), ib = b ? 1 / mass(b) : 0, Iz = A.PHYS.Iz;
    const ka = (n, p) => { const c = p[1] * n[0] - p[0] * n[1]; return c * c / Iz; };
    const den = ia + ib + ka(n, pa) + (b ? ka(n, pb) : 0);
    const j = -(1 + E) * vn / den;
    push(a, -j * n[0], -j * n[1], pa[0], pa[1]);
    if (b) push(b, j * n[0], j * n[1], pb[0], pb[1]);
    const vt = rv[0] * t[0] + rv[1] * t[1], dt_ = ia + ib + ka(t, pa) + (b ? ka(t, pb) : 0);
    const jt = A.clamp(-vt / dt_, -MU * j, MU * j);
    push(a, -jt * t[0], -jt * t[1], pa[0], pa[1]);
    if (b) push(b, jt * t[0], jt * t[1], pb[0], pb[1]);
    return -vn;
  };

  const ext = (c, n) => { // demi-étendue de la boîte de c projetée sur n
    const f = [Math.sin(c.h), Math.cos(c.h)], l = [Math.cos(c.h), -Math.sin(c.h)];
    return HL * Math.abs(f[0] * n[0] + f[1] * n[1]) + HW * Math.abs(l[0] * n[0] + l[1] * n[1]);
  };
  const centre = c => [c.x + Math.sin(c.h) * CX, c.z + Math.cos(c.h) * CX];

  // Retourne le choc entre a et b : { n, depth, p } ou null
  A.obbTest = (a, b) => {
    const ca = centre(a), cb = centre(b);
    if ((ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2 > 42) return null;
    let best = null;
    for (const c of [a, b]) for (const ang of [c.h, c.h + Math.PI / 2]) {
      const n = [Math.sin(ang), Math.cos(ang)];
      let d = (cb[0] - ca[0]) * n[0] + (cb[1] - ca[1]) * n[1];
      const ra = ext(a, n), rb = ext(b, n), ov = ra + rb - Math.abs(d);
      if (ov <= 0) return null;
      if (!best || ov < best.depth) { if (d < 0) { n[0] = -n[0]; n[1] = -n[1]; d = -d; } best = { n, depth: ov, d, ra }; }
    }
    // point de contact : milieu du recouvrement sur l'axe tangent
    const n = best.n, t = [-n[1], n[0]];
    const ta = ca[0] * t[0] + ca[1] * t[1], tb = cb[0] * t[0] + cb[1] * t[1], ea = ext(a, t), eb = ext(b, t);
    const mid = (Math.max(ta - ea, tb - eb) + Math.min(ta + ea, tb + eb)) / 2, pn = ca[0] * n[0] + ca[1] * n[1] + best.ra - best.depth / 2;
    best.p = [n[0] * pn + t[0] * mid, n[1] * pn + t[1] * mid];
    return best;
  };

  // cars : voitures actives ; emit(type, data) pour sons/étincelles/règles
  A.collide = (cars, tr, emit) => {
    const n = cars.length;
    for (let i = 0; i < n; i++) {
      const a = cars[i];
      if (a.hidden) continue;
      for (let j = i + 1; j < n; j++) {
        const b = cars[j];
        if (b.hidden || (a.dnf && b.dnf)) continue;
        const h = A.obbTest(a, b);
        if (!h) continue;
        const sh = Math.min(h.depth, 0.5), wa = a.dnf ? 0 : b.dnf ? 1 : 0.5, wb = 1 - wa;
        a.x -= h.n[0] * sh * wa; a.z -= h.n[1] * sh * wa; b.x += h.n[0] * sh * wb; b.z += h.n[1] * sh * wb;
        const pa = [h.p[0] - a.x, h.p[1] - a.z], pb = [h.p[0] - b.x, h.p[1] - b.z];
        const sev = resolve(a, b, h.n, pa, pb);
        if (sev > 0.5) {
          a.bumpT = b.bumpT = 1;
          if (sev > 2) {
            const la = local(a, pa[0], pa[1]), lb = local(b, pb[0], pb[1]);
            const ds = a.isPlayer || b.isPlayer ? sev : sev * 0.3; // les contacts entre bots abîment peu : sinon le premier virage décime la grille
            if (ds > 2) { A.applyHit(a, la[0], la[1], ds); A.applyHit(b, lb[0], lb[1], ds); }
            emit && emit('crash', { a, b, sev, x: h.p[0], z: h.p[1] });
          }
        }
      }
    }
    // murs : on teste les 4 coins des voitures proches du bord
    for (const c of cars) {
      if (c.hidden || c.idx < 0) continue;
      const wl = c.lat > 0 ? tr.wallL[c.idx] : tr.wallR[c.idx];
      if (Math.abs(c.lat) < wl - 5) continue;
      const sh = Math.sin(c.h), ch = Math.cos(c.h);
      for (const fx of [CX + HL, CX - HL]) for (const fy of [HW, -HW]) {
        const px = sh * fx + ch * fy, pz = ch * fx - sh * fy;
        const q = tr.query(c.x + px, c.z + pz, c.idx, Q), lim = (q.d > 0 ? tr.wallL[q.i] : tr.wallR[q.i]) - 0.3, pen = Math.abs(q.d) - lim;
        if (pen <= 0) continue;
        const sg = q.d > 0 ? -1 : 1, nrm = [tr.nx[q.i] * sg, tr.nz[q.i] * sg];
        const mv = Math.min(pen, 0.5); c.x += nrm[0] * mv; c.z += nrm[1] * mv;
        const sev = resolve(c, null, [-nrm[0], -nrm[1]], [px, pz], null); // la normale pointe vers le mur
        if (sev > 0.5) {
          c.bumpT = 1;
          const sp = Math.abs(velAt(c, px, pz)[0] * -nrm[1] + velAt(c, px, pz)[1] * nrm[0]);
          if (sev > 2) { const l = local(c, px, pz); A.applyHit(c, l[0], l[1], sev); emit && emit('wall', { car: c, sev, x: c.x + px, z: c.z + pz }); }
          else if (sp > 15) emit && emit('scrape', { car: c, x: c.x + px, z: c.z + pz, sp });
        }
      }
    }
  };
})();
