// Modes de jeu : configuration de session (course, contre-la-montre, essais, qualifs, championnat) et état du championnat.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});

  const RAIN0 = { sun: 0, cloud: 0, rain: 0.7, dynamic: 0 };

  // kind : race | tt | practice | quali. Renvoie la config de A.Race (hors scène).
  A.Modes = {
    config(kind, set, tr, opt) {
      opt = opt || {};
      const base = { tr, settings: set, wet0: RAIN0[set.weather] || 0, rolling: set.start === 'rolling' };
      if (kind === 'race') return Object.assign(base, { mode: 'race', laps: opt.laps || set.laps, playerGrid: opt.playerGrid });
      if (kind === 'quali') return Object.assign(base, { mode: 'quali', laps: 2, rolling: false });
      if (kind === 'tt') return Object.assign(base, { mode: 'practice', bots: 0, rolling: false });
      return Object.assign(base, { mode: 'practice', bots: 5, rolling: false }); // practice
    },

    // Temps au tour estimé d'un bot sur ce circuit : somme ds/vmax, ramenée au rythme du pilote.
    botLap(race, k) {
      const L = race.line, ds = race.tr.ds, drv = A.DRIVERS[k], lv = A.diffAt(race.baseLevel);
      let t = 0;
      for (let i = 0; i < race.tr.N; i++) t += ds / L.vmax[i];
      const style = { prudent: 0.985, regulier: 1, agressif: 1.005, cannibale: 1.005 }[drv.style] || 1;
      return (t / (lv.pace * style * drv.skill)) * (1 + 0.025 * (Math.random() - 0.4)) + 1.2;
    },

    // Place sur la grille d'après le meilleur tour du joueur en qualifs
    gridFromQuali(race) {
      const p = race.player, t = p && p.best;
      if (!t) return 19;
      let ahead = 0;
      for (let k = 0; k < 19; k++) if (A.Modes.botLap(race, k) < t) ahead++;
      return ahead;
    },
  };

  // ---------- Championnat : un Grand Prix par circuit, points par pilote et par écurie ----------
  const KEY = 'champ';
  A.Champ = {
    state() { return A.Save.get(KEY, null); },
    start(set) { const s = { round: 0, drivers: {}, teams: {}, hist: [], name: set.name, team: set.team }; A.Save.set(KEY, s); return s; },
    reset() { A.Save.del(KEY); },
    track() { const s = this.state(); return s ? A.TRACK_DEFS[s.round] : null; },
    finished() { const s = this.state(); return !!s && s.round >= A.TRACK_DEFS.length; },
    add(results, trackName) {
      const s = this.state(); if (!s) return null;
      results.forEach(r => {
        const n = r.car.name; s.drivers[n] = (s.drivers[n] || { pts: 0, team: r.car.teamIdx, wins: 0 });
        s.drivers[n].pts += r.points; if (r.pos === 1 && !r.dnf) s.drivers[n].wins++;
        s.teams[r.car.teamIdx] = (s.teams[r.car.teamIdx] || 0) + r.points;
      });
      s.hist.push({ track: trackName, winner: results[0].car.name });
      s.round++; A.Save.set(KEY, s);
      return s;
    },
    drivers() { const s = this.state(); return s ? Object.keys(s.drivers).map(n => Object.assign({ name: n }, s.drivers[n])).sort((a, b) => b.pts - a.pts || b.wins - a.wins) : []; },
    teams() { const s = this.state(); return s ? Object.keys(s.teams).map(k => ({ team: +k, pts: s.teams[k] })).sort((a, b) => b.pts - a.pts) : []; },
  };
})();
