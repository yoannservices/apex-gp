// Classe les contacts voiture-voiture par cause. Usage : node contacts.js [circuit] [tours] [niveau] [apex|moto]
const path = require('path');
const game = process.argv[5] || 'apex', G = game === 'moto' ? 'MGP' : 'AGP';
const root = path.join(__dirname, '..', '..', game === 'moto' ? 'moto-gp' : 'apex-gp');
globalThis.THREE = require(path.join(__dirname, '..', 'vendor', 'three.min.js'));
['util.js', 'config.js', 'tires.js', 'carPhysics.js', 'damage.js', 'car.js', 'tracks.js', 'track.js', 'racingLine.js', 'driver.js', 'collision.js', 'debris.js', 'rules.js', 'pitStop.js', 'adaptive.js', 'race.js'].forEach(f => require(path.join(root, 'src', f)));
const A = globalThis[G];
if (process.env.PRE) eval(process.env.PRE); // ex. PRE="A.steerGrip=()=>1"
const id = process.argv[2] || (game === 'moto' ? 'mugello' : 'velocita'), laps = +process.argv[3] || 3, lv = +(process.argv[4] ?? 2);
const tr = new A.Track(A.TRACK_DEFS.find(d => d.id === id));
const race = new A.Race({ tr, settings: Object.assign({}, A.DEFAULT_SETTINGS, { diff: lv, adaptive: true }), mode: 'race', laps, wet0: 0 });
const p = race.player; if (game === 'moto') p.crashK = 2.2;
const cat = {}, N = tr.N, hist = new Map();
let walls = 0;
race.on((t, d) => {
  if (t === 'wall') { walls++; if (process.env.W) { const c = d.car, f = x => x.toFixed(1); console.log('wall', c.name, 'clk', f(race.clock - race.startT), 'idx', c.idx, 'u', f(c.u), 'lat', f(c.lat), 'sev', f(d.sev), 'brk', f(c.in.brk), 'thr', f(c.in.thr), 'steer', f(c.in.steer), 'slip', f(c.slip), 'crash', c.crash > 0, 'off', f(c.drv.off), 'vmax', f(c.drv.line.vmax[c.idx])); } }
  if (t !== 'contact') return;
  const a = d.a, b = d.b, since = race.clock - (race.raceT0 || 0);
  const ds = tr.rel(b.s - a.s), dl = b.lat - a.lat, k = Math.abs(tr.curv ? tr.curv[a.idx] : 0);
  const brk = Math.max(a.in.brk, b.in.brk) > 0.3;
  let c = Math.abs(ds) > 2.5 && Math.abs(dl) < 2.2 ? (brk ? 'arriere-freinage' : 'arriere') : 'lateral';
  if (race.phase !== 'race') c = 'hors-course/' + race.phase;
  else if (a.pit.state || b.pit.state) c = 'stands';
  else if (since < 20) c = 'depart-20s';
  cat[c] = (cat[c] || 0) + 1;
  if (process.env.H && c === 'lateral') { const h = x => (hist.get(x) || []).map(r => r.join('/')).join(' '); console.log(c, 'clk', (race.clock - race.startT).toFixed(1), 'hw', tr.hw, 'A', a.name, h(a), ' || B', b.name, h(b)); }
  if (process.env.V) { const f = x => x.toFixed(1), q = x => x.drv; console.log(c, 'sev', f(d.sev), 'clk', f(race.clock - race.startT), 'k', f(1 / (tr.curv ? tr.curv[a.idx] || 1e-9 : 1)), 'ds', f(ds), 'dl', f(dl), 'ua', f(a.u), 'ub', f(b.u), 'brk', f(a.in.brk), f(b.in.brk), 'pass', !!q(a).pass, !!q(b).pass, 'err', f(q(a).errT), f(q(b).errT), 'slipA', f(a.slip)); }
});
const H = 1 / 60; let t = 0;
const TR = process.env.TR ? process.env.TR.split(',') : null; // nom,debut,fin

while (t < 60 * 20 * laps && !race.resultsDone) { if (race.phase === 'race' || race.phase === 'finished') p.auto_ap = true; race.update(H); t += H;
  if (process.env.H && Math.round(race.clock * 60) % 9 === 0) for (const c of race.cars) { const r = hist.get(c) || []; r.push([(c.dist % 10000).toFixed(0), c.lat.toFixed(1), c.u.toFixed(0), c.drv && c.drv.pass ? 'P' : '-']); if (r.length > 8) r.shift(); hist.set(c, r); }
  if (process.env.O) for (const c of race.cars) { const out = Math.abs(c.lat) > tr.hw + 1.5 && c.u > 3; if (out && !c._o && race.phase === 'race') { c._o = 1; const i = c.idx, L = c.drv.line; console.log('SORTIE', c.name, 'clk', (race.clock - race.startT).toFixed(1), 'idx', i, '/', tr.N, 'u', c.u.toFixed(1), 'lat', c.lat.toFixed(1), 'vmax', L.vmax[i].toFixed(0), 'k', (1 / (L.k[i] || 1e-9)).toFixed(0), 'brk', c.in.brk.toFixed(1), 'thr', c.in.thr.toFixed(1), 'slip', c.slip.toFixed(2), 'v', c.v.toFixed(1)); } if (!out) c._o = 0; }
  if (TR) { const c = race.cars.find(x => x.name.includes(TR[0])), ck = race.clock - race.startT; if (c && ck > +TR[1] && ck < +TR[2] && Math.round(ck * 60) % 12 === 0) console.log(ck.toFixed(1), 'idx', c.idx, 'u', c.u.toFixed(1), 'lat', c.lat.toFixed(1), 'v', c.v.toFixed(1), 'h-err', (A.wrap(c.h - Math.atan2(tr.px[(c.idx + 1) % tr.N] - tr.px[c.idx], tr.pz[(c.idx + 1) % tr.N] - tr.pz[c.idx]))).toFixed(2), 'steer', c.in.steer.toFixed(2), 'brk', c.in.brk.toFixed(2), 'thr', c.in.thr.toFixed(2), 'slip', c.slip.toFixed(2), 'vt?', c.drv.line.vmax[c.idx].toFixed(0), 'off', c.drv.off.toFixed(1), 'lean', c.lean.toFixed(2)); }
}
for (const k of Object.keys(cat)) if (k.startsWith('hors-course')) delete cat[k];
const dn = race.cars.filter(c => c.dnf).length;
console.log(game, id, 'dnf', dn, laps + ' tours', JSON.stringify(cat), 'murs', walls);
