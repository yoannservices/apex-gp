// Voie des stands : revêtement, marquages des emplacements et garages (un par voiture).
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;

  A.buildPitlane = (tr, group, std) => {
    const tex = A.canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#4a4c52'; c.fillRect(0, 0, w, h); A.speckle(c, w, h, 800, ['#3e4046', '#55575d', '#46484e'], 2); });
    const hw = tr.hw, ph = tr.pitHW;
    const pit = tr._strip(i => (tr.pitOff[i] > 0.5 ? [hw, Math.max(hw, tr.pitOff[i] + ph)] : [hw, hw]), std(tex, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { y: 0.006, us: 8, vs: 8 });
    group.add(pit);

    const parts = [], lines = [];
    const colors = tr.slotColors || [];
    for (let k = 0; k < 20; k++) {
      const s = tr.pitSlotS(k), c = colors[k] != null ? colors[k] : 0x888888;
      const g = tr.at(s, tr.pitCenter + ph + 7.5);
      // garage : corps, toit coloré, ouverture sombre côté voie
      parts.push(A.box(8, 4, 15.5, 0x55585e, g.x, 2, g.z, 0, g.h, 0));
      parts.push(A.box(8.6, 0.5, 16, c, g.x, 4.25, g.z, 0, g.h, 0));
      const f = tr.at(s, tr.pitCenter + ph + 3.4);
      parts.push(A.box(0.3, 3, 11, 0x15161a, f.x, 1.7, f.z, 0, f.h, 0));
      // marquage de l'emplacement d'arrêt
      const m = tr.at(s + 1.94, tr.pitCenter + 0.5);
      lines.push(A.part(new T.PlaneGeometry(4.2, 0.25).rotateX(-Math.PI / 2), 0xffffff, m.x, 0.02, m.z, 0, m.h, 0));
    }
    // ligne blanche entre la piste et la voie (plateau)
    for (let rel = -170; rel < 180; rel += 8) {
      const m = tr.at(rel, hw + 1.2);
      lines.push(A.part(new T.PlaneGeometry(0.3, 6).rotateX(-Math.PI / 2), 0xffffff, m.x, 0.02, m.z, 0, m.h, 0));
    }
    group.add(new T.Mesh(A.merge(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    group.add(new T.Mesh(A.merge(lines), new T.MeshBasicMaterial({ vertexColors: true })));
  };
})();
