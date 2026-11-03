// Typographie française des textes du widget (1.33.0, audit UI/UX U39) : une espace insécable devant « : ; ? ! » et dans « », pour qu'un
// message ne laisse jamais un « ? » ou un « : » seul en début de ligne, ni un guillemet loin de son mot (sur un téléphone, les colonnes
// sont étroites et le cas arrivait). Un nombre de mille contacts s'écrit « 1 234 » avec l'espace insécable fine de la langue.
//
// La garde lit le code : chaque chaîne et chaque modèle de texte des modules du widget, et le texte de index.html. Les tests, eux,
// comparent sans tenir compte de l'espace insécable (tests/support/assert.mjs) : écrire un message avec une espace ordinaire dans un test
// est permis, dans le widget ça échoue ici. Pour une espace ordinaire voulue (rare : du code dans une chaîne), l'écrire `\x20`.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crowdedTables } from './fixtures-responsive.mjs';
import { formatCount } from '../grist-data.js';
import { resultCount, skip, waitForCards, withWidget } from './support/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ===== Les textes d'un module =====

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof']);

// Le contenu de chaque chaîne ('…', "…") et de chaque modèle de texte (`…`, sans ses ${ }) d'un module JavaScript, avec la ligne où il
// commence. Ni les commentaires ni les expressions régulières n'en sont : ce qu'ils disent ne s'affiche pas. `balanced` : le module a été
// lu jusqu'au bout sans perdre le fil (accolades rendues, aucun texte resté ouvert), de quoi se méfier d'une lecture qui se serait trompée.
function textsOf(source) {
  const texts = [];
  const templates = []; // pour chaque ${ ouvert : le niveau d'accolades où l'on rentre dans le modèle de texte
  let braces = 0;
  let previous = ''; // le dernier élément du code, pour distinguer une division d'une expression régulière
  let line = 1;
  let index = 0;
  let open = false;

  const keep = (from, startLine) => texts.push({ line: startLine, text: source.slice(from, index) });

  const readString = quote => {
    const from = index + 1;
    const startLine = line;
    index += 1;
    while (index < source.length && source[index] !== quote && source[index] !== '\n') index += source[index] === '\\' ? 2 : 1;
    open = source[index] !== quote;
    keep(from, startLine);
    index += 1;
    previous = '"';
  };

  const readTemplate = () => {
    const from = index;
    const startLine = line;
    open = true;
    while (index < source.length) {
      const char = source[index];
      if (char === '\\') { index += 2; continue; }
      if (char === '`') { keep(from, startLine); index += 1; previous = '`'; open = false; return; }
      if (char === '$' && source[index + 1] === '{') {
        keep(from, startLine);
        templates.push(braces);
        braces += 1;
        index += 2;
        previous = '{';
        open = false;
        return;
      }
      if (char === '\n') line += 1;
      index += 1;
    }
  };

  const skipRegex = () => {
    index += 1;
    let inClass = false;
    while (index < source.length && source[index] !== '\n') {
      const char = source[index];
      if (char === '\\') { index += 2; continue; }
      if (char === '[') inClass = true;
      else if (char === ']') inClass = false;
      else if (char === '/' && !inClass) { index += 1; break; }
      index += 1;
    }
    while (/[a-z]/.test(source[index] ?? '')) index += 1;
    previous = 'regex';
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '\n') { line += 1; index += 1; } else if (/\s/.test(char)) index += 1;
    else if (char === '/' && next === '/') { while (index < source.length && source[index] !== '\n') index += 1; } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end < 0 ? source.length : end + 2;
      line += (source.slice(index, stop).match(/\n/g) ?? []).length;
      index = stop;
    } else if (char === '\'' || char === '"') readString(char);
    else if (char === '`') { index += 1; readTemplate(); } else if (char === '{') { braces += 1; index += 1; previous = '{'; } else if (char === '}') {
      braces -= 1;
      index += 1;
      previous = '}';
      if (templates.length > 0 && templates[templates.length - 1] === braces) { templates.pop(); readTemplate(); }
    } else if (char === '/') {
      if (previous === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(previous) || REGEX_AFTER_WORD.has(previous)) skipRegex();
      else { index += 1; previous = '/'; }
    } else if (/[\w$]/.test(char)) {
      const from = index;
      while (/[\w$]/.test(source[index] ?? '')) index += 1;
      previous = source.slice(from, index);
    } else { previous = char; index += 1; }
  }
  return { texts, balanced: braces === 0 && templates.length === 0 && !open };
}

