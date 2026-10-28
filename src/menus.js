// Menus en DOM : accueil, configuration de session, réglages, records, commandes, pause, résultats, championnat.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  const KINDS = { race: 'Course', tt: 'Contre-la-montre', champ: 'Championnat', practice: 'Essais libres' };

  const CONTROLS = [
    ['Z / ↑ · S / ↓', 'Accélérer · freiner'], ['Q / D · ← →', 'Direction'], ['E / Maj · F / Ctrl', 'Rapport supérieur · inférieur (boîte manuelle)'],
    ['Espace', 'DRS (zone de DRS, voiture à moins de 1 s)'], ['X', 'Demander / annuler un arrêt au stand'], ['C', 'Changer de caméra'], ['V (maintenu)', 'Regarder derrière'],
    ['G', 'Mode économie de carburant'], ['T', "Point de l'ingénieur"], ['Y / N', "Répondre à l'ingénieur"], ['R · Maj+R', 'Replacer la voiture · recommencer'], ['Échap / P', 'Pause'], ['Manette', 'Gâchettes gaz/frein, stick gauche, A DRS, X stand, Y caméra, bumpers rapports, Start pause'],
  ];

  A.Menus = {
    init(container, app) {
      this.app = app; this.root = el('div', 'menu', container); this.root.style.display = 'none';
      // sélecteur d'image de fond : dégradé uniquement (aucun fichier externe)
      return this;
    },
    hide() { this.root.style.display = 'none'; this.root.innerHTML = ''; this.open = false; },
    _screen(title, sub) {
      this.root.innerHTML = ''; this.root.style.display = 'flex'; this.open = true;
      const p = el('div', 'panel', this.root); el('h1', '', p, title); if (sub) el('div', 'sub', p, sub);
      return p;
    },
    _btn(p, text, fn, cls) { const b = el('button', cls || '', p, text); b.onclick = () => { this.app.unlock(); fn(); }; return b; },

    // ---------- champs de formulaire ----------
    _row(p, label) { const r = el('label', 'row', p); el('span', '', r, label); return r; },
    _sel(p, label, opts, obj, key, num) {
      const s = el('select', '', this._row(p, label));
      opts.forEach(o => { const e = el('option', '', s, o[1]); e.value = o[0]; });
      s.value = obj[key]; s.onchange = () => { obj[key] = num ? +s.value : s.value; this.app.saveSet(); };
      return s;
    },
    _rng(p, label, min, max, step, obj, key, fmt) {
      const r = this._row(p, label), i = el('input', '', r), v = el('em', '', r);
      i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = obj[key]; v.textContent = fmt ? fmt(obj[key]) : obj[key];
      i.oninput = () => { obj[key] = +i.value; v.textContent = fmt ? fmt(obj[key]) : obj[key]; this.app.saveSet(); };
    },
    _chk(p, label, obj, key) { const i = el('input', '', this._row(p, label)); i.type = 'checkbox'; i.checked = !!obj[key]; i.onchange = () => { obj[key] = i.checked; this.app.saveSet(); }; },
    _txt(p, label, obj, key, max, num) {
      const i = el('input', '', this._row(p, label)); i.type = num ? 'number' : 'text'; i.value = obj[key]; i.maxLength = max || 16;
      if (num) { i.min = 0; i.max = 99; }
      i.onchange = () => { obj[key] = num ? Math.max(0, Math.min(99, Math.round(+i.value) || 0)) : (i.value.trim() || 'Toi'); this.app.saveSet(); };
    },

    _audio(p, s) {
      el('h2', '', p, 'Audio & radio');
      const pc = v => Math.round(v * 100) + ' %';
      this._rng(p, 'Volume général', 0, 1, 0.05, s.audio, 'master', pc);
      this._rng(p, 'Moteur', 0, 1, 0.05, s.audio, 'engine', pc);
      this._rng(p, 'Radio', 0, 1, 0.05, s.audio, 'radio', pc);
      this._chk(p, 'Radio activée', s.audio, 'radioOn');
      this._sel(p, 'Fréquence radio', [['minimal', 'Minimale (urgences)'], ['normal', 'Normale'], ['chatty', 'Bavarde']], s.audio, 'freq');
      const voices = A.Radio.voices();
      this._sel(p, 'Voix', [['', voices.length ? 'Auto (français)' : 'Aucune voix FR — sous-titres']].concat(voices.map(v => [v.name, v.name])), s.audio, 'voice');
    },
    _assists(p, s) {
      el('h2', '', p, 'Aides');
      this._chk(p, 'Trajectoire idéale', s.assists, 'line'); this._chk(p, 'ABS', s.assists, 'abs'); this._chk(p, 'Antipatinage', s.assists, 'tc');
      this._chk(p, 'Boîte automatique', s.assists, 'auto'); this._chk(p, 'Limiteur dans les stands', s.assists, 'limiter');
    },
    _gfx(p, s) {
      el('h2', '', p, 'Affichage');
      this._chk(p, 'Ombres', s, 'shadows'); this._chk(p, 'Rétroviseurs', s, 'mirrors');
    },

    // ---------- écrans ----------
    main() {
      const p = this._screen('APEX GP', 'Simulation de Formule 1 — 100 % procédurale, Three.js');
      const ch = A.Champ.state();
      this._btn(p, 'Course', () => this.setup('race'));
      this._btn(p, 'Contre-la-montre', () => this.setup('tt'));
      this._btn(p, ch && !A.Champ.finished() ? `Championnat — manche ${ch.round + 1}/${A.TRACK_DEFS.length}` : 'Championnat', () => this.champ());
      this._btn(p, 'Essais libres', () => this.setup('practice'));
      this._btn(p, 'Réglages', () => this.settings(), 'alt'); this._btn(p, 'Records', () => this.records(), 'alt'); this._btn(p, 'Commandes', () => this.controls(), 'alt');
    },

    setup(kind) {
      const s = this.app.set, p = this._screen(KINDS[kind], kind === 'champ' ? (A.Champ.track() || {}).name : 'Configuration');
      const g = el('div', 'cols', p), a = el('div', 'col', g), b = el('div', 'col', g);
      el('h2', '', a, 'Session');
      if (kind !== 'champ') this._sel(a, 'Circuit', A.TRACK_DEFS.map(d => [d.id, `${d.name} (${d.country})`]), s, 'track');
      if (kind === 'race' || kind === 'champ') {
        this._sel(a, 'Tours', [[3, '3'], [5, '5'], [8, '8'], [12, '12'], [20, '20']], s, 'laps', true);
        this._sel(a, 'Difficulté des bots', A.DIFFS.map((d, i) => [i, d.name]), s, 'diff', true);
        this._chk(a, 'Difficulté adaptative', s, 'adaptive');
        this._sel(a, 'Départ', [['grid', 'Arrêté sur la grille'], ['rolling', 'Lancé']], s, 'start');
        if (kind === 'race') this._chk(a, 'Qualifications (2 tours)', s, 'qualif');
      }
      this._sel(a, 'Météo', [['sun', 'Soleil'], ['cloud', 'Nuageux'], ['rain', 'Pluie'], ['dynamic', 'Dynamique']], s, 'weather');
      this._chk(a, 'Nuit', s, 'night');
      el('h2', '', b, 'Pilote & voiture');
      this._txt(b, 'Nom', s, 'name', 14); this._txt(b, 'Numéro', s, 'number', 2, true);
      this._sel(b, 'Écurie', A.TEAMS.map((t, i) => [i, t.name]), s, 'team', true);
      this._sel(b, 'Pneus de départ', Object.values(A.COMPOUNDS).map(c => [c.id, c.name]), s, 'tire');
      this._rng(b, 'Aileron', 0, 1, 0.05, s.setup, 'wing', v => (v < 0.35 ? 'Vitesse de pointe' : v > 0.65 ? 'Appui max' : 'Équilibré'));
      this._rng(b, 'Répartition freins (av.)', 0.5, 0.66, 0.005, s.setup, 'bias', v => Math.round(v * 100) + ' %');
      this._rng(b, 'Pression AV (psi)', 18, 25, 0.5, s.setup, 'pF'); this._rng(b, 'Pression AR (psi)', 18, 25, 0.5, s.setup, 'pR');
      const row = el('div', 'actions', p);
      this._btn(row, 'Démarrer', () => this.app.start(kind)); this._btn(row, 'Retour', () => this.main(), 'alt');
    },

    settings(back) {
      const s = this.app.set, p = this._screen('Réglages');
      const g = el('div', 'cols', p), a = el('div', 'col', g), b = el('div', 'col', g);
      this._audio(a, s); this._assists(b, s); this._gfx(b, s);
      const row = el('div', 'actions', p); this._btn(row, 'Retour', back || (() => this.main()), 'alt');
    },

    records() {
      const p = this._screen('Records'), r = A.Save.records(), t = el('table', '', p);
      el('tr', '', t).innerHTML = '<th>Circuit</th><th>Meilleur tour</th><th>S1</th><th>S2</th><th>S3</th><th>Pneus</th>';
      A.TRACK_DEFS.forEach(d => {
        const x = r[d.id], tr = el('tr', '', t);
        tr.innerHTML = `<td>${d.name}</td><td>${x ? A.fmt(x.best) : '—'}</td>` + [0, 1, 2].map(i => `<td>${x && x.sectors ? x.sectors[i].toFixed(2) : '—'}</td>`).join('') + `<td>${x ? A.COMPOUNDS[x.compound].name : '—'}</td>`;
      });
      this._btn(el('div', 'actions', p), 'Retour', () => this.main(), 'alt');
    },

    controls() {
      const p = this._screen('Commandes'), t = el('table', '', p);
      CONTROLS.forEach(c => { el('tr', '', t).innerHTML = `<td><b>${c[0]}</b></td><td>${c[1]}</td>`; });
      this._btn(el('div', 'actions', p), 'Retour', () => this.main(), 'alt');
    },

    champ() {
      const st = A.Champ.state();
      if (!st) { A.Champ.start(this.app.set); return this.setup('champ'); }
      const done = A.Champ.finished(), p = this._screen('Championnat', done ? 'Saison terminée' : 'Prochaine manche : ' + A.Champ.track().name);
      this.champTable(p);
      const row = el('div', 'actions', p);
      if (!done) { this._btn(row, 'Réglages de la manche', () => this.setup('champ')); }
      this._btn(row, 'Nouveau championnat', () => { A.Champ.reset(); this.champ(); }, 'alt'); this._btn(row, 'Retour', () => this.main(), 'alt');
    },

    champTable(p) {
      const g = el('div', 'cols', p), a = el('div', 'col', g), b = el('div', 'col', g);
      el('h2', '', a, 'Pilotes'); const t = el('table', '', a);
      A.Champ.drivers().slice(0, 12).forEach((d, i) => { el('tr', d.name === this.app.set.name ? 'me' : '', t).innerHTML = `<td>${i + 1}</td><td><i class="dot" style="background:${hex(A.TEAMS[d.team].color)}"></i>${esc(d.name)}</td><td>${d.pts}</td>`; });
      el('h2', '', b, 'Écuries'); const u = el('table', '', b);
      A.Champ.teams().forEach((d, i) => { el('tr', '', u).innerHTML = `<td>${i + 1}</td><td><i class="dot" style="background:${hex(A.TEAMS[d.team].color)}"></i>${A.TEAMS[d.team].name}</td><td>${d.pts}</td>`; });
    },

    pause() {
      const p = this._screen('Pause');
      this._btn(p, 'Reprendre', () => this.app.resume());
      this._btn(p, 'Recommencer', () => this.app.restart(), 'alt');
      this._btn(p, 'Audio & aides', () => this.settings(() => this.pause()), 'alt');
      this._btn(p, 'Quitter vers le menu', () => this.app.quit(), 'alt');
    },

    results(race, kind, info) {
      const p = this._screen(info.title, info.sub), t = el('table', 'res', p);
      el('tr', '', t).innerHTML = '<th>#</th><th>Pilote</th><th>Écurie</th><th>Tours</th><th>Temps</th><th>Meilleur</th><th>Pén.</th><th>Pts</th>';
      race.results.forEach(r => {
        const c = r.car, best = race.fastest && race.fastest.car === c;
        el('tr', c.isPlayer ? 'me' : '', t).innerHTML = `<td>${r.dnf ? 'DNF' : r.pos}</td><td>${esc(c.name)}</td><td><i class="dot" style="background:${hex(c.team.color)}"></i>${c.team.name}</td><td>${r.laps}</td><td>${r.time ? (r.pos === 1 ? A.fmt(r.time) : A.fmtGap(r.gap)) : '—'}</td><td class="${best ? 'pur' : ''}">${r.best ? A.fmt(r.best) : '—'}</td><td>${r.pen ? '+' + r.pen + ' s' : ''}</td><td>${r.points || ''}</td>`;
      });
      if (info.champ) this.champTable(p);
      const row = el('div', 'actions', p);
      (info.buttons || []).forEach(b => this._btn(row, b[0], b[1], b[2]));
    },

    // écran simple (fin de qualifs, fin d'essais)
    summary(title, sub, lines, buttons) {
      const p = this._screen(title, sub);
      lines.forEach(l => el('div', 'line', p, l));
      const row = el('div', 'actions', p); buttons.forEach(b => this._btn(row, b[0], b[1], b[2]));
    },
  };
})();
