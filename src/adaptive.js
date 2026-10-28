// Difficulté adaptative : compare le rythme du joueur à celui des bots et décale leur niveau (visible dans le HUD, désactivable).
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});

  A.Adaptive = class Adaptive {
    constructor(race, enabled) { this.race = race; this.on = enabled; this.delta = 0; this.dir = 0; this.hist = []; }

    // à chaque tour du joueur : lastT = son tour. On regarde son rythme relatif aux bots et sa position.
    onLap(player, lastT) {
      const R = this.race;
      if (!this.on || !lastT || player.lap < 3 || R.phase !== 'race' || R.rules.sc.mode) return;
      const bots = R.cars.filter(c => !c.isPlayer && !c.isSC && !c.dnf && c.last > 0 && c.lastClean);
      if (bots.length < 3) return;
      const ts = bots.map(c => c.last).sort((a, b) => a - b), med = ts[ts.length >> 1];
      const rel = lastT / med, n = R.cars.filter(c => !c.isSC).length;
      // cible : se battre au milieu du peloton ; très devant ou très derrière = on corrige
      const want = (player.pos - (n + 1) / 2) / n; // <0 devant, >0 derrière
      let step = 0;
      if (rel < 0.985 || want < -0.3) step = 0.12; else if (rel > 1.025 || want > 0.3) step = -0.12;
      if (rel < 0.97 && want < -0.4) step = 0.2;
      this.delta = A.clamp(this.delta + step, -1.5, 1.5); this.dir = Math.sign(step);
      this.apply();
    }

    apply() {
      const base = this.race.baseLevel;
      this.race.drivers.forEach(d => d.setLevel(A.clamp(base + d.jitter + this.delta, 0, 4)));
    }

    get label() { return A.DIFFS[Math.round(A.clamp(this.race.baseLevel + this.delta, 0, 4))].name; }
  };
})();
