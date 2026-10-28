// Tour de circuit sans rendu avec un bot seul : temps, sorties de piste, usure, température.
const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js', 'config.js', 'tires.js', 'carPhysics.js', 'damage.js', 'car.js', 'tracks.js', 'track.js', 'racingLine.js', 'driver.js'].forEach(f => require(path.join('..', 'src', f)));
const A = globalThis.AGP; if (process.env.MU) { require(path.join('..', 'src', 'racingLine.js')); A.BOT.mu = +process.env.MU; }
const only = process.argv[2], laps = +process.argv[3] || 3, lv = process.argv[4] != null ? +process.argv[4] : 4;

for (const def of A.TRACK_DEFS) {
  if (only && def.id !== only) continue;
  const tr = new A.Track(def), line = A.buildRacingLine(tr);
  const car = new A.Car(0, { name: 'bot', number: 9, team: 0, tire: 'M' });
  const pose = tr.gridPose(0); car.reset(pose, 60);
  const drv = new A.Driver(car, tr, line, A.DRIVERS[0]); drv.setLevel(lv);
  const ctx = { phase: 'start', cars: [car], wet: 0 };
  const env = { wet: 0, air: 24 }, H = 1 / 240;
  let lastS = pose.s, lapStart = 0, times = [], off = 0, maxLat = 0, spins = 0, t = 0, offT = 0;
  for (let step = 0; step < 240 * 60 * 4 * laps; step++) {
    t = step * H;
    if (step % 4 === 0) { ctx.phase = t < 4 ? 'start' : 'race'; A.contact(car, tr); drv.drive(4 * H, ctx); }
    A.stepCar(car, H, env);
    if (step % 4 === 0) {
      if (lastS > tr.L * 0.9 && car.s < tr.L * 0.1) { times.push(t - lapStart); lapStart = t; if (times.length > laps) break; }
      lastS = car.s;
      const e = Math.abs(car.lat) - tr.hw; if (e > 0.3) offT += 4 * H; if (e > maxLat) maxLat = e;
      if (Math.abs(car.rhead) > 1.6) spins++;
    }
  }
  const w = car.tires.map(x => (x.wear * 100).toFixed(0) + '%/' + x.temp.toFixed(0)).join(' ');
  console.log(`${def.id.padEnd(9)} L=${tr.L.toFixed(0)} ref=${def.ref} laps=[${times.map(x => x.toFixed(1))}] off=${offT.toFixed(1)}s maxOut=${maxLat.toFixed(1)}m spinFrames=${spins} tires ${w} fuel=${car.fuel.toFixed(1)} Vtop=${Math.max(...line.vmax).toFixed(0)}`);
  if ([car.x, car.z].some(Number.isNaN)) { console.error('NaN'); process.exit(1); }
}
