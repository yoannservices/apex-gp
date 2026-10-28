# Apex GP

Simulation de F1 dans le navigateur. Three.js (r149, `vendor/three.min.js`) uniquement : pas de node_modules, pas d'asset externe (modèles, textures et sons sont générés par le code).

## Lancer

Double-cliquer `index.html` (Chrome ou Edge). Aucun serveur nécessaire.

Raccourci de test : `index.html#race,pluie,night,ville,rolling` (modes `race|tt|practice|champ`, météo `rain|pluie|cloud|dynamic`, `night`, circuit `velocita|ville|collines|marina`).

## Organisation

Un fichier par système dans `src/`, tous attachés à `globalThis.AGP`. L'ordre de chargement est celui de `index.html`.

- Physique : `carPhysics`, `tires`, `damage`, `car`, `collision`
- Piste : `tracks`, `track`, `pitlane`, `scenery`, `racingLine`
- Course : `race`, `driver`, `rules`, `pitStop`, `adaptive`, `weather`, `debris`, `ghost`, `modes`
- Interface : `camera`, `hud`, `menus`, `radio`, `audio`, `input`, `save`, `main`

## Tests (Node, sans rendu)

`node test/race-check.js [circuit] [tours] [niveau] [pluie]` · `node test/lap-check.js [circuit] [tours] [niveau]`
