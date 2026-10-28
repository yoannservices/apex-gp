// Course complète sans rendu : 20 voitures, départ, collisions, stands, safety car, classement. Usage : node race-check.js [circuit] [tours] [niveau] [pluie 0-1]
const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js', 'config.js', 'tires.js', 'carPhysics.js', 'damage.js', 'car.js', 'tracks.js', 'track.js', 'racingLine.js', 'driver.js', 'collision.js', 'debris.js', 'rules.js', 'pitStop.js', 'adaptive.js', 'race.js'].forEach(f => require(path.join('..', 'src', f)));
const A = globalThis.AGP;
const id = process.argv[2] || 'velocita', laps = +process.argv[3] || 4, lv = +(process.argv[4] ?? 2), wet0 = +process.argv[5] || 0;
const def = A.TRACK_DEFS.find(d => d.id === id), tr = new A.Track(def);
const set = Object.assign({}, A.DEFAULT_SETTINGS, { diff: lv, adaptive: true });
const race = new A.Race({ tr, settings: set, mode: 'race', laps, wet0 });
race.env.wet = wet0;
const ev = {}; race.on((t, d) => { ev[t] = (ev[t] || 0) + 1; if (['sc', 'dnf', 'penalty', 'missed'].includes(t)) console.log(`  [${race.clock.toFixed(0)}s] ${t}`, d.car ? d.car.name : '', d.on != null ? d.on : d.why || ''); });
const p = race.player;
const H = 1 / 60;
let nan = false, t = 0;
while (t < 60 * 20 * laps && !race.resultsDone) {
  // joueur : auto-pilote pour le test
  if (race.phase === 'race' || race.phase === 'finished') p.auto_ap = true;
  race.update(H); t += H;
  if (race.cars.some(c => [c.x, c.z, c.u, c.h].some(Number.isNaN))) { nan = true; break; }
}
console.log(`${id} ${laps} tours, ${t.toFixed(0)}s sim, phase=${race.phase}, NaN=${nan}`);
console.log('events', JSON.stringify(ev));
const res = race.results || [];
res.slice(0, 20).forEach(r => console.log(String(r.pos).padStart(2), r.car.name.padEnd(14), r.time ? r.time.toFixed(1) : 'DNF/--', 'laps', r.laps, 'best', r.best ? r.best.toFixed(2) : '-', 'pen', r.pen, 'stops', r.car.pit.stops, 'dmg', A.damageScore(r.car.d).toFixed(2), 'pts', r.points));
if (!res.length) race.byPos().forEach(c => console.log(c.pos, c.name, 'lap', c.lap, c.dist.toFixed(0), c.dnf ? 'DNF' : ''));
process.exit(nan || !res.length ? 1 : 0);
