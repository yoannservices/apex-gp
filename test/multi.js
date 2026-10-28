const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js','config.js','tires.js','carPhysics.js','damage.js','car.js','tracks.js','track.js','racingLine.js','driver.js','collision.js','debris.js','rules.js','pitStop.js','adaptive.js','race.js'].forEach(f => require(path.join('..','src',f)));
const A = globalThis.AGP;
const T = +process.argv[3] || 70, lv = +(process.argv[4] ?? 2);
for (const id of (process.argv[2]||'velocita').split(',')) for (let seed=1; seed<=3; seed++) {
  let s=seed*7919; Math.random = ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const tr = new A.Track(A.TRACK_DEFS.find(d => d.id === id));
  const race = new A.Race({ tr, settings: Object.assign({}, A.DEFAULT_SETTINGS, { diff: lv }), mode: 'race', laps: 3 });
  race.player.auto_ap = true;
  let big=0, first=null; race.on((t,d)=>{ if(t==='crash'&&d.sev>5){big++; if(!first) first=[race.clock.toFixed(1),d.a.number,d.b.number,d.a.s|0];} });
  for (let t=0;t<T;t+=1/60) race.update(1/60);
  const dnf=race.cars.filter(c=>c.dnf).length, dmg=race.cars.filter(c=>A.damageScore(c.d)>0.5).length;
  console.log(id, 'seed',seed,'dnf',dnf,'dmg>0.5',dmg,'bigcrashes',big,'first',JSON.stringify(first),'sc',race.rules.sc.mode,'lap',race.leader().lap);
}
