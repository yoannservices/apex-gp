// Physique de monoplace faite main : modèle 4 roues, transfert de masse, appui aéro, adhérence par pneu (ellipse de friction).
// Repère corps : x avant, y gauche ; r > 0 = rotation vers la gauche ; h = cap (avant = (sin h, cos h)).
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const PH = (A.PHYS = {
    a: 1.94, b: 1.66, L: 3.6, tw: 1.6, hcg: 0.28, Iz: 1150, mass: 798,
    kdf: 2.6, kdrag: 0.85, pmax: 780e3, fmax: 17000, brake: 29000, rollF: 0.52, ride: 0.012,
    VRED: [32, 49, 63, 75, 86, 95, 103, 110],
  });
  const WX = [PH.a, PH.a, -PH.b, -PH.b], WY = [PH.tw / 2, -PH.tw / 2, PH.tw / 2, -PH.tw / 2];
  A.WHEEL_X = WX; A.WHEEL_Y = WY;
  const CRR = [0.012, 0.03, 0.08, 0.25];
  const clamp = A.clamp, REAR_GRIP = 1.12;

  // Effets des dégâts sur l'aéro et le train roulant
  A.damageFx = d => ({
    fwF: 0.35 + 0.65 * d.fw, rwF: 0.35 + 0.65 * d.rw, floorF: 0.55 + 0.45 * d.floor,
  });

  A.stepCar = (car, dt, env) => {
    const wet = env.wet, m = PH.mass + car.fuel, G = A.G;
    let u = car.u, v = car.v, r = car.r;
    const sp = Math.abs(u), d = car.d, inp = car.in;
    let thr = clamp(inp.thr, 0, 1), brk = clamp(inp.brk, 0, 1);

    // limiteur de vitesse des stands
    if (car.limiter) {
      const over = u - A.PIT_LIMIT;
      if (over > -2) thr *= clamp(1 - (over + 2) / 2, 0, 1);
      if (over > 0) brk = Math.max(brk, clamp(over * 0.25, 0, 0.6));
    }
    if (car.fuel <= 0) thr = 0;

    // direction : angle limité en vitesse, avec vitesse de rotation bornée
    const dmax = 0.42 / (1 + (sp / 38) * (sp / 38)) + 0.045;
    car.delta += clamp(inp.steer * dmax - car.delta, -2.6 * dt, 2.6 * dt);

    // boîte de vitesses
    const V = PH.VRED, g = car.gear;
    if (car.shiftT > 0) car.shiftT -= dt;
    if (car.auto) {
      if (car.shiftT <= 0) {
        if (g < 8 && u > V[g - 1] * 0.94) { car.gear++; car.shiftT = 0.13; }
        else if (g > 1 && u < V[g - 2] * 0.8) { car.gear--; car.shiftT = 0.08; }
      }
    } else {
      if (inp.up && g < 8) { car.gear++; car.shiftT = 0.13; }
      if (inp.down && g > 1) { car.gear--; car.shiftT = 0.08; }
    }
    inp.up = inp.down = false;
    const rpm = (car.rpm = u < 3 ? 4200 + 6500 * thr : 4200 + 8500 * Math.min(1.03, u / V[car.gear - 1]));
    let Fdrive = 0;
    if (car.shiftT <= 0 && rpm < 12700 && thr > 0) {
      const ts = clamp(0.78 + 0.22 * (rpm - 4000) / 6000, 0.6, 1);
      const pw = PH.pmax * car.perf.power * ts * thr * (car.fuelSave ? 0.93 : 1);
      Fdrive = Math.min(pw / Math.max(sp, 10), PH.fmax * thr);
    }

    // aérodynamique
    const fx = A.damageFx(d), wing = car.setup.wing, aeroK = (0.75 + 0.5 * wing) * car.perf.aero * fx.floorF;
    const drs = car.drsOpen ? 1 : 0, q2 = sp * sp;
    const DF = PH.kdf * q2 * aeroK;
    const dfF = DF * 0.43 * fx.fwF, dfR = DF * 0.57 * fx.rwF * (1 - 0.3 * drs);
    const Fdrag = PH.kdrag * q2 * (0.85 + 0.3 * wing) * (1 - 0.22 * drs) * (1 + 0.1 * (1 - d.fw) + 0.05 * (1 - d.rw));

    // charges par axe puis par roue (transfert longitudinal et latéral)
    const ax = car.ax, ay = car.ay;
    const Wf = (m * G * PH.b) / PH.L, Wr = (m * G * PH.a) / PH.L, tl = (m * ax * PH.hcg) / PH.L, tt = (m * ay * PH.hcg) / PH.tw;
    const axleF = Math.max(300, Wf + dfF - tl), axleR = Math.max(300, Wr + dfR + tl);
    const latF = tt * PH.rollF, latR = tt * (1 - PH.rollF);

    const bias = car.setup.bias, Fb = brk * PH.brake;
    const pfF = (21 - car.setup.pF) / 10, pfR = (21 - car.setup.pR) / 10;
    const sgn = u >= 0 ? 1 : -1;
    let Sx = 0, Sy = 0, Mz = 0, locked = 0, spun = 0, aMax = 0;

    for (let w = 0; w < 4; w++) {
      const front = w < 2, xw = WX[w], yw = WY[w], tire = car.tires[w];
      if (!d.wheel[w]) { // roue arrachée : le moyeu racle le sol
        const sc = -sgn * Math.min(2800, 500 + sp * 50);
        Sx += sc; Mz += -yw * sc; continue;
      }
      const left = w % 2 === 0;
      const Fz = Math.max(150, (front ? axleF : axleR) / 2 + (left ? -1 : 1) * (front ? latF : latR));
      const mu = tire.mu(Fz, wet, car.surf[w], front ? pfF : pfR, car.perf.grip) * (0.5 + 0.5 * d.susp[w]);
      const Fmax = mu * Fz * (front ? 1 : REAR_GRIP);
      const ux = u - r * yw, uy = v + r * xw;
      const dw = (front ? car.delta : 0) + (1 - d.susp[w]) * 0.06 * (left ? 1 : -1);
      const c = Math.cos(dw), s = Math.sin(dw);
      const vlong = ux * c + uy * s, vlat = -ux * s + uy * c;
      const al = Math.atan2(vlat, Math.max(Math.abs(vlong), 4));

      // commande longitudinale
      // la force latérale a priorité : le longitudinal ne dispose que du reste de l'ellipse de friction
      // pics à petit angle de dérive (grip franc), train arrière plus tardif et chute douce, pour que le décrochage soit progressif
      const Fy0 = -Fmax * (front ? Math.sin(1.3 * Math.atan(18 * al)) : Math.sin(1.2 * Math.atan(22 * al))), fr = Fy0 / Fmax;
      const cap = Fmax * Math.sqrt(Math.max(0.01, 1 - fr * fr));
      let bw = (front ? bias : 1 - bias) * Fb * 0.5;
      let dw_ = front ? 0 : Fdrive * 0.5;
      let lock = false, spin = false;
      if (bw > 0.97 * cap) { if (car.assists.abs) bw = 0.92 * cap; else lock = true; }
      if (dw_ > 0.95 * cap) { if (car.assists.tc) dw_ = 0.9 * cap; else spin = true; }
      const vs = vlong >= 0 ? 1 : -1;
      let Fx = dw_ - bw * vs - CRR[car.surf[w]] * Fz * vs;
      let Fy = Fy0;
      if (lock) { Fx = -0.85 * Fmax * vs; Fy *= 0.45; locked++; tire.flat += dt * 0.15; }
      if (spin) { Fx = 0.9 * Fmax; Fy *= 0.8; spun++; }
      if (lock || spin) Fy *= Math.sqrt(Math.max(0.04, 1 - (Fx * Fx) / (Fmax * Fmax)));
      else Fx = clamp(Fx, -cap, cap);
      const Fxb = Fx * c - Fy * s, Fyb = Fx * s + Fy * c;
      Sx += Fxb; Sy += Fyb; Mz += xw * Fyb - yw * Fxb;

      // énergie dissipée -> échauffement et usure
      const ux_ = Math.abs(Fx) / Fmax, slipL = lock ? 0.6 * sp : spin ? 0.2 * sp + 3 : 0.015 * sp * ux_ * ux_ + 0.1;
      const P = Math.abs(Fy) * Math.abs(vlat) + Math.abs(Fx) * slipL;
      tire.P = P; tire.Fz = Fz;
      tire.thermal(dt, P, Fz, sp, env.air, wet, front ? pfF : pfR, car.perf.care);
      if (Math.abs(al) > aMax) aMax = Math.abs(al);
    }
    car.slip = aMax; car.locked = locked; car.spun = spun;

    // forces globales
    Sx += -sgn * (Fdrag + PH.ride * m * G);
    Sy += m * G * Math.sin(car.bank);
    if (d.rw < 0.95) Mz += (1 - d.rw) * q2 * 0.6 * Math.sin(car.t * 3.1 + 1.2) * Math.sin(car.t * 1.7);
    car.ax += (Sx / m - car.ax) * 0.25; car.ay += (Sy / m - car.ay) * 0.25;

    u += (Sx / m + v * r) * dt; v += (Sy / m - u * r) * dt; r += (Mz / PH.Iz) * dt;
    if (u < -1) u = -1;
    if (sp < 3 && thr < 0.05) { const k = 1 - Math.min(1, dt * 4); u *= k; v *= k; r *= k; }
    car.u = u; car.v = v; car.r = r;
    car.h += r * dt;
    const sh = Math.sin(car.h), ch = Math.cos(car.h);
    car.x += (u * sh + v * ch) * dt; car.z += (u * ch - v * sh) * dt;
    car.fuel = Math.max(0, car.fuel - (0.004 + 0.022 * thr) * (car.fuelSave ? 0.85 : 1) * dt);
    car.t += dt;
    car.odo += sp * dt;
  };
})();
