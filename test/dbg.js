const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js','config.js','tires.js','carPhysics.js','damage.js','car.js','tracks.js','track.js','racingLine.js','driver.js','collision.js','debris.js','rules.js','pitStop.js','adaptive.js','race.js'].forEach(f => require(path.join('..','src',f)));
const A = globalThis.AGP;
const tr = new A.Track(A.TRACK_DEFS.find(d => d.id === (process.argv[2]||'velocita')));
const race = new A.Race({ tr, settings: Object.assign({}, A.DEFAULT_SETTINGS, { diff: 2 }), mode: 'race', laps: 3 });
const log = []; race.on((t,d)=>{ if(['crash','wall','dnf','sc','yellow'].includes(t)) log.push([race.clock.toFixed(1), t, d.car?d.car.name:d.a?d.a.name+'/'+d.b.name:'', d.sev?d.sev.toFixed(1):''].join(' ')); });
race.player.auto_ap = true;
const T = +process.argv[3] || 60;
for (let t=0;t<T;t+=1/60){ race.update(1/60); if (Math.abs(t%5)<1/60) console.log(t.toFixed(0), race.phase, race.byPos().slice(0,20).map(c=>c.number+':'+(c.u*3.6|0)+(c.dnf?'X':'')).join(' ')); }
console.log(log.slice(0,40).join('\n'));
