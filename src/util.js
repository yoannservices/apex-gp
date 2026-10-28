// Utilitaires partagés : maths, formatage, textures canvas, fusion de géométries.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  A.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  A.lerp = (a, b, t) => a + (b - a) * t;
  A.smooth = (a, b, x) => { const t = A.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  A.wrap = a => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; };
  A.rand = (a, b) => a + Math.random() * (b - a);
  A.pick = arr => arr[(Math.random() * arr.length) | 0];
  A.sign = v => (v < 0 ? -1 : 1);

  A.fmt = t => {
    if (t == null || !isFinite(t)) return '-:--.---';
    const m = Math.floor(t / 60);
    return m + ':' + (t - m * 60).toFixed(3).padStart(6, '0');
  };
  A.fmtGap = t => (t == null || !isFinite(t) ? '--' : (t >= 0 ? '+' : '-') + Math.abs(t).toFixed(3));

  A.canvasTex = (w, h, draw, rx = 1, ry = 1) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  };
  A.speckle = (ctx, w, h, n, colors, size) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
      ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
  };

  // Pièce de géométrie : { g, color, m } — fusionnée ensuite par A.merge.
  A.part = (g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => ({
    g, color,
    m: new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz)),
  });
  A.box = (w, h, d, color, x, y, z, rx, ry, rz) => A.part(new T.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  A.cyl = (rt, rb, h, seg, color, x, y, z, rx, ry, rz) => A.part(new T.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz);

  // Fusionne des parts en une seule BufferGeometry non indexée avec couleurs par sommet.
  A.merge = parts => {
    const gs = parts.map(p => { const g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); g.applyMatrix4(p.m); return g; });
    let n = 0;
    gs.forEach(g => (n += g.attributes.position.count));
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
    const c = new T.Color();
    let o = 0;
    gs.forEach((g, k) => {
      const cnt = g.attributes.position.count;
      P.set(g.attributes.position.array, o * 3);
      N.set(g.attributes.normal.array, o * 3);
      c.set(parts[k].color);
      for (let i = 0; i < cnt; i++) { C[(o + i) * 3] = c.r; C[(o + i) * 3 + 1] = c.g; C[(o + i) * 3 + 2] = c.b; }
      o += cnt;
      g.dispose();
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(P, 3));
    out.setAttribute('normal', new T.BufferAttribute(N, 3));
    out.setAttribute('color', new T.BufferAttribute(C, 3));
    out.computeBoundingSphere();
    return out;
  };

  A.disposeObj = o => o.traverse(c => { if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose(); });
})();
