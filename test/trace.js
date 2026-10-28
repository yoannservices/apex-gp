const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js', 'config.js', 'tires.js', 'carPhysics.js', 'damage.js', 'car.js', 'tracks.js', 'track.js', 'racingLine.js', 'driver.js'].forEach(f => require(path.join('..', 'src', f)));
const A = globalThis.AGP;
const def = A.TRACK_DEFS.find(d => d.id === (process.argv[2] || 'velocita')), T0 = +process.argv[3] || 0, T1 = +process.argv[4] || 40, every = +process.argv[5] || 1;
const tr = new A.Track(def), line = A.buildRacingLine(tr);
const car = new A.Car(0, { name: 'bot', number: 9, team: 0, tire: 'M' });
const pose = tr.gridPose(0); car.reset(pose, 60);
const drv = new A.Driver(car, tr, line, A.DRIVERS[0]); drv.setLevel(4);
const ctx = { phase: 'start', cars: [car], wet: 0 }, env = { wet: 0, air: 24 }, H = 1 / 240;
for (let step = 0; step < 240 * T1; step++) {
  const t = step * H; ctx.phase = t < 4 ? 'start' : 'race';
  if (step % 4 === 0) { ctx.phase = t < 4 ? 'start' : 'race'; A.contact(car, tr); drv.drive(4 * H, ctx); }
  A.stepCar(car, H, env);
  if (t >= T0 && step % (240 * every) === 0) console.log(t.toFixed(1), 's', car.s.toFixed(0), 'lat', car.lat.toFixed(1), 'off*', line.off[car.idx].toFixed(1), 'u', car.u.toFixed(1), 'vmax', line.vmax[car.idx].toFixed(0), 'v', car.v.toFixed(1), 'steer', car.in.steer.toFixed(2), 'thr', car.in.thr.toFixed(2), 'brk', car.in.brk.toFixed(2), 'gear', car.gear, 'slip', car.slip.toFixed(2), 'rh', car.rhead.toFixed(2));
}
