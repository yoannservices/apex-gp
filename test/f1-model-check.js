// Vérifie l'intégration du modèle F1 partagé avec rendu de secours.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../src/carModel.js'), 'utf8');
assert(index.indexOf('GLTFLoader.js') < index.indexOf('src/carModel.js'), 'GLTFLoader must load before carModel');
assert(source.includes("'../../assets/models/F1.glb'"), 'F1.glb must be the shared visual model');
assert(source.includes('m.hi.visible = false') && source.includes('m.low.visible = false'), 'hide procedural car only after GLB load');
assert(source.includes('catch') && source.includes('m.hi.visible = true'), 'keep procedural fallback on load failure');
console.log('F1 visual model wiring and fallback verified');
