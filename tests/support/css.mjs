// Les feuilles de style du widget lues sans navigateur, pour les tests qui vérifient ce que style.css et dialogs.css déclarent
// (contrastes, bordures, règles d'impression) : le texte sans ses commentaires, et ses règles `{ selector, body }`. Une règle d'un bloc
// `@media` y figure comme une règle ordinaire, sans sa condition.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const readCss = name => fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

export function cssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.replace(/\s+/g, ' ').trim(),
    body
  }));
}

// La valeur que la règle dont le sélecteur est `selector` (seul, ou dans une liste « .a, .b ») donne à la propriété `property`,
// la première fois qu'une règle la donne ; undefined si aucune ne le fait.
export function cssValue(css, selector, property) {
  const wanted = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`);
  for (const rule of cssRules(css)) {
    if (!rule.selector.split(',').some(candidate => candidate.trim() === selector)) continue;
    const value = wanted.exec(rule.body)?.[1].trim();
    if (value !== undefined) return value;
  }
  return undefined;
}
