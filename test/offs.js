const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js', 'config.js', 'tires.js', 'carPhysics.js', 'damage.js', 'car.js', 'tracks.js', 'track.js', 'racingLine.js', 'driver.js'].forEach(f => require(path.join('..', 'src', f)));
const A = globalThis.AGP; if (process.env.MU) A.BOT.mu = +process.env.MU;
const def = A.TRACK_DEFS.find(d => d.id === process.argv[2]), laps = +process.argv[3] || 3;
const tr = new A.Track(def), line = A.buildRacingLine(tr);
const car = new A.Car(0, { name: 'bot', number: 9, team: 0, tire: 'M' }), pose = tr.gridPose(0); car.reset(pose, 60);
const drv = new A.Driver(car, tr, line, A.DRIVERS[0]); drv.setLevel(4);
const ctx = { phase: 'start', cars: [car], wet: 0 }, env = { wet: 0, air: 24 }, H = 1 / 240; let was = false;
for (let step = 0; step < 240 * 100 * laps; step++) {
  const t = step * H; ctx.phase = t < 4 ? 'start' : 'race';
  if (step % 4 === 0) { A.contact(car, tr); drv.drive(4 * H, ctx); }
  A.stepCar(car, H, env);
  if (step % 4 === 0) { const o = Math.abs(car.lat) - tr.hw > 0.4; if (o && !was) console.log('OFF t', t.toFixed(1), 's', car.s.toFixed(0), 'lat', car.lat.toFixed(1), 'u', car.u.toFixed(0), 'vmax', line.vmax[car.idx].toFixed(0), 'slip', car.slip.toFixed(2), 'temps', car.tires.map(x => x.temp.toFixed(0)).join('/'), 'R', (1/line.k[car.idx]).toFixed(0)); was = o; }
}
