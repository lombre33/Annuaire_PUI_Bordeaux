// Garde-fou du « aucun code mort » du guide de contribution Grist.Gouv (1.29.3) : un module du widget n'exporte rien que le widget
// ne lise pas. Une fonction exportée pour qu'un test l'appelle, et que rien d'autre n'appelle, est du code mort que les tests
// gardent en vie : hasMarks() (preview.js) et readRow() (profile-save.js) l'étaient, la 1.29.3 les a retirées.
//
// Un export est lu quand un autre module du widget cite son nom, ou quand son propre module le cite ailleurs que dans sa
// déclaration. Les tests, la démonstration et les commentaires ne comptent pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_SOURCES, withoutComments } from './support/widget-sources.mjs';

const EXPORTED = /^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

// Les formes que cette garde ne suit pas : si le widget en emploie une, il faut apprendre à la garde à la lire, sinon un export
// serait jugé mort à tort ou un code mort passerait.
const NOT_FOLLOWED = [
  [/^export\s+default\b/m, 'export default'],
  [/^export\s*(?:\*|\{)/m, 'export { … } ou export * from'],
  [/\bimport\s*\*\s*as\b/, 'import * as'],
  [/\bimport\s*\(/, 'import()']
];

// Combien de fois `name` est cité comme un mot à part entière (ni `.name` d'un objet, ni le bout d'un autre mot).
const mentions = (code, name) => (code.match(new RegExp(`(?<![\\w$.])${name.replaceAll('$', '\\$')}(?![\\w$])`, 'g')) ?? []).length;

const readable = sources => sources.map(({ name, code }) => ({ name, code: withoutComments(code) }));

// « module : export » pour chaque export que rien ne lit.
function unusedExports(sources) {
  const modules = readable(sources);
  return modules.flatMap(({ name, code }) => [...code.matchAll(EXPORTED)].map(match => match[1])
    .filter(exported => mentions(code, exported) < 2 && modules.every(other => other.name === name || mentions(other.code, exported) === 0))
    .map(exported => `${name} : ${exported}`));
}

// « module : forme » pour chaque forme d'export ou d'import que la garde ne suit pas.
const formsNotFollowed = sources => readable(sources).flatMap(({ name, code }) =>
  NOT_FOLLOWED.filter(([form]) => form.test(code)).map(([, label]) => `${name} : ${label}`));

test('aucun module du widget n\'exporte ce que rien ne lit (guide Grist.Gouv : aucun code mort)', () => {
  const sources = WIDGET_SOURCES();
  assert.ok(sources.length >= 20, 'le parcours doit trouver les modules du widget');
  assert.deepEqual(unusedExports(sources), []);
});

test('le widget n\'emploie aucune forme d\'export ou d\'import que cette garde ne sait pas suivre', () => {
  assert.deepEqual(formsNotFollowed(WIDGET_SOURCES()), []);
});

// ===== La garde elle-même =====

test('unusedExports names an export that no other module and not its own module reads', () => {
  const sources = [
    { name: 'a.js', code: ['export const used = 1;', 'export function alone() {}', 'export const inside = () => 1;', 'export class Gone {}',
      'export async function later() {}', 'export let $money = 0;', 'const total = inside();'].join('\n') },
    { name: 'b.js', code: "import { used } from './a.js';\nconsole.log(used);" }
  ];
  assert.deepEqual(unusedExports(sources), ['a.js : alone', 'a.js : Gone', 'a.js : later', 'a.js : $money']);
});

test('unusedExports reads an export that another module imports, and one that its own module calls', () => {
  const sources = [
    { name: 'a.js', code: 'export function shared() {}\nexport const $price = 1;\nexport function local() {}\nexport function caller() { return local(); }' },
    { name: 'b.js', code: "import { shared, $price, caller } from './a.js';\nshared();\nconsole.log($price);\ncaller();" }
  ];
  assert.deepEqual(unusedExports(sources), []);
});

test('a comment, a property of an object or a longer name does not keep an export alive', () => {
  const sources = [
    { name: 'a.js', code: 'export function ghost() {}\nexport function lost() {}\nexport function gone() {}' },
    { name: 'b.js', code: '// ghost() servait avant\nconst o = {};\nconsole.log(o.lost); // gone\nconsole.log(ghostly, gone2);' }
  ];
  assert.deepEqual(unusedExports(sources), ['a.js : ghost', 'a.js : lost', 'a.js : gone']);
});

test('formsNotFollowed names each form of export or import that the guard cannot follow', () => {
  const sources = [
    { name: 'a.js', code: 'export default function () {}' },
    { name: 'b.js', code: "export { x } from './a.js';" },
    { name: 'c.js', code: "import * as all from './a.js';\nconst later = await import('./b.js');" },
    { name: 'd.js', code: "import { fine } from './a.js';\nexport const ok = fine;" }
  ];
  assert.deepEqual(formsNotFollowed(sources), ['a.js : export default', 'b.js : export { … } ou export * from', 'c.js : import * as', 'c.js : import()']);
});
