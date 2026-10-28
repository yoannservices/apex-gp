// Ciel, lumières, brouillard, nuages, pluie, nuit et humidité de la piste. Météo fixe ou dynamique (planning aléatoire).
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;
  const lin = c => c.map(v => Math.pow(v, 2.2)), mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgb = h => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
  const SKY = { day: [rgb(0x2f74d0), rgb(0xb4d2ee)], over: [rgb(0x7c8794), rgb(0xaab1b9)], rain: [rgb(0x464d55), rgb(0x6e757d)], night: [rgb(0x03050d), rgb(0x16203a)] };

  A.Weather = class Weather {
    constructor(scene, renderer, tr, cfg, env) {
      this.scene = scene; this.tr = tr; this.env = env; this.mode = cfg.weather; this.nightT = cfg.night ? 1 : 0; this.night = cfg.night ? 1 : 0;
      this.cloud = 0.1; this.rain = 0; this.wet = 0; this.t = 0; this.plan = []; this.wind = 0;
      this.tCloud = 0.1; this.tRain = 0;
      if (this.mode === 'cloud') this.tCloud = this.cloud = 0.65;
      if (this.mode === 'rain') { this.tCloud = this.cloud = 1; this.tRain = this.rain = 0.75; this.wet = 0.7; }
      if (this.mode === 'dynamic') this._plan();

      // ciel
      this.skyMat = new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new T.Vector3() }, hor: { value: new T.Vector3() }, sun: { value: new T.Vector3(0, 1, 0) }, sunC: { value: new T.Vector3(1, 0.95, 0.8) }, sunA: { value: 1 } },
        vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top,hor,sun,sunC; uniform float sunA; varying vec3 vD; void main(){ float h=clamp(vD.y,0.0,1.0); vec3 c=mix(hor,top,pow(h,0.55)); float s=max(dot(normalize(vD),sun),0.0); c+=sunC*sunA*(pow(s,900.0)*3.0+pow(s,12.0)*0.25); if(vD.y<0.0) c=hor; gl_FragColor=vec4(c,1.0); }',
      });
      this.sky = new T.Mesh(new T.SphereGeometry(3500, 24, 12), this.skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; scene.add(this.sky);

      this.hemi = new T.HemisphereLight(0xcfe3ff, 0x4a5a40, 0.6); scene.add(this.hemi);
      this.sunL = new T.DirectionalLight(0xfff2d8, 1.1); this.sunL.castShadow = renderer.shadowMap.enabled;
      const sc = this.sunL.shadow.camera; sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 10; sc.far = 450;
      this.sunL.shadow.mapSize.set(2048, 2048); this.sunL.shadow.bias = -0.0005; this.sunL.shadow.normalBias = 0.05;
      scene.add(this.sunL, this.sunL.target);
      this.sunDir = new T.Vector3(0.45, 0.75, 0.3).normalize();
      scene.fog = new T.Fog(0xb4d2ee, 400, 2600);

      // étoiles
      const st = new Float32Array(900);
      for (let i = 0; i < 300; i++) { const a = Math.random() * 6.283, e = Math.asin(Math.random() * 0.95 + 0.05), r = 3300; st[i * 3] = Math.cos(a) * Math.cos(e) * r; st[i * 3 + 1] = Math.sin(e) * r; st[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
      const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(st, 3));
      this.stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false })); this.stars.frustumCulled = false; scene.add(this.stars);

      // nuages (sprites plats très haut)
      const ct = A.canvasTex(128, 128, (c, w, h) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
      this.clouds = new T.Group();
      for (let i = 0; i < 40; i++) {
        const m = new T.Sprite(new T.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
        const s = A.rand(500, 1100); m.scale.set(s, s * 0.45, 1); m.position.set(A.rand(-2800, 2800), A.rand(550, 800), A.rand(-2800, 2800)); m.userData.k = Math.random();
        this.clouds.add(m);
      }
      scene.add(this.clouds);

      // pluie
      this.N = 2600; this.rp = new Float32Array(this.N * 6); this.rl = new Float32Array(this.N * 3); // rl : position locale (autour de la caméra)
      for (let i = 0; i < this.N; i++) { this.rl[i * 3] = A.rand(-40, 40); this.rl[i * 3 + 1] = A.rand(-6, 36); this.rl[i * 3 + 2] = A.rand(-40, 40); }
      const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(this.rp, 3).setUsage(T.DynamicDrawUsage));
      this.rainMesh = new T.LineSegments(rg, new T.LineBasicMaterial({ color: 0xc8d6e4, transparent: true, opacity: 0.4, fog: false, depthWrite: false })); this.rainMesh.frustumCulled = false; this.rainMesh.renderOrder = 4; scene.add(this.rainMesh);

      this.head = null;
      this._apply(0, true);
    }

    // planning aléatoire : [temps, pluie cible, nuages cibles]
    _plan() {
      let t = A.rand(70, 200);
      const n = 1 + (Math.random() < 0.6 ? 1 : 0);
      this.plan = [];
      for (let k = 0; k < n; k++) {
        const r = A.rand(0.35, 1);
        this.plan.push({ t: t - 40, rain: 0, cloud: 0.85 }, { t, rain: r, cloud: 1 }, { t: t + A.rand(150, 320), rain: 0, cloud: 0.4 });
        t += A.rand(500, 800);
      }
    }

    // prévision pour la radio : { in: secondes avant pluie } ou { end: secondes avant arrêt }
    forecast() {
      for (const e of this.plan) if (e.t > this.t && e.rain > 0.2 && this.rain < 0.2) return { rainIn: e.t - this.t, level: e.rain };
      for (const e of this.plan) if (e.t > this.t && e.rain === 0 && this.rain > 0.2) return { dryIn: e.t - this.t };
      return null;
    }

    attachHeadlight(root) {
      if (this.head) return;
      const s = new T.SpotLight(0xfff0d0, 0, 110, 0.55, 0.6, 1.2); s.position.set(0, 0.8, 2.5); const tg = new T.Object3D(); tg.position.set(0, 0, 40); root.add(s, tg); s.target = tg;
      this.head = s;
    }

    update(dt, cam, focus) {
      this.t += dt;
      for (const e of this.plan) if (this.t >= e.t) { this.tRain = e.rain; this.tCloud = e.cloud; }
      this.cloud += A.clamp(this.tCloud - this.cloud, -dt / 50, dt / 50);
      this.rain += A.clamp(this.tRain - this.rain, -dt / 35, dt / 25);
      this.wet = A.clamp(this.wet + (this.rain - this.wet) * dt / (this.rain > this.wet ? 40 : 160) + (this.rain > this.wet ? dt * 0.002 : -dt * 0.001), 0, 1);
      this._apply(dt, false, cam, focus);
    }

    _apply(dt, init, cam, focus) {
      const n = this.night, ov = A.clamp(this.cloud * 0.85, 0, 1), rn = A.clamp(this.rain * 1.1, 0, 1);
      let top = mix(mix(SKY.day[0], SKY.over[0], ov), SKY.rain[0], rn), hor = mix(mix(SKY.day[1], SKY.over[1], ov), SKY.rain[1], rn);
      top = mix(top, SKY.night[0], n); hor = mix(hor, SKY.night[1], n);
      const u = this.skyMat.uniforms; u.top.value.set(...top); u.hor.value.set(...hor); u.sun.value.copy(this.sunDir);
      u.sunA.value = (1 - ov) * (1 - n); u.sunC.value.set(1, 0.93, 0.78);
      const f = this.scene.fog; f.color.setRGB(...lin(hor)); f.far = A.lerp(A.lerp(2600, 1100, ov), 650, rn) * (1 - 0.35 * n); f.near = f.far * 0.12;
      this.hemi.intensity = A.lerp(A.lerp(0.62, 0.5, ov), 0.4, n); this.hemi.color.setRGB(...lin(mix([0.8, 0.88, 1], [0.35, 0.45, 0.75], n))); this.hemi.groundColor.setRGB(...lin(mix([0.3, 0.36, 0.25], [0.08, 0.1, 0.16], n)));
      this.sunL.intensity = A.lerp(1.15 * (1 - 0.7 * ov), 0.28, n); this.sunL.color.setRGB(...lin(mix([1, 0.95, 0.85], [0.55, 0.65, 1], n)));
      this.stars.material.opacity = n * (1 - ov); this.stars.visible = n > 0.05;
      if (this.head) this.head.intensity = n * 2.4;
      if (this.tr.lampMat) this.tr.lampMat.color.setRGB(...lin(mix([0.4, 0.4, 0.37], [1, 0.92, 0.7], n)));
      this.tr.setWet(this.wet);
      this.env.wet = this.wet; this.env.air = A.lerp(A.lerp(27, 19, ov), 13, rn) - 7 * n;
      const dark = 1 - 0.5 * ov - 0.2 * rn;
      for (const c of this.clouds.children) { c.material.opacity = A.clamp((this.cloud * 1.3 - c.userData.k * 0.5) * 0.9, 0, 0.92) * (n > 0.5 ? 0.15 : 1); const g = (n > 0.5 ? 0.3 : 1) * (0.75 + 0.25 * dark) * (1 - 0.45 * rn); c.material.color.setRGB(g, g, g); }
      if (!cam) return;
      this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
      this.wind += dt * 6;
      for (const c of this.clouds.children) { c.position.x += dt * 6; if (c.position.x > 2800) c.position.x -= 5600; }
      this.clouds.position.set(cam.position.x * 0.9, 0, cam.position.z * 0.9);
      if (focus) { this.sunL.target.position.set(focus.x, 0, focus.z); this.sunL.position.set(focus.x + this.sunDir.x * 160, this.sunDir.y * 160, focus.z + this.sunDir.z * 160); this.sunL.target.updateMatrixWorld(); }
      // pluie autour de la caméra
      const cnt = Math.floor(this.N * rn), rp = this.rp, rl = this.rl, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      this.rainMesh.visible = cnt > 0;
      if (cnt > 0) {
        this.rainMesh.geometry.setDrawRange(0, cnt * 2);
        for (let i = 0; i < cnt; i++) {
          let y = rl[i * 3 + 1] - 26 * dt;
          if (y < -6) { y += 42; rl[i * 3] = A.rand(-40, 40); rl[i * 3 + 2] = A.rand(-40, 40); }
          rl[i * 3 + 1] = y;
          const bx = cx + rl[i * 3], by = cy + y, bz = cz + rl[i * 3 + 2];
          rp[i * 6] = bx; rp[i * 6 + 1] = by; rp[i * 6 + 2] = bz; rp[i * 6 + 3] = bx + 0.08; rp[i * 6 + 4] = by + 0.9; rp[i * 6 + 5] = bz + 0.03;
        }
        this.rainMesh.geometry.attributes.position.needsUpdate = true;
      }
    }
  };
})();
