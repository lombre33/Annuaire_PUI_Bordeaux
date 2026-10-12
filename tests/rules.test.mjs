// Règles du projet qui ne relèvent d'aucune fonction en particulier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.css']);
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git']);

// BDD porte une référence directe vers l'établissement : le code ne s'appuie
// jamais sur le nom de domaine. Nom assemblé pour que ce fichier ne se détecte
// pas lui-même ; la documentation reste libre d'expliquer la règle.
const FORBIDDEN_COLUMN = ['nom', 'de', 'domaine'].join('_');

function codeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) ? [] : codeFiles(fullPath);
    return CODE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

test('aucun fichier de code n\'utilise la colonne du nom de domaine (règle du projet)', () => {
  const files = codeFiles(ROOT);
  assert.ok(files.length >= 6, 'le parcours doit trouver les fichiers du widget');
  const offenders = files
    .filter(file => fs.readFileSync(file, 'utf8').includes(FORBIDDEN_COLUMN))
    .map(file => path.relative(ROOT, file));
  assert.deepEqual(offenders, []);
});
