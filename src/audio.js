// Audio procédural (Web Audio) : moteur, dérapages, vent, pluie, chocs, grésillement radio, bips. Démarre après un geste utilisateur.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const clamp = A.clamp;

  A.Audio = class Audio {
    constructor(settings) {
      this.set = settings; this.ok = false; this.ctx = null;
      this.vol = { master: 1, engine: 1, radio: 1 };
    }

    // à appeler dans un handler de clic/touche
    start() {
      if (this.ok) { this.ctx.state === 'suspended' && this.ctx.resume(); return; }
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      const x = (this.ctx = new AC()), n = x.sampleRate * 2, buf = x.createBuffer(1, n, x.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.master = x.createGain(); this.master.connect(x.destination);
      this.sfx = x.createGain(); this.sfx.connect(this.master);

      // moteur : deux dents de scie + un carré grave, filtre passe-bas
      this.eng = x.createGain(); this.eng.gain.value = 0;
      this.engF = x.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.Q.value = 2;
      this.oscs = [['sawtooth', 1, 0.5], ['sawtooth', 2.01, 0.25], ['square', 0.5, 0.35]].map(([type, mul, g]) => {
        const o = x.createOscillator(), gg = x.createGain(); o.type = type; gg.gain.value = g; o.connect(gg); gg.connect(this.engF); o.start(); return { o, mul };
      });
      this.engF.connect(this.eng); this.eng.connect(this.sfx);

      const loop = (type, freq, q) => {
        const s = x.createBufferSource(); s.buffer = buf; s.loop = true;
        const f = x.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
        const g = x.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
        return { f, g };
      };
      this.skid = loop('bandpass', 1100, 3); this.wind = loop('lowpass', 500); this.rain = loop('highpass', 3500); this.rumble = loop('lowpass', 160);
      this.setVolumes();
      this.ok = true;
    }

    setVolumes() {
      const a = this.set.audio;
      this.vol = { master: a.master, engine: a.engine, radio: a.radio };
      if (this.ok) this.master.gain.value = a.master;
    }

    // st : { car, rain (0-1), cockpit (bool), paused (bool) }
    update(dt, st) {
      if (!this.ok) return;
      const x = this.ctx, t = x.currentTime, c = st.car;
      if (st.paused || !c) { this.eng.gain.setTargetAtTime(0, t, 0.05); this.skid.g.gain.setTargetAtTime(0, t, 0.05); this.wind.g.gain.setTargetAtTime(0, t, 0.05); this.rumble.g.gain.setTargetAtTime(0, t, 0.05); return; }
      const rpm = c.rpm, thr = c.in.thr, f0 = rpm / 60, sp = c.speed, e = this.vol.engine * (st.cockpit ? 1 : 0.8);
      this.oscs.forEach(s => s.o.frequency.setTargetAtTime(f0 * s.mul, t, 0.03));
      this.engF.frequency.setTargetAtTime(500 + thr * 2200 + rpm * 0.1, t, 0.05);
      this.eng.gain.setTargetAtTime((0.1 + 0.16 * thr + 0.08 * clamp(rpm / 12000, 0, 1)) * e * (c.dnf ? 0 : 1) * (c.d.engine < 0.4 ? 0.8 : 1), t, 0.05);
      // dérapage / blocage de roues
      const sk = sp > 8 ? clamp((c.slip - 0.1) * 2.2, 0, 1) * 0.6 + (c.locked > 0 ? 0.35 : 0) : 0;
      this.skid.g.gain.setTargetAtTime(sk * 0.22, t, 0.04); this.skid.f.frequency.setTargetAtTime(800 + sp * 6, t, 0.1);
      // herbe / gravier / vibreurs
      const rough = c.surf.reduce((a, s) => a + (s ? 1 : 0), 0) / 4;
      this.rumble.g.gain.setTargetAtTime(rough * clamp(sp / 40, 0, 1) * 0.5, t, 0.05);
      this.wind.g.gain.setTargetAtTime(clamp((sp * sp) / 9000, 0, 1) * 0.18 * (st.cockpit ? 1 : 0.6), t, 0.1);
      this.wind.f.frequency.setTargetAtTime(300 + sp * 10, t, 0.1);
      this.rain.g.gain.setTargetAtTime(clamp(st.rain, 0, 1) * 0.12, t, 0.3);
    }

    _burst(dur, freq, type, g0, decay) {
      if (!this.ok) return;
      const x = this.ctx, s = x.createBufferSource(), f = x.createBiquadFilter(), g = x.createGain(), t = x.currentTime;
      s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.001, t + (decay || dur));
      s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random(), dur); return g;
    }

    thud(sev) {
      if (!this.ok) return;
      const k = clamp(sev / 25, 0.15, 1);
      this._burst(0.5, 600, 'lowpass', 0.8 * k, 0.45);
      const x = this.ctx, o = x.createOscillator(), g = x.createGain(), t = x.currentTime;
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.35); g.gain.setValueAtTime(0.7 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.45);
    }

    // grésillement de radio pendant dur secondes
    crackle(dur) {
      if (!this.ok || !this.set.audio.radioOn) return;
      const x = this.ctx, t = x.currentTime, s = x.createBufferSource(), f = x.createBiquadFilter(), g = x.createGain();
      s.buffer = this.noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
      for (let k = 0; k < dur * 30; k++) g.gain.setValueAtTime(Math.random() < 0.5 ? 0.03 * this.vol.radio : 0.1 * this.vol.radio * Math.random(), t + k / 30);
      g.gain.setValueAtTime(0, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
    }

    beep(freq, dur) {
      if (!this.ok) return;
      const x = this.ctx, o = x.createOscillator(), g = x.createGain(), t = x.currentTime;
      o.type = 'sine'; o.frequency.value = freq || 1000; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.1));
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + (dur || 0.1) + 0.02);
    }
  };
})();
