// Arrêts au stand : machine à états (0 piste, 1 voie des stands, 2 arrêt, 3 sortie), stratégie des bots, équipe de mécaniciens animée.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;
  const WR = { S: 1.0, M: 0.62, H: 0.4 };

  // ---------- équipe de mécaniciens (une par emplacement, créée à la demande) ----------
  class Crew {
    constructor(scene, color) {
      this.g = new T.Group(); this.g.visible = false; scene.add(this.g);
      const suit = new T.MeshStandardMaterial({ color, roughness: 0.8 }), dark = new T.MeshStandardMaterial({ color: 0x1a1b1f }), helm = new T.MeshStandardMaterial({ color: 0xf0f0f0 });
      const man = () => {
        const m = new T.Group();
        const b = new T.Mesh(new T.BoxGeometry(0.45, 0.9, 0.3), suit); b.position.y = 0.95; m.add(b);
        const l = new T.Mesh(new T.BoxGeometry(0.4, 0.5, 0.25), dark); l.position.y = 0.25; m.add(l);
        const h = new T.Mesh(new T.SphereGeometry(0.17, 8, 6), helm); h.position.y = 1.62; m.add(h);
        const gun = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.4), dark); gun.position.set(0, 1.0, 0.35); m.add(gun);
        const tire = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.4, 12).rotateZ(Math.PI / 2), dark); tire.position.set(0, 0.85, 0.5); tire.visible = false; m.add(tire);
        m.userData = { gun, tire }; this.g.add(m); return m;
      };
      this.men = [0, 1, 2, 3].map(man); this.jackF = man(); this.jackR = man();
      this.lolli = man(); const sign = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.04, 14).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0xd01010 })); sign.position.set(0, 2.1, 0.4); this.lolli.add(sign); this.sign = sign;
    }
    start(car) { this.car = car; this.g.visible = true; this.g.position.set(car.x, car.height, car.z); this.g.rotation.y = car.h; }
    // t : temps écoulé, D : durée totale. Repère local : +Z avant, +X gauche (côté stands).
    pose(t, D) {
      const WZ = A.WHEEL_MZ, WX = A.WHEEL_MX, car = this.car;
      for (let w = 0; w < 4; w++) {
        const m = this.men[w], side = Math.sign(WX[w]), tx = side * 1.25, tz = WZ[w], sx = side * 5.5;
        const come = A.smooth(0, 0.5, t), go = A.smooth(D - 0.5, D - 0.1, t), hold = Math.min(1, come) * (1 - go);
        m.position.set(A.lerp(sx, tx, hold), 0, tz + (1 - hold) * -1.5 * (w >> 1 ? 1 : -1));
        m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        const ud = m.userData, old = t > 0.85 && t < 1.7, fresh = t >= 1.7 && t < 2.1;
        ud.tire.visible = old || fresh; ud.tire.position.z = 0.5 + (old ? 0.5 * A.smooth(0.85, 1.4, t) : 0.5 * (1 - A.smooth(1.7, 2.1, t)));
        ud.gun.rotation.z = t > 0.5 && t < D - 0.4 ? Math.sin(t * 90) * 0.6 : 0;
      }
      const fj = this.jackF, rj = this.jackR, lift = A.smooth(0.3, 0.6, t) * (1 - A.smooth(D - 0.55, D - 0.3, t));
      fj.position.set(0, 0, 3.3 + (1 - A.smooth(0, 0.4, t)) * 3 + A.smooth(D - 0.3, D, t) * 3); fj.rotation.y = Math.PI; rj.position.set(0, 0, -3.2 - (1 - A.smooth(0, 0.4, t)) * 3 - A.smooth(D - 0.3, D, t) * 3);
      this.lolli.position.set(0, 0, 4.4); this.lolli.rotation.y = Math.PI;
      this.sign.material.color.setHex(t > D - 0.2 ? 0x10d040 : 0xd01010);
      if (car) car.lift = 0.1 * lift;
    }
    end() { this.g.visible = false; if (this.car) this.car.lift = 0; this.car = null; }
  }

  A.Pits = class Pits {
    constructor(race) { this.race = race; this.tr = race.tr; this.crews = new Map(); this.done = 0; }

    inLane(c) { return this.tr.pitOff[c.idx] > 1 && c.lat > this.tr.hw + 1.0; }

    // Conseil d'arrêt : { want, tire, why } d'après l'usure, les dégâts, la météo et la règle des deux gommes
    advise(c) {
      const R = this.race, wet = R.env.wet, type = c.tires[0].c.type, left = R.laps - (c.lap - 1), done = Math.max(0.5, c.lap - 1 + c.s / this.tr.L - (c.stintLap || 0));
      const wr = Math.max(...c.tires.map(t => t.wear)), dam = A.damageScore(c.d), res = { want: false, tire: null, why: '' };
      const dry = () => {
        const perLap = Math.max(0.01, (c.avgWear) / done) / WR[c.compound in WR ? c.compound : 'M'];
        let best = 'H';
        for (const k of ['S', 'M', 'H']) if (k !== (res.must ? c.compound : '') && perLap * WR[k] * (left - 0.5) < 0.82) { best = k; break; }
        return best;
      };
      if (type === 'slick' && wet > 0.62) { res.want = true; res.tire = 'W'; res.why = 'wet'; }
      else if (type === 'slick' && wet > 0.28) { res.want = true; res.tire = 'I'; res.why = 'wet'; }
      else if (type === 'inter' && wet > 0.78) { res.want = true; res.tire = 'W'; res.why = 'wet'; }
      else if (type === 'inter' && wet < 0.1) { res.want = true; res.tire = dry(); res.why = 'dry'; }
      else if (type === 'wet' && wet < 0.4) { res.want = true; res.tire = wet < 0.12 ? dry() : 'I'; res.why = 'dry'; }
      if (!res.want && left > 1.5) {
        const lim = 0.64 + ((c.id * 7) % 5) * 0.035;
        if (wr > lim && left > 2) { res.want = true; res.why = 'wear'; }
        else if (dam > 0.3 || c.d.wheel.some(w => !w) || c.d.fwOff) { res.want = true; res.why = 'damage'; }
        else if (type === 'slick' && wet < 0.1 && R.laps >= 4 && c.usedDry().size < 2 && left <= Math.max(2, Math.ceil(R.laps * 0.5))) { res.want = true; res.must = true; res.why = 'rule'; }
        if (res.want) res.tire = dry();
      }
      return res;
    }

    request(c, tire) { c.pit.want = true; c.pit.tire = tire || (this.advise(c).tire) || (c.tires[0].c.type === 'slick' ? c.compound : 'M'); }
    cancel(c) { if (c.pit.state < 2) c.pit.want = false; }

    // appelée à chaque passage de ligne pour les bots
    strategy(c) {
      if (c.isPlayer || c.isSC || c.dnf || c.pit.state || c.pit.want || c.lap < 2) return;
      const a = this.advise(c);
      if (a.want) { c.pit.want = true; c.pit.tire = a.tire || 'M'; }
    }

    _plan(c) {
      const d = c.d, fw = Math.min(d.fw, d.rw) < 0.85 || d.fwOff || d.rwOff, fix = d.wheel.some(w => !w) || d.susp.some(s => s < 0.7) || d.floor < 0.7;
      return { dur: 2.2 + Math.random() * 0.5 + (fw ? 3.5 : 0) + (fix ? 4 : 0), wing: fw, all: fix };
    }

    update(dt) {
      const R = this.race, tr = this.tr;
      for (const c of R.cars) {
        if (c.isSC || c.dnf || c.idx < 0) continue;
        const p = c.pit, rel = tr.rel(c.s), lane = this.inLane(c), slotS = p.slot >= 0 ? tr.pitSlotS(p.slot) : 0;
        if (p.state === 0) {
          if (!c.isPlayer && p.want && rel > -345 && rel < -300 && R.phase === 'race') { p.state = 1; p.leaving = false; }
          else if (c.isPlayer && lane && rel > -300 && rel < 0) { p.state = 1; p.leaving = false; R.emit('pitin', { car: c }); }
        }
        if (p.state === 1) {
          c.limiter = rel > -230 && rel < 230 && (!c.isPlayer || c.assists.limiter);
          const stopped = Math.abs(c.u) < (c.isPlayer ? 0.8 : 0.5) && Math.abs(rel - slotS) < (c.isPlayer ? 3.5 : 1.5);
          if (p.want && stopped) {
            const pl = this._plan(c); p.t = 0; p.dur = pl.dur; p.plan = pl; p.swapped = false; p.state = 2;
            if (R.scene) { let cr = this.crews.get(p.slot); if (!cr) { cr = new Crew(R.scene, c.team.color); this.crews.set(p.slot, cr); } cr.start(c); p.crew = cr; }
            R.emit('service', { car: c, dur: pl.dur });
          } else if (rel > slotS + (p.want ? 9 : 3)) { p.leaving = true; p.state = 3; if (p.want) R.emit('missed', { car: c }); }
          else if (!lane && rel > -190 && c.isPlayer) { p.state = 0; c.limiter = false; } // l'a retraversé la piste
        } else if (p.state === 2) {
          p.t += dt; c.limiter = true;
          if (p.crew) p.crew.pose(p.t, p.dur);
          if (!p.swapped && p.t > 1.3) { // roues changées
            p.swapped = true;
            const keepId = p.tire || c.compound;
            c.fit(keepId); c.stint++; c.stintLap = c.lap - 1 + c.s / tr.L;
          }
          if (p.t >= p.dur) {
            if (p.plan.wing || p.plan.all) A.repair(c, { wing: p.plan.wing, all: p.plan.all });
            p.state = 3; p.want = false; p.tire = null; p.stops++; p.count++; p.leaving = true; this.done++;
            if (p.crew) { p.crew.end(); p.crew = null; }
            R.emit('pitout', { car: c, dur: p.dur });
          }
        } else if (p.state === 3) {
          c.limiter = rel < 230 && (!c.isPlayer || c.assists.limiter);
          if (rel > 230 || rel < -100) { p.state = 0; p.leaving = false; c.limiter = false; }
        }
      }
    }
  };
})();
