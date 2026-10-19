// Le code du widget tel que les tests de garde le lisent (tests/docs.test.mjs, tests/csp.test.mjs) : les modules à la racine du
// dépôt, ni les tests ni la démonstration.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const WIDGET_SOURCES = () => fs.readdirSync(ROOT).filter(name => name.endsWith('.js'))
  .map(name => ({ name, code: fs.readFileSync(path.join(ROOT, name), 'utf8') }));

// Le code sans ses commentaires de ligne : de quoi chercher un appel sans tomber sur un commentaire qui
// le nomme. Une adresse (`https://…`) n'est pas un commentaire : on ne coupe qu'un `//` précédé d'une espace.
export const withoutComments = code => code.split('\n')
  .filter(line => !/^\s*\/\//.test(line))
  .map(line => line.replace(/\s\/\/\s.*$/, ''))
  .join('\n');
