// Pneu individuel : adhérence = gomme × température × usure × pression × surface × météo.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const MU0 = 3.0;
  const SURF_MU = [1, 0.88, 0.5, 0.3]; // asphalte, vibreur, herbe, gravier
  const SURF_WET = [1, 0.8, 0.38, 0.3];

  A.Tire = class Tire {
    constructor(compound) { this.fit(compound); }

    fit(id) { // pneu neuf, préchauffé
      this.c = A.COMPOUNDS[id]; this.wear = 0; this.temp = 72; this.punct = 0; this.flat = 0; this.spin = 0;
    }
    get dead() { return this.wear >= 1; }

    // Facteurs unitaires (exposés pour l'IA et le HUD)
    tempFactor() { const x = (this.temp - this.c.opt) / this.c.win; return Math.max(0.62, 1 - 0.2 * x * x); }
    wearFactor() { const w = this.wear; return 1 - 0.22 * w - 0.4 * A.smooth(0.82, 1, w); }

    // pf : effet de pression (positif = pression basse)
    mu(Fz, wet, surf, pf, perfGrip) {
      const sf = (wet > 0.15 ? A.lerp(SURF_MU[surf], SURF_WET[surf], wet) : SURF_MU[surf]);
      const wg = surf === 2 || surf === 3 ? 1 : A.wetGrip(this.c.type, wet); // hors piste, c'est l'herbe qui compte
      return MU0 * this.c.mu * perfGrip * wg * sf * this.tempFactor() * this.wearFactor() * (1 + 0.06 * pf) * (1 - 0.55 * this.punct) * (1 - 0.15 * Math.min(1, this.flat))
        * Math.pow(Math.max(Fz, 300) / 4000, -0.07);
    }

    // P : puissance dissipée par glissement (W), Fz : charge, u : vitesse, air/wet : conditions
    thermal(dt, P, Fz, u, air, wet, pf, care) {
      const c = this.c, dry = 1 - wet, nonSlick = c.type !== 'slick';
      const heat = (0.2 * P + 0.003 * Fz * u) * (1 + 0.35 * pf) * (nonSlick ? 1 + 1.4 * dry : 1) + (this.punct > 0 ? 3000 * this.punct : 0);
      const cool = (5 + 0.3 * u) * (1 + 1.6 * wet) * (1 + Math.max(0, this.temp - air - 50) / 28);
      this.temp += ((heat - cool * (this.temp - air)) / 5200) * dt;
      const over = Math.max(0, (this.temp - c.opt) / c.win - 1.1);
      const wearRate = 3.8e-7 * c.wear * (1 + 0.4 * pf) * (1 + 1.8 * over) / care;
      this.wear = Math.min(1.05, this.wear + wearRate * (P / (1 + P / 3e4)) * dt);
    }
  };
})();
