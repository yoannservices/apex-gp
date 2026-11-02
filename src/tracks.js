// Définition des circuits en mode « tortue » : droites + arcs (angle > 0 = virage à droite).
// Deux droites inconnues ('?A' toujours en dernier avant la ligne, '?B') sont résolues pour fermer la boucle.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const d2r = Math.PI / 180;

  // ops : ['S', len] | ['A', rayon, angleDeg] | ['?A'] | ['?B']
  A.TRACK_DEFS = [
    {
      id: 'velocita', name: 'Autodromo Velocità', country: 'Italie', width: 15, gap: 16, grass: 'plain', bank: 0.06,
      startBack: 520, ref: 85,
      ops: [
        ['S', 500], ['A', 45, -30], ['A', 45, 60], ['A', 45, -30], ['S', 300], ['A', 260, 70], ['S', 220], ['A', 40, -38], ['A', 40, 38],
        ['S', 120], ['A', 90, 60], ['S', 60], ['A', 75, 50], ['S', 1300], ['A', 55, -45], ['A', 55, 45], ['S', 500], ['A', 160, 90], ['?B'], ['A', 150, 90], ['?A'],
      ],
    },
    {
      id: 'ville', name: 'Grand Prix de la Ville', country: 'Monaco-sur-Mer', width: 13, gap: 3.5, grass: 'city', bank: 0,
      startBack: 520, ref: 101,
      ops: [
        ['S', 450], ['A', 22, 90], ['S', 250], ['A', 22, -90], ['S', 150], ['A', 18, 90], ['S', 100], ['A', 20, 90], ['S', 900],
        ['A', 28, -180], ['S', 150], ['A', 28, 180], ['S', 300], ['A', 14, -60], ['A', 14, 60], ['S', 300], ['A', 20, 90], ['?B'], ['A', 20, 90], ['?A'],
      ],
    },
    {
      id: 'collines', name: 'Ring des Collines', country: 'Allemagne', width: 14, gap: 14, grass: 'forest', bank: 0.11,
      startBack: 520, ref: 80,
      ops: [
        ['S', 420], ['A', 130, 55], ['S', 100], ['A', 170, -40], ['A', 90, 65], ['S', 150], ['A', 300, 40], ['A', 60, -50], ['S', 120],
        ['A', 100, 70], ['A', 50, -30], ['A', 120, 40], ['S', 1000], ['A', 110, 60], ['A', 200, -30], ['S', 400], ['A', 140, 90], ['?B'], ['A', 180, 90], ['?A'],
      ],
    },
    {
      id: 'marina', name: 'Marina Bay Nocturne', country: 'Singapour', width: 14, gap: 6, grass: 'city', bank: 0,
      startBack: 520, ref: 80,
      ops: [
        ['S', 400], ['A', 30, 90], ['S', 180], ['A', 40, 45], ['S', 100], ['A', 40, 45], ['S', 300], ['A', 60, -50], ['A', 60, 50], ['S', 500],
        ['A', 24, -90], ['S', 90], ['A', 24, 90], ['S', 300], ['A', 35, 90], ['?B'], ['A', 35, 90], ['?A'],
      ],
    },
    {
      id: 'littoral', name: 'Circuit du Littoral', country: 'Portugal', width: 15, gap: 16, grass: 'plain', bank: 0.07,
      startBack: 520, ref: 88,
      ops: [
        ['S', 750], ['A', 207, 35], ['S', 120], ['A', 175, 105], ['S', 160], ['A', 159, -50], ['S', 290], ['A', 142, -25], ['A', 190, 55],
        ['A', 151, 60], ['S', 930], ['A', 217, 35], ['S', 100], ['A', 100, 30], ['S', 150], ['A', 66, 25], ['S', 300], ['A', 213, -20],
        ['A', 89, -30], ['?B'], ['A', 179, 140], ['?A'],
      ],
    },
    {
      id: 'alpin', name: 'Grand Prix des Alpes', country: 'Autriche', width: 13, gap: 12, grass: 'forest', bank: 0.1,
      startBack: 520, ref: 72,
      ops: [
        ['S', 420], ['A', 36, 45], ['S', 70], ['A', 90, 65], ['S', 80], ['A', 85, -45], ['S', 70], ['A', 45, 25], ['S', 190],
        ['A', 87, 75], ['S', 110], ['A', 71, 60], ['S', 80], ['A', 127, -45], ['S', 350], ['A', 100, -30], ['S', 70], ['A', 76, -30],
        ['S', 80], ['A', 88, 65], ['S', 60], ['A', 98, 85], ['S', 140], ['A', 127, -85], ['S', 100], ['A', 97, 100], ['?B'],
        ['A', 48, 75], ['?A'],
      ],
    },
    {
      id: 'neon', name: 'Neon Strip Night GP', country: 'États-Unis', width: 14, gap: 3.5, grass: 'city', bank: 0,
      startBack: 520, ref: 96,
      ops: [
        ['S', 1240], ['A', 48, 80], ['S', 170], ['A', 38, 95], ['A', 61, -85], ['S', 300], ['A', 47, 65], ['S', 70], ['A', 53, -65],
        ['S', 140], ['A', 44, 90], ['S', 1490], ['A', 46, 90], ['S', 240], ['?B'], ['A', 65, 90], ['?A'],
      ],
    },
    {
      id: 'etangs', name: 'Circuit des Étangs', country: 'Belgique', width: 14, gap: 16, grass: 'forest', bank: 0.09,
      startBack: 520, ref: 104,
      ops: [
        ['S', 980], ['A', 179, 95], ['S', 120], ['A', 70, 35], ['S', 190], ['A', 152, -40], ['S', 160], ['A', 238, 70], ['S', 100],
        ['A', 243, -60], ['A', 208, 80], ['S', 830], ['A', 236, 75], ['A', 295, -15], ['A', 185, 30], ['S', 400], ['A', 199, -35], ['S', 60],
        ['A', 102, 65], ['?B'], ['A', 156, 60], ['?A'],
      ],
    },
  ];

  // Retourne { pts:[[x,z]...], len, startIdx } — pts espacés d'environ 4 m.
  A.expandOps = def => {
    const walk = (LA, LB, emit) => {
      let x = 0, z = 0, h = 0;
      const seg = (len, dh, r) => {
        const n = Math.max(1, Math.ceil(len / 3));
        for (let i = 0; i < n; i++) {
          if (r) { const h2 = h + dh / n; const hm = (h + h2) / 2; const cl = 2 * r * Math.sin(dh / n / 2) * Math.sign(dh); x += Math.cos(hm) * Math.abs(cl); z += Math.sin(hm) * Math.abs(cl); h = h2; }
          else { x += (Math.cos(h) * len) / n; z += (Math.sin(h) * len) / n; }
          emit && emit(x, z);
        }
      };
      const hd = {};
      for (const op of def.ops) {
        if (op[0] === 'S') seg(op[1]);
        else if (op[0] === 'A') seg(Math.abs(op[1] * op[2] * d2r), op[2] * d2r, op[1]);
        else { hd[op[0]] = h; seg(op[0] === '?A' ? LA : LB); }
      }
      return { x, z, h, hd };
    };
    // 1) déplacement hors droites inconnues, 2) résolution 2x2
    const base = walk(0, 0);
    const hA = base.hd['?A'], hB = base.hd['?B'];
    const det = Math.cos(hA) * Math.sin(hB) - Math.sin(hA) * Math.cos(hB);
    const LA = (-base.x * Math.sin(hB) + base.z * Math.cos(hB)) / det;
    const LB = (-Math.cos(hA) * base.z + Math.sin(hA) * base.x) / det;
    if (!(LA > 0 && LB > 0)) throw new Error(def.id + ' : fermeture impossible (LA=' + LA.toFixed(0) + ' LB=' + LB.toFixed(0) + ')');
    const pts = [[0, 0]];
    walk(LA, LB, (x, z) => pts.push([x, z]));
    pts.pop(); // dernier point == premier
    return { pts, LA, LB };
  };
})();
