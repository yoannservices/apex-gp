globalThis.THREE = require('../vendor/three.min.js');
['util.js','config.js','tracks.js','track.js'].forEach(f=>require('../src/'+f));
const A=globalThis.AGP; const tr=new A.Track(A.TRACK_DEFS[0]);
for(let k=0;k<6;k++){const p=tr.gridPose(k);console.log(k,p.s.toFixed(1),p.x.toFixed(1),p.z.toFixed(1),p.h.toFixed(2));}
