const path = require('path');
globalThis.THREE = require('../vendor/three.min.js');
['util.js','config.js','tires.js','carPhysics.js','damage.js','car.js','tracks.js','track.js','racingLine.js','driver.js','collision.js','debris.js','rules.js','pitStop.js','adaptive.js','race.js'].forEach(f => require(path.join('..','src',f)));
const A = globalThis.AGP;
const tr = new A.Track(A.TRACK_DEFS.find(d => d.id === (process.argv[2]||'velocita')));
const race = new A.Race({ tr, settings: Object.assign({}, A.DEFAULT_SETTINGS, { diff: 2 }), mode: 'race', laps: 3 });
race.player.auto_ap = true;
const line = race.line;
let first=true;
race.on((t,d)=>{ if(t==='crash'&&first&&d.sev>2){first=false;console.log('first crash',race.clock.toFixed(1),d.a.name,d.b.name,'s',d.a.s.toFixed(0),'u',(d.a.u*3.6)|0,(d.b.u*3.6)|0,'lat',d.a.lat.toFixed(1),d.b.lat.toFixed(1));}});
for (let t=0;t<40;t+=1/60){ race.update(1/60); if (t>=19 && Math.abs(t*2-Math.round(t*2))<1/120) { const L=race.byPos(); const c=L[0], z=L[10]; console.log(t.toFixed(1),'lead s',c.s.toFixed(0),(c.u*3.6)|0,'vmax',(line.vmax[c.idx]*3.6)|0,'| p10 s',z.s.toFixed(0),(z.u*3.6)|0,'lat',z.lat.toFixed(1),'brk',z.in.brk.toFixed(2)); } }
console.log('L',tr.L.toFixed(0),'curv near s=',[0,200,400,600,800,1000].map(s=>(tr.kS[Math.floor(s/tr.ds)]*1000).toFixed(1)).join(' '));
