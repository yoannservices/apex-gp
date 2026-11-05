# Apex GP

Simulation de Formule 1 dans le navigateur : course complète contre 19 pilotes IA, avec arrêts aux stands, pneus, dégâts, météo changeante et championnat. Three.js (r149, `vendor/three.min.js`) uniquement : pas de node_modules, pas d'asset externe (modèles, textures et sons sont générés par le code). Équipes, pilotes et circuits fictifs.

## Ce qu'on y fait

- **Modes** : course, contre-la-montre (avec fantôme), essais libres, qualifications, championnat sauvegardé.
- **8 circuits** : Autodromo Velocità (Italie), Grand Prix de la Ville (urbain), Ring des Collines (Allemagne), Marina Bay Nocturne (nuit), Circuit du Littoral (Portugal), Grand Prix des Alpes (Autriche), Neon Strip Night GP (urbain de nuit), Circuit des Étangs (Belgique).
- **Pilotage** : physique de voiture faite main, usure des pneus (gommes slick et pneus pluie), DRS, dégâts qui dégradent la voiture.
- **Course** : départ lancé ou sur la grille, IA qui dépasse, se défend et fait ses arrêts, voiture de sécurité, débris sur la piste, fantôme du meilleur tour.
- **Règlement** : limites de piste (1 s puis 5 s de pénalité ajoutées au temps final), contacts fautifs, drapeaux jaunes et bleus, safety car, drapeau noir au-delà de 30 s de pénalités.
- **Stands** : voie des stands, arrêt au stand à la demande (X), choix des pneus, conseils de la radio ; difficulté de l'IA qui s'adapte au joueur.
- **Météo** : sec, pluie, nuageux ou dynamique, jour ou nuit.
- **Interface** : HUD, radio de l'équipe, rétroviseur, caméras multiples, sons synthétisés. Manette supportée.

## Touches (AZERTY)

Z gaz · S frein · Q / D tourner (flèches aussi) · Espace DRS · E / Maj monter le rapport · F / Ctrl rétrograder · X arrêt au stand · C caméra · V regarder derrière · B rétroviseur · M carte · T radio · R replacer · Maj + R recommencer · Y / N accepter ou refuser · P / Échap pause.

## Lancer

Double-cliquer `index.html` (Chrome ou Edge). Aucun serveur nécessaire.

Raccourci de test : `index.html#race,pluie,night,ville,rolling` (modes `race|tt|practice|champ`, météo `rain|pluie|cloud|dynamic`, `night`, circuit par id, `rolling` pour un départ lancé).

## Organisation

Un fichier par système dans `src/`, tous attachés à `globalThis.AGP`. L'ordre de chargement est celui de `index.html`.

- Physique : `carPhysics`, `tires`, `damage`, `car`, `collision`
- Piste : `tracks`, `track`, `pitlane`, `scenery`, `racingLine`
- Course : `race`, `driver`, `rules`, `pitStop`, `adaptive`, `weather`, `debris`, `ghost`, `modes`
- Interface : `camera`, `hud`, `menus`, `radio`, `audio`, `input`, `save`, `main`

## Tests (Node, sans rendu)

`node test/race-check.js [circuit] [tours] [niveau] [pluie]` · `node test/lap-check.js [circuit] [tours] [niveau]`

## À savoir

Moto GP (`loisirs/moto-gp/`) reprend cette structure avec une moto.

## Évitement des contacts (IA)

`driver.js` : distance de sécurité cinématique derrière la voiture de devant (elle peut freiner à fond, on s'arrête quand même ; on anticipe sa vitesse cible), freinage proportionnel à la décélération nécessaire, écart latéral minimal de 2,7 m avec toute voiture à notre hauteur (fenêtre élargie selon la vitesse relative), la voiture la plus en arrière lève le pied quand il n'y a plus de place, épaves à l'arrêt traitées comme obstacles. Mesure : `node test/contacts.js [circuit] [tours] [niveau] [apex|moto]` (contacts classés par cause ; `V=1`, `H=1`, `O=1` pour le détail). `sh test/multi-contacts.sh apex|moto` : 3 circuits.
