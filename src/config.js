// Données de jeu : écuries, gommes, difficultés, pilotes, réglages par défaut.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});

  A.G = 9.81;
  A.PIT_LIMIT = 22.2; // 80 km/h

  // perf : multiplicateurs autour de 1 (puissance, appui, adhérence, ménagement des pneus)
  A.TEAMS = [
    { id: 'ros', name: 'Scuderia Rosso', color: 0xd8101a, color2: 0xffffff, perf: { power: 1.02, aero: 1.0, grip: 1.0, care: 0.95 } },
    { id: 'sil', name: 'Silver Arrow GP', color: 0xc9ced4, color2: 0x00b5a5, perf: { power: 1.03, aero: 1.02, grip: 1.01, care: 1.0 } },
    { id: 'azu', name: 'Azure Dynamics', color: 0x1747d6, color2: 0xff8a00, perf: { power: 1.0, aero: 1.03, grip: 1.0, care: 1.02 } },
    { id: 'pap', name: 'Papaya Works', color: 0xff7a00, color2: 0x111111, perf: { power: 0.99, aero: 0.99, grip: 1.0, care: 0.98 } },
    { id: 'ver', name: 'Verde Motorsport', color: 0x0c8f4a, color2: 0xf2f2f2, perf: { power: 0.97, aero: 0.97, grip: 0.98, care: 1.04 } },
    { id: 'vio', name: 'Violet Storm', color: 0x7a2bd0, color2: 0xf4d000, perf: { power: 0.96, aero: 0.96, grip: 0.97, care: 1.0 } },
  ];

  // mu : adhérence relative ; wear : usure relative ; opt/win : température idéale et demi-fenêtre (°C)
  A.COMPOUNDS = {
    S: { id: 'S', name: 'Tendre', color: 0xe02020, mu: 1.0, wear: 1.0, opt: 92, win: 28, type: 'slick' },
    M: { id: 'M', name: 'Medium', color: 0xf2d21b, mu: 0.965, wear: 0.62, opt: 96, win: 30, type: 'slick' },
    H: { id: 'H', name: 'Dur', color: 0xf2f2f2, mu: 0.93, wear: 0.4, opt: 100, win: 32, type: 'slick' },
    I: { id: 'I', name: 'Intermédiaire', color: 0x2fb35a, mu: 0.9, wear: 0.9, opt: 78, win: 34, type: 'inter' },
    W: { id: 'W', name: 'Pluie', color: 0x2a6fe0, mu: 0.85, wear: 0.8, opt: 68, win: 38, type: 'wet' },
  };

  // Facteur d'adhérence selon la piste mouillée w∈[0,1]
  A.wetGrip = (type, w) => {
    const s = A.smooth;
    if (type === 'slick') return 1 - 0.62 * Math.pow(w, 0.8);
    if (type === 'inter') return 0.82 + 0.17 * s(0, 0.45, w) - 0.2 * s(0.6, 1, w);
    return 0.68 + 0.22 * s(0, 0.7, w);
  };

  // pace : fraction de la limite ; err : fautes par minute ; noise : irrégularité ; agg : agressivité (0..1)
  A.DIFFS = [
    { name: 'Débutant', pace: 0.8, noise: 0.05, err: 0.35, agg: 0.15 },
    { name: 'Amateur', pace: 0.87, noise: 0.035, err: 0.18, agg: 0.3 },
    { name: 'Pro', pace: 0.93, noise: 0.022, err: 0.08, agg: 0.5 },
    { name: 'Champion', pace: 0.97, noise: 0.012, err: 0.035, agg: 0.7 },
    { name: 'Légende', pace: 1.0, noise: 0.006, err: 0.012, agg: 0.9 },
  ];
  // Interpole les paramètres pour un niveau continu 0..4
  A.diffAt = lv => {
    lv = A.clamp(lv, 0, 4);
    const i = Math.min(3, Math.floor(lv)), f = lv - i, a = A.DIFFS[i], b = A.DIFFS[i + 1];
    const o = { name: A.DIFFS[Math.round(lv)].name };
    for (const k of ['pace', 'noise', 'err', 'agg']) o[k] = A.lerp(a[k], b[k], f);
    return o;
  };

  // team : index d'écurie ; style : prudent | agressif | regulier | cannibale
  A.DRIVERS = [
    ['L. Marchand', 'regulier'], ['K. Brandt', 'agressif'], ['T. Okada', 'prudent'], ['M. Ferrer', 'cannibale'],
    ['J. Whitfield', 'regulier'], ['A. Kovacs', 'agressif'], ['R. Dubois', 'prudent'], ['S. Lindqvist', 'regulier'],
    ['D. Moretti', 'cannibale'], ['E. Santos', 'agressif'], ['P. Novak', 'prudent'], ['H. Tanaka', 'regulier'],
    ['G. Leclair', 'agressif'], ['N. Petrov', 'cannibale'], ['C. Alvarez', 'prudent'], ['B. O’Neill', 'regulier'],
    ['F. Rossi', 'agressif'], ['V. Hartmann', 'prudent'], ['Y. Benali', 'cannibale'],
  ].map((d, i) => ({ name: d[0], style: d[1], team: (i + 1) % 6, skill: 0.97 + ((i * 37) % 7) / 100 }));

  A.POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  A.DEFAULT_SETTINGS = {
    name: 'Toi',
    team: 0,
    number: 7,
    laps: 5,
    diff: 2,
    adaptive: true,
    weather: 'sun', // sun | cloud | rain | dynamic
    night: false,
    start: 'grid', // grid | rolling
    qualif: false,
    tire: 'M',
    shadows: true,
    mirrors: true,
    assists: { line: true, abs: true, tc: true, auto: true, limiter: true },
    audio: { master: 0.7, engine: 0.7, radio: 0.8, voice: '', freq: 'normal', radioOn: true },
    setup: { wing: 0.5, bias: 0.58, pF: 21, pR: 20.5 },
  };
})();
