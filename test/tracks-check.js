// Vérifie fermeture, longueur, auto-intersections (séparation) et trace un aperçu ASCII de chaque circuit.
const path = require('path');
globalThis.THREE = require(path.join(__dirname, '../vendor/three.min.js'));
require('../src/util.js'); require('../src/config.js'); require('../src/tracks.js');
const A = globalThis.AGP;
const plot = process.argv.includes('--plot');
for (const def of A.TRACK_DEFS) {
  try {
    const { pts, LA, LB } = A.expandOps(def);
    let L = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    // séparation minimale entre points éloignés de plus de 150 m le long du circuit
    const step = L / pts.length; const far = Math.ceil(150 / step); let minSep = 1e9;
    for (let i = 0; i < pts.length; i += 2) for (let j = i + far; j < pts.length; j += 2) {
      if (pts.length - (j - i) < far) continue;
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d < minSep) minSep = d;
    }
    console.log(def.id.padEnd(9), 'L=' + L.toFixed(0), 'LA=' + LA.toFixed(0), 'LB=' + LB.toFixed(0), 'minSep=' + minSep.toFixed(0), minSep < def.width + 2 * def.gap + 10 ? ' <-- TROP PROCHE' : 'ok');
    if (plot) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; pts.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
      const W = 110, H = 36, sc = Math.max((x1 - x0) / W, (z1 - z0) / (H * 2));
      const g = Array.from({ length: H }, () => Array(W).fill(' '));
      pts.forEach((p, i) => { const cx = Math.floor((p[0] - x0) / sc), cy = Math.floor((p[1] - z0) / sc / 2); if (g[cy] && cx < W) g[cy][cx] = i === 0 ? 'S' : '#'; });
      console.log(g.map(r => r.join('')).join('\n'));
    }
  } catch (e) { console.log(def.id, 'ERREUR', e.message); }
}
