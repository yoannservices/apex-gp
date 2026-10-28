const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js','config.js','tires.js','carPhysics.js','damage.js','car.js','tracks.js','track.js','racingLine.js','driver.js','collision.js','debris.js','rules.js','pitStop.js','adaptive.js','race.js'].forEach(f => require(path.join('..','src',f)));
const A = globalThis.AGP; Math.random = (()=>{let s=(+process.argv[3]||1)*7919;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;}})();
const tr = new A.Track(A.TRACK_DEFS.find(d => d.id === (process.argv[2]||'velocita')));
const race = new A.Race({ tr, settings: Object.assign({}, A.DEFAULT_SETTINGS, { diff: 2 }), mode: 'race', laps: 3 });
race.player.auto_ap = true;
let hist=[], hit=null;
race.on((t,d)=>{ if(t==='crash'&&d.a.number===16&&d.b.number===17&&process.env.ALL) console.log('contact',race.clock.toFixed(2),d.sev.toFixed(1),'a h',d.a.h.toFixed(2),'rh',d.a.rhead.toFixed(2),'b rh',d.b.rhead.toFixed(2),'lat',d.a.lat.toFixed(1),d.b.lat.toFixed(1)); if(t==='crash'&&d.sev>4&&!hit) hit={t:race.clock,a:d.a,b:d.b}; });
for (let t=0;t<40 && !(hit && race.clock-hit.t>0.3);t+=1/60){ race.update(1/60); if (race.clock>10) hist.push([race.clock, race.cars.map(c=>[c.number,c.s,c.lat,c.u,c.in.brk,c.in.steer,c.drv.off])]); if(hist.length>240) hist.shift(); }
if(!hit){console.log('no hit');process.exit();}
console.log('hit',hit.t.toFixed(2),hit.a.number,hit.b.number);
for (let k=0;k<hist.length;k+=6){ const [t,cs]=hist[k]; const f=n=>cs.find(c=>c[0]===n); console.log(t.toFixed(2),[hit.a.number,hit.b.number].map(n=>{const c=f(n);return `#${n} s${c[1]|0} lat${c[2].toFixed(1)} u${(c[3]*3.6)|0} brk${c[4].toFixed(2)} st${c[5].toFixed(2)} off${c[6].toFixed(1)}`;}).join(' | ')); }
// who's near a at hit
const [t,cs]=hist[hist.length-1]; const a=cs.find(c=>c[0]===hit.a.number);
console.log('near a:',cs.filter(c=>Math.abs(c[1]-a[1])<25&&c[0]!==a[0]).map(c=>`#${c[0]} ds${(c[1]-a[1]).toFixed(0)} lat${c[2].toFixed(1)} u${(c[3]*3.6)|0}`).join(' ; '));
console.log('vmax at a', (race.line.vmax[hit.a.idx]*3.6)|0, 'line off', race.line.off[hit.a.idx].toFixed(1));
