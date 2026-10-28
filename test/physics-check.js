// Vérifie l'ordre de grandeur de la physique : accélération, vitesse max, freinage, g latéral.
const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
const src = f => require(path.join('..', 'src', f));
['util.js', 'config.js', 'tires.js', 'carPhysics.js', 'damage.js', 'car.js'].forEach(src);
const A = globalThis.AGP;
const env = { wet: 0, air: 24 };
const mk = (tire = 'M') => { const c = new A.Car(0, { name: 't', number: 1, team: 0, tire, isPlayer: true }); c.fuel = 60; return c; };
const run = (c, secs, ctl) => { for (let k = 0; k < secs * 240; k++) { ctl(c, k / 240); A.stepCar(c, 1 / 240, env); } };

let c = mk(), log = {};
run(c, 25, (c, t) => { c.in.thr = 1; c.in.brk = 0; c.in.steer = 0; for (const T of [3, 6, 10, 20]) if (Math.abs(t - T) < 1 / 480) log[T] = (c.u * 3.6).toFixed(0); });
console.log('accel km/h @3,6,10,20s', log, 'top', (c.u * 3.6).toFixed(0), 'gear', c.gear, 'rpm', c.rpm.toFixed(0));

c = mk(); c.u = 90; c.gear = 7; let d0 = c.odo, t0 = 0;
run(c, 8, (c, t) => { c.in.thr = 0; c.in.brk = 1; if (c.u < 0.5 && !t0) t0 = t; });
console.log('brake 324->0: dist', (c.odo - d0).toFixed(0), 'm, t', t0.toFixed(1), 's, u', c.u.toFixed(1));

for (const [V, R] of [[25, 45], [25, 35], [45, 120], [45, 90], [65, 200], [65, 150], [85, 300], [85, 220]]) {
  c = mk(); c.u = V; c.gear = V < 30 ? 3 : V < 50 ? 5 : V < 70 ? 6 : 8; let ay = 0, n = 0, y = 0;
  run(c, 8, (c, t) => {
    const rt = c.u / R, dmax = 0.42 / (1 + (c.u / 38) ** 2) + 0.045;
    c.in.steer = Math.max(-1, Math.min(1, (3.6 / R + 0.3 * (rt - c.r)) / dmax));
    c.in.thr = Math.max(0, Math.min(1, 0.15 + (V - c.u) * 0.4)); c.in.brk = Math.max(0, Math.min(1, (c.u - V) * 0.3));
    if (t > 6) { ay += c.ay; y += c.u * c.r; n++; }
  });
  console.log(`corner V=${V} R=${R}: ay=${(ay / n / 9.81).toFixed(2)}g (u*r ${(y / n / 9.81).toFixed(2)}g) u=${c.u.toFixed(0)} slip=${c.slip.toFixed(2)} wear=${c.tires[0].wear.toExponential(1)} T=${c.tires[0].temp.toFixed(0)}`);
}
if ([c.x, c.z, c.u].some(Number.isNaN)) { console.error('NaN'); process.exit(1); }
