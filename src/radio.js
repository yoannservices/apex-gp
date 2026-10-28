// Ingénieur de course : messages contextuels en français (Web Speech + grésillement Web Audio), questions Oui/Non (Y/N), fréquence réglable.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const MINP = { minimal: 3, normal: 2, chatty: 1 };
  const PART = { fw: "l'aileron avant", rw: "l'aileron arrière", mirL: 'le rétroviseur gauche', mirR: 'le rétroviseur droit' };
  const WHY = { limits: 'limites de piste', collision: 'collision', pitspeed: 'excès de vitesse aux stands' };
  const num = (t, d = 1) => t.toFixed(d).replace('.', ',');
  const synth = globalThis.speechSynthesis;

  A.Radio = class Radio {
    // ui : { say(text, question|null), clear() } fournie par le HUD
    constructor(race, audio, settings, ui) {
      this.race = race; this.audio = audio; this.set = settings; this.ui = ui;
      this.q = []; this.cd = {}; this.cur = null; this.pending = null; this.t = 0; this.chk = 0; this.lastLap = -1; this.forecastSeen = new Set();
      race.on((type, d) => this._event(type, d));
    }

    static voices() { return synth ? synth.getVoices().filter(v => /^fr/i.test(v.lang)) : []; }

    // key : limite la répétition (secondes). prio : 1 bavard, 2 normal, 3 important, 9 réponse demandée
    say(text, prio, o) {
      o = o || {};
      const a = this.set.audio;
      if (!a.radioOn && prio < 9) return;
      if (prio < 9 && prio < MINP[a.freq || 'normal']) return;
      if (o.key) { if (this.t - (this.cd[o.key] || -1e9) < (o.cd || 30)) return; this.cd[o.key] = this.t; }
      this.q.push({ text, prio, q: o.q || null, t: this.t });
      this.q.sort((x, y) => y.prio - x.prio);
    }

    ask(text, yes, no, o) { this.say(text + ' Y ou N ?', 2.5, Object.assign({ q: { yes, no } }, o)); }

    answer(yes) {
      const p = this.pending; if (!p) return;
      this.pending = null; this.ui.clear();
      if (yes) p.yes && p.yes(); else p.no && p.no();
    }

    _speak(item) {
      this.cur = item; item.end = this.t + Math.max(2, item.text.length * 0.07) + 1.5;
      this.audio.crackle(0.3);
      this.ui.say(item.text, item.q);
      if (item.q) this.pending = Object.assign({ until: this.t + 14 }, item.q);
      const a = this.set.audio;
      if (synth && a.radioOn && a.radio > 0) {
        try {
          const u = new SpeechSynthesisUtterance(item.text);
          u.lang = 'fr-FR'; u.rate = 1.12; u.pitch = 0.85; u.volume = a.radio * a.master;
          const v = a.voice && Radio.voices().find(x => x.name === a.voice) || Radio.voices()[0];
          if (v) u.voice = v;
          synth.cancel(); synth.speak(u);
        } catch (e) { /* synthèse indisponible : sous-titres seuls */ }
      }
    }

    update(dt, act) {
      const R = this.race, p = R.player; if (!p) return;
      this.t += dt;
      if (act.yes) this.answer(true); else if (act.no) this.answer(false);
      if (act.radio) this.say(this._status(), 9);
      if (this.pending && this.t > this.pending.until) { this.pending = null; }
      if (this.cur && this.t > this.cur.end) {
        this.audio.crackle(0.15); this.audio.beep(1400, 0.05);
        if (!this.pending) this.ui.clear();
        this.cur = null;
      }
      this.q = this.q.filter(m => this.t - m.t < 15);
      if (!this.cur && this.q.length && !this.pending) this._speak(this.q.shift());
      if ((this.chk -= dt) <= 0) { this.chk = 1; this._periodic(p); }
    }

    _status() {
      const R = this.race, p = R.player, a = R.ahead(p), b = R.behind(p), n = R.cars.length;
      let s = `Position ${p.pos} sur ${n}. `;
      if (R.laps !== Infinity) s += `Tour ${Math.min(p.lap, R.laps)} sur ${R.laps}. `;
      s += `Pneus usés à ${Math.round(p.avgWear * 100)} pour cent, ${Math.round(p.fuel)} kilos d'essence. `;
      if (a) s += `Devant, ${num(R.gap(p, a))} seconde. `;
      if (b) s += `Derrière, ${num(R.gap(b, p))}. `;
      const dm = A.damageScore(p.d); if (dm > 0.15) s += 'Voiture endommagée. ';
      return s;
    }

    _event(type, d) {
      const R = this.race, p = R.player, c = d.car, mine = c === p;
      switch (type) {
        case 'start': this.say(R.cfg.rolling ? 'Départ lancé, reste dans ta file.' : 'Feux éteints, go go go !', 2); break;
        case 'lap':
          if (!mine) break;
          if (R.laps !== Infinity && d.lap + 1 === R.laps) this.say('Dernier tour. Donne tout.', 3);
          else if (d.fastest) this.say(`Meilleur tour de la course, ${A.fmt(d.t)}.`, 2);
          else if (d.pb && R.mode !== 'race') this.say(`Meilleur temps personnel, ${A.fmt(d.t)}.`, 2);
          else if (!d.valid) this.say('Tour non valide.', 1, { key: 'invalid', cd: 20 });
          else if (R.mode === 'race') {
            const a = R.ahead(p), b = R.behind(p);
            this.say(`Tour en ${A.fmt(d.t)}. ${a ? 'Devant ' + num(R.gap(p, a)) + ' seconde.' : 'Tu mènes.'} ${b ? 'Derrière ' + num(R.gap(b, p)) + '.' : ''}`, 1, { key: 'lapinfo', cd: 55 });
          }
          break;
        case 'penalty': if (mine) this.say(`Pénalité de ${d.secs} secondes. ${WHY[d.why] || ''}.`, 3); break;
        case 'limits': if (mine) this.say(d.n === 1 ? 'Attention aux limites de piste.' : 'Deuxième avertissement. Le prochain sera une pénalité.', 2, { key: 'limits', cd: 15 }); break;
        case 'yellow': if (!mine) this.say(`Drapeau jaune, secteur ${d.sector}.`, 2, { key: 'yellow', cd: 15 }); break;
        case 'sc':
          if (d.on) this.say('Safety car, safety car. Reste derrière, pas de dépassement.', 3);
          else if (d.ending) this.say('La safety car rentre au prochain tour. Prépare la relance.', 3);
          else this.say('Course relancée !', 3);
          break;
        case 'drs': this.say('DRS disponible.', 1, { key: 'drs', cd: 40 }); break;
        case 'damage':
          if (mine && d.sev > 6 && !p.pit.want && R.mode !== 'quali') {
            const bad = A.damageScore(p.d);
            if (bad > 0.25) this.ask('Tu as des dégâts. On rentre changer ça ?', () => { R.pits.request(p); this.say('Reçu, on t\'attend au stand.', 2); }, () => this.say('Compris, on continue.', 1), { key: 'dmgq', cd: 45 });
            else this.say('Contact, tout va bien ?', 2, { key: 'hit', cd: 12 });
          }
          break;
        case 'detach': if (mine && PART[d.part]) this.say(`Tu as perdu ${PART[d.part]}.`, 3, { key: 'det' + d.part, cd: 8 }); break;
        case 'puncture': if (mine) { this.say('Crevaison ! Rentre au stand, vite.', 3); if (R.mode !== 'quali') R.pits.request(p); } break;
        case 'overtake':
          if (mine && R.mode === 'race') this.say(d.to < d.from ? `Bien joué, P${d.to}.` : `On perd une place, tu es P${d.to}.`, 1, { key: 'ovt', cd: 25 });
          break;
        case 'finish': if (mine) this.say(R.mode === 'race' ? `Drapeau à damier ! Tu termines P${p.pos}. Bravo.` : 'Session terminée.', 3); break;
        case 'pitreq': if (mine) this.say(d.want ? `Reçu, stand ce tour. Pneus ${A.COMPOUNDS[p.pit.tire].name}.` : 'Annulé, tu restes en piste.', 2); break;
        case 'pitin': if (mine) this.say('Limiteur activé, 80 à l\'heure.', 2, { key: 'pitin', cd: 5 }); break;
        case 'missed': if (mine) this.say('On t\'a raté. Prochain tour.', 2); break;
        case 'pitout': if (mine) this.say(`Arrêt en ${num(d.dur)} secondes. Go go go !`, 2); break;
        case 'crash': if ((d.a === p || d.b === p) && d.sev > 8) this.say('Gros contact ! Réponds-moi.', 3, { key: 'crash', cd: 10 }); break;
        case 'wall': if (mine && d.sev > 8) this.say('Gros impact ! Tout va bien ?', 3, { key: 'wallr', cd: 10 }); break;
        case 'recover': if (mine) this.say('Voiture replacée.', 1, { key: 'rec', cd: 10 }); break;
        default:
      }
    }

    _periodic(p) {
      const R = this.race;
      if (R.phase !== 'race' || p.finished || p.dnf || R.mode === 'quali') return;
      const left = R.laps - (p.lap - 1);
      // pneus et stratégie
      if (R.mode === 'race' && !p.pit.want && !p.pit.state && p.lap >= 2) {
        const ad = R.pits.advise(p);
        if (ad.want) {
          const nm = A.COMPOUNDS[ad.tire || 'M'].name, why = { wear: 'Les pneus sont usés.', wet: 'La piste est trop humide pour ces gommes.', dry: 'La piste sèche.', damage: 'Les dégâts coûtent du temps.', rule: 'Il faut utiliser deux types de gommes.' }[ad.why] || '';
          this.ask(`${why} Je propose un arrêt pour des pneus ${nm}. Tu confirmes ?`, () => { R.pits.request(p, ad.tire); R.emit('pitreq', { car: p, want: true }); }, () => this.say('Compris, on reste dehors.', 1), { key: 'tireq', cd: 70 });
        }
      }
      // météo
      const w = R.weather && R.weather.forecast && R.weather.forecast();
      if (w && w.rainIn !== undefined && w.rainIn < 150) this.say(`La pluie arrive dans environ ${Math.max(1, Math.round(w.rainIn / 60))} minute${w.rainIn > 90 ? 's' : ''}.`, 2, { key: 'rain', cd: 120 });
      if (w && w.dryIn !== undefined && w.dryIn < 120) this.say('La pluie va s\'arrêter bientôt, piste qui sèche.', 2, { key: 'dry', cd: 120 });
      if (R.env.wet > 0.35 && p.tires[0].c.type === 'slick' && !p.pit.want && R.mode === 'race') this.ask('Il pleut fort. On passe en gommes pluie ?', () => { R.pits.request(p, R.env.wet > 0.62 ? 'W' : 'I'); R.emit('pitreq', { car: p, want: true }); }, null, { key: 'wetq', cd: 60 });
      // températures
      const c = p.tires[0].c, tp = p.avgTemp;
      if (tp > c.opt + c.win + 6) this.say('Les pneus surchauffent. Ménage-les.', 1, { key: 'hot', cd: 80 });
      else if (tp < c.opt - c.win - 4 && p.speed > 20) this.say('Pneus froids, attention à l\'adhérence.', 1, { key: 'cold', cd: 80 });
      // carburant
      if (p.fuel < 5 && left > 1.5 && !p.fuelSave && R.laps !== Infinity) this.ask('Essence juste. On passe en mode économie ?', () => { p.fuelSave = true; this.say('Mode économie activé.', 1); }, null, { key: 'fuelq', cd: 90 });
      // trafic
      const b = R.behind(p), a = R.ahead(p);
      if (R.mode === 'race' && R.rules.sc.mode === 0) {
        if (b && !b.dnf && R.gap(b, p) < 0.6) this.say('Voiture derrière, moins d\'une seconde.', 1, { key: 'behind', cd: 40 });
        if (a && !a.dnf && R.gap(p, a) < 0.8 && a.pos < p.pos) this.say(`Tu reviens sur ${a.name}, ${num(R.gap(p, a))} seconde.`, 1, { key: 'ahead', cd: 45 });
        if (R.rules.blue) this.say('Drapeau bleu. Laisse passer le leader.', 2, { key: 'blue', cd: 20 });
      }
    }
  };
})();
