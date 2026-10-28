// Point d'entrée : renderer, session (circuit + course + météo + radio + HUD), boucle principale, pause, qualité auto.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;
  const app = document.getElementById('app');

  // erreurs visibles à l'écran (utile en file:// où la console est cachée)
  const errBox = document.createElement('div'); errBox.className = 'errbox'; document.body.appendChild(errBox);
  addEventListener('error', e => { errBox.style.display = 'block'; errBox.textContent = 'Erreur : ' + e.message + ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')'; });

  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.domElement.id = 'gl'; app.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(65, 1, 0.1, 4000);
  const rig = new A.CameraRig(camera, app);
  const hud = new A.Hud(app); hud.show(false);
  const set = A.Save.settings(); set.track = set.track || 'velocita';
  const audio = new A.Audio(set);
  A.Input.init();

  const S = { race: null, scene: null, paused: false, kind: null, opts: {} };
  let W = 1, H = 1;
  const resize = () => { W = innerWidth; H = innerHeight; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();

  function disposeScene(sc) {
    sc.traverse(o => {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(m => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); });
    });
  }

  function endSession() {
    if (S.race) S.race.dispose();
    if (S.ghost) S.ghost.dispose();
    if (S.scene) disposeScene(S.scene);
    if (globalThis.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* rien */ }
    S.race = S.scene = S.ghost = S.radio = S.weather = null; S.paused = false;
    hud.show(false); rig.hideMirrors(); hud.radioClear();
  }

  const App = (A.App = {
    set, S, rig, hud,
    saveSet() { A.Save.saveSettings(set); audio.setVolumes(); },
    unlock() { audio.start(); },

    start(kind, opts) {
      opts = opts || {};
      endSession(); A.Menus.hide();
      const def = kind === 'champ' ? A.Champ.track() : A.TRACK_DEFS.find(d => d.id === set.track) || A.TRACK_DEFS[0];
      if (!def) return A.Menus.champ();
      S.kind = kind; S.opts = opts;
      const quali = kind === 'race' && set.qualif && !opts.skipQuali;
      const tr = new A.Track(def), scene = (S.scene = new T.Scene());
      renderer.shadowMap.enabled = !!set.shadows && !S.lowQ;
      const cfg = A.Modes.config(quali ? 'quali' : kind === 'champ' ? 'race' : kind, set, tr, opts);
      cfg.scene = scene;
      const race = (S.race = new A.Race(cfg));
      tr.slotTeams = Array.from({ length: 20 }, (_, k) => race.cars.find(x => x.gridPos === k)?.teamIdx ?? k % 6);
      tr.playerSlot = race.player.gridPos;
      tr.build(); scene.add(tr.group);
      const weather = (S.weather = race.weather = new A.Weather(scene, renderer, tr, { weather: set.weather, night: set.night }, race.env));
      if (set.night) weather.attachHeadlight(race.models.get(race.player).root);
      S.audioOn = true; S.quali = quali; S.gLap = -1;
      S.ghost = kind === 'tt' ? new A.Ghost(scene, tr, set) : null;
      S.radio = new A.Radio(race, audio, set, { say: (t, q) => hud.radioSay(t, q), clear: () => hud.radioClear() });
      rig.setMode('chase'); rig.tvLook.set(race.player.x, 0, race.player.z);
      hud.attach(race, set); hud.show(true);
      race.on((type, d) => this.onEvent(type, d, race, tr));
      race.cam = camera.position;
    },

    onEvent(type, d, race, tr) {
      const p = race.player, mine = d.car === p;
      if (type === 'sector' && mine && (S.kind === 'tt' || S.kind === 'practice')) {
        const sb = A.Save.bestSectors(tr.id);
        d.color = sb && d.t <= sb[d.i] + 1e-6 ? 'purple' : !p.secBest[d.i] || d.t <= p.secBest[d.i] + 1e-6 ? 'green' : 'yellow';
      }
      hud.onEvent(type, d, race);
      if ((type === 'crash' && (d.a === p || d.b === p)) || (type === 'wall' && mine)) audio.thud(d.sev);
      if (type === 'lap' && mine && (S.kind === 'tt' || S.kind === 'practice')) {
        if (S.ghost) S.ghost.endLap(d.t, d.valid);
        if (d.valid && A.Save.record(tr.id, d.t, p.curSec.slice(), p.compound)) hud.toast('NOUVEAU RECORD DU CIRCUIT', 'purple', 5);
      }
      if (type === 'lights') audio.beep(d.n >= 5 ? 700 : 500, 0.12);
      if (type === 'start') audio.beep(1100, 0.25);
      if (type === 'end') setTimeout(() => S.race === race && this.showResults(race), 600);
    },

    showResults(race) {
      const M = A.Menus, kind = S.kind, p = race.player, me = race.results.find(r => r.car === p);
      if (S.quali) {
        const g = A.Modes.gridFromQuali(race);
        return M.summary('Qualifications', race.tr.name, [`Ton meilleur tour : ${p.best ? A.fmt(p.best) : 'aucun tour valide'}`, `Place sur la grille : P${g + 1} / 20`],
          [['Lancer la course', () => this.start(kind, { skipQuali: true, playerGrid: g })], ['Refaire les qualifs', () => this.restart(), 'alt'], ['Menu', () => this.quit(), 'alt']]);
      }
      const title = me && !me.dnf ? `Arrivée — P${me.pos}` : 'Course terminée';
      const info = { title, sub: race.tr.name + (race.fastest ? ` · meilleur tour ${race.fastest.car.name} ${A.fmt(race.fastest.t)}` : ''), buttons: [], champ: false };
      if (kind === 'champ') {
        A.Champ.add(race.results, race.tr.name); info.champ = true;
        info.buttons.push(A.Champ.finished() ? ['Fin de saison', () => A.Menus.champ()] : ['Manche suivante', () => this.start('champ')]);
      } else info.buttons.push(['Rejouer', () => this.restart()]);
      info.buttons.push(['Menu', () => this.quit(), 'alt']);
      M.results(race, kind, info);
    },

    pause() { if (!S.race || S.paused || S.race.resultsDone) return; S.paused = true; A.Menus.pause(); },
    resume() { S.paused = false; A.Menus.hide(); },
    restart() { this.start(S.kind, S.opts); },
    quit() { endSession(); A.Menus.main(); },
  });

  // ---------- boucle ----------
  let last = performance.now(), fpsT = 0, fpsN = 0, bad = 0;
  function quality(dt) {
    fpsT += dt; fpsN++;
    if (fpsT < 2.5) return;
    const fps = fpsN / fpsT; fpsT = fpsN = 0;
    bad = fps < 45 ? bad + 1 : 0;
    if (bad < 2 || S.q >= 3) return;
    bad = 0; S.q = (S.q || 0) + 1; S.lowQ = true;
    if (S.q === 1) renderer.setPixelRatio(1);
    else if (S.q === 2) { if (S.weather) S.weather.sunL.castShadow = false; set.mirrors = false; }
    else renderer.setPixelRatio(0.75);
    resize(); hud.toast('Qualité réduite pour garder la fluidité', '', 3);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const act = A.Input.actions(), race = S.race;
    if (race) {
      const p = race.player;
      if (act.pause) { if (S.paused) App.resume(); else if (!A.Menus.open) App.pause(); }
      if (document.hidden && !S.paused) App.pause();
      if (!S.paused) {
        A.Input.update(dt, p.speed);
        if (act.cam) rig.cycle();
        if (act.mirror) { set.mirrors = !set.mirrors; App.saveSet(); }
        if (act.map) hud.map.style.display = hud.map.style.display === 'none' ? '' : 'none';
        if (act.restart) return App.restart(), A.Input.endFrame();
        race.setPlayer({ steer: A.Input.steer, thr: A.Input.thr, brk: A.Input.brk }, act);
        race.update(dt);
        rig.update(dt, race, act.look);
        S.weather.update(dt, camera, p);
        S.radio.update(dt, act);
        if (S.ghost && p.lap >= 1) {
          if (p.lap !== S.gLap) { S.gLap = p.lap; S.ghost.startLap(); }
          S.ghost.record(p.lapT, p, dt); S.ghost.update(p.lapT);
        }
        const gd = S.ghost && p.lap >= 1 ? S.ghost.delta(p.s, p.lapT) : null;
        hud.update(dt, race, { rig, delta: gd });
        quality(dt);
      }
      audio.update(dt, { car: p, rain: S.weather.rain, cockpit: rig.mode === 'cockpit', paused: S.paused });
      renderer.render(S.scene, camera);
      rig.renderMirrors(renderer, S.scene, race, W, H);
    }
    A.Input.endFrame();
  }

  // démarrage direct pour les tests : index.html#race,pluie,nuit,ville,tt…
  A.Menus.init(app, App);
  const tok = location.hash.slice(1).split(',').filter(Boolean);
  if (tok.length) {
    const W2 = { rain: 'rain', pluie: 'rain', cloud: 'cloud', dynamic: 'dynamic' };
    tok.forEach(t => { if (W2[t]) set.weather = W2[t]; else if (t === 'night') set.night = true; else if (A.TRACK_DEFS.some(d => d.id === t)) set.track = t; else if (t === 'rolling') set.start = 'rolling'; });
    App.start(['race', 'tt', 'practice', 'champ'].find(k => tok.includes(k)) || 'race');
  } else A.Menus.main();
  addEventListener('pointerdown', () => audio.start());
  requestAnimationFrame(frame);
})();
