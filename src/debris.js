// Effets : débris physiques (pièces arrachées), étincelles, fumée de pneus, poussière, embruns, fumée moteur.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;

  // Système de particules GPU simple : un seul Points, taille et alpha par particule.
  class Particles {
    constructor(n, additive) {
      this.n = n; this.i = 0;
      this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
      this.life = new Float32Array(n); this.max = new Float32Array(n); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n);
      this.grav = new Float32Array(n); this.drag = new Float32Array(n);
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(this.p, 3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('color', new T.BufferAttribute(this.col, 4).setUsage(T.DynamicDrawUsage));
      g.setAttribute('size', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
      const mat = new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
        vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*(420.0/-mv.z); gl_Position=projectionMatrix*mv; }',
        fragmentShader: 'varying vec4 vC; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.2,d); if(a<0.01) discard; gl_FragColor=vec4(vC.rgb, vC.a*a); }',
      });
      this.mesh = new T.Points(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
      this.col.fill(0); this.life.fill(0);
    }
    spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, drag) {
      const k = this.i; this.i = (this.i + 1) % this.n;
      this.p[k * 3] = x; this.p[k * 3 + 1] = y; this.p[k * 3 + 2] = z; this.v[k * 3] = vx; this.v[k * 3 + 1] = vy; this.v[k * 3 + 2] = vz;
      this.life[k] = this.max[k] = life; this.s0[k] = s0; this.s1[k] = s1; this.a0[k] = a; this.grav[k] = grav; this.drag[k] = drag;
      this.col[k * 4] = r; this.col[k * 4 + 1] = g; this.col[k * 4 + 2] = b; this.col[k * 4 + 3] = a; this.size[k] = s0;
    }
    update(dt) {
      for (let k = 0; k < this.n; k++) {
        if (this.life[k] <= 0) { this.col[k * 4 + 3] = 0; continue; }
        this.life[k] -= dt;
        const f = 1 - this.life[k] / this.max[k], dr = Math.max(0, 1 - this.drag[k] * dt);
        this.v[k * 3] *= dr; this.v[k * 3 + 2] *= dr; this.v[k * 3 + 1] = this.v[k * 3 + 1] * dr - this.grav[k] * dt;
        this.p[k * 3] += this.v[k * 3] * dt; this.p[k * 3 + 1] = Math.max(0.02, this.p[k * 3 + 1] + this.v[k * 3 + 1] * dt); this.p[k * 3 + 2] += this.v[k * 3 + 2] * dt;
        this.size[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * f;
        this.col[k * 4 + 3] = this.a0[k] * (1 - f) * (1 - f);
      }
      const at = this.mesh.geometry.attributes; at.position.needsUpdate = at.color.needsUpdate = at.size.needsUpdate = true;
    }
  }

  A.Fx = class Fx {
    constructor(scene) {
      this.scene = scene;
      this.sparks = new Particles(500, true); this.smoke = new Particles(1200, false);
      scene.add(this.sparks.mesh, this.smoke.mesh);
      this.debris = []; this.hazards = []; this.acc = 0;
    }

    spark(x, y, z, vx, vz, n) {
      for (let k = 0; k < n; k++) this.sparks.spawn(x, y, z, vx * 0.3 + A.rand(-5, 5), A.rand(1, 5), vz * 0.3 + A.rand(-5, 5), A.rand(0.25, 0.7), 0.35, 0.1, 1, A.rand(0.6, 0.85), 0.25, 1, 14, 1.5);
    }
    puff(x, y, z, vx, vz, r, g, b, a, size, life) {
      this.smoke.spawn(x + A.rand(-0.2, 0.2), y, z + A.rand(-0.2, 0.2), vx * 0.2 + A.rand(-0.5, 0.5), A.rand(0.4, 1.4), vz * 0.2 + A.rand(-0.5, 0.5), life, size, size * 3.2, r, g, b, a, -0.3, 1.2);
    }

    // Pièce arrachée : copie visuelle de la pièce du modèle + mouvement balistique
    detach(car, m, part) {
      if (!m) return;
      const mesh = A.clonePart(m, part);
      if (!mesh) return;
      const sh = Math.sin(car.h), ch = Math.cos(car.h);
      const at = { fw: [0, 0.2, 0], rw: [0, 0, 0], mirL: [0.5, 0.74, 0.9], mirR: [-0.5, 0.74, 0.9] };
      let lx, ly, lz;
      if (part.startsWith('wheel')) { const w = +part[5]; lx = A.WHEEL_MX[w]; ly = A.WHEEL_R[w]; lz = A.WHEEL_MZ[w]; }
      else { [lx, ly, lz] = at[part]; }
      const vx = car.u * sh + car.v * ch, vz = car.u * ch - car.v * sh, big = part.startsWith('wheel') || part === 'fw' || part === 'rw';
      mesh.position.set(car.x + sh * lz + ch * lx, car.height + ly + 0.05, car.z + ch * lz - sh * lx);
      mesh.rotation.set(0, car.h, 0, 'YXZ');
      this.scene.add(mesh);
      const o = { mesh, vx: vx * 0.8 + A.rand(-4, 4), vy: A.rand(2, 6), vz: vz * 0.8 + A.rand(-4, 4), wx: A.rand(-8, 8), wy: A.rand(-6, 6), wz: A.rand(-8, 8), life: 45, rest: false, big, part, r: part.startsWith('wheel') ? 0.35 : 0.9 };
      if (part.startsWith('wheel')) { o.wx = -vz * 0.8 / 0.35 * 0.5; o.vy = A.rand(1, 3); }
      this.debris.push(o);
      this.spark(mesh.position.x, 0.2, mesh.position.z, vx, vz, 14);
    }

    update(dt) {
      for (let k = this.debris.length - 1; k >= 0; k--) {
        const o = this.debris[k], m = o.mesh;
        o.life -= dt;
        if (o.life <= 0) { this.scene.remove(m); this.debris.splice(k, 1); const h = this.hazards.indexOf(o); if (h >= 0) this.hazards.splice(h, 1); continue; }
        if (o.life < 2) m.scale.setScalar(o.life / 2);
        if (o.rest) continue;
        o.vy -= 9.81 * dt;
        m.position.x += o.vx * dt; m.position.y += o.vy * dt; m.position.z += o.vz * dt;
        m.rotation.x += o.wx * dt; m.rotation.y += o.wy * dt; m.rotation.z += o.wz * dt;
        if (m.position.y < 0.12) {
          m.position.y = 0.12;
          if (Math.abs(o.vy) > 2.5) this.spark(m.position.x, 0.15, m.position.z, o.vx, o.vz, 4);
          o.vy = -o.vy * 0.3; const f = Math.max(0, 1 - 2.2 * dt); o.vx *= f; o.vz *= f; o.wx *= f; o.wy *= f; o.wz *= f;
          if (Math.hypot(o.vx, o.vz) < 0.6 && Math.abs(o.vy) < 0.8) { o.rest = true; m.rotation.x = m.rotation.z = 0; if (o.big) this.hazards.push(o); }
        }
      }
      this.sparks.update(dt); this.smoke.update(dt);
    }

    // Fumée et poussière d'une voiture (appelé pour les voitures proches de la caméra)
    carFx(car, wet, dt) {
      const sh = Math.sin(car.h), ch = Math.cos(car.h), sp = Math.abs(car.u), vx = car.u * sh + car.v * ch, vz = car.u * ch - car.v * sh;
      this.acc += dt;
      for (let w = 0; w < 4; w++) {
        if (!car.d.wheel[w]) { if (sp > 8 && Math.random() < dt * 40) this.spark(car.x + sh * A.WHEEL_X[w], 0.1, car.z + ch * A.WHEEL_X[w], vx, vz, 3); continue; }
        const wx = car.x + sh * A.WHEEL_X[w] + ch * A.WHEEL_Y[w], wz = car.z + ch * A.WHEEL_X[w] - sh * A.WHEEL_Y[w], sf = car.surf[w];
        if (sp > 10 && (sf === 2 || sf === 3) && Math.random() < dt * 22) this.puff(wx, 0.15, wz, vx * 0.3, vz * 0.3, sf === 3 ? 0.72 : 0.35, sf === 3 ? 0.65 : 0.5, sf === 3 ? 0.5 : 0.28, 0.45, 0.8, 1.4);
        else if ((car.locked > 0 && w < 2 || car.spun > 0 && w > 1) && sp > 8 && Math.random() < dt * 40) this.puff(wx, 0.1, wz, vx * 0.1, vz * 0.1, 0.85, 0.85, 0.85, 0.5, 0.7, 1.1);
        else if (wet > 0.3 && sp > 35 && w > 1 && Math.random() < dt * 30 * wet) this.puff(wx, 0.2, wz, vx * 0.05, vz * 0.05, 0.8, 0.85, 0.9, 0.22, 0.9, 1.2);
      }
      const e = car.d.engine;
      if (e < 0.6 && Math.random() < dt * 25) {
        const fx = car.x - sh * 1.5, fz = car.z - ch * 1.5;
        if (e < 0.35) this.sparks.spawn(fx, 0.8, fz, vx * 0.4, 2, vz * 0.4, 0.35, 0.5, 0.1, 1, 0.5, 0.1, 1, -1, 1);
        this.puff(fx, 0.8, fz, vx * 0.4, vz * 0.4, 0.2, 0.2, 0.2, 0.6, 0.6, 1.6);
      }
    }
  };
})();
