// Règles du projet qui ne relèvent d'aucune fonction en particulier.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.css']);
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git']);

// BDD porte une référence directe vers l'établissement : le code ne s'appuie jamais sur la colonne du nom de domaine de BDD. Une seule
// exception, décidée par Antoine le 19 novembre 2026 (1.45.0) : la colonne d'`Etablissements` sert, en lecture seule, de liste blanche aux
// personnes qui créent leur fiche (domains.js). Le nom de la colonne n'est écrit qu'à un endroit, constants.js (ETABLISSEMENT_DOMAIN_COLUMN),
// et seuls domains.js et requests.js l'importent. Nom assemblé pour que ce fichier ne se détecte pas lui-même ; la documentation reste
// libre d'expliquer la règle.
const FORBIDDEN_COLUMN = ['nom', 'de', 'domaine'].join('_');
const MAY_NAME_IT = ['constants.js'];
const MAY_IMPORT_IT = ['constants.js', 'domains.js', 'requests.js'];

function codeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) ? [] : codeFiles(fullPath);
    return CODE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

test('seul constants.js écrit le nom de la colonne des domaines (règle du projet, exception de la 1.45.0)', () => {
  const files = codeFiles(ROOT);
  assert.ok(files.length >= 6, 'le parcours doit trouver les fichiers du widget');
  const offenders = files
    .filter(file => fs.readFileSync(file, 'utf8').includes(FORBIDDEN_COLUMN))
    .map(file => path.relative(ROOT, file))
    .filter(file => !MAY_NAME_IT.includes(file));
  assert.deepEqual(offenders, []);
});

test('seuls domains.js et requests.js lisent la colonne des domaines d\'Etablissements', () => {
  const importers = codeFiles(ROOT)
    .filter(file => !file.includes(`${path.sep}tests${path.sep}`))
    .filter(file => fs.readFileSync(file, 'utf8').includes('ETABLISSEMENT_DOMAIN_COLUMN'))
    .map(file => path.relative(ROOT, file))
    .sort();
  assert.deepEqual(importers, MAY_IMPORT_IT);
});
