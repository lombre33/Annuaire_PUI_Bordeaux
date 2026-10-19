// Le code du widget tel que les tests de garde le lisent (tests/docs.test.mjs, tests/csp.test.mjs) : les modules à la racine du
// dépôt, ni les tests ni la démonstration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const WIDGET_SOURCES = () => fs.readdirSync(ROOT).filter(name => name.endsWith('.js'))
  .map(name => ({ name, code: fs.readFileSync(path.join(ROOT, name), 'utf8') }));

// Tous les textes du dépôt (code, tests, documentation, configuration), pour tests/fiction.test.mjs : ni les images (assets/), ni
// les dépendances, ni le journal des versions, qui cite des messages d'autrefois.
const TEXT_FILE = /\.(?:js|mjs|md|html|css|json|yml|txt)$/;
const SKIPPED = new Set(['.git', 'node_modules', 'assets']);
const readTree = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : readTree(file);
  return TEXT_FILE.test(entry.name) ? [{ name: path.relative(ROOT, file), code: fs.readFileSync(file, 'utf8') }] : [];
});
export const REPOSITORY_TEXTS = () => readTree(ROOT).filter(({ name }) => name !== 'CHANGELOG.md');

// Le code sans ses commentaires de ligne : de quoi chercher un appel sans tomber sur un commentaire qui
// le nomme. Une adresse (`https://…`) n'est pas un commentaire : on ne coupe qu'un `//` précédé d'une espace.
export const withoutComments = code => code.split('\n')
  .filter(line => !/^\s*\/\//.test(line))
  .map(line => line.replace(/\s\/\/\s.*$/, ''))
  .join('\n');
