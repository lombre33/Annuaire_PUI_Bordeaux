import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ===== La page index.html : les modules qu'elle fait précharger sont ceux que main.js charge. =====
// Sans préchargement, le navigateur découvre les modules niveau par niveau (main.js, ses import, les leurs...) : quatre allers-retours
// de suite avant que le widget ne démarre. Avec lui, il les demande tous dans l'en-tête, en parallèle. Un module oublié dans la liste
// revient à l'ancienne attente ; un fichier qui n'existe plus est une demande perdue, et une erreur 404 dans la console.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Les modules locaux qu'un module importe (même expression que le schéma de docs/developpeurs.md, tests/docs.test.mjs).
const importsOf = name => [...read(name).matchAll(/^import [^;]*? from '\.\/([\w-]+\.js)';/gm)].map(match => match[1]);

// Tous les modules que main.js charge, directement ou non.
function loadedFromMain() {
  const loaded = new Set();
  const pending = ['main.js'];
  while (pending.length > 0) {
    const name = pending.pop();
    if (loaded.has(name)) continue;
    loaded.add(name);
    pending.push(...importsOf(name));
  }
  return loaded;
}

const preloaded = () => [...read('index.html').matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(match => match[1]);

test('index.html fait précharger exactement les modules que main.js charge, chacun une fois', () => {
  const listed = preloaded();
  assert.equal(new Set(listed).size, listed.length, 'un module est listé deux fois');
  assert.deepEqual([...listed].sort(), [...loadedFromMain()].sort(),
    'La liste <link rel="modulepreload"> de index.html doit nommer chaque module que main.js importe, directement ou non (ni plus, ni moins).');
});

test('le script de la page est main.js, en module : c\'est lui que la liste de préchargement prépare', () => {
  assert.match(read('index.html'), /<script type="module" src="main\.js"><\/script>/);
});