// Une espace ordinaire devant ; ? ! ou devant un : suivi d'une espace (jamais « a :hover » d'un sélecteur), après « ou devant ».
const ORDINARY_SPACE = /[ ](?=[;?!])|[ ](?=:(?:\s|$))|« | »/;
const offences = (name, texts) => texts.filter(({ text }) => ORDINARY_SPACE.test(text))
  .map(({ line, text }) => `${name}:${line} « ${text.length > 70 ? `${text.slice(0, 70)}…` : text} »`);

test('le lecteur de textes distingue les chaînes et les modèles de texte des commentaires et des expressions régulières', () => {
  const source = [
    'const a = \'un : deux\'; // trois : quatre',
    '/* cinq : six */ const b = "sept ; huit";',
    'const c = `neuf ${ok ? \'dix : onze\' : \'douze\'} treize ? ${`${x} : quatorze`}`;',
    'const d = /quinze : seize/.test(a) && 10 / 2 / 5;',
    'const e = { f: \'dix-sept\' };',
    'const g = x.replace(/[\'"`]/g, \'\') + \'dix-huit\';'
  ].join('\n');
  const { texts, balanced } = textsOf(source);
  assert.equal(balanced, true);
  assert.deepEqual(texts.map(({ text }) => text),
    ['un : deux', 'sept ; huit', 'neuf ', 'dix : onze', 'douze', ' treize ? ', '', ' : quatorze', '', 'dix-sept', '', 'dix-huit']);
  assert.deepEqual(texts.filter(({ text }) => ORDINARY_SPACE.test(text)).map(({ line }) => line), [1, 2, 3, 3, 3]);
  assert.equal(ORDINARY_SPACE.test('Cause\u00a0: une règle «\u00a0logo\u00a0» ?'), true, 'le « ? » seul est signalé');
  assert.equal(ORDINARY_SPACE.test('Cause\u00a0: une règle «\u00a0logo\u00a0»\u00a0?'), false);
  assert.equal(ORDINARY_SPACE.test('.card :hover, a?b=c, ok!'), false, 'un sélecteur, une adresse, un point d\'exclamation collé ne sont pas signalés');
});

// ===== Le widget =====

const modules = fs.readdirSync(ROOT).filter(name => name.endsWith('.js'));

test('aucun texte du widget n\'écrit une espace ordinaire devant : ; ? ! ni dans « » (espace insécable, audit U39)', () => {
  assert.ok(modules.length > 20, `les modules du widget sont lus (${modules.length})`);
  const found = modules.flatMap(name => {
    const { texts, balanced } = textsOf(fs.readFileSync(path.join(ROOT, name), 'utf8'));
    assert.equal(balanced, true, `${name} : la lecture des textes a perdu le fil, adaptez textsOf()`);
    return offences(name, texts);
  });
  assert.deepEqual(found, [], 'Remplacez l\'espace par une espace insécable (U+00A0) : elle ne se voit pas, mais le texte ne se coupe plus à cet endroit.');
});

test('index.html n\'écrit aucune espace ordinaire devant : ; ? ! ni dans « » (espace insécable, audit U39)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
  assert.ok(html.includes('Mode admin\u00a0:'), 'le texte du bandeau du mode admin est lu (sinon ce test ne prouve rien)');
  assert.deepEqual(html.split('\n').flatMap((line, index) => (ORDINARY_SPACE.test(line) ? [`index.html:${index + 1} ${line.trim().slice(0, 80)}`] : [])), []);
});

// ===== Les nombres =====

test('formatCount écrit « 1 234 » avec une espace insécable fine, et laisse les petits nombres tels quels', () => {
  assert.equal(formatCount(4), '4');
  assert.equal(formatCount(999), '999');
  // `assert.ok` et non `assert.match` : celui-ci confond l'espace insécable avec l'espace ordinaire (tests/support/assert.mjs).
  assert.ok(/^1[\u00a0\u202f]234$/.test(formatCount(1234)), 'l\'espace entre les milliers ne se coupe pas');
  assert.ok(/^45[\u00a0\u202f]000$/.test(formatCount(45000)));
});

test('le compteur de contacts écrit « 1 234 contacts » avec une espace insécable, et « 4 contacts » sans espace de plus', { skip }, async () => {
  await withWidget({ tables: crowdedTables(1234) }, async ({ page }) => {
    await waitForCards(page, 1234);
    assert.ok(/^1[\u00a0\u202f]234 contacts$/.test(await resultCount(page)), 'l\'espace entre les milliers est insécable');
  });
  await withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await resultCount(page), '4 contacts');
  });
});
