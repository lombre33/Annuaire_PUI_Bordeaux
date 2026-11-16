// Les messages du widget qui citent la documentation (doc-refs.js) : chacun la nomme en clair (« guide d'installation Grist, étape 4 »)
// et, dans la fenêtre « Documentation », mène à la bonne étape. Ici : chaque passage cité existe encore dans le guide, aucun message
// montré à une personne ne nomme un fichier (GRIST_SETUP.md), et la détection d'un passage dans un message ne se trompe pas.
// Le lien dans une vraie fenêtre est essayé dans tests/e2e-etablissement.test.mjs.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_REFS } from '../doc-refs.js';
import { DOC_PAGES, pageOf } from '../docs-source.js';
import { parseMarkdown } from '../markdown.js';
import { withoutComments } from './support/widget-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headingsOf = file => parseMarkdown(fs.readFileSync(path.join(ROOT, file), 'utf8')).headings;

test('chaque passage cité par un message est un titre du guide, avec son numéro d\'étape et son nom', () => {
  for (const [name, ref] of Object.entries(DOC_REFS)) {
    assert.ok(pageOf(ref.page), `${name} : ${ref.page} est un document de la fenêtre`);
    const heading = headingsOf(ref.page).find(candidate => candidate.id === ref.anchor);
    assert.ok(heading, `${name} : « ${ref.anchor} » n'est plus un titre de ${ref.page} : corriger doc-refs.js`);
    const step = ref.text.match(/^guide d’installation Grist, étape (\d+)\u00a0«\u00a0(.+?)\u00a0»$/);
    assert.ok(step, `${name} : le texte dit « guide d’installation Grist, étape N « Titre » » (${ref.text})`);
    assert.ok(heading.text.startsWith(`${step[1]}. `), `${name} : le titre « ${heading.text} » est celui de l'étape ${step[1]}`);
    assert.ok(heading.text.replaceAll('’', "'").includes(step[2].replaceAll('’', "'")), `${name} : « ${step[2]} » est le nom de l'étape dans le guide (« ${heading.text} »)`);
    assert.doesNotMatch(ref.text, /\.md\b/, `${name} : un nom clair, pas un nom de fichier`);
  }
  assert.equal(new Set(Object.values(DOC_REFS).map(ref => ref.text)).size, Object.keys(DOC_REFS).length, 'deux passages ne portent pas le même texte');
  assert.equal(new Set(Object.values(DOC_REFS).map(ref => ref.anchor)).size, Object.keys(DOC_REFS).length);
  assert.ok(DOC_PAGES.some(page => page.path === 'GRIST_SETUP.md'));
});

test('aucun message montré à une personne ne nomme un fichier de documentation : le guide est nommé en clair, et lié', () => {
  // Les messages de la console (une ligne qui passe par `log.` ou `console.`, ou qui porte un préfixe [XXX]) nomment le fichier : une console
  // n'a pas de lien, et celui qui la lit tient le document sous la main.
  const consoleLine = /\blog\.(?:info|warn|error)\b|\bconsole\.|(['"`])\[[A-Z-]{3,}\]\s/;
  // Trois messages nomment encore le fichier, parce qu'aucune personne ne les lit à l'écran : la raison d'une sonde indisponible est « pour
  // la console » (identity.js, état unavailable) et l'avertissement des logos part dans console.warn (render.js).
  const consoleOnly = [
    ['identity.js', /introuvable, et Grist n'a pas permis de la créer/],
    ['identity.js', /règles d\\'accès de la sonde\s*:\s*la personne doit pouvoir supprimer/],
    ['render.js', /\(GRIST_SETUP\.md, étape 5\)\. Autres causes/]
  ];
  const offenders = fs.readdirSync(ROOT).filter(name => name.endsWith('.js') && !['docs-source.js', 'markdown.js', 'markdown-dom.js', 'doc-refs.js'].includes(name))
    .flatMap(name => withoutComments(fs.readFileSync(path.join(ROOT, name), 'utf8')).split('\n')
      .map((line, index) => ({ name, line: line.trim(), index: index + 1 }))
      .filter(({ line }) => /\b[A-Za-z_]+\.md\b(?!-)/.test(line) && !consoleLine.test(line))
      .filter(({ name: file, line }) => !consoleOnly.some(([only, pattern]) => only === file && pattern.test(line)))
      .map(({ name: file, line, index }) => `${file}:${index} ${line.slice(0, 90)}`));
  assert.deepEqual(offenders, [], 'Un message affiché cite un fichier .md : le dire par un passage de DOC_REFS (doc-refs.js), que dom.js transforme en lien.');
});

test('une référence est lue dans un message à sa place, plusieurs fois, et pas en pièces', () => {
  // La découpe d'un message en texte et en liens est essayée dans le navigateur (tests/e2e-etablissement.test.mjs) ; ici, ce dont elle dépend : le
  // texte d'un passage n'est jamais le début ou la fin d'un autre, sinon un lien en avalerait un autre.
  const texts = Object.values(DOC_REFS).map(ref => ref.text);
  for (const a of texts) {
    for (const b of texts) if (a !== b) assert.ok(!a.includes(b), `« ${b} » est dans « ${a} »`);
  }
});
