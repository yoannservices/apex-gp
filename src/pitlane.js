// Voie des stands : revêtement, marquages des emplacements et garages (un par voiture).
(function () {
  const A = (globalThis.AGP = globalThis.AGP || {});
  const T = THREE;

  A.buildPitlane = (tr, group, std) => {
    const tex = A.canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#4a4c52'; c.fillRect(0, 0, w, h); A.speckle(c, w, h, 800, ['#3e4046', '#55575d', '#46484e'], 2); });
    const hw = tr.hw, ph = tr.pitHW;
    const pit = tr._strip(i => (tr.pitOff[i] > 0.5 ? [hw, Math.max(hw, tr.pitOff[i] + ph)] : [hw, hw]), std(tex, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { y: 0.006, us: 8, vs: 8 });
    group.add(pit);

    const parts = [], lines = [], K = BuildingKit(T), kacc = K.acc();
    for (let k = 0; k < 20; k++) {
      const s = tr.pitSlotS(k), teamIdx = tr.slotTeams?.[k] ?? k % A.TEAMS.length;
      const team = A.TEAMS[teamIdx], player = k === tr.playerSlot;
      // garage du kit commun (assets/building-kit.js) : baie ouverte de 12.6 m vers la voie avec intérieur, bandeau aux couleurs de l'équipe
      // longueur = pas des emplacements moins 40 cm (les anciens corps de 15,5 m laissaient l'ouverture à moitié dans le mur)
      const g = tr.at(s, tr.pitCenter + ph + 7.5), f = tr.at(s, tr.pitCenter + ph + 3.4), gw = 17 - 0.4;
      const yaw = Math.atan2(f.x - g.x, f.z - g.z);   // façade +z du kit vers la voie des stands
      kacc.at(g.x, 0, g.z, yaw);
      K.building(kacc, { w: gw, d: 8, h: 4.6, fh: 4.6, roof: 'flat', parapet: 0.5, door: false, faces: ['-z'], win: [1.6, 0.9], bay: 4, plinth: 0.3, equip: false, rand: Math.random,
        openings: [{ face: '+z', s: 0, w: gw - 4.4, h: 3.4, type: 'bay' }] });
      const ap = tr.at(s, tr.pitCenter + ph + 1.75);   // dalle béton entre la voie et le garage (il y avait de l'herbe)
      parts.push(A.part(new T.PlaneGeometry(gw + 0.4, 3.6).rotateX(-Math.PI / 2), 0x8d9095, ap.x, 0.012, ap.z, 0, yaw, 0));
      parts.push(A.box(gw + 0.2, 0.55, 8.2, team.color, g.x, 4.6 + 0.275 + 0.05, g.z, 0, yaw, 0));
      const sign = A.canvasTex(256, 64, (c, w, h) => {
        c.fillStyle = player ? '#f7ff00' : '#f4f4f4'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#111'; c.font = player ? 'bold 38px sans-serif' : 'bold 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(player ? 'TON STAND' : team.name.toUpperCase(), w / 2, h / 2, w - 12);
      });
      const board = new T.Mesh(new T.PlaneGeometry(7.2, 1.8), new T.MeshBasicMaterial({ map: sign, side: T.DoubleSide }));
      const bp = tr.at(s, tr.pitCenter + ph + 3.9);
      board.position.set(bp.x, 6.25, bp.z); board.rotation.y = yaw;
      group.add(board);
      parts.push(A.box(7.4, 2.5, 0.2, 0x2b2f35, bp.x - Math.sin(yaw) * 0.12, 5.95, bp.z - Math.cos(yaw) * 0.12, 0, yaw, 0));
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
    group.add(K.group(kacc.geometries(), K.materials({ wall: '#d9dde2', style: 'concrete', trim: '#f2f2f2', frame: '#3a3f46' })));
    group.add(new T.Mesh(A.merge(lines), new T.MeshBasicMaterial({ vertexColors: true })));
  };
})();
