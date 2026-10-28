// Caméras : poursuite, cockpit (volant animé), T-cam, TV (caméras fixes en bord de piste), intro orbitale, rétroviseurs (rendus secondaires).
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE, clamp = A.clamp;
  const UP = new T.Vector3(0, 1, 0), FLIP = new T.Quaternion().setFromAxisAngle(UP, Math.PI);
  const NAMES = { chase: 'Poursuite', cockpit: 'Cockpit', tcam: 'T-cam', tv: 'TV' };

  A.CameraRig = class CameraRig {
    constructor(camera, container) {
      this.cam = camera; this.modes = ['chase', 'cockpit', 'tcam', 'tv']; this.k = 0; this.hd = 0; this.spot = null; this.back = false;
      this.p = new T.Vector3(); this.q = new T.Quaternion(); this.q2 = new T.Quaternion(); this.look = new T.Vector3(); this.tvLook = new T.Vector3();
      this.mirCam = new T.PerspectiveCamera(38, 3.2, 0.3, 1800);
      this.mirOn = true; this.pr = 1;
      this.mir = ['L', 'R'].map(() => { const c = document.createElement('canvas'); c.className = 'mirror'; c.style.display = 'none'; container.appendChild(c); return c; });
    }
    get mode() { return this.modes[this.k]; }
    get label() { return NAMES[this.mode]; }
    cycle() { this.k = (this.k + 1) % this.modes.length; this.spot = null; }
    setMode(m) { const k = this.modes.indexOf(m); if (k >= 0) { this.k = k; this.spot = null; } }

    // points de vue TV : un tous les ~230 m, derrière le mur, en hauteur
    _spots(tr) {
      if (this._spotTr === tr) return this.spots;
      this._spotTr = tr; this.spots = [];
      const n = Math.max(6, Math.round(tr.L / 230));
      for (let k = 0; k < n; k++) {
        const s = (k * tr.L) / n, i = Math.floor(s / tr.ds) % tr.N, side = k % 2 ? 1 : -1;
        const w = side > 0 ? tr.wallL[i] : tr.wallR[i], p = tr.at(s, side * (w + 5));
        this.spots.push({ s, x: p.x, z: p.z, y: tr.height(i, 0) + 7.5 });
      }
      return this.spots;
    }

    // look : touche « regarder derrière » maintenue
    update(dt, race, look) {
      const cam = this.cam, c = race.player, m = race.models.get(c);
      if (!c || !m) return;
      const sp = c.speed, tr = race.tr, mode = this.mode, p = this.p, intro = race.phase === 'intro';
      m.helmet.visible = intro || mode !== 'cockpit';
      this.mirOn = !intro && (mode === 'cockpit' || mode === 'tcam');
      cam.near = 0.1;
      if (intro) { // orbite autour de la voiture pendant la présentation
        const a = race.phaseT * 0.55 + c.h + 2.2, r = 9 - race.phaseT * 0.8;
        cam.position.set(c.x + Math.sin(a) * r, c.height + 2.2, c.z + Math.cos(a) * r);
        cam.lookAt(c.x, c.height + 0.6, c.z); cam.fov = 50; cam.updateProjectionMatrix(); this.hd = c.h; return;
      }
      if (mode === 'chase') {
        const tgt = c.h + clamp(Math.atan2(c.v, Math.max(6, Math.abs(c.u))), -0.5, 0.5) * 0.5 + (look ? Math.PI : 0);
        this.hd += A.wrap(tgt - this.hd) * (1 - Math.exp(-dt * (look ? 14 : 5)));
        const d = 6.8 + sp * 0.03, sx = Math.sin(this.hd), cz = Math.cos(this.hd), sh = sp > 40 ? (Math.random() - 0.5) * 0.03 * (sp / 90) : 0;
        p.set(c.x - sx * d, Math.max(c.height + 2.1 + sp * 0.004, tr.height(c.idx, c.lat) + 0.7) + sh, c.z - cz * d);
        cam.position.copy(p); cam.lookAt(c.x + sx * 5, c.height + 0.9, c.z + cz * 5);
        this._fov(60 + clamp(sp / 90, 0, 1) * 14, dt);
      } else if (mode === 'cockpit' || mode === 'tcam') {
        m.root.updateMatrixWorld(true);
        if (mode === 'cockpit') m.head.getWorldPosition(p); else m.root.localToWorld(p.set(0, 1.28, -0.55));
        m.root.getWorldQuaternion(this.q);
        this.q2.setFromAxisAngle(UP, (look ? 0 : Math.PI) + (mode === 'cockpit' ? c.in.steer * 0.1 : 0));
        cam.position.copy(p); cam.quaternion.copy(this.q).multiply(this.q2);
        this._fov(mode === 'cockpit' ? 78 : 84, dt);
      } else { // TV
        const sp_ = this._spots(tr), L = tr.L, rel = s => ((s % L) + L * 1.5) % L - L / 2;
        let cur = this.spot, ahead = cur ? rel(cur.s - c.s) : -1e9;
        if (!cur || ahead < -35 || ahead > 380) {
          cur = null; let best = 1e9;
          for (const s of sp_) { const a = rel(s.s - c.s); if (a >= 60 && a < best) { best = a; cur = s; } }
          this.spot = cur || sp_[0];
        }
        const s = this.spot, dist = Math.hypot(s.x - c.x, s.z - c.z);
        cam.position.set(s.x, s.y, s.z);
        this.tvLook.lerp(p.set(c.x, c.height + 0.8, c.z), 1 - Math.exp(-dt * 8)); cam.lookAt(this.tvLook);
        this._fov(clamp((2 * Math.atan(14 / Math.max(dist, 10)) * 180) / Math.PI, 14, 55), dt, 6);
      }
    }
    _fov(f, dt, k = 3) { const c = this.cam; c.fov += (f - c.fov) * Math.min(1, dt * k); c.updateProjectionMatrix(); }

    // Rétroviseurs : deux rendus réduits en haut de l'écran, retournés horizontalement via un canvas 2D.
    renderMirrors(renderer, scene, race, W, H) {
      const on = this.mirOn && race.set.mirrors, c = race.player;
      this.mir.forEach(cv => (cv.style.display = on ? 'block' : 'none'));
      if (!on || !c) return;
      const mw = Math.round(clamp(W * 0.2, 150, 320)), mh = Math.round(mw * 0.31), top = Math.round(H * 0.1), pr = renderer.getPixelRatio();
      const cam = this.mirCam, sh = Math.sin(c.h), ch = Math.cos(c.h);
      cam.aspect = mw / mh; cam.updateProjectionMatrix();
      const prevAuto = renderer.autoClear; renderer.autoClear = false; renderer.setScissorTest(true);
      [1, -1].forEach((side, k) => { // +1 = gauche
        const x = k === 0 ? Math.round(W * 0.05) : W - mw - Math.round(W * 0.05), cv = this.mir[k];
        if (cv.width !== mw * pr) { cv.width = mw * pr; cv.height = mh * pr; cv.style.width = mw + 'px'; cv.style.height = mh + 'px'; }
        cv.style.left = x + 'px'; cv.style.top = top + 'px';
        cam.position.set(c.x + sh * 0.3 + ch * 0.8 * side, c.height + 0.95, c.z + ch * 0.3 - sh * 0.8 * side);
        const a = c.h + Math.PI - 0.12 * side; // vers l'arrière, légèrement vers l'extérieur
        cam.lookAt(cam.position.x + Math.sin(a) * 30, cam.position.y - 0.4, cam.position.z + Math.cos(a) * 30);
        renderer.setViewport(x, H - top - mh, mw, mh); renderer.setScissor(x, H - top - mh, mw, mh);
        renderer.clearDepth(); renderer.render(scene, cam);
        const g = cv.getContext('2d'); g.save(); g.scale(-1, 1);
        g.drawImage(renderer.domElement, x * pr, top * pr, mw * pr, mh * pr, -cv.width, 0, cv.width, cv.height); g.restore();
      });
      renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.autoClear = prevAuto;
    }

    hideMirrors() { this.mir.forEach(cv => (cv.style.display = 'none')); }
  };
})();
