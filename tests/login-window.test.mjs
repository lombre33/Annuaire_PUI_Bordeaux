// La fenêtre de connexion de l'annuaire est celle du widget « agenda partagé », à l'identique (1.45.1). Antoine l'avait demandée ainsi dès la
// 1.44.0 ; la 1.44.0 n'en avait repris que la logique et avait réécrit la fenêtre dans le style de l'annuaire. Ces tests gardent l'identité
// sans navigateur, contre des copies de l'agenda (tests/fixtures) :
//   1. login.css : chaque règle `.acces…` de l'agenda y est, mot pour mot, et la charte (couleurs, police) est posée sur la fenêtre seule.
//   2. login-art.js : les trois dessins repris de l'agenda sont les mêmes, forme par forme ; le quatrième (`record`) est celui de l'annuaire.
//   3. login-ui.js : les classes de la mise en page sont celles de l'agenda.
// Ce que la fenêtre fait dans la page (ouverture, fermeture, lien) est dans tests/e2e-login.test.mjs.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENDA_BUTTON, AGENDA_HEREBUTTON, AGENDA_SERVICE } from './fixtures/agenda-illustrations.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const squash = text => text.replace(/\s+/g, ' ').trim();

// ===== 1. Le style =====

// Les règles de l'agenda : une par ligne, sauf les blocs `@media` (jusqu'à leur accolade fermante, au début d'une ligne).
function chunksOf(css) {
  const chunks = [];
  let block = null;
  for (const line of css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')) {
    if (block) {
      block.push(line);
      if (/^\}/.test(line)) { chunks.push(squash(block.join(' '))); block = null; }
    } else if (/^@media[^{]*\{\s*$/.test(line)) {
      block = [line];
    } else if (line.trim()) {
      chunks.push(squash(line));
    }
  }
  return chunks;
}

test('login.css reprend chaque règle de la fenêtre de l\'agenda, mot pour mot', () => {
  const agenda = chunksOf(read('tests/fixtures/agenda-acces.css'));
  const ours = squash(read('login.css').replace(/\/\*[\s\S]*?\*\//g, ''));
  assert.ok(agenda.length >= 20, `la copie de l'agenda a ses règles (${agenda.length})`);
  const missing = agenda.filter(rule => !ours.includes(rule));
  assert.deepEqual(missing, [], 'ces règles de l\'agenda manquent ou ont changé dans login.css : la fenêtre ne serait plus la même');
});

test('login.css pose la charte de l\'agenda (magenta, jaune, brun, Bitter) sur la fenêtre seule, jamais sur la page', () => {
  const css = read('login.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = css.match(/\.acces\s*\{([^}]*--magenta[^}]*)\}/)?.[1];
  assert.ok(tokens, 'les jetons de couleur sont sur `.acces`');
  for (const [name, value] of Object.entries({
    '--magenta': '#b9348b', '--jaune': '#ffcc00', '--brun': '#3b1c13', '--texte': '#292322', '--gris': '#615961', '--rose': '#faf4f8', '--rayon': '8px'
  })) assert.match(tokens, new RegExp(`${name}:\\s*${value};`), `${name} vaut ${value}, comme dans l'agenda`);
  assert.match(tokens, /--serif:\s*"Bitter",\s*"Rockwell",\s*"Roboto Slab",\s*Georgia,\s*"Times New Roman",\s*serif;/);
  assert.match(tokens, /font:\s*16px\/1\.4 var\(--serif\)/);
  assert.doesNotMatch(css, /:root\s*\{/, 'rien n\'est posé sur la page : ni :root, ni body');
  assert.doesNotMatch(css, /(^|\})\s*(body|html|\*)\s*[,{]/, 'aucun réglage ne déborde de la fenêtre');
  // Tout sélecteur de ce fichier est celui de la fenêtre (ou un de ses éléments).
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(match => squash(match[1])).filter(selector => !/^@/.test(selector) && selector !== '');
  const foreign = selectors.filter(selector => !selector.split(/,(?![^(]*\))/).every(part => /\.acces|^from$/.test(part.trim())));
  assert.deepEqual(foreign, [], 'ces sélecteurs ne sont pas ceux de la fenêtre');
});

test('Bitter est embarquée avec sa licence, en deux graisses, depuis le dépôt', () => {
  const css = read('login.css');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(match => match[1]);
  assert.equal(faces.length, 2);
  assert.deepEqual(faces.map(face => /font-weight:\s*(\d+)/.exec(face)[1]), ['400', '700']);
  for (const face of faces) {
    assert.match(face, /font-family:\s*Bitter;/);
    assert.match(face, /font-display:\s*swap;/);
    const file = /url\("(assets\/fonts\/[^"]+\.woff2)"\)/.exec(face)?.[1];
    assert.ok(file, 'le fichier du dépôt');
    const bytes = fs.readFileSync(path.join(ROOT, file));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2');
    assert.ok(bytes.length < 30_000, `${file} reste léger`);
  }
  const license = read('assets/fonts/OFL-Bitter.txt');
  assert.match(license, /The Bitter Project Authors/);
  assert.match(license, /SIL Open Font License, Version 1\.1/);
  assert.match(read('assets/fonts/LISEZ-MOI.md'), /Bitter/, 'la provenance est écrite à côté des fichiers');
});

// ===== 2. Les dessins =====

// Un faux DOM : de quoi bâtir login-art.js sans navigateur.
function fakeDocument() {
  const make = tag => ({
    tag, attrs: {}, children: [], text: '',
    setAttribute(name, value) { this.attrs[name] = String(value); },
    append(...nodes) { this.children.push(...nodes); },
    set textContent(value) { this.text = value; },
    get textContent() { return this.text; }
  });
  return { createElementNS: (_, tag) => make(tag) };
}

const describeSvg = svg => ({
  viewBox: svg.attrs.viewBox,
  role: svg.attrs.role,
  label: svg.attrs['aria-label'],
  shapes: svg.children.map(shape => ({ tag: shape.tag, attrs: shape.attrs, text: shape.text }))
});

// Les dessins de l'agenda, lus dans leur texte : la balise, ses attributs, son texte.
function parseAgenda(svg, { service, reference }) {
  const attributesOf = text => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
  const open = /<svg\s([^>]*)>/.exec(svg);
  const root = attributesOf(open[1]);
  const fill = text => text.replaceAll('__SERVICE__', service).replaceAll('__REFERENCE__', reference);
  const inner = svg.slice(open.index + open[0].length, svg.lastIndexOf('</svg>'));
  const shapes = [...inner.matchAll(/<(rect|path|text)\s([^>]*?)(?:\/>|>([^<]*)<\/text>)/g)]
    .map(([, tag, attributes, text = '']) => ({
      tag,
      attrs: Object.fromEntries(Object.entries(attributesOf(attributes)).map(([name, value]) => [name, fill(value)])),
      text: fill(text)
    }));
  return { viewBox: root.viewBox, role: root.role, label: fill(root['aria-label']), shapes };
}

test('les dessins des étapes 1 et 2 sont ceux de l\'agenda, forme par forme, avec le service et la référence de l\'annuaire', async () => {
  globalThis.document = fakeDocument();
  try {
    const { illustration } = await import('../login-art.js');
    const names = { service: 'ProConnect', reference: 'Resana' };
    for (const [key, agenda] of [['button', AGENDA_BUTTON], ['hereButton', AGENDA_HEREBUTTON], ['service', AGENDA_SERVICE]]) {
      const expected = parseAgenda(agenda, names);
      assert.ok(expected.shapes.length >= 6, `${key} : le dessin de l'agenda est lu (${expected.shapes.length} formes)`);
      assert.deepEqual(describeSvg(illustration(key, names)), expected, `${key} : le même dessin que dans l'agenda`);
    }
  } finally {
    delete globalThis.document;
  }
});

test('la troisième étape montre les boutons de l\'annuaire, dans le même dessin que « Présent » et « À confirmer » de l\'agenda', async () => {
  globalThis.document = fakeDocument();
  try {
    const { illustration } = await import('../login-art.js');
    const record = describeSvg(illustration('record', { service: 'ProConnect', reference: 'Resana' }));
    assert.equal(record.viewBox, '0 0 320 120');
    assert.equal(record.role, 'img');
    assert.match(record.label, /« Modifier ma fiche » et « Créer ma fiche »/);
    assert.deepEqual(record.shapes.filter(shape => shape.text).map(shape => shape.text), ['✎ Modifier ma fiche', '+ Créer ma fiche']);
    // Le cadre jaune de l'agenda, autour du premier bouton.
    assert.ok(record.shapes.some(shape => shape.attrs.stroke === '#ffcc00' && shape.attrs.fill === 'none'));
  } finally {
    delete globalThis.document;
  }
});

// ===== 3. La mise en page =====

test('login-ui.js bâtit la mise en page de l\'agenda : mêmes classes, trois étapes, une note, deux boutons', () => {
  const code = read('login-ui.js');
  for (const cls of ['acces__corps', 'acces__sur', 'acces__intro', 'acces__etapes', 'acces__num', 'acces__texte', 'acces__note', 'acces__actions', 'acces__bouton', 'acces__lien']) {
    assert.ok(code.includes(`'${cls}'`), `la classe ${cls} de l'agenda est posée`);
  }
  assert.match(code, /'acces-titre'/, 'le titre porte l\'identifiant que la fenêtre cite (aria-labelledby)');
  assert.match(code, /link\.target = '_top'/);
  assert.match(read('index.html'), /<dialog class="acces" id="acces" aria-labelledby="acces-titre"><\/dialog>/);
});
