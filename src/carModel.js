// Monoplace procédurale : géométrie fusionnée par équipe (partagée), pièces détachables séparées, LOD lointain.
// Repère local : +Z avant, +X gauche, +Y haut, sol à y = 0.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;
  const WZ = [1.94, 1.94, -1.66, -1.66], WX = [0.8, -0.8, 0.8, -0.8];
  const WR = [0.33, 0.33, 0.36, 0.36], WW = [0.38, 0.38, 0.48, 0.48];
  const DARK = 0x1a1b1f, UP = new T.Vector3(0, 0, 1);
  const cache = {};
  let bodyMat, tireMat, stripeMats, glassMat, f1Source;
  const loadF1 = () => {
    if (f1Source) return f1Source;
    f1Source = new Promise((resolve, reject) => {
      if (!T.GLTFLoader) return reject(new Error('GLTFLoader unavailable'));
      new T.GLTFLoader().load(new URL('../../assets/models/F1.glb', document.baseURI).href, gltf => resolve(gltf.scene), undefined, reject);
    });
    return f1Source;
  };

  const mats = () => {
    if (bodyMat) return;
    bodyMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25 });
    tireMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    stripeMats = {};
    for (const k in A.COMPOUNDS) stripeMats[k] = new T.MeshBasicMaterial({ color: A.COMPOUNDS[k].color, side: T.DoubleSide });
  };

  const cone = (rt, rb, len, seg, color, x, y, z, sx, sy) => A.part(new T.CylinderGeometry(rt, rb, len, seg), color, x, y, z, Math.PI / 2, 0, 0, sx, 1, sy);
  const rod = (a, b, t, color) => {
    const v = new T.Vector3().subVectors(b, a), len = v.length(), q = new T.Quaternion().setFromUnitVectors(UP, v.normalize()), e = new T.Euler().setFromQuaternion(q);
    return A.part(new T.BoxGeometry(t, t, len), color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, e.x, e.y, e.z);
  };

  const build = team => {
    mats();
    const c1 = team.color, c2 = team.color2;
    const V = (x, y, z) => new T.Vector3(x, y, z);

    // ---- châssis ----
    const body = [
      A.box(1.5, 0.05, 3.6, DARK, 0, 0.12, -0.1),
      cone(0.09, 0.33, 2.4, 10, c1, 0, 0.38, 1.8, 1, 0.75),
      A.box(0.64, 0.4, 1.1, c1, 0, 0.5, 0.1),
      A.box(0.42, 0.04, 0.6, 0x0a0a0c, 0, 0.71, 0.15),
      A.box(0.46, 0.36, 1.7, c1, 0.54, 0.34, -0.5), A.box(0.46, 0.36, 1.7, c1, -0.54, 0.34, -0.5),
      A.box(0.4, 0.2, 0.05, 0x0a0a0c, 0.54, 0.4, 0.36), A.box(0.4, 0.2, 0.05, 0x0a0a0c, -0.54, 0.4, 0.36),
      A.box(0.48, 0.05, 1.7, c2, 0.54, 0.53, -0.5), A.box(0.48, 0.05, 1.7, c2, -0.54, 0.53, -0.5),
      cone(0.26, 0.05, 2.3, 10, c1, 0, 0.62, -1.35, 0.9, 1.2),
      A.box(0.3, 0.38, 0.5, c2, 0, 0.9, -0.1),
      A.box(0.03, 0.45, 1.3, c1, 0, 0.95, -1.2),
      A.box(0.05, 0.36, 0.05, 0x24262b, 0, 0.9, 0.5, 0.55, 0, 0),
      A.box(0.04, 0.04, 0.95, 0x24262b, 0.27, 0.97, 0.03), A.box(0.04, 0.04, 0.95, 0x24262b, -0.27, 0.97, 0.03),
      A.box(0.03, 0.3, 0.55, DARK, 0.42, 0.3, 0.75, 0, 0.4, 0), A.box(0.03, 0.3, 0.55, DARK, -0.42, 0.3, 0.75, 0, -0.4, 0),
      A.box(0.9, 0.2, 0.5, DARK, 0, 0.2, -2.15),
      A.box(0.7, 0.04, 0.4, 0x2b2d33, 0, 0.14, -2.45, -0.2, 0, 0),
    ];
    for (let w = 0; w < 4; w++) { // bras de suspension
      const x = WX[w], z = WZ[w], s = Math.sign(x), y = WR[w];
      body.push(rod(V(0.2 * s, 0.22, z + 0.28), V(x - 0.1 * s, y + 0.06, z + 0.04), 0.035, 0x2b2d33), rod(V(0.2 * s, 0.4, z - 0.25), V(x - 0.1 * s, y - 0.04, z - 0.04), 0.035, 0x2b2d33));
    }
    // ---- aileron avant ----
    const fw = [A.box(1.9, 0.03, 0.38, DARK, 0, 0.1, 3.0), A.box(1.9, 0.03, 0.22, c1, 0, 0.17, 2.88), A.box(0.06, 0.12, 0.3, DARK, 0, 0.14, 2.7),
      A.box(0.03, 0.2, 0.55, c2, 0.95, 0.17, 2.95), A.box(0.03, 0.2, 0.55, c2, -0.95, 0.17, 2.95)];
    // ---- aileron arrière ----
    const rw = [A.box(1.0, 0.035, 0.3, c1, 0, 0.98, -2.5), A.box(0.8, 0.03, 0.2, DARK, 0, 0.62, -2.45), A.box(0.06, 0.4, 0.18, DARK, 0, 0.78, -2.4),
      A.box(0.03, 0.44, 0.62, c2, 0.52, 0.85, -2.45), A.box(0.03, 0.44, 0.62, c2, -0.52, 0.85, -2.45)];
    const flap = [A.box(1.0, 0.03, 0.2, c2, 0, 0, -0.1)];
    const mir = [A.box(0.14, 0.09, 0.05, DARK, 0, 0, 0), A.box(0.03, 0.12, 0.03, DARK, -0.03, -0.06, 0.02)];
    const helmet = [A.part(new T.SphereGeometry(0.125, 10, 8), c2, 0, 0.78, 0.1), A.box(0.2, 0.06, 0.12, 0x111114, 0, 0.8, 0.2)];

    // ---- roue : pneu + jante (couleurs sommets) ----
    const wheelGeo = [0, 2].map(i => A.merge([
      A.part(new T.CylinderGeometry(WR[i], WR[i], WW[i], 18), 0x1b1b1d, 0, 0, 0, 0, 0, Math.PI / 2),
      A.part(new T.CylinderGeometry(WR[i] * 0.6, WR[i] * 0.6, WW[i] * 1.03, 12), 0x8d9097, 0, 0, 0, 0, 0, Math.PI / 2),
    ]));
    // ---- LOD lointain : un seul maillage ----
    const low = [A.box(0.7, 0.45, 3.2, c1, 0, 0.4, 0.2), A.box(1.9, 0.05, 0.4, DARK, 0, 0.1, 3.0), A.box(1.0, 0.05, 0.3, c1, 0, 0.98, -2.5), A.box(0.05, 0.8, 0.4, c1, 0, 0.6, -2.4), A.box(0.5, 0.2, 2, c1, 0, 0.3, -1.2)];
    for (let w = 0; w < 4; w++) low.push(A.box(WW[w], WR[w] * 2, WR[w] * 2, 0x1b1b1d, WX[w], WR[w], WZ[w]));
    return { body: A.merge(body), fw: A.merge(fw), rw: A.merge(rw), flap: A.merge(flap), mir: A.merge(mir), helmet: A.merge(helmet), wheel: wheelGeo, low: A.merge(low) };
  };

  const numTex = n => A.canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#f4f4f4'; c.beginPath(); c.arc(32, 32, 30, 0, 6.3); c.fill();
    c.fillStyle = '#111'; c.font = 'bold 36px sans-serif'; c.textAlign = 'center'; c.fillText(n, 32, 45);
  });

  A.buildCarModel = (teamIdx, number) => {
    const team = A.TEAMS[teamIdx];
    if (!cache[teamIdx]) { cache[teamIdx] = build(team); Object.values(cache[teamIdx]).flat().forEach(g => (g.userData.shared = true)); }
    const G = cache[teamIdx], m = { team, comp: null, spin: [0, 0, 0, 0], lodFar: false, flapA: 0 };
    const root = (m.root = new T.Group()); root.rotation.order = 'YXZ';
    const hi = (m.hi = new T.Group()); root.add(hi);
    m.casters = [];
    const mesh = (geo, mat, parent, cast = true) => { const o = new T.Mesh(geo, mat); o.castShadow = cast; if (cast) m.casters.push(o); parent.add(o); return o; };
    m.body = mesh(G.body, bodyMat, hi);
    m.fw = mesh(G.fw, bodyMat, hi);
    m.rw = new T.Group(); hi.add(m.rw);
    mesh(G.rw, bodyMat, m.rw);
    m.flapPivot = new T.Group(); m.flapPivot.position.set(0, 1.02, -2.38); m.rw.add(m.flapPivot);
    mesh(G.flap, bodyMat, m.flapPivot, false);
    m.mirL = mesh(G.mir, bodyMat, hi, false); m.mirL.position.set(0.5, 0.74, 0.9);
    m.mirR = mesh(G.mir, bodyMat, hi, false); m.mirR.position.set(-0.5, 0.74, 0.9);
    m.helmet = mesh(G.helmet, bodyMat, hi, false);
    // numéro sur le nez et le capot moteur
    const nt = numTex(number), nm = new T.MeshBasicMaterial({ map: nt, transparent: true });
    m.num = new T.Group(); hi.add(m.num);
    const top = new T.Mesh(new T.PlaneGeometry(0.32, 0.32).rotateX(-Math.PI / 2).rotateY(Math.PI), nm); top.position.set(0, 0.68, 2.1); m.num.add(top);
    const fl = new T.Mesh(new T.PlaneGeometry(0.36, 0.36).rotateY(Math.PI / 2), nm); fl.position.set(0.02, 1.0, -1.2); m.num.add(fl);
    const fr = new T.Mesh(new T.PlaneGeometry(0.36, 0.36).rotateY(-Math.PI / 2), nm); fr.position.set(-0.02, 1.0, -1.2); m.num.add(fr);
    // feu stop
    m.brakeMat = new T.MeshBasicMaterial({ color: 0x501010 });
    const bl = new T.Mesh(new T.BoxGeometry(0.12, 0.1, 0.04), m.brakeMat); bl.position.set(0, 0.7, -2.52); hi.add(bl);
    // roues
    m.wheel = []; m.pivot = []; m.stripe = [];
    for (let w = 0; w < 4; w++) {
      const piv = new T.Group(); piv.position.set(WX[w], WR[w], WZ[w]); hi.add(piv);
      const sp = new T.Group(); piv.add(sp);
      mesh(G.wheel[w >> 1], tireMat, sp);
      const st = new T.Mesh(new T.RingGeometry(WR[w] * 0.64, WR[w] * 0.92, 18).rotateY(WX[w] > 0 ? Math.PI / 2 : -Math.PI / 2), stripeMats.M);
      st.position.x = Math.sign(WX[w]) * (WW[w] / 2 + 0.004); piv.add(st);
      m.pivot.push(piv); m.wheel.push(sp); m.stripe.push(st);
    }
    // volant (visible en vue cockpit)
    const sw = (m.steer = new T.Group()), tilt = new T.Group(); tilt.position.set(0, 0.76, 0.5); tilt.rotation.x = 0.55; tilt.add(sw); hi.add(tilt);
    sw.add(new T.Mesh(A.merge([A.box(0.3, 0.14, 0.03, 0x141418, 0, 0, 0), A.box(0.05, 0.2, 0.05, 0x141418, 0.15, 0, 0), A.box(0.05, 0.2, 0.05, 0x141418, -0.15, 0, 0), A.box(0.1, 0.05, 0.035, team.color2, 0, 0.02, 0.01)]), bodyMat));
    // LOD
    m.low = new T.Mesh(G.low, bodyMat); m.low.visible = false; root.add(m.low);
    m.head = new T.Object3D(); m.head.position.set(0, 0.85, 0.05); hi.add(m.head); // œil du pilote
    m.shadowOn = true;
    loadF1().then(source => {
      const visual = source.clone(true);
      visual.rotation.y = Math.PI;
      let bounds = new T.Box3().setFromObject(visual), size = bounds.getSize(new T.Vector3());
      visual.scale.setScalar(6 / Math.max(size.x, size.z));
      bounds = new T.Box3().setFromObject(visual);
      const center = bounds.getCenter(new T.Vector3());
      visual.position.set(-center.x, -bounds.min.y, -center.z);
      visual.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      hi.add(visual);
      m.glb = visual; m.hi.visible = false; m.low.visible = false;
    }).catch(() => { m.hi.visible = true; m.low.visible = false; });
    return m;
  };

  // Copie d'une pièce pour les débris (partage la géométrie).
  A.clonePart = (m, name) => {
    const G = cache[A.TEAMS.indexOf(m.team)];
    if (name === 'fw') return new T.Mesh(G.fw, bodyMat);
    if (name === 'rw') { const g = new T.Group(); g.add(new T.Mesh(G.rw, bodyMat)); const f = new T.Mesh(G.flap, bodyMat); f.position.set(0, 1.02, -2.38); g.add(f); return g; }
    if (name === 'mirL' || name === 'mirR') return new T.Mesh(G.mir, bodyMat);
    if (name.startsWith('wheel')) { const w = +name[5], g = new T.Group(); g.add(new T.Mesh(G.wheel[w >> 1], tireMat)); return g; }
    return null;
  };
  A.WHEEL_R = WR; A.WHEEL_MZ = WZ; A.WHEEL_MX = WX;

  // Synchronise le modèle avec l'état physique. far : LOD lointain, cast : projette une ombre.
  A.syncModel = (car, m, dt, far, cast) => {
    const d = car.d, root = m.root;
    const rough = car.surf[0] === 1 || car.surf[1] === 1 || car.surf[2] === 1 || car.surf[3] === 1 ? Math.sin(car.t * 90) * 0.008 : 0;
    root.position.set(car.x, car.height + rough + (car.lift || 0), car.z);
    root.rotation.set(-car.ax * 0.0022, car.h, car.ay * 0.0012 - car.bank, 'YXZ');
    if (far !== m.lodFar) { m.lodFar = far; m.hi.visible = m.glb ? false : !far; m.low.visible = m.glb ? false : far; }
    m.low.castShadow = m.hi.visible ? false : cast;
    if (far) return;
    if (m.shadowOn !== cast) { m.shadowOn = cast; m.casters.forEach(o => (o.castShadow = cast)); }
    if (m.comp !== car.compound) { m.comp = car.compound; m.stripe.forEach(s => (s.material = stripeMats[car.compound])); }
    m.fw.visible = !d.fwOff; m.rw.visible = !d.rwOff; m.mirL.visible = d.mirL; m.mirR.visible = d.mirR;
    const bend = 1 - d.fw; m.fw.rotation.z = bend * 0.1; m.fw.position.y = -bend * 0.05; m.fw.scale.x = 1 - bend * 0.25;
    m.rw.rotation.z = (1 - d.rw) * 0.08;
    m.flapA += ((car.drsOpen ? 0.42 : 0) - m.flapA) * Math.min(1, dt * 12); m.flapPivot.rotation.x = m.flapA;
    m.brakeMat.color.setHex(car.in.brk > 0.1 ? 0xff2020 : 0x501010);
    for (let w = 0; w < 4; w++) {
      const piv = m.pivot[w], sg = Math.sign(WX[w]);
      piv.visible = d.wheel[w];
      if (!d.wheel[w]) continue;
      piv.rotation.y = w < 2 ? car.delta : 0;
      piv.rotation.z = (1 - d.susp[w]) * 0.25 * sg;
      piv.position.y = WR[w] - (1 - d.susp[w]) * 0.06;
      if (!(w < 2 && car.locked > 0)) m.spin[w] += (car.u * dt) / WR[w];
      m.wheel[w].rotation.x = m.spin[w];
    }
    m.steer.rotation.z = -car.in.steer * 1.3;
  };
})();
