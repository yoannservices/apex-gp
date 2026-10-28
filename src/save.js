// Sauvegarde localStorage (réglages, championnat, records, fantômes). Tout est protégé : file:// ou mode privé peuvent refuser l'accès.
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const P = 'agp.';
  const mem = {};

  A.Save = {
    get(k, def) {
      try { const v = localStorage.getItem(P + k); return v == null ? def : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : def; }
    },
    set(k, v) {
      mem[k] = v;
      try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del(k) { delete mem[k]; try { localStorage.removeItem(P + k); } catch (e) { /* rien */ } },

    settings() {
      const s = this.get('settings', {}), d = JSON.parse(JSON.stringify(A.DEFAULT_SETTINGS));
      const merge = (a, b) => { for (const k in b) a[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? merge(a[k], b[k]) : b[k]; return a; };
      return merge(d, s);
    },
    saveSettings(s) { return this.set('settings', s); },

    // meilleurs temps : { [trackId]: { best, sectors:[3], compound } }
    records() { return this.get('records', {}); },
    record(trackId, lapT, sectors, compound) {
      const r = this.records(), cur = r[trackId];
      if (!cur || lapT < cur.best) { r[trackId] = { best: lapT, sectors, compound }; this.set('records', r); return true; }
      return false;
    },
    bestSectors(trackId) { const r = this.records()[trackId]; return r ? r.sectors : null; },
  };
})();
